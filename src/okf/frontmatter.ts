import { invalidOkf } from "../protocol/errors";

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
  return `---\n${yamlLines(stable, 0).join("\n")}\n---\n${body}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => entry === undefined ? null : stableValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

function yamlLines(value: unknown, indent: number): string[] {
  const padding = " ".repeat(indent);
  if (isInlineValue(value)) return [`${padding}${yamlScalar(value)}`];

  if (Array.isArray(value)) {
    const lines: string[] = [];
    for (const entry of value) {
      if (isInlineValue(entry)) {
        lines.push(`${padding}- ${yamlScalar(entry)}`);
        continue;
      }
      const nested = yamlLines(entry, indent + 2);
      lines.push(`${padding}- ${nested[0]!.slice(indent + 2)}`, ...nested.slice(1));
    }
    return lines;
  }

  const lines: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const renderedKey = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
    if (isInlineValue(nested)) {
      lines.push(`${padding}${renderedKey}: ${yamlScalar(nested)}`);
    } else {
      lines.push(`${padding}${renderedKey}:`, ...yamlLines(nested, indent + 2));
    }
  }
  return lines;
}

function isInlineValue(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

function yamlScalar(value: unknown): string {
  if (Array.isArray(value)) return "[]";
  if (value && typeof value === "object") return "{}";
  if (typeof value === "string") return isSafePlainString(value) ? value : JSON.stringify(value);
  if (value === null) return "null";
  return String(value);
}

function isSafePlainString(value: string): boolean {
  if (!value || value.trim() !== value || /[\r\n]/.test(value)) return false;
  try {
    const parsed = Bun.YAML.parse(`value: ${value}\n`) as Record<string, unknown>;
    return Object.keys(parsed).length === 1 && parsed.value === value;
  } catch {
    return false;
  }
}

export function effectiveStatus(frontmatter: Frontmatter): string | null {
  return typeof frontmatter.status === "string" ? frontmatter.status : null;
}

export function trustTier(frontmatter: Frontmatter): "unverified" | "machine_confirmed" | "human_reviewed" {
  const raw = frontmatter.verified;
  if (raw === undefined) return "unverified";
  const entries = Array.isArray(raw) ? raw : [raw];
  const verifiers = entries.flatMap((entry) => {
    const by = entry && typeof entry === "object" ? (entry as Record<string, unknown>).by : undefined;
    return typeof by === "string" && by.trim() ? [by] : [];
  });
  if (!verifiers.length) return "unverified";
  return verifiers.some((by) => by.startsWith("human:")) ? "human_reviewed" : "machine_confirmed";
}

export function isStale(frontmatter: Frontmatter, today = new Date().toISOString().slice(0, 10)): boolean {
  return typeof frontmatter.stale_after === "string" && today >= frontmatter.stale_after;
}
