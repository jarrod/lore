import { unsupported } from "./protocol/errors";

declare const __LORE_COMPILED__: boolean;

export function requireCompiledExecutable(): void {
  if (typeof __LORE_COMPILED__ !== "undefined" && __LORE_COMPILED__ === true) return;
  throw unsupported("Lore must be run as a standalone compiled executable");
}
