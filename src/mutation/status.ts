import { existsSync } from "node:fs";
import { ensureNoArgs, takeOption } from "../commands/options";
import { conceptPath } from "../okf/ids";
import { invalidArgument, notFound } from "../protocol/errors";
import { putConcept } from "./put";

export async function runStatus(bundle: string, args: string[]): Promise<unknown> {
  const id = args.shift();
  if (!id) throw invalidArgument("status requires a concept ID");
  const rawStatus = args.shift();
  if (!rawStatus || !rawStatus.trim()) throw invalidArgument("status requires a non-empty status value");
  const status = rawStatus.trim();
  const expectedHash = takeOption(args, "--expected-hash");
  ensureNoArgs(args);
  if (!existsSync(conceptPath(bundle, id))) throw notFound("CONCEPT_NOT_FOUND", "Concept does not exist", { id });
  const result = await putConcept(bundle, id, {
    mode: "merge",
    frontmatter: { status },
    expected_hash: expectedHash,
  }) as Record<string, unknown>;
  return { ...result, status };
}
