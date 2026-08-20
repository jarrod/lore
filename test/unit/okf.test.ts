import { describe, expect, test } from "bun:test";
import { validateConceptId } from "../../src/okf/ids";
import { effectiveStatus, splitDocument, serializeDocument, trustTier, isStale } from "../../src/okf/frontmatter";
import { extractMarkdownEdges, extractSection, extractTypedEdges } from "../../src/okf/markdown";
import { naturalFtsQuery } from "../../src/index/search";

describe("OKF primitives", () => {
  test("validates canonical concept IDs", () => {
    expect(validateConceptId("systems/okta")).toBe("systems/okta");
    for (const invalid of ["", "/root", "../escape", "systems\\okta", "systems/okta.md"]) {
      expect(() => validateConceptId(invalid)).toThrow();
    }
  });

  test("parses and serializes block YAML while preserving key order", () => {
    const parsed = splitDocument("---\ntitle: Okta\ntype: System\ncustom: {z: 1, a: 2}\n---\n# Okta\n");
    expect(parsed.frontmatter.type).toBe("System");
    const output = serializeDocument(parsed.frontmatter, parsed.body);
    expect(output).toBe("---\ntitle: Okta\ntype: System\ncustom:\n  z: 1\n  a: 2\n---\n# Okta\n");
    expect(splitDocument(output).frontmatter.custom).toEqual({ a: 2, z: 1 });
  });

  test("quotes ambiguous YAML strings and preserves nested collections", () => {
    const frontmatter = {
      type: "System",
      tags: ["one", "true", "a: b"],
      empty: [],
      custom: { enabled: true, value: "null" },
      "x-okf": { rel: [["depends_on", "systems/okta"]] },
    };
    const output = serializeDocument(frontmatter, "# Body\n");
    expect(output).toContain('  - "true"');
    expect(output).toContain('  - "a: b"');
    expect(output).toContain("  value: \"null\"");
    expect(output).toContain("    - - depends_on\n      - systems/okta");
    expect(splitDocument(output).frontmatter).toEqual(frontmatter);
  });

  test("derives trust and freshness", () => {
    expect(trustTier({ type: "X" })).toBe("unverified");
    expect(trustTier({ type: "X", verified: false })).toBe("unverified");
    expect(trustTier({ type: "X", verified: { by: "process:ci", at: "2026-01-01" } })).toBe("machine_confirmed");
    expect(trustTier({ type: "X", verified: [{ by: "human:j", at: "2026-01-01" }] })).toBe("human_reviewed");
    expect(isStale({ type: "X", stale_after: "2020-01-01" }, "2020-01-01")).toBeTrue();
    expect(effectiveStatus({ type: "X" })).toBeNull();
    expect(effectiveStatus({ type: "X", status: "reviewed" })).toBe("reviewed");
  });

  test("extracts Markdown and typed edges", () => {
    expect(extractMarkdownEdges("[Target](../systems/okta.md#auth) ![Image](x.md) [Web](https://x.test)", "capabilities/id"))
      .toEqual([{ rel: "links_to", dst: "systems/okta", origin: "markdown" }]);
    expect(extractTypedEdges({ type: "X", "x-okf": { rel: [["depends_on", "systems/okta"]] } }))
      .toEqual([{ rel: "depends_on", dst: "systems/okta", origin: "typed" }]);
  });

  test("extracts a section with descendants", () => {
    const body = "# Root\n\n## Authentication\n\nA\n\n### Sessions\n\nB\n\n## Other\n\nC\n";
    expect(extractSection(body, "authentication")).toBe("## Authentication\n\nA\n\n### Sessions\n\nB\n\n");
  });

  test("escapes natural FTS terms", () => {
    expect(naturalFtsQuery('customer "identity"')).toBe('"customer" AND """identity"""');
  });
});
