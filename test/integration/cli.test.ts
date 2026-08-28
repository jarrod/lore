import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let root: string;
let bundle: string;
let cache: string;
let binary: string;
const project = path.resolve(import.meta.dir, "../..");

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "lore-cli-test-"));
  binary = path.join(root, process.platform === "win32" ? "lore.exe" : "lore");
  const built = Bun.spawnSync([
    "bun", "build", "--compile", "--define", "__LORE_COMPILED__=true",
    "--outfile", binary, path.join(project, "src/cli.ts"),
  ], { cwd: project, stdout: "pipe", stderr: "pipe" });
  if (built.exitCode !== 0) throw new Error(`Could not build integration executable: ${built.stderr.toString()}`);
  bundle = path.join(root, "bundle");
  cache = path.join(root, "cache");
  cpSync(path.join(project, "test/fixtures/graph"), bundle, { recursive: true });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

async function cli(args: string[], stdin?: string, targetBundle = bundle): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runProcess(binary, [...args, "--bundle", targetBundle], stdin, { ...Bun.env, OKF_CACHE_DIR: cache });
}

async function sourceCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runProcess("bun", [path.join(project, "src/cli.ts"), ...args]);
}

async function compiledCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runProcess(binary, args);
}

function runProcess(command: string, args: string[], stdin?: string, env = Bun.env): { exitCode: number; stdout: string; stderr: string } {
  const token = crypto.randomUUID();
  const stdinPath = path.join(root, `${token}.stdin`);
  const stdoutPath = path.join(root, `${token}.stdout`);
  const stderrPath = path.join(root, `${token}.stderr`);
  if (stdin !== undefined) writeFileSync(stdinPath, stdin);
  const stdinFd = stdin === undefined ? undefined : openSync(stdinPath, "r");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  let exitCode = 10;
  try {
    const process = spawnSync(command, args, {
      cwd: project,
      env,
      stdio: [stdinFd ?? "ignore", stdoutFd, stderrFd],
    });
    exitCode = process.status ?? 10;
  } finally {
    if (stdinFd !== undefined) closeSync(stdinFd);
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  rmSync(stdoutPath, { force: true });
  rmSync(stderrPath, { force: true });
  if (stdin !== undefined) rmSync(stdinPath, { force: true });
  return { exitCode, stdout, stderr };
}

describe("CLI protocol", () => {
  test("returns global and command help as successful JSON", async () => {
    const global = await cli(["--help"]);
    expect(global.exitCode).toBe(0);
    expect(global.stderr).toBe("");
    const globalData = JSON.parse(global.stdout).data;
    expect(globalData.name).toBe("lore");
    expect(globalData.commands.map((command: { name: string }) => command.name)).toEqual(["init", "info", "index", "find", "get", "graph", "visualise", "put", "status", "reset", "check"]);

    const command = await cli(["graph", "--help"]);
    expect(command.exitCode).toBe(0);
    const commandData = JSON.parse(command.stdout).data;
    expect(commandData.name).toBe("graph");
    expect(commandData.options).toEqual(expect.arrayContaining([expect.objectContaining({ flag: "--to" })]));

    const visualise = await cli(["visualise", "--help"]);
    const visualiseData = JSON.parse(visualise.stdout).data;
    expect(visualiseData.name).toBe("visualise");
    expect(visualiseData.options).toEqual(expect.arrayContaining([expect.objectContaining({ flag: "--open" }), expect.objectContaining({ flag: "--max-nodes" })]));

    const reset = await cli(["reset", "--help"]);
    const resetData = JSON.parse(reset.stdout).data;
    expect(resetData.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ flag: "--knowledge" }),
      expect.objectContaining({ flag: "--no-backup" }),
      expect.objectContaining({ flag: "--confirm" }),
    ]));
  });

  test("prints only the version", async () => {
    const result = await compiledCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0.1.0\n");
    expect(result.stderr).toBe("");
  });

  test("refuses every command through the TypeScript runtime", async () => {
    const target = path.join(root, "source-init-target");
    mkdirSync(target);
    const result = await sourceCli(["init", "--repo", target]);
    expect(result.exitCode).toBe(6);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("UNSUPPORTED_CAPABILITY");
    expect(existsSync(path.join(target, ".lore"))).toBeFalse();

    const help = await sourceCli(["--help"]);
    expect(help.exitCode).toBe(6);
    expect(JSON.parse(help.stderr).error.code).toBe("UNSUPPORTED_CAPABILITY");
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

  test("consumes a complete OKF v0.2 bundle with provenance graph edges", async () => {
    const okfBundle = path.join(project, "test/fixtures/okf-v0.2");
    const checked = await cli(["check"], undefined, okfBundle);
    expect(checked.exitCode).toBe(0);
    expect(JSON.parse(checked.stdout).data).toEqual({ valid: true, errors: [], warnings: [] });

    const graph = await cli(["graph", "computations/revenue", "--direction", "out", "--depth", "1"], undefined, okfBundle);
    const graphData = JSON.parse(graph.stdout).data as { edges: Array<{ rel: string; origin: string }> };
    expect(graphData.edges.filter((edge) => edge.origin === "okf").map((edge) => edge.rel).sort()).toEqual(["attester", "executor", "source"]);

    const metric = await cli(["get", "metrics/revenue"], undefined, okfBundle);
    const metricData = JSON.parse(metric.stdout).data as { effective_status: string; frontmatter: Record<string, unknown> };
    expect(metricData.effective_status).toBe("stable");
    expect(metricData.frontmatter.status).toBeUndefined();
  });

  test("writes structured failures to stderr", async () => {
    const result = await cli(["get", "systems/missing"]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("CONCEPT_NOT_FOUND");
  });

  test("classifies invalid concepts, unsafe links, structurally invalid reserved files and case collisions", async () => {
    const invalidBundle = path.join(root, "invalid-bundle");
    cpSync(path.join(project, "test/fixtures/graph"), invalidBundle, { recursive: true });
    writeFileSync(path.join(invalidBundle, "broken.md"), "---\ntype: [\n---\n# Broken\n");
    writeFileSync(path.join(invalidBundle, "unsafe.md"), "---\ntype: Reference\n---\n# Unsafe\n\n[Escape](../../outside.md)\n");
    const nested = path.join(invalidBundle, "nested");
    mkdirSync(nested);
    writeFileSync(path.join(nested, "index.md"), "---\ntype: Index\n---\nFree-form nested index content.\n");
    writeFileSync(path.join(nested, "log.md"), "---\ninvalid: [\n---\nFree-form log content.\n");
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

  test("enforces reserved-file conformance and warns on malformed optional OKF families", async () => {
    const validationBundle = path.join(root, "validation-bundle");
    mkdirSync(validationBundle);
    writeFileSync(path.join(validationBundle, "index.md"), "---\nokf_version: \"0.2\"\nextra: invalid\n---\n# Knowledge\n");
    writeFileSync(path.join(validationBundle, "log.md"), "# Log\n\n## 2026-01-01\n- Older\n\n## 2026-02-01\n- Newer\n");
    const nested = path.join(validationBundle, "nested");
    mkdirSync(nested);
    writeFileSync(path.join(nested, "index.md"), "---\nokf_version: \"0.2\"\n---\n# Nested\n");
    writeFileSync(path.join(validationBundle, "optional.md"), "---\ntype: Attested Computation\nstatus: reviewed\nstale_after: tomorrow\ntags: invalid\ngenerated:\n  at: yesterday\nverified: false\nsources:\n  - id: policy\n  - id: policy\n---\nClaim.[^missing]\n");

    const checked = await cli(["check"], undefined, validationBundle);
    expect(checked.exitCode).toBe(3);
    const data = JSON.parse(checked.stdout).data as { errors: Array<{ code: string; reason?: string }>; warnings: Array<{ code: string }> };
    expect(data.errors.filter((finding) => finding.code === "INVALID_RESERVED_FILE").length).toBeGreaterThanOrEqual(3);
    expect(data.warnings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "ATTESTED_COMPUTATION_MISSING_RUNTIME",
      "INVALID_GENERATED",
      "INVALID_OKF_STATUS",
      "INVALID_SOURCES",
      "INVALID_STALE_AFTER",
      "INVALID_TAGS",
      "INVALID_VERIFIED",
    ]));
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

  if (process.platform !== "win32") test("refuses concept paths that resolve outside the bundle", async () => {
    const outsideConcept = path.join(root, "outside.md");
    writeFileSync(outsideConcept, "---\ntype: Secret\ntitle: Outside\n---\n# Outside\n");
    symlinkSync(outsideConcept, path.join(bundle, "systems/escaped.md"));

    const get = await cli(["get", "systems/escaped"]);
    expect(get.exitCode).toBe(2);
    expect(get.stdout).toBe("");
    expect(JSON.parse(get.stderr).error.code).toBe("INVALID_ARGUMENT");

    const merge = await cli(["put", "systems/escaped"], JSON.stringify({ mode: "merge", frontmatter: { title: "Changed" } }));
    expect(merge.exitCode).toBe(2);
    expect(readFileSync(outsideConcept, "utf8")).not.toContain("Changed");

    const outsideDirectory = path.join(root, "outside-directory");
    mkdirSync(outsideDirectory);
    symlinkSync(outsideDirectory, path.join(bundle, "linked-directory"));
    const create = await cli(["put", "linked-directory/new"], JSON.stringify({ mode: "create", frontmatter: { type: "System" }, body: "# New\n" }));
    expect(create.exitCode).toBe(2);
    expect(existsSync(path.join(outsideDirectory, "new.md"))).toBeFalse();
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
    expect(stored).toContain("  keep: true");
    expect(stored).toContain("generated:");
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

    const unsafe = await cli(["put", "systems/unsafe-content"], JSON.stringify({ mode: "create", frontmatter: { type: "System", resource: "../../outside.md" }, body: "# Unsafe\n" }));
    expect(unsafe.exitCode).toBe(3);
    expect(existsSync(path.join(bundle, "systems/unsafe-content.md"))).toBeFalse();
  });

  test("reports a committed mutation when derived index refresh needs recovery", async () => {
    const mutationBundle = path.join(root, "mutation-refresh-bundle");
    mkdirSync(mutationBundle);
    writeFileSync(path.join(mutationBundle, "invalid.md"), "---\ntype: [\n---\n");
    const result = await cli(["put", "saved"], JSON.stringify({ mode: "create", frontmatter: { type: "Concept" }, body: "# Saved\n" }), mutationBundle);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data.index).toEqual({ current: false, recovery: "lore index --rebuild" });
    expect(readFileSync(path.join(mutationBundle, "saved.md"), "utf8")).toContain("# Saved");
  });

  test("changes lifecycle status deterministically without changing other content", async () => {
    const before = await cli(["get", "systems/okta"]);
    const beforeData = JSON.parse(before.stdout).data as { hash: string; trust: string; body: string };
    expect(beforeData.trust).toBe("unverified");

    const invalid = await cli(["status", "systems/okta", "reviewed", "--expected-hash", beforeData.hash]);
    expect(invalid.exitCode).toBe(2);

    const changed = await cli(["status", "systems/okta", "deprecated", "--expected-hash", beforeData.hash]);
    expect(changed.exitCode).toBe(0);
    expect(JSON.parse(changed.stdout).data.status).toBe("deprecated");

    const after = await cli(["get", "systems/okta"]);
    const afterData = JSON.parse(after.stdout).data as { frontmatter: Record<string, unknown>; body: string };
    expect(afterData.frontmatter.status).toBe("deprecated");
    expect(afterData.body).toBe(beforeData.body);

    const conflict = await cli(["status", "systems/okta", "stable", "--expected-hash", beforeData.hash]);
    expect(conflict.exitCode).toBe(5);
    expect(JSON.parse(conflict.stderr).error.code).toBe("MUTATION_CONFLICT");

    const missing = await cli(["status", "systems/missing-status", "stable"]);
    expect(missing.exitCode).toBe(4);
    expect(JSON.parse(missing.stderr).error.code).toBe("CONCEPT_NOT_FOUND");
  });

  test("previews and performs a recoverable knowledge reset", async () => {
    const resetRepository = path.join(root, "reset-repository");
    mkdirSync(path.join(resetRepository, ".lore"), { recursive: true });
    const resetBundle = path.join(resetRepository, ".lore", "knowledge");
    cpSync(path.join(project, "test/fixtures/graph"), resetBundle, { recursive: true });

    const implicitBundle = await compiledCli(["reset", "--knowledge"]);
    expect(implicitBundle.exitCode).toBe(2);
    expect(JSON.parse(implicitBundle.stderr).error.code).toBe("INVALID_ARGUMENT");

    const missingScope = await cli(["reset"], undefined, resetBundle);
    expect(missingScope.exitCode).toBe(2);

    const preview = await cli(["reset", "--knowledge"], undefined, resetBundle);
    expect(preview.exitCode).toBe(0);
    const previewData = JSON.parse(preview.stdout).data as {
      bundle: string;
      concepts: number;
      files: number;
      confirmation_token: string;
      requires_confirmation: boolean;
    };
    expect(previewData).toEqual(expect.objectContaining({
      bundle: realpathSync(resetBundle),
      concepts: 7,
      files: 8,
      requires_confirmation: true,
    }));
    expect(previewData.confirmation_token).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(path.join(resetBundle, "systems/okta.md"))).toBeTrue();

    const wrong = await cli(["reset", "--knowledge", "--confirm", "wrong"], undefined, resetBundle);
    expect(wrong.exitCode).toBe(5);
    expect(JSON.parse(wrong.stderr).error.code).toBe("MUTATION_CONFLICT");
    expect(existsSync(path.join(resetBundle, "systems/okta.md"))).toBeTrue();

    writeFileSync(path.join(resetBundle, "changed.txt"), "changed");
    const stale = await cli(["reset", "--knowledge", "--confirm", previewData.confirmation_token], undefined, resetBundle);
    expect(stale.exitCode).toBe(5);
    expect(existsSync(path.join(resetBundle, "systems/okta.md"))).toBeTrue();

    const refreshed = await cli(["reset", "--knowledge"], undefined, resetBundle);
    const token = JSON.parse(refreshed.stdout).data.confirmation_token as string;
    const reset = await cli(["reset", "--knowledge", "--confirm", token], undefined, resetBundle);
    expect(reset.exitCode).toBe(0);
    const resetData = JSON.parse(reset.stdout).data as { backup: string; concepts: number; removed: { concepts: number; files: number }; cache: { current: boolean } };
    expect(resetData).toEqual(expect.objectContaining({ concepts: 0, cache: { current: true } }));
    expect(resetData.removed).toEqual(expect.objectContaining({ concepts: 7, files: 9 }));
    expect(readdirSync(resetBundle)).toEqual([]);
    expect(path.dirname(resetData.backup)).toBe(realpathSync(path.join(resetRepository, ".lore", "backups")));
    expect(existsSync(path.join(resetData.backup, "systems/okta.md"))).toBeTrue();

    const info = await cli(["info"], undefined, resetBundle);
    expect(JSON.parse(info.stdout).data).toEqual(expect.objectContaining({ concepts: 0, edges: 0 }));
  });

  test("permanently resets knowledge only with a mode-specific token", async () => {
    const resetRepository = path.join(root, "permanent-reset-repository");
    mkdirSync(path.join(resetRepository, ".lore"), { recursive: true });
    const resetBundle = path.join(resetRepository, ".lore", "knowledge");
    cpSync(path.join(project, "test/fixtures/graph"), resetBundle, { recursive: true });

    const indexed = await cli(["info"], undefined, resetBundle);
    expect(JSON.parse(indexed.stdout).data).toEqual(expect.objectContaining({ concepts: 7 }));

    const recoverablePreview = await cli(["reset", "--knowledge"], undefined, resetBundle);
    const recoverableToken = JSON.parse(recoverablePreview.stdout).data.confirmation_token as string;
    const permanentPreview = await cli(["reset", "--knowledge", "--no-backup"], undefined, resetBundle);
    const permanentData = JSON.parse(permanentPreview.stdout).data as { confirmation_token: string; mode: string; recoverable: boolean };
    expect(permanentData).toEqual(expect.objectContaining({ mode: "permanent", recoverable: false }));
    expect(permanentData.confirmation_token).not.toBe(recoverableToken);

    const wrongMode = await cli(["reset", "--knowledge", "--no-backup", "--confirm", recoverableToken], undefined, resetBundle);
    expect(wrongMode.exitCode).toBe(5);
    expect(existsSync(path.join(resetBundle, "systems/okta.md"))).toBeTrue();

    const reset = await cli(["reset", "--knowledge", "--no-backup", "--confirm", permanentData.confirmation_token], undefined, resetBundle);
    expect(reset.exitCode).toBe(0);
    const resetData = JSON.parse(reset.stdout).data as Record<string, unknown>;
    expect(resetData).toEqual(expect.objectContaining({ mode: "permanent", recoverable: false, concepts: 0, cache: { current: true } }));
    expect(resetData.backup).toBeUndefined();
    expect(readdirSync(resetBundle)).toEqual([]);
    expect(existsSync(path.join(resetRepository, ".lore", "backups"))).toBeFalse();
    expect(readdirSync(path.join(resetRepository, ".lore"))).toEqual(["knowledge"]);

    const info = await cli(["info"], undefined, resetBundle);
    expect(JSON.parse(info.stdout).data).toEqual(expect.objectContaining({ concepts: 0, edges: 0 }));
    const find = await cli(["find", "identity"], undefined, resetBundle);
    expect(JSON.parse(find.stdout).data.results).toEqual([]);
  });

  test("generates complete and rooted visualisations as disposable HTML", async () => {
    const visualBundle = path.join(root, "visual-bundle");
    cpSync(path.join(project, "test/fixtures/graph"), visualBundle, { recursive: true });
    const completePath = path.join(root, "visualisations", "complete.html");
    const complete = await cli(["visualise", "--output", completePath], undefined, visualBundle);
    expect(complete.exitCode).toBe(0);
    expect(complete.stderr).toBe("");
    const completeData = JSON.parse(complete.stdout).data as { path: string; scope: string; root: null; nodes: number; edges: number; opened: boolean };
    expect(path.basename(completeData.path)).toBe(path.basename(completePath));
    expect(path.basename(path.dirname(completeData.path))).toBe(path.basename(path.dirname(completePath)));
    expect(existsSync(completeData.path)).toBeTrue();
    expect(completeData).toEqual(expect.objectContaining({ scope: "bundle", root: null, nodes: 9, edges: 9, opened: false }));
    const html = readFileSync(completePath, "utf8");
    expect(html).toContain("Lore knowledge graph");
    expect(html).toContain("systems/missing");
    expect(html).not.toContain("fetch(");

    writeFileSync(completePath, "replace me");
    expect((await cli(["visualise", "--output", completePath], undefined, visualBundle)).exitCode).toBe(0);
    expect(readFileSync(completePath, "utf8")).not.toBe("replace me");

    const rootedPath = path.join(root, "visualisations", "rooted.html");
    const rooted = await cli(["visualise", "capabilities/payments", "--direction", "out", "--depth", "2", "--output", rootedPath], undefined, visualBundle);
    expect(rooted.exitCode).toBe(0);
    expect(JSON.parse(rooted.stdout).data).toEqual(expect.objectContaining({ scope: "rooted", root: "capabilities/payments" }));
    expect(readFileSync(rootedPath, "utf8")).toContain("capabilities/payments");

    const tooLarge = await cli(["visualise", "--max-nodes", "1", "--output", path.join(root, "too-large.html")], undefined, visualBundle);
    expect(tooLarge.exitCode).toBe(6);
    expect(JSON.parse(tooLarge.stderr).error.code).toBe("GRAPH_TOO_LARGE");

    const invalidWholeOptions = await cli(["visualise", "--depth", "2", "--output", path.join(root, "invalid.html")], undefined, visualBundle);
    expect(invalidWholeOptions.exitCode).toBe(2);
    const insideOutput = path.join(visualBundle, "generated", "graph.html");
    const insideBundle = await cli(["visualise", "--output", insideOutput], undefined, visualBundle);
    expect(insideBundle.exitCode).toBe(2);
    expect(existsSync(path.dirname(insideOutput))).toBeFalse();
  });
});
