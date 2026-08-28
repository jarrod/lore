import { EXIT, LoreError } from "./errors";

export function writeSuccess(data: unknown, exitCode: number = EXIT.success): void {
  process.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
  process.exitCode = exitCode;
}

export function writeFailure(error: unknown): void {
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
  process.exitCode = known.exitCode;
}
