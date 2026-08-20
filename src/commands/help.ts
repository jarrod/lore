import { TOOL_VERSION } from "../version";
import { invalidArgument } from "../protocol/errors";

interface CommandHelp {
  name: string;
  usage: string;
  summary: string;
  arguments?: Array<{ name: string; required: boolean; description: string }>;
  options: Array<{ flag: string; value?: string; description: string }>;
}

const bundleOption = { flag: "--bundle", value: "<path>", description: "Use this OKF bundle instead of OKF_BUNDLE or the current directory." };

const commands: CommandHelp[] = [
  {
    name: "init",
    usage: "lore init [--repo <path>]",
    summary: "Install this executable and initialize repository-local Lore state.",
    options: [
      { flag: "--repo", value: "<path>", description: "Initialize this repository; defaults to the current directory." },
      helpOption(),
    ],
  },
  {
    name: "info",
    usage: "lore info [--bundle <path>]",
    summary: "Report bundle state and runtime capabilities.",
    options: [bundleOption, helpOption()],
  },
  {
    name: "index",
    usage: "lore index [--rebuild] [--bundle <path>]",
    summary: "Refresh or rebuild the disposable SQLite index.",
    options: [
      { flag: "--rebuild", description: "Delete and recreate all derived index state." },
      bundleOption,
      helpOption(),
    ],
  },
  {
    name: "find",
    usage: "lore find <query> [--type <type>] [--tag <tag>] [--status <status>] [--scope <concept-id>] [--limit <n>] [--bundle <path>]",
    summary: "Search concepts using FTS5 and BM25 ranking.",
    arguments: [{ name: "query", required: true, description: "Natural lexical search query." }],
    options: [
      { flag: "--type", value: "<type>", description: "Require an exact concept type." },
      { flag: "--tag", value: "<tag>", description: "Require a matching tag." },
      { flag: "--status", value: "<status>", description: "Require an explicitly recorded lifecycle status." },
      { flag: "--scope", value: "<concept-id>", description: "Limit results to a concept or directory prefix." },
      { flag: "--limit", value: "<1..100>", description: "Limit returned results; defaults to 20." },
      bundleOption,
      helpOption(),
    ],
  },
  {
    name: "get",
    usage: "lore get <concept-id> [--section <heading>] [--bundle <path>]",
    summary: "Retrieve a complete concept or one Markdown section.",
    arguments: [{ name: "concept-id", required: true, description: "Canonical bundle-relative concept ID." }],
    options: [
      { flag: "--section", value: "<heading>", description: "Return only the matching Markdown section." },
      bundleOption,
      helpOption(),
    ],
  },
  {
    name: "graph",
    usage: "lore graph <concept-id> [--direction <in|out|both>] [--depth <1..8>] [--rel <relationship>] [--to <concept-id>] [--bundle <path>]",
    summary: "Inspect neighbours, traverse relationships, or find a shortest path.",
    arguments: [{ name: "concept-id", required: true, description: "Canonical starting concept ID." }],
    options: [
      { flag: "--direction", value: "<in|out|both>", description: "Choose edge direction; defaults to both." },
      { flag: "--depth", value: "<1..8>", description: "Maximum traversal depth; defaults to 1." },
      { flag: "--rel", value: "<relationship>", description: "Restrict traversal to one relationship." },
      { flag: "--to", value: "<concept-id>", description: "Find a shortest path to another concept." },
      bundleOption,
      helpOption(),
    ],
  },
  {
    name: "put",
    usage: "lore put <concept-id> [--bundle <path>] < request.json",
    summary: "Create, merge, or explicitly replace one concept from a JSON request on stdin.",
    arguments: [{ name: "concept-id", required: true, description: "Canonical destination concept ID." }],
    options: [bundleOption, helpOption()],
  },
  {
    name: "status",
    usage: "lore status <concept-id> <status> [--expected-hash <hash>] [--bundle <path>]",
    summary: "Set one concept's lifecycle status without changing its other content.",
    arguments: [
      { name: "concept-id", required: true, description: "Canonical destination concept ID." },
      { name: "status", required: true, description: "User-defined non-empty lifecycle status." },
    ],
    options: [
      { flag: "--expected-hash", value: "<hash>", description: "Reject the update unless the current content hash matches." },
      bundleOption,
      helpOption(),
    ],
  },
  {
    name: "check",
    usage: "lore check [--strict] [--bundle <path>]",
    summary: "Validate an OKF bundle and report deterministic findings.",
    options: [
      { flag: "--strict", description: "Exit with validation failure when warnings are present." },
      bundleOption,
      helpOption(),
    ],
  },
];

export function globalHelp(): unknown {
  return {
    name: "lore",
    version: TOOL_VERSION,
    usage: "lore <command> [options]",
    bundle_resolution: ["--bundle <path>", "OKF_BUNDLE", "current working directory"],
    commands: commands.map(({ name, usage, summary }) => ({ name, usage, summary })),
    options: [helpOption(), { flag: "--version", description: "Print only the Lore version." }],
  };
}

export function commandHelp(name: string): CommandHelp {
  const command = commands.find((candidate) => candidate.name === name);
  if (!command) throw invalidArgument("Unknown command", { command: name });
  return command;
}

function helpOption(): { flag: string; description: string } {
  return { flag: "--help", description: "Return machine-readable help for this command." };
}
