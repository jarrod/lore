#!/usr/bin/env bun
import { resolveBundle, takeGlobalBundleOption } from "./okf/bundle";
import { writeFailure, writeSuccess } from "./protocol/result";
import { invalidArgument } from "./protocol/errors";
import { runFind, runGet, runGraph, runIndex, runInfo } from "./commands/read";
import { runCheck } from "./commands/check";
import { runPut } from "./mutation/put";
import { commandHelp, globalHelp } from "./commands/help";

async function main(): Promise<never> {
  const parsed = takeGlobalBundleOption(Bun.argv.slice(2));
  const command = parsed.args.shift();
  if (command === "--help") return writeSuccess(globalHelp());
  if (!command) throw invalidArgument("A command is required");
  if (parsed.args.includes("--help")) return writeSuccess(commandHelp(command));
  const bundle = resolveBundle(parsed.bundle);
  switch (command) {
    case "info": return writeSuccess(await runInfo(bundle, parsed.args));
    case "index": return writeSuccess(await runIndex(bundle, parsed.args));
    case "find": return writeSuccess(await runFind(bundle, parsed.args));
    case "get": return writeSuccess(await runGet(bundle, parsed.args));
    case "graph": return writeSuccess(await runGraph(bundle, parsed.args));
    case "put": return writeSuccess(await runPut(bundle, parsed.args));
    case "check": {
      const result = await runCheck(bundle, parsed.args);
      return writeSuccess(result.data, result.exitCode);
    }
    default: throw invalidArgument("Unknown command", { command });
  }
}

main().catch(writeFailure);
