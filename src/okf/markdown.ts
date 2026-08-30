import path from "node:path";
import { validateConceptId } from "./ids";
import type { Frontmatter } from "./frontmatter";

export interface EdgeInput {
  rel: string;
  dst: string;
  origin: "markdown" | "typed" | "okf";
}

export function extractMarkdownEdges(body: string, sourceId: string): EdgeInput[] {
  const hrefs = markdownHrefs(body);
  const sourceDir = path.posix.dirname(sourceId);
  const edges: EdgeInput[] = [];
  for (const raw of hrefs) {
    const target = resolveConceptTarget(raw, sourceDir);
    if (target?.id) edges.push({ rel: "links_to", dst: target.id, origin: "markdown" });
  }
  return dedupeEdges(edges);
}

export function unsafeMarkdownTargets(body: string, sourceId: string): string[] {
  const sourceDir = path.posix.dirname(sourceId);
  return markdownHrefs(body).filter((raw) => {
    return resolveConceptTarget(raw, sourceDir)?.unsafe === true;
  });
}

export function extractOkfEdges(frontmatter: Frontmatter, sourceId: string): EdgeInput[] {
  const sourceDir = path.posix.dirname(sourceId);
  const edges: EdgeInput[] = [];
  for (const field of okfPathFields(frontmatter)) {
    const target = resolveConceptTarget(field.value, sourceDir);
    if (target?.id) edges.push({ rel: field.rel, dst: target.id, origin: "okf" });
  }
  return dedupeEdges(edges);
}

export function unsafeOkfTargets(frontmatter: Frontmatter, sourceId: string): string[] {
  const sourceDir = path.posix.dirname(sourceId);
  return okfPathFields(frontmatter)
    .filter((field) => resolveConceptTarget(field.value, sourceDir)?.unsafe)
    .map((field) => field.value);
}

function okfPathFields(frontmatter: Frontmatter): Array<{ rel: string; value: string }> {
  const fields: Array<{ rel: string; value: string }> = [];
  addStringField(fields, "resource", frontmatter.resource);
  addStringField(fields, "computation", frontmatter.computation);
  for (const relation of ["executor", "attester"] as const) {
    const value = frontmatter[relation];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      addStringField(fields, relation, (value as Record<string, unknown>).resource);
    }
  }
  if (Array.isArray(frontmatter.sources)) {
    for (const source of frontmatter.sources) {
      if (source && typeof source === "object" && !Array.isArray(source)) {
        addStringField(fields, "source", (source as Record<string, unknown>).resource);
      }
    }
  }
  return fields;
}

function addStringField(fields: Array<{ rel: string; value: string }>, rel: string, value: unknown): void {
  if (typeof value === "string") fields.push({ rel, value });
}

function resolveConceptTarget(raw: string, sourceDir: string): { id?: string; unsafe?: true } | undefined {
  const href = raw.split("#", 1)[0]?.split("?", 1)[0] ?? "";
  if (!href.endsWith(".md") || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return undefined;
  const basename = path.posix.basename(href);
  if (basename === "index.md" || basename === "log.md") return undefined;
  const resolved = href.startsWith("/")
    ? path.posix.normalize(href.slice(1))
    : path.posix.normalize(path.posix.join(sourceDir === "." ? "" : sourceDir, href));
  if (resolved.startsWith("../") || resolved === "..") return { unsafe: true };
  try {
    return { id: validateConceptId(resolved.slice(0, -3)) };
  } catch {
    return { unsafe: true };
  }
}

function markdownHrefs(body: string): string[] {
  const hrefs: string[] = [];
  Bun.markdown.render(body, {
    link: (children, meta) => { hrefs.push(meta.href); return children; },
    image: () => "",
  });
  return hrefs;
}

export function searchableMarkdownText(body: string): string {
  const block = (children: string): string => `${children}\n`;
  const cell = (children: string): string => `${children} `;
  const text = Bun.markdown.render(body, {
    heading: block,
    paragraph: block,
    blockquote: block,
    code: block,
    list: block,
    listItem: block,
    hr: () => "\n",
    table: block,
    thead: block,
    tbody: block,
    tr: block,
    th: cell,
    td: cell,
    html: () => "",
    strong: (children) => children,
    emphasis: (children) => children,
    link: (children) => children,
    image: (children) => children,
    codespan: (children) => children,
    strikethrough: (children) => children,
    text: (value) => isInlineHtmlTag(value) ? "" : value,
  });
  return text.replace(/\s+/g, " ").trim();
}

function isInlineHtmlTag(value: string): boolean {
  const trimmed = value.trim();
  return /^<\/?[A-Za-z][^>]*>$/.test(trimmed) || /^<!--(?:[^-]|-(?!->))*-->$/.test(trimmed);
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
