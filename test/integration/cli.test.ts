import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let root: string;
let bundle: string;
let cache: string;
const project = path.resolve(import.meta.dir, "../..");

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "lore-cli-test-"));
  bundle = path.join(root, "bundle");
  cache = path.join(root, "cache");
  cpSync(path.join(project, "test/fixtures/graph"), bundle, { recursive: true });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function cli(args: string[], stdin?: string, targetBundle = bundle): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(["bun", path.join(project, "src/cli.ts"), ...args, "--bundle", targetBundle], {
    cwd: project,
    env: { ...Bun.env, OKF_CACHE_DIR: cache },
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("CLI protocol", () => {
  test("returns global and command help as successful JSON", async () => {
    const global = await cli(["--help"]);
    expect(global.exitCode).toBe(0);
    expect(global.stderr).toBe("");
    const globalData = JSON.parse(global.stdout).data;
    expect(globalData.name).toBe("lore");
    expect(globalData.commands.map((command: { name: string }) => command.name)).toEqual(["info", "index", "find", "get", "graph", "put", "check"]);

    const command = await cli(["graph", "--help"]);
    expect(command.exitCode).toBe(0);
    const commandData = JSON.parse(command.stdout).data;
    expect(commandData.name).toBe("graph");
    expect(commandData.options).toEqual(expect.arrayContaining([expect.objectContaining({ flag: "--to" })]));
  });

  test("returns compact JSON and stable validation exits", async () => {
    const normal = await cli(["check"]);
    expect(normal.exitCode).toBe(0);
    expect(normal.stderr).toBe("");
    expect(normal.stdout.trim()).toStartWith('{"ok":true,"data":');
    const warningCodes = JSON.parse(normal.stdout).data.warnings.map((finding: { code: string }) => finding.code);
    expect(warningCodes).toContain("MISSING_TYPED_RELATIONSHIP_TARGET");
    expect(warningCodes).toContain("DEPRECATED_CONCEPT_REFERENCED");
    const strict = await cli(["check", "--strict"]);
    expect(strict.exitCode).toBe(3);
    expect(JSON.parse(strict.stdout).data.warnings.length).toBeGreaterThan(0);
    expect(strict.stderr).toBe("");
  });

  test("writes structured failures to stderr", async () => {
    const result = await cli(["get", "systems/missing"]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("CONCEPT_NOT_FOUND");
  });

  test("classifies invalid concepts, unsafe links, reserved files and case collisions", async () => {
    const invalidBundle = path.join(root, "invalid-bundle");
    cpSync(path.join(project, "test/fixtures/graph"), invalidBundle, { recursive: true });
    writeFileSync(path.join(invalidBundle, "broken.md"), "---\ntype: [\n---\n# Broken\n");
    writeFileSync(path.join(invalidBundle, "unsafe.md"), "---\ntype: Reference\n---\n# Unsafe\n\n[Escape](../../outside.md)\n");
    const nested = path.join(invalidBundle, "nested");
    mkdirSync(nested);
    writeFileSync(path.join(nested, "index.md"), "---\ntype: Index\n---\n# Invalid nested index\n");
    const caseDirectory = path.join(invalidBundle, "case-test");
    mkdirSync(caseDirectory);
    writeFileSync(path.join(caseDirectory, "Alpha.md"), "---\ntype: Reference\n---\n# A\n");
    writeFileSync(path.join(caseDirectory, "alpha.md"), "---\ntype: Reference\n---\n# a\n");
    const caseSensitive = readdirSync(caseDirectory).length === 2;

    const checked = await cli(["check"], undefined, invalidBundle);
    expect(checked.exitCode).toBe(3);
    const codes = JSON.parse(checked.stdout).data.errors.map((finding: { code: string }) => finding.code);
    expect(codes).toContain("INVALID_FRONTMATTER");
    expect(codes).toContain("RELATIONSHIP_ESCAPES_BUNDLE");
    expect(codes).toContain("INVALID_RESERVED_FILE");
    if (caseSensitive) expect(codes).toContain("CASE_COLLIDING_CONCEPT_IDS");
  });

  test("reports malformed typed metadata as invalid OKF during queries", async () => {
    const typedBundle = path.join(root, "typed-invalid-bundle");
    cpSync(path.join(project, "test/fixtures/graph"), typedBundle, { recursive: true });
    writeFileSync(path.join(typedBundle, "typed-invalid.md"), "---\ntype: Reference\nx-okf:\n  rel:\n    - [Bad-Relation, systems/okta]\n---\n# Invalid\n");
    const result = await cli(["info"], undefined, typedBundle);
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_OKF");
  });

  test("creates, merges and guards concepts without metadata loss", async () => {
    const created = await cli(["put", "systems/new-system"], JSON.stringify({
      mode: "create",
      frontmatter: { type: "System", title: "New", custom: { keep: true }, generated: { by: "human:test", at: "2026-01-01" } },
      body: "# New\n\nOriginal body.\n",
      relations: [["depends_on", "systems/okta"]],
    }));
    expect(created.exitCode).toBe(0);
    const firstHash = JSON.parse(created.stdout).data.hash as string;

    const merged = await cli(["put", "systems/new-system"], JSON.stringify({
      mode: "merge",
      expected_hash: firstHash,
      frontmatter: { title: "Renamed" },
    }));
    expect(merged.exitCode).toBe(0);
    const stored = readFileSync(path.join(bundle, "systems/new-system.md"), "utf8");
    expect(stored).toContain('"keep": true');
    expect(stored).toContain('"generated"');
    expect(stored).toContain("Original body.");

    const conflict = await cli(["put", "systems/new-system"], JSON.stringify({ mode: "merge", expected_hash: "wrong", frontmatter: { title: "Lost" } }));
    expect(conflict.exitCode).toBe(5);
    expect(JSON.parse(conflict.stderr).error.code).toBe("MUTATION_CONFLICT");

    const deniedReplace = await cli(["put", "systems/new-system"], JSON.stringify({ mode: "replace", frontmatter: { type: "System" }, body: "# Replacement\n" }));
    expect(deniedReplace.exitCode).toBe(5);
    const replaced = await cli(["put", "systems/new-system"], JSON.stringify({ mode: "replace", allow_destructive: true, frontmatter: { type: "System", title: "Replacement" }, body: "# Replacement\n" }));
    expect(replaced.exitCode).toBe(0);

    const bodyFile = path.join(root, "body.md");
    writeFileSync(bodyFile, "# From file\n");
    const fileCreated = await cli(["put", "systems/from-file"], JSON.stringify({ mode: "create", frontmatter: { type: "System" }, body_file: bodyFile }));
    expect(fileCreated.exitCode).toBe(0);
    expect(readFileSync(path.join(bundle, "systems/from-file.md"), "utf8")).toContain("# From file");
  });
});
