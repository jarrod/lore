import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

export const TOOL_VERSION = "0.1.0";

export function cachePath(bundle: string): string {
  const hash = new Bun.CryptoHasher("sha256").update(bundle).digest("hex").slice(0, 24);
  const override = process.env.OKF_CACHE_DIR;
  const base = override
    ? path.resolve(override)
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Caches", "lore")
      : process.platform === "win32"
        ? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "lore", "cache")
        : path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "lore");
  return path.join(base, hash, "index.db");
}

export function openDatabase(bundle: string, rebuild = false): { db: Database; path: string; rebuilt: boolean } {
  const dbPath = cachePath(bundle);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  if (rebuild) removeDatabaseFiles(dbPath);
  let rebuilt = rebuild || !existsSync(dbPath);
  let db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  const version = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
  if (version && version.value !== SCHEMA_VERSION) {
    db.close();
    removeDatabaseFiles(dbPath);
    db = new Database(dbPath, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.exec(SCHEMA_SQL);
    rebuilt = true;
  }
  const upsert = db.query("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  upsert.run("schema_version", SCHEMA_VERSION);
  upsert.run("tool_version", TOOL_VERSION);
  upsert.run("bundle_path", bundle);
  return { db, path: dbPath, rebuilt };
}

function removeDatabaseFiles(dbPath: string): void {
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(candidate)) unlinkSync(candidate);
  }
}

export function verifyFts5(): boolean {
  try {
    const db = new Database(":memory:");
    db.exec("CREATE VIRTUAL TABLE fts_test USING fts5(content); INSERT INTO fts_test VALUES ('customer identity authentication');");
    db.query("SELECT bm25(fts_test) score FROM fts_test WHERE fts_test MATCH 'identity'").get();
    db.close();
    return true;
  } catch {
    return false;
  }
}
