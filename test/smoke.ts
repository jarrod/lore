import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

// Windows can report the same directory through both an 8.3 alias and its long path.
function sameDirectory(left: string, right: string): boolean {
  const a = statSync(left, { bigint: true });
  const b = statSync(right, { bigint: true });
  return a.isDirectory() && b.isDirectory() && a.ino !== 0n && a.dev === b.dev && a.ino === b.ino;
}

const project = path.resolve(import.meta.dir, "..");
const binaryOption = Bun.argv.indexOf("--binary");
const suppliedBinary = binaryOption >= 0 ? Bun.argv[binaryOption + 1] : undefined;
if (binaryOption >= 0 && !suppliedBinary) throw new Error("--binary requires a path");
const binary = suppliedBinary
  ? path.resolve(suppliedBinary)
  : process.platform === "win32"
    ? path.join(project, "dist", "lore.exe")
    : path.join(project, "dist", "lore");

const cache = mkdtempSync(path.join(os.tmpdir(), "lore-smoke-"));
const bundle = path.join(cache, "bundle");
cpSync(path.join(project, "test", "fixtures", "graph"), bundle, { recursive: true });
const initializedRepository = mkdtempSync(path.join(os.tmpdir(), "lore-init-smoke-"));
const visualisation = path.join(initializedRepository, "knowledge-graph.html");

const commands = [
  ["--help"],
  ["info"],
  ["index", "--rebuild"],
  ["find", "customer identity"],
  ["get", "capabilities/customer-identity", "--section", "Authentication"],
  ["graph", "capabilities/payments", "--depth", "3"],
  ["visualise", "capabilities/payments", "--depth", "3", "--output", visualisation],
  ["check"],
];

