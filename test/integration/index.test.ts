import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { cachePath, openDatabase } from "../../src/index/database";
import { refreshIndex } from "../../src/index/refresh";
import { findConcepts } from "../../src/index/search";
import { graphTraversal, shortestPath } from "../../src/index/graph";

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
    expect(results[0]?.status).toBeNull();
    expect(results[0]?.trust).toBe("unverified");
    expect((findConcepts(opened.db, "customer", { tag: "identity" }) as Array<{ id: string }>).map((row) => row.id)).toEqual(["capabilities/customer-identity"]);
    expect((findConcepts(opened.db, "identity", { type: "Team", scope: "teams" }) as Array<{ id: string }>)[0]?.id).toBe("teams/identity");
    const graph = graphTraversal(opened.db, "capabilities/payments", "out", 3);
    expect(graph.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "systems/okta" })]));
    const pathResult = shortestPath(opened.db, "capabilities/payments", "systems/okta");
    expect(pathResult.found).toBeTrue();
    const idsBefore = results.map((result) => result.id);
    const addedPath = path.join(bundle, "systems", "temporary.md");
    writeFileSync(addedPath, "---\ntype: System\ntitle: Temporary\n---\n# Temporary\n");
    expect((await refreshIndex(opened.db, bundle)).added).toBe(1);
    writeFileSync(addedPath, "---\ntype: System\ntitle: Temporary Changed\n---\n# Temporary\n");
    expect((await refreshIndex(opened.db, bundle)).updated).toBe(1);
    unlinkSync(addedPath);
    expect((await refreshIndex(opened.db, bundle)).deleted).toBe(1);
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
    legacy.exec("CREATE TABLE concept (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, type TEXT NOT NULL)");
    legacy.close();

    const opened = openDatabase(legacyBundle);
    expect(opened.rebuilt).toBeTrue();
    expect((await refreshIndex(opened.db, legacyBundle)).concepts).toBe(7);
    opened.db.close();
  });
});
