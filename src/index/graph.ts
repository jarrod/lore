import type { Database } from "bun:sqlite";
import { compareStrings } from "../okf/ids";

export type Direction = "in" | "out" | "both";
export interface GraphEdge { from: string; rel: string; to: string; origin: string }

export function graphTraversal(db: Database, root: string, direction: Direction, depth: number, rel?: string): { nodes: unknown[]; edges: GraphEdge[] } {
  const visited = new Set([root]);
  let frontier = [root];
  const edgeMap = new Map<string, GraphEdge>();
  for (let level = 0; level < depth && frontier.length; level++) {
    const next = new Set<string>();
    for (const id of frontier.sort()) {
      for (const edge of adjacent(db, id, direction, rel)) {
        edgeMap.set(`${edge.from}\0${edge.rel}\0${edge.to}\0${edge.origin}`, edge);
        const neighbour = edge.from === id ? edge.to : edge.from;
        if (!visited.has(neighbour)) { visited.add(neighbour); next.add(neighbour); }
      }
    }
    frontier = [...next];
  }
  return { nodes: nodeMetadata(db, [...visited]), edges: [...edgeMap.values()].sort(compareEdges) };
}

export function shortestPath(db: Database, from: string, to: string, rel?: string, maxDepth = 8): { found: boolean; nodes: unknown[]; edges: GraphEdge[] } {
  if (from === to) return { found: true, nodes: nodeMetadata(db, [from]), edges: [] };
  const visited = new Set([from]);
  let frontier = [from];
  const parent = new Map<string, { previous: string; edge: GraphEdge }>();
  for (let level = 0; level < maxDepth && frontier.length; level++) {
    const next: string[] = [];
    for (const id of frontier.sort()) {
      for (const edge of adjacent(db, id, "both", rel)) {
        const neighbour = edge.from === id ? edge.to : edge.from;
        if (visited.has(neighbour)) continue;
        visited.add(neighbour); parent.set(neighbour, { previous: id, edge }); next.push(neighbour);
        if (neighbour === to) {
          const edges: GraphEdge[] = [];
          const ids = [to];
          let cursor = to;
          while (cursor !== from) {
            const step = parent.get(cursor)!;
            edges.push(step.edge); cursor = step.previous; ids.push(cursor);
          }
          return { found: true, nodes: nodeMetadata(db, ids.reverse()), edges: edges.reverse() };
        }
      }
    }
    frontier = next;
  }
  return { found: false, nodes: [], edges: [] };
}

function adjacent(db: Database, id: string, direction: Direction, rel?: string): GraphEdge[] {
  const clauses: string[] = [];
  if (direction === "out" || direction === "both") clauses.push("src = ?");
  if (direction === "in" || direction === "both") clauses.push("dst = ?");
  const params = clauses.map(() => id);
  const relSql = rel ? " AND rel = ?" : "";
  if (rel) params.push(rel);
  const rows = db.query(`SELECT src,rel,dst,origin FROM edge WHERE (${clauses.join(" OR ")})${relSql} ORDER BY src,rel,dst,origin`).all(...params) as Array<{src:string;rel:string;dst:string;origin:string}>;
  return rows.map((row) => ({ from: row.src, rel: row.rel, to: row.dst, origin: row.origin }));
}

function nodeMetadata(db: Database, ids: string[]): unknown[] {
  const query = db.query("SELECT id,type,title FROM concept WHERE id=?");
  return ids.map((id) => query.get(id) ?? { id }).sort((a, b) => compareStrings(String((a as {id:string}).id), String((b as {id:string}).id)));
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return compareStrings(`${a.from}\0${a.rel}\0${a.to}\0${a.origin}`, `${b.from}\0${b.rel}\0${b.to}\0${b.origin}`);
}
