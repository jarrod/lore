import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/index/database";
import { refreshIndex, type RefreshResult } from "../src/index/refresh";

const project = path.resolve(import.meta.dir, "..");
const args = Bun.argv.slice(2);
const bundleOption = takeOption(args, "--bundle");
const iterationsOption = takeOption(args, "--iterations");
if (args.length) throw new Error(`Unexpected argument: ${args[0]}`);

const requestedBundle = path.resolve(
  bundleOption ?? path.join(project, "test", "fixtures", "graph"),
);
if (!existsSync(requestedBundle) || !statSync(requestedBundle).isDirectory()) {
  throw new Error(`Profile bundle is not a directory: ${requestedBundle}`);
}
const sourceBundle = realpathSync(requestedBundle);
const iterations =
  iterationsOption === undefined ? (bundleOption ? 1 : 100) : Number(iterationsOption);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1000) {
  throw new Error("--iterations must be an integer between 1 and 1000");
}

mkdirSync(path.join(project, "dist", "profiles"), { recursive: true });
const cache = mkdtempSync(path.join(os.tmpdir(), "lore-index-profile-"));
const bundle = path.join(cache, "knowledge");
cpSync(sourceBundle, bundle, { recursive: true });

let result: RefreshResult | undefined;
try {
  for (let iteration = 0; iteration < iterations; iteration++) {
    const { db } = openDatabase(bundle, true);
    try {
      result = await refreshIndex(db, bundle);
    } finally {
      db.close();
    }
  }
  process.stdout.write(`${JSON.stringify({ bundle, iterations, result })}\n`);
} finally {
  rmSync(cache, { recursive: true, force: true });
}

function takeOption(values: string[], name: string): string | undefined {
  const index = values.indexOf(name);
  if (index < 0) return undefined;
  const value = values[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  values.splice(index, 2);
  return value;
}
