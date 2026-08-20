import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const project = path.resolve(import.meta.dir, "..");
const binaryOption = Bun.argv.indexOf("--binary");
const suppliedBinary = binaryOption >= 0 ? Bun.argv[binaryOption + 1] : undefined;
if (binaryOption >= 0 && !suppliedBinary) throw new Error("--binary requires a path");
const binary = suppliedBinary
  ? path.resolve(suppliedBinary)
  : process.platform === "win32"
    ? path.join(project, "dist", "lore.exe")
    : path.join(project, "dist", "lore");
const bundle = path.join(project, "test", "fixtures", "graph");
const cache = mkdtempSync(path.join(os.tmpdir(), "lore-smoke-"));
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
  if (version.exitCode !== 0 || version.stdout.toString() !== "0.1.0\n" || version.stderr.length !== 0) {
    throw new Error("--version did not print only the expected version");
  }

  const initialized = Bun.spawnSync([binary, "init", "--repo", initializedRepository], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (initialized.exitCode !== 0) throw new Error(`init failed: ${initialized.stderr.toString()}`);
  const initData = JSON.parse(initialized.stdout.toString()) as {
    ok?: boolean;
    data?: { binary?: string; bundle?: string; cache?: string; installed?: boolean };
  };
  if (initData.ok !== true || initData.data?.installed !== true) throw new Error("init did not install the standalone executable");
  const localBinary = initData.data.binary;
  if (!localBinary || !existsSync(localBinary)) throw new Error("init did not create the repository-local executable");
  if (!initData.data.bundle || !existsSync(path.join(initData.data.bundle, "index.md"))) throw new Error("init did not create the knowledge bundle");
  if (!initData.data.cache || !existsSync(initData.data.cache)) throw new Error("init did not create the cache directory");
  const ignore = path.join(initializedRepository, ".lore", ".gitignore");
  writeFileSync(ignore, `${readFileSync(ignore, "utf8")}custom-entry\n`);

  const repeated = Bun.spawnSync([localBinary, "init", "--repo", initializedRepository], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (repeated.exitCode !== 0) throw new Error(`repeated init failed: ${repeated.stderr.toString()}`);
  const repeatedData = JSON.parse(repeated.stdout.toString()) as { ok?: boolean; data?: { installed?: boolean } };
  if (repeatedData.ok !== true || repeatedData.data?.installed !== false) throw new Error("init was not idempotent");
  if (!readFileSync(ignore, "utf8").includes("custom-entry")) throw new Error("init did not preserve existing ignore entries");
  if (!readFileSync(ignore, "utf8").includes("/visualisations/")) throw new Error("init did not ignore generated visualisations");

  for (const args of commands) {
    const child = Bun.spawnSync([binary, ...args, "--bundle", bundle], {
      env: { ...Bun.env, OKF_CACHE_DIR: cache },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (child.exitCode !== 0) throw new Error(`${args[0]} failed: ${child.stderr.toString()}`);
    const parsed = JSON.parse(child.stdout.toString()) as { ok?: boolean };
    if (parsed.ok !== true) throw new Error(`${args[0]} did not return a success envelope`);
  }
  if (!existsSync(visualisation) || !readFileSync(visualisation, "utf8").includes("Lore knowledge graph")) {
    throw new Error("visualise did not produce a standalone HTML graph");
  }
} finally {
  rmSync(cache, { recursive: true, force: true });
  rmSync(initializedRepository, { recursive: true, force: true });
}
