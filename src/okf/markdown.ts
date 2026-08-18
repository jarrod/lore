import path from "node:path";
import { validateConceptId } from "./ids";
import type { Frontmatter } from "./frontmatter";

export interface EdgeInput {
  rel: string;
  dst: string;
  origin: "markdown" | "typed";
}

export function extractMarkdownEdges(body: string, sourceId: string): EdgeInput[] {
  const hrefs = markdownHrefs(body);
  const sourceDir = path.posix.dirname(sourceId);
  const edges: EdgeInput[] = [];
  for (const raw of hrefs) {
    const href = raw.split("#", 1)[0]?.split("?", 1)[0] ?? "";
    if (!href.endsWith(".md") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) continue;
    const basename = path.posix.basename(href);
    if (basename === "index.md" || basename === "log.md") continue;
    const resolved = href.startsWith("/")
      ? path.posix.normalize(href.slice(1))
      : path.posix.normalize(path.posix.join(sourceDir === "." ? "" : sourceDir, href));
    if (resolved.startsWith("../") || resolved === "..") continue;
    const id = resolved.slice(0, -3);
    try {
      edges.push({ rel: "links_to", dst: validateConceptId(id), origin: "markdown" });
    } catch {
      // Unsafe Markdown targets are validation concerns, not graph nodes.
    }
  }
  return dedupeEdges(edges);
}

export function unsafeMarkdownTargets(body: string, sourceId: string): string[] {
  const sourceDir = path.posix.dirname(sourceId);
  return markdownHrefs(body).filter((raw) => {
    const href = raw.split("#", 1)[0]?.split("?", 1)[0] ?? "";
    if (!href.endsWith(".md") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return false;
    const resolved = href.startsWith("/")
      ? path.posix.normalize(href.slice(1))
      : path.posix.normalize(path.posix.join(sourceDir === "." ? "" : sourceDir, href));
    return resolved === ".." || resolved.startsWith("../");
  });
}

function markdownHrefs(body: string): string[] {
  const hrefs: string[] = [];
  Bun.markdown.render(body, {
    link: (children, meta) => { hrefs.push(meta.href); return children; },
    image: () => "",
  });
  return hrefs;
}

export function extractTypedEdges(frontmatter: Frontmatter): EdgeInput[] {
  const x = frontmatter["x-okf"];
  if (!x || typeof x !== "object" || Array.isArray(x)) return [];
  const rels = (x as Record<string, unknown>).rel;
  if (rels === undefined) return [];
  if (!Array.isArray(rels)) throw new Error("x-okf.rel must be an array");
  return dedupeEdges(rels.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "string") {
      throw new Error("x-okf.rel entries must be [relationship, concept-id] tuples");
    }
    if (!/^[a-z][a-z0-9_]*$/.test(entry[0])) throw new Error(`Invalid relationship: ${entry[0]}`);
    return { rel: entry[0], dst: validateConceptId(entry[1]), origin: "typed" as const };
  }));
}

function dedupeEdges(edges: EdgeInput[]): EdgeInput[] {
  return [...new Map(edges.map((edge) => [`${edge.rel}\0${edge.dst}\0${edge.origin}`, edge])).values()];
}

export function extractSection(body: string, requested: string): string | undefined {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").replace(/\s+#+$/, "").toLowerCase();
  const lines = body.split(/(?<=\n)/);
  const headings: Array<{ index: number; level: number; title: string }> = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const atx = /^(#{1,6})\s+(.+?)(?:\r?\n)?$/.exec(line);
    if (atx) headings.push({ index, level: atx[1]!.length, title: atx[2]! });
    const next = lines[index + 1] ?? "";
    if (!atx && line.trim() && /^(=+|-+)\s*\r?\n?$/.test(next)) {
      headings.push({ index, level: next.trim().startsWith("=") ? 1 : 2, title: line.trim() });
    }
  }
  const startHeading = headings.find((heading) => normalize(heading.title) === normalize(requested));
  if (!startHeading) return undefined;
  const following = headings.find((heading) => heading.index > startHeading.index && heading.level <= startHeading.level);
  return lines.slice(startHeading.index, following?.index ?? lines.length).join("");
}
