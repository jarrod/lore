import { readFile } from "node:fs/promises";
import path from "node:path";
import { scanBundle, type Concept } from "../okf/bundle";
import { isOkfDate, isOkfStatus, isStale } from "../okf/frontmatter";
import { unsafeMarkdownTargets, unsafeOkfTargets } from "../okf/markdown";
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
    for (const target of unsafeOkfTargets(concept.frontmatter, concept.id)) errors.push({ code: "OKF_PATH_ESCAPES_BUNDLE", concept: concept.id, target });
    validateStandardFrontmatter(concept, warnings);
  }
  await validateReservedFiles(bundle, errors);
  const ids = new Set(concepts.map((concept) => concept.id));
  const status = new Map(concepts.map((concept) => [concept.id, concept.frontmatter.status]));
  const connected = new Set<string>();
  for (const concept of concepts) {
    for (const edge of concept.edges) {
      connected.add(concept.id);
      connected.add(edge.dst);
      if (ids.has(edge.dst)) {
        if (status.get(edge.dst) === "deprecated") warnings.push({ code: "DEPRECATED_CONCEPT_REFERENCED", concept: concept.id, target: edge.dst });
      } else {
        const code = edge.origin === "typed"
          ? "MISSING_TYPED_RELATIONSHIP_TARGET"
          : edge.origin === "okf" ? "MISSING_OKF_PATH_TARGET" : "BROKEN_MARKDOWN_LINK";
        warnings.push({ code, concept: concept.id, target: edge.dst });
      }
    }
  }
  for (const concept of concepts) {
    if (!connected.has(concept.id)) warnings.push({ code: "ORPHAN_CONCEPT", concept: concept.id });
  }
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
    const isIndex = path.basename(relative) === "index.md";
    const rootIndex = isIndex && !relative.includes("/") && !relative.includes("\\");
    const parsed = parseReservedFile(content, relative, errors);
    if (!parsed) continue;
    if (parsed.frontmatter) {
      if (!rootIndex) {
        errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Only the bundle-root index.md may contain frontmatter" });
      } else {
        const keys = Object.keys(parsed.frontmatter);
        if (keys.some((key) => key !== "okf_version")) {
          errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Root index.md frontmatter may contain only okf_version" });
        }
        const version = parsed.frontmatter.okf_version;
        if (version !== undefined && (typeof version !== "string" || !version.trim())) {
          errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "okf_version must be a non-empty string" });
        }
      }
    }
    if (isIndex) validateIndexBody(parsed.body, relative, errors);
    else validateLogBody(parsed.body, relative, errors);
  }
}

function parseReservedFile(content: string, relative: string, errors: Finding[]): { frontmatter?: Record<string, unknown>; body: string } | undefined {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return { body: content };
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) {
    errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Reserved file has unterminated YAML frontmatter" });
    return undefined;
  }
  try {
    const frontmatter = Bun.YAML.parse(match[1] ?? "");
    if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
      errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Reserved file frontmatter must be a mapping" });
      return undefined;
    }
    return { frontmatter: frontmatter as Record<string, unknown>, body: content.slice(match[0].length) };
  } catch {
    errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "Reserved file has invalid YAML frontmatter" });
    return undefined;
  }
}

function validateIndexBody(body: string, relative: string, errors: Finding[]): void {
  if (!markdownHeadings(body).length) {
    errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "index.md must group entries under at least one heading" });
  }
}

function validateLogBody(body: string, relative: string, errors: Finding[]): void {
  const levelTwo = markdownHeadings(body).filter((heading) => heading.level === 2);
  if (!levelTwo.length || levelTwo.some((heading) => !isOkfDate(heading.title))) {
    errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "log.md requires ISO YYYY-MM-DD level-two date headings" });
    return;
  }
  const dates = levelTwo.map((heading) => heading.title);
  if (dates.some((date, index) => index > 0 && date > dates[index - 1]!)) {
    errors.push({ code: "INVALID_RESERVED_FILE", path: relative, reason: "log.md date headings must be newest first" });
  }
}

function markdownHeadings(body: string): Array<{ level: number; title: string }> {
  const lines = body.split(/\r?\n/);
  const headings: Array<{ level: number; title: string }> = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) { headings.push({ level: atx[1]!.length, title: atx[2]!.trim() }); continue; }
    const underline = /^(=+|-+)\s*$/.exec(lines[index + 1] ?? "");
    if (line.trim() && underline) {
      headings.push({ level: underline[1]!.startsWith("=") ? 1 : 2, title: line.trim() });
      index++;
    }
  }
  return headings;
}

function validateStandardFrontmatter(concept: Concept, warnings: Finding[]): void {
  const fm = concept.frontmatter;
  if (fm.status !== undefined && (typeof fm.status !== "string" || !isOkfStatus(fm.status))) {
    warnings.push({ code: "INVALID_OKF_STATUS", concept: concept.id, value: fm.status });
  }
  if (fm.stale_after !== undefined && (typeof fm.stale_after !== "string" || !isOkfDate(fm.stale_after))) {
    warnings.push({ code: "INVALID_STALE_AFTER", concept: concept.id, value: fm.stale_after });
  }
  if (fm.tags !== undefined && (!Array.isArray(fm.tags) || fm.tags.some((tag) => typeof tag !== "string"))) {
    warnings.push({ code: "INVALID_TAGS", concept: concept.id });
  }
  if (fm.resource !== undefined && (typeof fm.resource !== "string" || !fm.resource.trim())) {
    warnings.push({ code: "INVALID_RESOURCE", concept: concept.id });
  }
  validateGenerated(concept, warnings);
  validateVerified(concept, warnings);
  validateSources(concept, warnings);
  if (fm.type === "Attested Computation") validateAttestedComputation(concept, warnings);
}