try {
  const version = Bun.spawnSync([binary, "--version"], { stdout: "pipe", stderr: "pipe" });
  if (
    version.exitCode !== 0 ||
    version.stdout.toString() !==
      `${(await Bun.file(path.join(project, "package.json")).json()).version}\n` ||
    version.stderr.length !== 0
  ) {
    throw new Error("--version did not print only the expected version");
  }

  writeFileSync(path.join(initializedRepository, ".env"), "LORE_TEST_UNUSED=1\n");
  writeFileSync(path.join(initializedRepository, "bunfig.toml"), "invalid bunfig syntax\n");
  const initialized = Bun.spawnSync([binary, "init", "--repo", initializedRepository], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (initialized.exitCode !== 0) throw new Error(`init failed: ${initialized.stderr.toString()}`);
  const initData = JSON.parse(initialized.stdout.toString()) as {
    ok?: boolean;
    data?: { binary?: string; bundle?: string; cache?: string; installed?: boolean };
  };
  if (initData.ok !== true || initData.data?.installed !== true)
    throw new Error("init did not install the standalone executable");
  const localBinary = initData.data.binary;
  if (!localBinary || !existsSync(localBinary))
    throw new Error("init did not create the repository-local executable");
  if (!initData.data.bundle || !existsSync(initData.data.bundle))
    throw new Error("init did not create the knowledge bundle");
  if (readdirSync(initData.data.bundle).length !== 0)
    throw new Error("init did not create an empty knowledge bundle");
  if (!initData.data.cache || !existsSync(initData.data.cache))
    throw new Error("init did not create the cache directory");

  const localInfo = Bun.spawnSync([localBinary, "info"], {
    cwd: initializedRepository,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (localInfo.exitCode !== 0) throw new Error(localInfo.stderr.toString());
  const info = JSON.parse(localInfo.stdout.toString()).data;
  if (
    !sameDirectory(info.bundle, initData.data.bundle) ||
    !sameDirectory(path.dirname(path.dirname(info.cache.path)), initData.data.cache)
  ) {
    throw new Error(
      `installed binary did not use local knowledge and cache: ${JSON.stringify({ info, initialized: initData.data })}`,
    );
  }
  const preview = Bun.spawnSync([localBinary, "reset", "--knowledge"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (
    preview.exitCode !== 0 ||
    !sameDirectory(JSON.parse(preview.stdout.toString()).data.bundle, initData.data.bundle)
  ) {
    throw new Error("reset did not default to installed knowledge");
  }
  const fromCwd = Bun.spawnSync([binary, "info"], {
    cwd: initializedRepository,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (
    fromCwd.exitCode !== 0 ||
    !sameDirectory(JSON.parse(fromCwd.stdout.toString()).data.bundle, initData.data.bundle)
  ) {
    throw new Error("uninstalled binary did not resolve working-directory local knowledge");
  }
  const missing = Bun.spawnSync([binary, "info"], { cwd: cache, stdout: "pipe", stderr: "pipe" });
  if (missing.exitCode !== 4)
    throw new Error("missing local knowledge must not fall back to a source directory");
  const override = Bun.spawnSync([localBinary, "info", "--bundle", bundle], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (override.exitCode !== 0 || JSON.parse(override.stdout.toString()).data.concepts !== 7) {
    throw new Error("explicit bundle did not override installed knowledge");
  }
  const ignore = path.join(initializedRepository, ".lore", ".gitignore");
  writeFileSync(ignore, `${readFileSync(ignore, "utf8")}custom-entry\n`);

  const repeated = Bun.spawnSync([localBinary, "init", "--repo", initializedRepository], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (repeated.exitCode !== 0)
    throw new Error(`repeated init failed: ${repeated.stderr.toString()}`);
  const repeatedData = JSON.parse(repeated.stdout.toString()) as {
    ok?: boolean;
    data?: { installed?: boolean };
  };
  if (repeatedData.ok !== true || repeatedData.data?.installed !== false)
    throw new Error("init was not idempotent");
  if (!readFileSync(ignore, "utf8").includes("custom-entry"))
    throw new Error("init did not preserve existing ignore entries");
  if (!readFileSync(ignore, "utf8").includes("/visualisations/"))
    throw new Error("init did not ignore generated visualisations");
  if (!readFileSync(ignore, "utf8").includes("/backups/"))
    throw new Error("init did not ignore recoverable knowledge backups");

  const created = Bun.spawnSync([localBinary, "put", "smoke/example"], {
    stdin: Buffer.from(
      JSON.stringify({
        mode: "create",
        frontmatter: { type: "Smoke Test", title: "Compiled mutation" },
        body: "# Compiled mutation\n",
      }),
    ),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (created.exitCode !== 0) throw new Error(`put failed: ${created.stderr.toString()}`);
  const createdData = JSON.parse(created.stdout.toString()) as {
    ok?: boolean;
    data?: { hash?: string };
  };
  if (createdData.ok !== true || !createdData.data?.hash)
    throw new Error("put did not return a mutation hash");

  const changed = Bun.spawnSync(
    [
      localBinary,
      "status",
      "smoke/example",
      "deprecated",
      "--expected-hash",
      createdData.data.hash,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (changed.exitCode !== 0) throw new Error(`status failed: ${changed.stderr.toString()}`);
  const changedData = JSON.parse(changed.stdout.toString()) as {
    ok?: boolean;
    data?: { status?: string };
  };
  if (changedData.ok !== true || changedData.data?.status !== "deprecated")
    throw new Error("status did not update the compiled mutation");

  const resetPreview = Bun.spawnSync([localBinary, "reset", "--knowledge"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (resetPreview.exitCode !== 0) throw new Error(resetPreview.stderr.toString());
  const token = JSON.parse(resetPreview.stdout.toString()).data.confirmation_token;
  const reset = Bun.spawnSync([localBinary, "reset", "--knowledge", "--confirm", token], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (reset.exitCode !== 0 || readdirSync(initData.data.bundle).length !== 0) {
    throw new Error("local reset failed");
  }
  const afterReset = Bun.spawnSync([localBinary, "info"], { stdout: "pipe", stderr: "pipe" });
  if (afterReset.exitCode !== 0 || JSON.parse(afterReset.stdout.toString()).data.concepts !== 0) {
    throw new Error("local reset did not clear its derived index");
  }

  for (const args of commands) {
    const child = Bun.spawnSync([binary, ...args, "--bundle", bundle], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (child.exitCode !== 0) throw new Error(`${args[0]} failed: ${child.stderr.toString()}`);
    const parsed = JSON.parse(child.stdout.toString()) as { ok?: boolean };
    if (parsed.ok !== true) throw new Error(`${args[0]} did not return a success envelope`);
  }
  if (
    !existsSync(visualisation) ||
    !readFileSync(visualisation, "utf8").includes("Lore knowledge graph")
  ) {
    throw new Error("visualise did not produce a standalone HTML graph");
  }
} finally {
  rmSync(cache, { recursive: true, force: true });
  rmSync(initializedRepository, { recursive: true, force: true });
}
