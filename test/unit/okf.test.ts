import { describe, expect, test } from "bun:test";
import { validateConceptId } from "../../src/okf/ids";
import { effectiveStatus, splitDocument, serializeDocument, trustTier, isStale } from "../../src/okf/frontmatter";
import { extractMarkdownEdges, extractOkfEdges, extractSection, extractTypedEdges, searchableMarkdownText, unsafeOkfTargets } from "../../src/okf/markdown";
import { naturalFtsQuery } from "../../src/index/search";
import { browserCommand, safeFilename } from "../../src/commands/visualise";
import { renderVisualisation } from "../../src/visualisation/html";

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
    expect(effectiveStatus({ type: "X" })).toBe("stable");
    expect(effectiveStatus({ type: "X", status: "reviewed" })).toBe("reviewed");
  });

  test("extracts Markdown and typed edges", () => {
    expect(extractMarkdownEdges("[Target](../systems/okta.md#auth) ![Image](x.md) [Web](https://x.test)", "capabilities/id"))
      .toEqual([{ rel: "links_to", dst: "systems/okta", origin: "markdown" }]);
    expect(extractTypedEdges({ type: "X", "x-okf": { rel: [["depends_on", "systems/okta"]] } }))
      .toEqual([{ rel: "depends_on", dst: "systems/okta", origin: "typed" }]);
  });

  test("extracts standard OKF path relationships", () => {
    const frontmatter = {
      type: "Attested Computation",
      resource: "../systems/okta.md",
      sources: [{ resource: "/references/policy.md" }, { resource: "https://example.test/source" }],
      computation: "./query.md",
      executor: { resource: "../references/runner.md" },
      attester: { resource: "../../escape.md" },
    };
    expect(extractOkfEdges(frontmatter, "computations/revenue")).toEqual([
      { rel: "resource", dst: "systems/okta", origin: "okf" },
      { rel: "computation", dst: "computations/query", origin: "okf" },
      { rel: "executor", dst: "references/runner", origin: "okf" },
      { rel: "source", dst: "references/policy", origin: "okf" },
    ]);
    expect(unsafeOkfTargets(frontmatter, "computations/revenue")).toEqual(["../../escape.md"]);
  });

  test("extracts a section with descendants", () => {
    const body = "# Root\n\n## Authentication\n\nA\n\n### Sessions\n\nB\n\n## Other\n\nC\n";
    expect(extractSection(body, "authentication")).toBe("## Authentication\n\nA\n\n### Sessions\n\nB\n\n");
  });

  test("derives semantic search text from Markdown", () => {
    const text = searchableMarkdownText(`# Search heading

[Visible link](hidden-destination.md) ![Image description](hidden-image.png)

| Column |
| --- |
| Table value |

\`inlineIdentifier\`

\`\`\`configuration
fencedIdentifier = true
\`\`\`

<span data-secret="hiddenAttribute">Visible HTML text</span>

<div>hiddenBlockContent</div>
`);
    expect(text).toContain("Search heading");
    expect(text).toContain("Visible link Image description");
    expect(text).toContain("Table value");
    expect(text).toContain("inlineIdentifier");
    expect(text).toContain("fencedIdentifier = true");
    expect(text).toContain("Visible HTML text");
    expect(text).not.toContain("hidden-destination");
    expect(text).not.toContain("hidden-image");
    expect(text).not.toContain("hiddenAttribute");
    expect(text).not.toContain("hiddenBlockContent");
    expect(text).not.toContain("configuration");
  });

  test("escapes natural FTS terms", () => {
    expect(naturalFtsQuery('customer "identity"')).toBe('"customer" AND """identity"""');
  });

  test("creates safe visualisation filenames and browser commands", () => {
    expect(safeFilename("notes/An example: 1")).toBe("notes-An-example-1");
    expect(browserCommand("/tmp/graph.html", "darwin")).toEqual(["open", "/tmp/graph.html"]);
    expect(browserCommand("C:\\graph.html", "win32")).toEqual(["cmd", "/c", "start", "", "C:\\graph.html"]);
    expect(browserCommand("/tmp/graph.html", "linux")).toEqual(["xdg-open", "/tmp/graph.html"]);
  });

  test("renders a self-contained visualisation without allowing metadata injection", () => {
    const html = renderVisualisation({
      nodes: [{ id: "hostile", type: "Concept", title: "</script><script>alert(1)</script>" }],
      edges: [],
    });
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("src=\"http");
    const executable = /<script>\n([\s\S]*?)\n<\/script>/.exec(html)?.[1];
    expect(executable).toBeDefined();
    expect(() => new Function(executable!)).not.toThrow();
  });
});
