import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { scanBundle, type Concept } from "../okf/bundle";
import { isStale } from "../okf/frontmatter";
import { unsafeMarkdownTargets } from "../okf/markdown";
import { compareStrings } from "../okf/ids";
import { EXIT, LoreError } from "../protocol/errors";
import { ensureNoArgs, takeFlag } from "./options";

interface Finding { code: string; concept?: string; path?: string; [key: string]: unknown }

export async function runCheck(bundle: string, args: string[]): Promise<{ data: unknown; exitCode: number }> {
  const strict = takeFlag(args, "--strict");
  ensureNoArgs(args);
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const { concepts, failures } = await scanBundle(bundle, true);
  for (const failure of failures) errors.push({ code: classifyFailure(failure.error), path: failure.path, message: errorMessage(failure.error) });
  const lowerIds = new Map<string, string>();
  for (const concept of concepts) {
    const lower = concept.id.toLowerCase();
    const prior = lowerIds.get(lower);
    if (prior && prior !== concept.id) errors.push({ code: "CASE_COLLIDING_CONCEPT_IDS", concept: concept.id, other: prior });
    else lowerIds.set(lower, concept.id);
    if (isStale(concept.frontmatter)) warnings.push({ code: "STALE_CONCEPT", concept: concept.id, stale_after: concept.frontmatter.stale_after });
    for (const target of unsafeMarkdownTargets(concept.body, concept.id)) errors.push({ code: "RELATIONSHIP_ESCAPES_BUNDLE", concept: concept.id, target });
  }
  await validateReservedFiles(bundle, errors);
  const ids = new Set(concepts.map((concept) => concept.id));
  const degree = new Map(concepts.map((concept) => [concept.id, 0]));
  const status = new Map(concepts.map((concept) => [concept.id, concept.frontmatter.status ?? "stable"]));
  for (const concept of concepts) {
    for (const edge of concept.edges) {
      degree.set(concept.id, (degree.get(concept.id) ?? 0) + 1);
      if (ids.has(edge.dst)) {
        degree.set(edge.dst, (degree.get(edge.dst) ?? 0) + 1);
        if (status.get(edge.dst) === "deprecated") warnings.push({ code: "DEPRECATED_CONCEPT_REFERENCED", concept: concept.id, target: edge.dst });
      } else {
        warnings.push({ code: edge.origin === "typed" ? "MISSING_TYPED_RELATIONSHIP_TARGET" : "BROKEN_MARKDOWN_LINK", concept: concept.id, target: edge.dst });
      }
    }
  }
  for (const [id, count] of degree) if (count === 0) warnings.push({ code: "ORPHAN_CONCEPT", concept: id });
  sortFindings(errors); sortFindings(warnings);
  const valid = errors.length === 0;
  const exitCode = !valid || (strict && warnings.length) ? EXIT.invalidOkf : EXIT.success;
  return { data: { valid, errors, warnings }, exitCode };
}

function classifyFailure(error: unknown): string {
  const message = errorMessage(error);
  if (message.includes("x-okf.rel") || message.includes("relationship")) return "MALFORMED_TYPED_RELATIONSHIP";
  if (message.includes("concept ID")) return "INVALID_CONCEPT_ID";
  if (message.includes("frontmatter") || message.includes("type")) return "INVALID_FRONTMATTER";
  return "INVALID_OKF";
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function sortFindings(findings: Finding[]): void { findings.sort((a, b) => compareStrings(`${a.code}\0${a.concept ?? a.path ?? ""}`, `${b.code}\0${b.concept ?? b.path ?? ""}`)); }

async function validateReservedFiles(bundle: string, errors: Finding[]): Promise<void> {
  const glob = new Bun.Glob("**/{index,log}.md");
  for await (const relative of glob.scan({ cwd: bundle, dot: false, onlyFiles: true, followSymlinks: false })) {
    const content = await readFile(path.join(bundle, relative), "utf8");
    const name = path.basename(relative).toLowerCase();
    if (name === "index.md") {
      const hasFrontmatter = content.startsWith("---\n") || content.startsWith("---\r\n");
      if (hasFrontmatter && relative !== "index.md") errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Only the root index may have frontmatter" });
      let body = content;
      if (hasFrontmatter) {
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
        if (!match) { errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Invalid root index frontmatter" }); continue; }
        try {
          const frontmatter = Bun.YAML.parse(match[1] ?? "");
          if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter) || Object.keys(frontmatter as object).some((key) => key !== "okf_version")) {
            errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Root index frontmatter may contain only okf_version" });
          }
        } catch { errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Invalid root index frontmatter" }); }
        body = content.slice(match[0].length);
      }
      if (!body.trim() || !/^#{1,6}\s+/m.test(body)) errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Index must group entries under headings" });
    } else {
      const dates = [...content.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm)].map((match) => match[1]!);
      if (!content.trim() || !/^#\s+.+/m.test(content) || dates.length === 0 || dates.some((date, index) => index > 0 && date > dates[index - 1]!)) {
        errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Log must contain a title and newest-first dated entries" });
      }
    }
  }
}
