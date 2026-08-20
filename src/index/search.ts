import type { Database } from "bun:sqlite";
import { invalidArgument } from "../protocol/errors";

export interface FindOptions {
  type?: string;
  tag?: string;
  status?: string;
  scope?: string;
  limit?: number;
}

export function naturalFtsQuery(input: string): string {
  const terms = input.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) throw invalidArgument("Search query must not be empty");
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
}

export function findConcepts(db: Database, query: string, options: FindOptions): unknown[] {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidArgument("--limit must be between 1 and 100");
  let match = naturalFtsQuery(query);
  if (options.tag) match += ` AND tags : "${options.tag.replaceAll('"', '""')}"`;
  const where = ["concept_fts MATCH ?"];
  const params: Array<string | number> = [match];
  if (options.type) { where.push("c.type = ?"); params.push(options.type); }
  if (options.status) { where.push("c.status = ?"); params.push(options.status); }
  if (options.scope) { where.push("(c.id = ? OR c.id LIKE ?)"); params.push(options.scope, `${options.scope}/%`); }
  params.push(limit);
  return db.query(`SELECT c.id,c.type,c.title,c.description,c.status,c.trust,-bm25(concept_fts,0.0,8.0,4.0,3.0,1.0) score
    FROM concept_fts JOIN concept c ON c.id=concept_fts.id
    WHERE ${where.join(" AND ")} ORDER BY score DESC,c.id ASC LIMIT ?`).all(...params);
}
