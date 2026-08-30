import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "../index/database";
import { bundleGraph, graphTraversal, type Direction } from "../index/graph";
import { refreshIndex } from "../index/refresh";
import { validateConceptId } from "../okf/ids";
import { EXIT, LoreError, graphTooLarge, invalidArgument, notFound } from "../protocol/errors";
import { renderVisualisation } from "../visualisation/html";
import { ensureNoArgs, takeFlag, takeOption } from "./options";

const DEFAULT_MAX_NODES = 500;
const MAX_MAX_NODES = 1000;

export async function runVisualise(bundle: string, args: string[]): Promise<unknown> {
  const root = args[0] && !args[0]!.startsWith("--") ? args.shift() : undefined;
  if (root) validateConceptId(root);
  const directionRaw = takeOption(args, "--direction");
  const depthRaw = takeOption(args, "--depth");
  const rel = takeOption(args, "--rel");
  const maxNodesRaw = takeOption(args, "--max-nodes");
  const outputRaw = takeOption(args, "--output");
  const shouldOpen = takeFlag(args, "--open");
  ensureNoArgs(args);
  if (!root && (directionRaw !== undefined || depthRaw !== undefined)) {
    throw invalidArgument("--direction and --depth require a root concept ID");
  }
  const direction = (directionRaw ?? "both") as Direction;
  if (!(["in", "out", "both"] as string[]).includes(direction)) throw invalidArgument("Invalid graph direction", { direction });
  const depth = depthRaw === undefined ? 1 : Number(depthRaw);
  if (!Number.isInteger(depth) || depth < 1 || depth > 8) throw invalidArgument("--depth must be between 1 and 8");
  if (rel && !/^[a-z][a-z0-9_]*$/.test(rel)) throw invalidArgument("Invalid relationship filter", { rel });
  const maxNodes = maxNodesRaw === undefined ? DEFAULT_MAX_NODES : Number(maxNodesRaw);
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_MAX_NODES) {
    throw invalidArgument(`--max-nodes must be between 1 and ${MAX_MAX_NODES}`);
  }

  const { db } = openDatabase(bundle);
  let graph;
  try {
    await refreshIndex(db, bundle);
    if (root && !db.query("SELECT 1 FROM concept WHERE id=?").get(root)) {
      throw notFound("CONCEPT_NOT_FOUND", "Concept does not exist", { id: root });
    }
    graph = root ? graphTraversal(db, root, direction, depth, rel) : bundleGraph(db, rel);
  } finally {
    db.close();
  }
  if (graph.nodes.length > maxNodes) {
    throw graphTooLarge({ nodes: graph.nodes.length, limit: maxNodes, root: root ?? null, max_supported: MAX_MAX_NODES });
  }

  const requestedOutput = outputRaw
    ? path.resolve(process.cwd(), outputRaw)
    : path.join(process.cwd(), ".lore", "visualisations", root ? `${safeFilename(root)}-graph.html` : "knowledge-graph.html");
  const output = await prepareOutput(bundle, requestedOutput);
  await writeAtomically(output, renderVisualisation({ ...graph, ...(root ? { root } : {}) }));
  if (shouldOpen) await openInBrowser(output);
  return {
    path: output,
    scope: root ? "rooted" : "bundle",
    root: root ?? null,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    max_nodes: maxNodes,
    opened: shouldOpen,
  };
}

export function safeFilename(id: string): string {
  return id.replaceAll("/", "-").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "concept";
}

export function browserCommand(file: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "darwin") return ["open", file];
  if (platform === "win32") return ["cmd", "/c", "start", "", file];
  if (platform === "linux") return ["xdg-open", file];
  throw new LoreError("OPEN_FAILED", "No browser launcher is available for this platform", EXIT.unsupported, { path: file, platform });
}

async function prepareOutput(bundle: string, requested: string): Promise<string> {
  if (existsSync(requested) && statSync(requested).isDirectory()) throw invalidArgument("--output must name a file", { path: requested });
  const missingSegments: string[] = [];
  let existingAncestor = path.dirname(requested);
  while (!existsSync(existingAncestor)) {
    missingSegments.unshift(path.basename(existingAncestor));
    const next = path.dirname(existingAncestor);
    if (next === existingAncestor) throw invalidArgument("Visualisation output has no accessible parent", { path: requested });
    existingAncestor = next;
  }
  // Use the same synchronous canonicalizer as bundle resolution so Windows
  // short and long path aliases cannot bypass the bundle boundary check.
  const resolvedParent = path.join(realpathSync(existingAncestor), ...missingSegments);
  const output = path.join(resolvedParent, path.basename(requested));
  assertOutsideBundle(bundle, output);
  await mkdir(resolvedParent, { recursive: true });
  return output;
}

function assertOutsideBundle(bundle: string, output: string): void {
  const relative = path.relative(bundle, output);
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) {
    throw invalidArgument("Visualisation output must be outside the authoritative bundle", { path: output, bundle });
  }
}

async function writeAtomically(destination: string, content: string): Promise<void> {
  const temporary = `${destination}.lore-${process.pid}-${crypto.randomUUID()}.tmp`;
  const backup = `${destination}.lore-${process.pid}.old`;
  let backupCreated = false;
  try {
    await Bun.write(temporary, content);
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!existsSync(destination)) throw error;
      await rename(destination, backup);
      backupCreated = true;
      try {
        await rename(temporary, destination);
        await unlink(backup);
        backupCreated = false;
      } catch (replacementError) {
        if (!existsSync(destination) && existsSync(backup)) {
          await rename(backup, destination);
          backupCreated = false;
        }
        throw replacementError;
      }
    }
  } finally {
    if (existsSync(temporary)) await unlink(temporary);
    // Preserve a backup after an exceptional failed restore rather than deleting the previous graph.
    if (!backupCreated && existsSync(backup)) await unlink(backup);
  }
}

async function openInBrowser(file: string): Promise<void> {
  try {
    const command = browserCommand(file);
    const child = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" });
    const exitCode = await child.exited;
    if (exitCode !== 0) {
      const reason = await new Response(child.stderr).text();
      throw new Error(reason.trim() || `launcher exited ${exitCode}`);
    }
  } catch (error) {
    if (error instanceof LoreError) throw error;
    throw new LoreError("OPEN_FAILED", "Visualisation was generated but could not be opened", EXIT.unsupported, {
      path: file,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
