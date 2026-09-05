import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "../index/database";
import { refreshIndex } from "../index/refresh";
import {
  isOkfStatus,
  splitDocument,
  serializeDocument,
  type Frontmatter,
} from "../okf/frontmatter";
import { assertBundlePath, conceptPath } from "../okf/ids";
import { extractTypedEdges, unsafeMarkdownTargets, unsafeOkfTargets } from "../okf/markdown";
import { conflict, invalidArgument, invalidOkf, notFound } from "../protocol/errors";
import { ensureNoArgs } from "../commands/options";

export interface PutRequest {
  mode?: "create" | "merge" | "replace";
  frontmatter?: Frontmatter;
  body?: string;
  body_file?: string;
  relations?: unknown;
  expected_hash?: string;
  allow_destructive?: boolean;
}

export async function runPut(bundle: string, args: string[]): Promise<unknown> {
  const id = args.shift();
  if (!id) throw invalidArgument("put requires a concept ID");
  ensureNoArgs(args);
  let request: PutRequest;
  try {
    request = JSON.parse(readFileSync(process.stdin.fd, "utf8")) as PutRequest;
  } catch {
    throw invalidArgument("put requires a valid JSON request on stdin");
  }
  return putConcept(bundle, id, request);
}

export async function putConcept(
  bundle: string,
  id: string,
  request: PutRequest,
): Promise<unknown> {
  if (!request || typeof request !== "object" || Array.isArray(request))
    throw invalidArgument("put request must be an object");
  if (request.body !== undefined && request.body_file !== undefined)
    throw invalidArgument("body and body_file are mutually exclusive");
  if (request.body !== undefined && typeof request.body !== "string")
    throw invalidArgument("body must be a string");
  if (request.body_file !== undefined && typeof request.body_file !== "string")
    throw invalidArgument("body_file must be a string");
  if (
    request.frontmatter !== undefined &&
    (!request.frontmatter ||
      typeof request.frontmatter !== "object" ||
      Array.isArray(request.frontmatter))
  )
    throw invalidArgument("frontmatter must be an object");
  if (
    request.frontmatter &&
    Object.hasOwn(request.frontmatter, "status") &&
    (typeof request.frontmatter.status !== "string" || !isOkfStatus(request.frontmatter.status))
  ) {
    throw invalidOkf("status must be draft, stable, or deprecated", {
      id,
      status: request.frontmatter.status,
    });
  }
  const mode = request.mode ?? "merge";
  if (!(["create", "merge", "replace"] as string[]).includes(mode))
    throw invalidArgument("Invalid put mode", { mode });
  const destination = conceptPath(bundle, id);
  const exists = existsSync(destination);
  if (mode === "create" && exists) throw conflict("Concept already exists", { id });
  if (mode === "replace" && !exists)
    throw notFound("CONCEPT_NOT_FOUND", "Concept does not exist", { id });
  if (mode === "replace" && request.allow_destructive !== true)
    throw conflict("replace requires allow_destructive=true", { id });
  let current: { frontmatter: Frontmatter; body: string; hash: string } | undefined;
  if (exists) {
    const resolvedDestination = realpathSync(destination);
    assertBundlePath(bundle, resolvedDestination, id);
    const content = await readFile(resolvedDestination, "utf8");
    const parsed = splitDocument(content, id);
    current = { ...parsed, hash: new Bun.CryptoHasher("sha256").update(content).digest("hex") };
    if (request.expected_hash !== undefined && request.expected_hash !== current.hash)
      throw conflict("Concept hash does not match", {
        id,
        expected_hash: request.expected_hash,
        actual_hash: current.hash,
      });
  }
  const suppliedBody =
    request.body_file !== undefined ? await readBodyFile(request.body_file) : request.body;
  let frontmatter: Frontmatter;
  let body: string;
  if (mode === "replace") {
    if (!request.frontmatter || suppliedBody === undefined)
      throw invalidArgument("replace requires complete frontmatter and body content");
    frontmatter = { ...request.frontmatter };
    body = suppliedBody;
  } else {
    frontmatter = { ...current?.frontmatter, ...request.frontmatter };
    body = suppliedBody ?? current?.body ?? "";
  }
  if (request.relations !== undefined) {
    if (!Array.isArray(request.relations)) throw invalidArgument("relations must be an array");
    const existingX = frontmatter["x-okf"];
    const x =
      existingX && typeof existingX === "object" && !Array.isArray(existingX)
        ? { ...(existingX as Record<string, unknown>) }
        : {};
    x.rel = request.relations;
    frontmatter["x-okf"] = x;
  }
  if (typeof frontmatter.type !== "string" || !frontmatter.type.trim())
    throw invalidOkf("Resulting concept requires a non-empty type", { id });
  try {
    extractTypedEdges(frontmatter);
  } catch (error) {
    throw invalidOkf("Resulting concept has malformed x-okf.rel", { id, reason: String(error) });
  }
  const unsafeTargets = [...unsafeMarkdownTargets(body, id), ...unsafeOkfTargets(frontmatter, id)];
  if (unsafeTargets.length)
    throw invalidOkf("Resulting concept contains a path that escapes the bundle", {
      id,
      targets: unsafeTargets,
    });
  const content = serializeDocument(frontmatter, body);
  splitDocument(content, id);
  await ensureContainedParent(bundle, destination, id);
  const temporary = `${destination}.lore-${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, content);
    await rename(temporary, destination);
  } catch (error) {
    if (existsSync(temporary)) await unlink(temporary);
    throw error;
  }
  const index = await refreshAfterMutation(bundle);
  const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex");
  return { id, mode, created: !exists, hash, index };
}

async function refreshAfterMutation(
  bundle: string,
): Promise<{ current: boolean; recovery?: string }> {
  try {
    const { db } = openDatabase(bundle);
    try {
      await refreshIndex(db, bundle);
    } finally {
      db.close();
    }
    return { current: true };
  } catch {
    return { current: false, recovery: "lore index --rebuild" };
  }
}

async function ensureContainedParent(
  bundle: string,
  destination: string,
  id: string,
): Promise<void> {
  const parent = path.dirname(destination);
  let existingAncestor = parent;
  while (!existsSync(existingAncestor)) {
    const next = path.dirname(existingAncestor);
    if (next === existingAncestor)
      throw invalidArgument("Concept path has no accessible bundle ancestor", { id });
    existingAncestor = next;
  }
  assertBundlePath(bundle, realpathSync(existingAncestor), id);
  await mkdir(parent, { recursive: true });
  assertBundlePath(bundle, realpathSync(parent), id);
}

async function readBodyFile(file: string): Promise<string> {
  try {
    return await readFile(path.resolve(process.cwd(), file), "utf8");
  } catch {
    throw invalidArgument("body_file could not be read", { body_file: file });
  }
}
