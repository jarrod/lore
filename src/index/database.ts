import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";
import { TOOL_VERSION } from "../version";

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
  const existed = existsSync(dbPath);
  let rebuilt = rebuild || !existed;
  let db = new Database(dbPath, { create: true });
  let incompatible = false;
  try {
    initializeDatabase(db);
    incompatible = existed && !rebuild && !hasCurrentSchema(db);
  } catch (error) {
    if (!existed || rebuild) { db.close(); throw error; }
    incompatible = true;
  }
  if (incompatible) {
    db.close();
    removeDatabaseFiles(dbPath);
    db = new Database(dbPath, { create: true });
    initializeDatabase(db);
    rebuilt = true;
  }
  const upsert = db.query("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  upsert.run("schema_version", SCHEMA_VERSION);
  upsert.run("tool_version", TOOL_VERSION);
  upsert.run("bundle_path", bundle);
  return { db, path: dbPath, rebuilt };
}

function initializeDatabase(db: Database): void {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
}

function hasCurrentSchema(db: Database): boolean {
  const version = db.query("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | null;
  if (version?.value !== SCHEMA_VERSION) return false;
  try {
    db.query("SELECT id,path,type,title,description,status,trust,stale_after,hash,mtime_ms,size_bytes FROM concept LIMIT 0").all();
    db.query("SELECT id,title,description,tags,search_text FROM concept_fts LIMIT 0").all();
    db.query("SELECT src,rel,dst,origin FROM edge LIMIT 0").all();
    return true;
  } catch {
    return false;
  }
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
