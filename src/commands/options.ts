import { invalidArgument } from "../protocol/errors";

export function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw invalidArgument(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

export function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

export function ensureNoArgs(args: string[]): void {
  if (args.length) throw invalidArgument("Unexpected arguments", { arguments: args });
}
