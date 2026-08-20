import { resolveBundle, takeGlobalBundleOption } from "./okf/bundle";
import { writeFailure, writeSuccess } from "./protocol/result";
import { invalidArgument } from "./protocol/errors";
import { runFind, runGet, runGraph, runIndex, runInfo } from "./commands/read";
import { runCheck } from "./commands/check";
import { runPut } from "./mutation/put";
import { runStatus } from "./mutation/status";
import { commandHelp, globalHelp } from "./commands/help";
import { runInit } from "./commands/init";
import { requireCompiledExecutable } from "./runtime";
import { TOOL_VERSION } from "./version";
import { runVisualise } from "./commands/visualise";

async function main(): Promise<never> {
  requireCompiledExecutable();
  const rawArgs = Bun.argv.slice(2);
  if (rawArgs.length === 1 && rawArgs[0] === "--version") {
    process.stdout.write(`${TOOL_VERSION}\n`);
    process.exit(0);
  }
  const parsed = takeGlobalBundleOption(rawArgs);
  const command = parsed.args.shift();
  if (command === "--help") return writeSuccess(globalHelp());
  if (!command) throw invalidArgument("A command is required");
  if (parsed.args.includes("--help")) return writeSuccess(commandHelp(command));
  if (command === "init") {
    if (parsed.bundle) throw invalidArgument("--bundle is not valid for init");
    return writeSuccess(runInit(parsed.args));
  }
  const bundle = resolveBundle(parsed.bundle);
  switch (command) {
    case "info": return writeSuccess(await runInfo(bundle, parsed.args));
    case "index": return writeSuccess(await runIndex(bundle, parsed.args));
    case "find": return writeSuccess(await runFind(bundle, parsed.args));
    case "get": return writeSuccess(await runGet(bundle, parsed.args));
    case "graph": return writeSuccess(await runGraph(bundle, parsed.args));
    case "visualise": return writeSuccess(await runVisualise(bundle, parsed.args));
    case "put": return writeSuccess(await runPut(bundle, parsed.args));
    case "status": return writeSuccess(await runStatus(bundle, parsed.args));
    case "check": {
      const result = await runCheck(bundle, parsed.args);
      return writeSuccess(result.data, result.exitCode);
    }
    default: throw invalidArgument("Unknown command", { command });
  }
}

main().catch(writeFailure);
