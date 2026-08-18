import { describe, expect, test } from "bun:test";
import { validateConceptId } from "../../src/okf/ids";
import { splitDocument, serializeDocument, trustTier, isStale } from "../../src/okf/frontmatter";
import { extractMarkdownEdges, extractSection, extractTypedEdges } from "../../src/okf/markdown";
import { naturalFtsQuery } from "../../src/index/search";

describe("OKF primitives", () => {
  test("validates canonical concept IDs", () => {
    expect(validateConceptId("systems/okta")).toBe("systems/okta");
    for (const invalid of ["", "/root", "../escape", "systems\\okta", "systems/okta.md"]) {
      expect(() => validateConceptId(invalid)).toThrow();
    }
  });

  test("parses YAML and serializes deterministic JSON-compatible YAML", () => {
    const parsed = splitDocument("---\ntitle: Okta\ntype: System\ncustom: {z: 1, a: 2}\n---\n# Okta\n");
    expect(parsed.frontmatter.type).toBe("System");
    const output = serializeDocument(parsed.frontmatter, parsed.body);
    expect(output.indexOf('"custom"')).toBeLessThan(output.indexOf('"title"'));
    expect(splitDocument(output).frontmatter.custom).toEqual({ a: 2, z: 1 });
  });

  test("derives trust and freshness", () => {
    expect(trustTier({ type: "X" })).toBe("unverified");
    expect(trustTier({ type: "X", verified: { by: "process:ci", at: "2026-01-01" } })).toBe("machine_confirmed");
    expect(trustTier({ type: "X", verified: [{ by: "human:j", at: "2026-01-01" }] })).toBe("human_reviewed");
    expect(isStale({ type: "X", stale_after: "2020-01-01" }, "2020-01-01")).toBeTrue();
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
