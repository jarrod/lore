import path from "node:path";
import { existsSync, realpathSync, statSync } from "node:fs";
import { invalidArgument, invalidOkf, notFound } from "../protocol/errors";
import { compareStrings, idFromRelativePath } from "./ids";
import { splitDocument, type Frontmatter } from "./frontmatter";
import { extractMarkdownEdges, extractTypedEdges, type EdgeInput } from "./markdown";

export interface Concept {
  id: string;
  path: string;
  absolutePath: string;
  frontmatter: Frontmatter;
  body: string;
  hash: string;
  mtimeMs: number;
  sizeBytes: number;
  edges: EdgeInput[];
}

export async function loadConcept(bundle: string, relative: string): Promise<Concept> {
  let id: string;
  try { id = idFromRelativePath(relative); }
  catch (error) { throw invalidOkf("Concept has an invalid concept ID", { source: relative, reason: error instanceof Error ? error.message : String(error) }); }
  const absolutePath = path.join(bundle, relative);
  const file = Bun.file(absolutePath);
  const [content, stat] = await Promise.all([file.text(), file.stat()]);
  const parsed = splitDocument(content, relative);
  const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex");
  let typedEdges;
  try { typedEdges = extractTypedEdges(parsed.frontmatter); }
  catch (error) { throw invalidOkf("Concept has malformed x-okf.rel", { source: relative, reason: error instanceof Error ? error.message : String(error) }); }
  const edges = [...extractMarkdownEdges(parsed.body, id), ...typedEdges];
  return { id, path: relative.split(path.sep).join("/"), absolutePath, ...parsed, hash, mtimeMs: stat.mtimeMs, sizeBytes: stat.size, edges };
}

export function resolveBundle(explicit?: string): string {
  const candidate = explicit ?? process.env.OKF_BUNDLE ?? process.cwd();
  const absolute = path.resolve(candidate);
  if (!existsSync(absolute)) throw notFound("BUNDLE_NOT_FOUND", "Bundle does not exist", { path: absolute });
  try {
    const resolved = realpathSync(absolute);
    if (!statSync(resolved).isDirectory()) throw new Error("not a directory");
    return resolved;
  } catch { throw notFound("BUNDLE_NOT_FOUND", "Bundle is not an accessible directory", { path: absolute }); }
}

export async function scanBundle(bundle: string, tolerateInvalid = false): Promise<{ concepts: Concept[]; failures: Array<{ path: string; error: unknown }> }> {
  const concepts: Concept[] = [];
  const failures: Array<{ path: string; error: unknown }> = [];
  const glob = new Bun.Glob("**/*.md");
  for await (const relative of glob.scan({ cwd: bundle, dot: false, onlyFiles: true, followSymlinks: false })) {
    const parts = relative.split(/[\\/]/);
    if (parts.some((part) => part.startsWith("."))) continue;
    const name = parts.at(-1);
    if (name === "index.md" || name === "log.md") continue;
    try {
      concepts.push(await loadConcept(bundle, relative));
    } catch (error) {
      failures.push({ path: relative, error });
      if (!tolerateInvalid) throw error;
    }
  }
  concepts.sort((a, b) => compareStrings(a.id, b.id));
  return { concepts, failures };
}

export function takeGlobalBundleOption(args: string[]): { args: string[]; bundle?: string } {
  const copy = [...args];
  const index = copy.indexOf("--bundle");
  if (index < 0) return { args: copy };
  const value = copy[index + 1];
  if (!value) throw invalidArgument("--bundle requires a path");
  copy.splice(index, 2);
  return { args: copy, bundle: value };
}
