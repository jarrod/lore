import type { Database } from "bun:sqlite";
import path from "node:path";
import { stat } from "node:fs/promises";
import { loadConcept } from "../okf/bundle";
import { effectiveStatus } from "../okf/frontmatter";

export interface RefreshResult {
  concepts: number;
  edges: number;
  added: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

export async function refreshIndex(db: Database, bundle: string): Promise<RefreshResult> {
  const previousRows = db.query("SELECT id, path, hash, mtime_ms, size_bytes FROM concept").all() as Array<{
    id: string; path: string; hash: string; mtime_ms: number; size_bytes: number;
  }>;
  const previous = new Map(previousRows.map((row) => [row.path, row]));
  const seen = new Set<string>();
  const changed: Awaited<ReturnType<typeof loadConcept>>[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const glob = new Bun.Glob("**/*.md");
  for await (const rawRelative of glob.scan({ cwd: bundle, dot: false, onlyFiles: true, followSymlinks: false })) {
    const relative = rawRelative.split(path.sep).join("/");
    const parts = relative.split("/");
    if (parts.some((part) => part.startsWith("."))) continue;
    const name = parts.at(-1);
    if (name === "index.md" || name === "log.md") continue;
    seen.add(relative);
    const prior = previous.get(relative);
    const fileStat = await stat(path.join(bundle, relative));
    if (prior && prior.mtime_ms === fileStat.mtimeMs && prior.size_bytes === fileStat.size) {
      unchanged++;
      continue;
    }
    const concept = await loadConcept(bundle, relative);
    if (prior && prior.hash === concept.hash) {
      db.query("UPDATE concept SET mtime_ms=?, size_bytes=? WHERE id=?").run(concept.mtimeMs, concept.sizeBytes, concept.id);
      unchanged++;
      continue;
    }
    changed.push(concept);
    if (prior) updated++; else added++;
  }
  const deletedRows = previousRows.filter((row) => !seen.has(row.path));
  const transaction = db.transaction(() => {
    for (const row of deletedRows) {
      db.query("DELETE FROM edge WHERE src=?").run(row.id);
      db.query("DELETE FROM concept_fts WHERE id=?").run(row.id);
      db.query("DELETE FROM concept WHERE id=?").run(row.id);
    }
    for (const concept of changed) {
      db.query("DELETE FROM edge WHERE src=?").run(concept.id);
      db.query("DELETE FROM concept_fts WHERE id=?").run(concept.id);
      db.query(`INSERT INTO concept(id,path,type,title,description,status,stale_after,hash,mtime_ms,size_bytes)
        VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        path=excluded.path,type=excluded.type,title=excluded.title,description=excluded.description,status=excluded.status,
        stale_after=excluded.stale_after,hash=excluded.hash,mtime_ms=excluded.mtime_ms,size_bytes=excluded.size_bytes`).run(
        concept.id,
        concept.path,
        String(concept.frontmatter.type),
        stringOrNull(concept.frontmatter.title),
        stringOrNull(concept.frontmatter.description),
        effectiveStatus(concept.frontmatter),
        stringOrNull(concept.frontmatter.stale_after),
        concept.hash,
        concept.mtimeMs,
        concept.sizeBytes,
      );
      const tags = Array.isArray(concept.frontmatter.tags) ? concept.frontmatter.tags.filter((tag): tag is string => typeof tag === "string").join(" ") : "";
      db.query("INSERT INTO concept_fts(id,title,description,tags,body) VALUES (?,?,?,?,?)").run(
        concept.id, stringOrNull(concept.frontmatter.title), stringOrNull(concept.frontmatter.description), tags, concept.body,
      );
      const insertEdge = db.query("INSERT OR IGNORE INTO edge(src,rel,dst,origin) VALUES (?,?,?,?)");
      for (const edge of concept.edges) insertEdge.run(concept.id, edge.rel, edge.dst, edge.origin);
    }
    db.query("INSERT INTO meta(key,value) VALUES ('last_indexed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(new Date().toISOString());
  });
  transaction();
  const counts = db.query("SELECT (SELECT count(*) FROM concept) concepts, (SELECT count(*) FROM edge) edges").get() as { concepts: number; edges: number };
  return { ...counts, added, updated, deleted: deletedRows.length, unchanged };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
