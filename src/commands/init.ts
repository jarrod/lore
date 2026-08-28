import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { ensureNoArgs, takeOption } from "./options";
import { notFound } from "../protocol/errors";
import { requireCompiledExecutable } from "../runtime";

export function runInit(args: string[]): unknown {
  requireCompiledExecutable();

  const repoOption = takeOption(args, "--repo");
  ensureNoArgs(args);
  const repository = resolveRepository(repoOption);
  const loreRoot = path.join(repository, ".lore");
  const binDirectory = path.join(loreRoot, "bin");
  const cache = path.join(loreRoot, "cache");
  const bundle = path.join(loreRoot, "knowledge");
  const binary = path.join(binDirectory, process.platform === "win32" ? "lore.exe" : "lore");

  mkdirSync(binDirectory, { recursive: true });
  mkdirSync(cache, { recursive: true });
  mkdirSync(bundle, { recursive: true });
  const installed = installSelf(binary);
  ensureIgnoreFile(path.join(loreRoot, ".gitignore"));

  return { repository, binary, bundle, cache, installed };
}

function resolveRepository(input?: string): string {
  const candidate = path.resolve(input ?? process.cwd());
  if (!existsSync(candidate)) {
    throw notFound("REPOSITORY_NOT_FOUND", "Repository directory does not exist", { path: candidate });
  }
  try {
    const resolved = realpathSync(candidate);
    if (!statSync(resolved).isDirectory()) throw new Error("not a directory");
    return resolved;
  } catch {
    throw notFound("REPOSITORY_NOT_FOUND", "Repository is not an accessible directory", { path: candidate });
  }
}

function installSelf(destination: string): boolean {
  const source = realpathSync(process.execPath);
  if (existsSync(destination) && realpathSync(destination) === source) return false;

  const temporary = `${destination}.tmp-${process.pid}`;
  try {
    copyFileSync(source, temporary);
    if (process.platform !== "win32") chmodSync(temporary, 0o755);
    replaceFile(temporary, destination);
    return true;
  } finally {
    rmSync(temporary, { force: true });
  }
}

function replaceFile(source: string, destination: string): void {
  try {
    renameSync(source, destination);
  } catch (error) {
    if (!existsSync(destination)) throw error;
    const backup = `${destination}.old-${process.pid}`;
    renameSync(destination, backup);
    try {
      renameSync(source, destination);
      rmSync(backup, { force: true });
    } catch (replacementError) {
      if (!existsSync(destination)) renameSync(backup, destination);
      throw replacementError;
    }
  }
}

function ensureIgnoreFile(ignorePath: string): void {
  const required = ["/bin/", "/cache/", "/visualisations/", "/backups/"];
  const existing = existsSync(ignorePath)
    ? readFileSync(ignorePath, "utf8").split(/\r?\n/).filter(Boolean)
    : [];
  const merged = [...existing];
  for (const entry of required) {
    if (!merged.includes(entry)) merged.push(entry);
  }
  const content = `${merged.join("\n")}\n`;
  if (!existsSync(ignorePath) || readFileSync(ignorePath, "utf8") !== content) {
    writeFileSync(ignorePath, content);
  }
}
