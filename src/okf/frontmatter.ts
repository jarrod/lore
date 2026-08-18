import { invalidOkf } from "../protocol/errors";
import { compareStrings } from "./ids";

export type Frontmatter = Record<string, unknown>;

export interface ParsedDocument {
  frontmatter: Frontmatter;
  body: string;
}

export function splitDocument(content: string, source = "document"): ParsedDocument {
  const normalized = content.startsWith("\uFEFF") ? content.slice(1) : content;
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    throw invalidOkf("Concept is missing YAML frontmatter", { source });
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(normalized);
  if (!match) throw invalidOkf("Concept has unterminated YAML frontmatter", { source });
  let value: unknown;
  try {
    value = Bun.YAML.parse(match[1] ?? "");
  } catch (error) {
    throw invalidOkf("Concept has invalid YAML frontmatter", { source, reason: String(error) });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidOkf("Concept frontmatter must be a mapping", { source });
  }
  const frontmatter = value as Frontmatter;
  if (typeof frontmatter.type !== "string" || !frontmatter.type.trim()) {
    throw invalidOkf("Concept frontmatter requires a non-empty type", { source });
  }
  return { frontmatter, body: normalized.slice(match[0].length) };
}

export function serializeDocument(frontmatter: Frontmatter, body: string): string {
  const stable = stableValue(frontmatter);
  return `---\n${JSON.stringify(stable, null, 2)}\n---\n${body}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => compareStrings(a, b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function effectiveStatus(frontmatter: Frontmatter): string {
  return typeof frontmatter.status === "string" ? frontmatter.status : "stable";
}

export function trustTier(frontmatter: Frontmatter): "unverified" | "machine_confirmed" | "human_reviewed" {
  const raw = frontmatter.verified;
  if (raw === undefined) return "unverified";
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries.some((entry) => {
    const by = entry && typeof entry === "object" ? (entry as Record<string, unknown>).by : undefined;
    return typeof by === "string" && by.startsWith("human:");
  }) ? "human_reviewed" : "machine_confirmed";
}

export function isStale(frontmatter: Frontmatter, today = new Date().toISOString().slice(0, 10)): boolean {
  return typeof frontmatter.stale_after === "string" && today >= frontmatter.stale_after;
}
