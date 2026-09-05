import path from "node:path";
import { invalidArgument } from "../protocol/errors";

export function validateConceptId(id: string): string {
  if (!id || id.includes("\\") || id.includes("\0") || id.endsWith(".md") || id.startsWith("/")) {
    throw invalidArgument("Invalid concept ID", { id });
  }
  const segments = id.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw invalidArgument("Invalid concept ID", { id });
  }
  return segments.join("/");
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function idFromRelativePath(relativePath: string): string {
  const posix = relativePath.split(path.sep).join("/");
  return validateConceptId(posix.slice(0, -3));
}

export function conceptPath(bundle: string, id: string): string {
  const valid = validateConceptId(id);
  const destination = path.resolve(bundle, ...valid.split("/")) + ".md";
  assertBundlePath(bundle, destination, id);
  return destination;
}

export function assertBundlePath(bundle: string, candidate: string, id: string): string {
  const relative = path.relative(bundle, candidate);
  if (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  )
    return candidate;
  throw invalidArgument("Concept path escapes bundle", { id });
}
