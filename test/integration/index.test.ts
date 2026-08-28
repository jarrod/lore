import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { cachePath, openDatabase } from "../../src/index/database";
import { refreshIndex } from "../../src/index/refresh";
import { findConcepts } from "../../src/index/search";
import { bundleGraph, graphTraversal, shortestPath } from "../../src/index/graph";

let root: string;
let bundle: string;
let oldCache: string | undefined;

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "lore-test-"));
  bundle = path.join(root, "bundle");
  cpSync(path.join(import.meta.dir, "../fixtures/graph"), bundle, { recursive: true });
  oldCache = process.env.OKF_CACHE_DIR;
  process.env.OKF_CACHE_DIR = path.join(root, "cache");
});

afterAll(() => {
  if (oldCache === undefined) delete process.env.OKF_CACHE_DIR; else process.env.OKF_CACHE_DIR = oldCache;
  rmSync(root, { recursive: true, force: true });
});

describe("derived index", () => {
  test("indexes, searches, traverses and rebuilds equivalently", async () => {
    let opened = openDatabase(bundle);
    const first = await refreshIndex(opened.db, bundle);
    expect(first.concepts).toBe(7);
    expect(first.edges).toBe(9);
    const results = findConcepts(opened.db, "customer identity", { limit: 10 }) as Array<{ id: string; status: string | null; trust: string }>;
    expect(results[0]?.id).toBe("capabilities/customer-identity");
    expect(results[0]?.status).toBe("stable");
    expect(results[0]?.trust).toBe("unverified");
    expect((findConcepts(opened.db, "customer", { tag: "identity" }) as Array<{ id: string }>).map((row) => row.id)).toEqual(["capabilities/customer-identity"]);
    expect((findConcepts(opened.db, "identity", { type: "Team", scope: "teams" }) as Array<{ id: string }>)[0]?.id).toBe("teams/identity");
    const graph = graphTraversal(opened.db, "capabilities/payments", "out", 3);
    expect(graph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "systems/okta" })]));
    const complete = bundleGraph(opened.db);
    expect(complete.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "references/orphan" }), expect.objectContaining({ id: "systems/missing", missing: true })]));
    expect(bundleGraph(opened.db, "owned_by").nodes.map((node) => node.id)).toEqual(["capabilities/customer-identity", "teams/identity"]);
    const pathResult = shortestPath(opened.db, "capabilities/payments", "systems/okta");
    expect(pathResult.found).toBeTrue();
    expect((findConcepts(opened.db, "customer absentterm", { limit: 10 }) as Array<{ id: string }>).some((row) => row.id === "capabilities/customer-identity")).toBeTrue();
    const idsBefore = results.map((result) => result.id);
    const addedPath = path.join(bundle, "systems", "temporary.md");
    writeFileSync(addedPath, "---\ntype: System\ntitle: Temporary\n---\n# Temporary\n");
    expect((await refreshIndex(opened.db, bundle)).added).toBe(1);
    writeFileSync(addedPath, "---\ntype: System\ntitle: Temporary Changed\n---\n# Temporary\n");
    expect((await refreshIndex(opened.db, bundle)).updated).toBe(1);
    unlinkSync(addedPath);
    expect((await refreshIndex(opened.db, bundle)).deleted).toBe(1);

    const minimalPath = path.join(bundle, "minimal-only.md");
    writeFileSync(minimalPath, "---\ntype: Concept\n---\n");
    await refreshIndex(opened.db, bundle);
    expect((findConcepts(opened.db, "minimal", {}) as Array<{ id: string }>)[0]?.id).toBe("minimal-only");
    unlinkSync(minimalPath);
    await refreshIndex(opened.db, bundle);

    const lineagePath = path.join(bundle, "lineage.md");
    writeFileSync(lineagePath, "---\ntype: Concept\nresource: systems/okta.md\nsources:\n  - resource: capabilities/customer-identity.md\ncomputation: decisions/identity-provider.md\nexecutor:\n  resource: teams/identity.md\nattester:\n  resource: systems/payment-api.md\n---\n# Lineage\n");
    await refreshIndex(opened.db, bundle);
    const lineage = graphTraversal(opened.db, "lineage", "out", 1);
    expect(lineage.edges.filter((edge) => edge.origin === "okf")).toHaveLength(5);
    unlinkSync(lineagePath);
    await refreshIndex(opened.db, bundle);

    const pathDirectory = path.join(bundle, "paths");
    mkdirSync(pathDirectory);
    writeFileSync(path.join(pathDirectory, "a.md"), "---\ntype: Concept\nx-okf:\n  rel:\n    - [next, paths/b]\n---\n");
    writeFileSync(path.join(pathDirectory, "b.md"), "---\ntype: Concept\nx-okf:\n  rel:\n    - [next, paths/c]\n---\n");
    writeFileSync(path.join(pathDirectory, "c.md"), "---\ntype: Concept\n---\n");
    await refreshIndex(opened.db, bundle);
    expect(shortestPath(opened.db, "paths/a", "paths/c", { direction: "out", maxDepth: 1 }).found).toBeFalse();
    expect(shortestPath(opened.db, "paths/a", "paths/c", { direction: "out", maxDepth: 2 }).found).toBeTrue();
    expect(shortestPath(opened.db, "paths/a", "paths/c", { direction: "in", maxDepth: 8 }).found).toBeFalse();
    rmSync(pathDirectory, { recursive: true });
    await refreshIndex(opened.db, bundle);

    const freshnessPath = path.join(bundle, "freshness.md");
    const fixed = new Date("2026-01-01T00:00:00Z");
    writeFileSync(freshnessPath, "---\ntype: Note\n---\noldtoken\n");
    utimesSync(freshnessPath, fixed, fixed);
    await refreshIndex(opened.db, bundle);
    writeFileSync(freshnessPath, "---\ntype: Note\n---\nnewtoken\n");
    utimesSync(freshnessPath, fixed, fixed);
    expect((await refreshIndex(opened.db, bundle)).updated).toBe(1);
    expect(findConcepts(opened.db, "newtoken", {})).toHaveLength(1);
    expect(findConcepts(opened.db, "oldtoken", {})).toHaveLength(0);
    unlinkSync(freshnessPath);
    await refreshIndex(opened.db, bundle);

    const semanticPath = path.join(bundle, "semantic-search.md");
    writeFileSync(semanticPath, `---
type: Note
---
# headingtoken

[linklabeltoken](destinationnoisetoken.md)

![imagealttoken](imagenoisetoken.png)

| tabletoken |
| --- |
| tablevaluetoken |

\`inlinecodetoken\`

\`\`\`languageonlytoken
fencedcodetoken = true
\`\`\`

<span data-secret="htmlattributetoken">visiblehtmltoken</span>

<div>htmlblocktoken</div>
`);
    await refreshIndex(opened.db, bundle);
    for (const token of ["headingtoken", "linklabeltoken", "imagealttoken", "tabletoken", "tablevaluetoken", "inlinecodetoken", "fencedcodetoken", "visiblehtmltoken"]) {
      expect((findConcepts(opened.db, token, {}) as Array<{ id: string }>).map((row) => row.id)).toEqual(["semantic-search"]);
    }
    for (const token of ["destinationnoisetoken", "imagenoisetoken", "languageonlytoken", "htmlattributetoken", "htmlblocktoken"]) {
      expect(findConcepts(opened.db, token, {})).toHaveLength(0);
    }
    unlinkSync(semanticPath);
    await refreshIndex(opened.db, bundle);
    opened.db.close();
    opened = openDatabase(bundle, true);
    await refreshIndex(opened.db, bundle);
    const idsAfter = (findConcepts(opened.db, "customer identity", { limit: 10 }) as Array<{ id: string }>).map((result) => result.id);
    expect(idsAfter).toEqual(idsBefore);
    opened.db.close();
  });

  test("rebuilds an existing cache without a compatible schema", async () => {
    const legacyBundle = path.join(root, "legacy-bundle");
    cpSync(path.join(import.meta.dir, "../fixtures/graph"), legacyBundle, { recursive: true });
    const dbPath = cachePath(legacyBundle);
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const legacy = new Database(dbPath, { create: true });
    legacy.exec(`
      CREATE TABLE concept (
        id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, type TEXT NOT NULL, title TEXT, description TEXT,
        status TEXT, trust TEXT NOT NULL, stale_after TEXT, hash TEXT NOT NULL, mtime_ms INTEGER, size_bytes INTEGER
      );
      CREATE VIRTUAL TABLE concept_fts USING fts5(id,title,description,tags,body);
      CREATE TABLE edge (src TEXT NOT NULL, rel TEXT NOT NULL, dst TEXT NOT NULL, origin TEXT NOT NULL, PRIMARY KEY (src,rel,dst,origin));
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta(key,value) VALUES ('schema_version','3');
    `);
    legacy.close();

    const opened = openDatabase(legacyBundle);
    expect(opened.rebuilt).toBeTrue();
    expect((await refreshIndex(opened.db, legacyBundle)).concepts).toBe(7);
    expect(opened.db.query("SELECT value FROM meta WHERE key='schema_version'").get()).toEqual({ value: "4" });
    expect(opened.db.query("SELECT search_text FROM concept_fts LIMIT 1").get()).not.toBeNull();
    opened.db.close();
  });
});
