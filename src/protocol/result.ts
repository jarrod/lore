import { EXIT, LoreError } from "./errors";

export function writeSuccess(data: unknown, exitCode: number = EXIT.success): never {
  process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
  process.exit(exitCode);
}

export function writeFailure(error: unknown): never {
  const known = error instanceof LoreError
    ? error
    : new LoreError("INTERNAL_ERROR", "Internal error", EXIT.internal);
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: {
      code: known.code,
      message: known.message,
      ...(known.details ? { details: known.details } : {}),
    },
  })}\n`);
  process.exit(known.exitCode);
}
