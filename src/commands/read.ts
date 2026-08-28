import { existsSync } from "node:fs";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Database } from "bun:sqlite";
import { openDatabase, verifyFts5 } from "../index/database";
import { TOOL_VERSION } from "../version";
import { refreshIndex } from "../index/refresh";
import { findConcepts } from "../index/search";
import { graphTraversal, shortestPath, type Direction } from "../index/graph";
import { assertBundlePath, conceptPath, validateConceptId } from "../okf/ids";
import { effectiveStatus, splitDocument, trustTier } from "../okf/frontmatter";
import { extractSection } from "../okf/markdown";
import { invalidArgument, notFound } from "../protocol/errors";
import { ensureNoArgs, takeFlag, takeOption } from "./options";

export async function runInfo(bundle: string, args: string[]): Promise<unknown> {
  ensureNoArgs(args);
  const { db, path: dbPath } = openDatabase(bundle);
  try {
    const result = await refreshIndex(db, bundle);
    const fts5 = verifyFts5();
    return {
      bundle,
      okf_version: await declaredVersion(bundle),
      tool_version: TOOL_VERSION,
      concepts: result.concepts,
      edges: result.edges,
      cache: { path: dbPath, current: true },
      capabilities: {
        sqlite: true,
        fts5,
        bm25: fts5,
        typed_relations: true,
        html_visualisation: true,
        browser_open: ["darwin", "linux", "win32"].includes(process.platform),
      },
    };
  } finally { db.close(); }
}

export async function runIndex(bundle: string, args: string[]): Promise<unknown> {
  const rebuild = takeFlag(args, "--rebuild");
  ensureNoArgs(args);
  const { db } = openDatabase(bundle, rebuild);
  try { return await refreshIndex(db, bundle); } finally { db.close(); }
}

export async function runFind(bundle: string, args: string[]): Promise<unknown> {
  const query = args.shift();
  if (!query) throw invalidArgument("find requires a query");
  const type = takeOption(args, "--type");
  const tag = takeOption(args, "--tag");
  const status = takeOption(args, "--status");
  const scope = takeOption(args, "--scope");
  if (scope) validateConceptId(scope);
  const limitRaw = takeOption(args, "--limit");
  ensureNoArgs(args);
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  const { db } = openDatabase(bundle);
  try {
    await refreshIndex(db, bundle);
    return { results: findConcepts(db, query, { type, tag, status, scope, limit }) };
  } finally { db.close(); }
}

export async function runGet(bundle: string, args: string[]): Promise<unknown> {
  const id = args.shift();
  if (!id) throw invalidArgument("get requires a concept ID");
  const section = takeOption(args, "--section");
  ensureNoArgs(args);
  const { db } = openDatabase(bundle);
  try { await refreshIndex(db, bundle); } finally { db.close(); }
  const filePath = conceptPath(bundle, id);
  if (!existsSync(filePath)) throw notFound("CONCEPT_NOT_FOUND", "Concept does not exist", { id });
  let resolvedPath: string;
  try { resolvedPath = realpathSync(filePath); }
  catch { throw notFound("CONCEPT_NOT_FOUND", "Concept does not exist", { id }); }
  assertBundlePath(bundle, resolvedPath, id);
  const content = await readFile(resolvedPath, "utf8");
  const parsed = splitDocument(content, id);
  const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex");
  if (!section) return { id, hash, trust: trustTier(parsed.frontmatter), effective_status: effectiveStatus(parsed.frontmatter), frontmatter: parsed.frontmatter, body: parsed.body };
  const body = extractSection(parsed.body, section);
  if (body === undefined) throw notFound("SECTION_NOT_FOUND", "Section does not exist", { id, section });
  return { id, hash, trust: trustTier(parsed.frontmatter), effective_status: effectiveStatus(parsed.frontmatter), frontmatter: parsed.frontmatter, section, body };
}

export async function runGraph(bundle: string, args: string[]): Promise<unknown> {
  const root = args.shift();
  if (!root) throw invalidArgument("graph requires a concept ID");
  validateConceptId(root);
  const direction = (takeOption(args, "--direction") ?? "both") as Direction;
  if (!(["in", "out", "both"] as string[]).includes(direction)) throw invalidArgument("Invalid graph direction", { direction });
  const depthRaw = takeOption(args, "--depth");
  const depth = depthRaw === undefined ? 1 : Number(depthRaw);
  if (!Number.isInteger(depth) || depth < 1 || depth > 8) throw invalidArgument("--depth must be between 1 and 8");
  const rel = takeOption(args, "--rel");
  if (rel && !/^[a-z][a-z0-9_]*$/.test(rel)) throw invalidArgument("Invalid relationship filter", { rel });
  const to = takeOption(args, "--to");
  if (to) validateConceptId(to);
  ensureNoArgs(args);
  const { db } = openDatabase(bundle);
  try {
    await refreshIndex(db, bundle);
    requireConcept(db, root);
    if (to) {
      requireConcept(db, to);
      return { root, target: to, ...shortestPath(db, root, to, { direction, rel, maxDepth: depthRaw === undefined ? 8 : depth }) };
    }
    return { root, ...graphTraversal(db, root, direction, depth, rel) };
  } finally { db.close(); }
}

function requireConcept(db: Database, id: string): void {
  if (!db.query("SELECT 1 FROM concept WHERE id=?").get(id)) throw notFound("CONCEPT_NOT_FOUND", "Concept does not exist", { id });
}

async function declaredVersion(bundle: string): Promise<string> {
  const index = path.join(bundle, "index.md");
  if (!existsSync(index)) return "0.2";
  const content = await readFile(index, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return "0.2";
  try {
    const parsed = Bun.YAML.parse(match[1] ?? "") as Record<string, unknown>;
    return typeof parsed?.okf_version === "string" ? parsed.okf_version : "0.2";
  } catch { return "0.2"; }
}
