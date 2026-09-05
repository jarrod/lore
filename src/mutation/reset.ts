import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { ensureNoArgs, takeFlag, takeOption } from "../commands/options";
import { openDatabase } from "../index/database";
import { refreshIndex } from "../index/refresh";
import { conflict, invalidArgument } from "../protocol/errors";

interface BundleState {
  confirmation_token: string;
  concepts: number;
  files: number;
  bytes: number;
}

export async function runReset(bundle: string, args: string[]): Promise<unknown> {
  const knowledge = takeFlag(args, "--knowledge");
  const noBackup = takeFlag(args, "--no-backup");
  const confirmation = takeOption(args, "--confirm");
  ensureNoArgs(args);
  if (!knowledge) throw invalidArgument("reset requires --knowledge");

  const mode = noBackup ? "permanent" : "recoverable";
  const state = bundleState(bundle, mode);
  if (confirmation === undefined) {
    return {
      action: "reset_knowledge",
      mode,
      bundle,
      ...state,
      requires_confirmation: true,
      recoverable: !noBackup,
    };
  }
  if (confirmation !== state.confirmation_token) {
    throw conflict("Bundle changed or confirmation token is invalid", {
      bundle,
      expected_confirmation_token: confirmation,
      actual_confirmation_token: state.confirmation_token,
    });
  }

  const previousBundle = noBackup
    ? discardedBundlePath(bundle, state.confirmation_token)
    : backupPath(bundle, state.confirmation_token);
  mkdirSync(path.dirname(previousBundle), { recursive: true });
  renameSync(bundle, previousBundle);
  try {
    mkdirSync(bundle);
    const { db } = openDatabase(bundle, true);
    try {
      await refreshIndex(db, bundle);
    } finally {
      db.close();
    }
    if (noBackup) rmSync(previousBundle, { recursive: true });
  } catch (error) {
    if (existsSync(bundle)) rmSync(bundle, { recursive: true, force: true });
    if (existsSync(previousBundle)) renameSync(previousBundle, bundle);
    throw error;
  }

  return {
    action: "reset_knowledge",
    mode,
    bundle,
    removed: { concepts: state.concepts, files: state.files, bytes: state.bytes },
    ...(noBackup ? {} : { backup: previousBundle }),
    concepts: 0,
    recoverable: !noBackup,
    cache: { current: true },
  };
}

function bundleState(bundle: string, mode: "recoverable" | "permanent"): BundleState {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`lore-reset-v2\0${mode}\0${bundle}\0`);
  let concepts = 0;
  let files = 0;
  let bytes = 0;

  for (const relative of bundleEntries(bundle)) {
    const absolute = path.join(bundle, ...relative.split("/"));
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      hasher.update(`directory\0${relative}\0`);
      continue;
    }
    files++;
    if (stat.isSymbolicLink()) {
      hasher.update(`symlink\0${relative}\0${readlinkSync(absolute)}\0`);
      continue;
    }
    if (stat.isFile()) {
      const content = readFileSync(absolute);
      bytes += content.byteLength;
      hasher.update(`file\0${relative}\0${content.byteLength}\0`);
      hasher.update(content);
      hasher.update("\0");
      if (isConceptPath(relative)) concepts++;
      continue;
    }
    hasher.update(`other\0${relative}\0${stat.mode}\0${stat.size}\0`);
  }

  return { confirmation_token: hasher.digest("hex"), concepts, files, bytes };
}

function bundleEntries(bundle: string): string[] {
  const entries: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      entries.push(relative);
      if (entry.isDirectory() && !entry.isSymbolicLink())
        visit(path.join(directory, entry.name), relative);
    }
  };
  visit(bundle, "");
  return entries.sort();
}

function isConceptPath(relative: string): boolean {
  const name = relative.split("/").at(-1);
  return relative.endsWith(".md") && name !== "index.md" && name !== "log.md";
}

function backupPath(bundle: string, token: string): string {
  const parent = path.dirname(bundle);
  const standardRepositoryBundle =
    path.basename(parent) === ".lore" && path.basename(bundle) === "knowledge";
  const backupRoot = standardRepositoryBundle ? path.join(parent, "backups") : `${bundle}.backups`;
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  const destination = path.join(
    backupRoot,
    `${path.basename(bundle)}-${timestamp}-${token.slice(0, 12)}`,
  );
  if (existsSync(destination))
    throw conflict("Knowledge backup already exists", { backup: destination });
  return destination;
}

function discardedBundlePath(bundle: string, token: string): string {
  const destination = path.join(
    path.dirname(bundle),
    `.lore-reset-${path.basename(bundle)}-${process.pid}-${token.slice(0, 12)}`,
  );
  if (existsSync(destination))
    throw conflict("Temporary reset path already exists", { path: destination });
  return destination;
}
