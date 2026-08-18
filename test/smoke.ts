import { mkdtempSync, rmSync } from "node:fs";
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

const commands = [
  ["--help"],
  ["info"],
  ["index", "--rebuild"],
  ["find", "customer identity"],
  ["get", "capabilities/customer-identity", "--section", "Authentication"],
  ["graph", "capabilities/payments", "--depth", "3"],
  ["check"],
];

try {
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
} finally {
  rmSync(cache, { recursive: true, force: true });
}
