export const SCHEMA_VERSION = "3";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS concept (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT,
  trust TEXT NOT NULL,
  stale_after TEXT,
  hash TEXT NOT NULL,
  mtime_ms INTEGER,
  size_bytes INTEGER
);
CREATE VIRTUAL TABLE IF NOT EXISTS concept_fts USING fts5(
  id,
  title,
  description,
  tags,
  body
);
CREATE TABLE IF NOT EXISTS edge (
  src TEXT NOT NULL,
  rel TEXT NOT NULL,
  dst TEXT NOT NULL,
  origin TEXT NOT NULL,
  PRIMARY KEY (src, rel, dst, origin)
);
CREATE INDEX IF NOT EXISTS edge_src ON edge(src);
CREATE INDEX IF NOT EXISTS edge_dst ON edge(dst);
CREATE INDEX IF NOT EXISTS edge_rel ON edge(rel);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