function validateGenerated(concept: Concept, warnings: Finding[]): void {
  const generated = concept.frontmatter.generated;
  if (generated === undefined) return;
  if (!isMapping(generated) || !nonEmptyString(generated.by) || (generated.at !== undefined && !isIsoDateTime(generated.at))) {
    warnings.push({ code: "INVALID_GENERATED", concept: concept.id });
  }
}

function validateVerified(concept: Concept, warnings: Finding[]): void {
  const verified = concept.frontmatter.verified;
  if (verified === undefined) return;
  const entries = Array.isArray(verified) ? verified : [verified];
  if (!entries.length || entries.some((entry) => !isMapping(entry) || !nonEmptyString(entry.by) || !isIsoDateTime(entry.at))) {
    warnings.push({ code: "INVALID_VERIFIED", concept: concept.id });
  }
}

function validateSources(concept: Concept, warnings: Finding[]): void {
  const sources = concept.frontmatter.sources;
  if (concept.frontmatter.usage_window !== undefined && !isUsageWindow(concept.frontmatter.usage_window)) {
    warnings.push({ code: "INVALID_USAGE_WINDOW", concept: concept.id });
  }
  if (sources === undefined) return;
  if (!Array.isArray(sources) || sources.some((source) => !validSource(source))) {
    warnings.push({ code: "INVALID_SOURCES", concept: concept.id });
    return;
  }
  const ids = sources.flatMap((source) => nonEmptyString(source.id) ? [source.id] : []);
  if (new Set(ids).size !== ids.length) warnings.push({ code: "DUPLICATE_SOURCE_ID", concept: concept.id });
  const cited = new Set([...concept.body.matchAll(/\[\^([^\]]+)\]/g)].map((match) => match[1]!));
  for (const id of cited) {
    if (!ids.includes(id)) warnings.push({ code: "SOURCE_FOOTNOTE_WITHOUT_SOURCE", concept: concept.id, source_id: id });
  }
}

function validateAttestedComputation(concept: Concept, warnings: Finding[]): void {
  const fm = concept.frontmatter;
  if (!nonEmptyString(fm.runtime)) warnings.push({ code: "ATTESTED_COMPUTATION_MISSING_RUNTIME", concept: concept.id });
  if (fm.parameters !== undefined && (!Array.isArray(fm.parameters) || fm.parameters.some((parameter) =>
    !isMapping(parameter) || !nonEmptyString(parameter.name) || !nonEmptyString(parameter.type) || typeof parameter.required !== "boolean"
  ))) warnings.push({ code: "INVALID_COMPUTATION_PARAMETERS", concept: concept.id });
  for (const field of ["executor", "attester"] as const) {
    const value = fm[field];
    if (value !== undefined && (!isMapping(value) || !nonEmptyString(value.resource))) {
      warnings.push({ code: `INVALID_${field.toUpperCase()}`, concept: concept.id });
    }
  }
  if (isMapping(fm.executor) && fm.executor.receipt !== undefined && (!Array.isArray(fm.executor.receipt) || fm.executor.receipt.some((field) => !nonEmptyString(field)))) {
    warnings.push({ code: "INVALID_EXECUTOR_RECEIPT", concept: concept.id });
  }
  const externalComputation = fm.computation !== undefined;
  const inlineComputation = /^#\s+Computation\s*$[\s\S]*?^(```|~~~)/im.test(concept.body);
  if (externalComputation && !nonEmptyString(fm.computation)) warnings.push({ code: "INVALID_COMPUTATION_PATH", concept: concept.id });
  if ((!externalComputation && !inlineComputation) || (externalComputation && inlineComputation)) {
    warnings.push({ code: "INVALID_COMPUTATION_CONTENT", concept: concept.id });
  }
}

function validSource(value: unknown): value is Record<string, unknown> {
  if (!isMapping(value) || !nonEmptyString(value.resource)) return false;
  if (value.id !== undefined && !nonEmptyString(value.id)) return false;
  if (value.title !== undefined && !nonEmptyString(value.title)) return false;
  if (value.author !== undefined && !nonEmptyString(value.author)) return false;
  if (value.usage_count !== undefined && (typeof value.usage_count !== "number" || !Number.isFinite(value.usage_count) || value.usage_count < 0)) return false;
  if (value.last_modified !== undefined && (typeof value.last_modified !== "string" || !isOkfDate(value.last_modified))) return false;
  if (value.usage_window !== undefined && !isUsageWindow(value.usage_window)) return false;
  return true;
}

function isUsageWindow(value: unknown): boolean {
  return isMapping(value) && typeof value.from === "string" && isOkfDate(value.from) && typeof value.to === "string" && isOkfDate(value.to);
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isIsoDateTime(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}
