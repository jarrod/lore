export const EXIT = {
  success: 0,
  invalidArguments: 2,
  invalidOkf: 3,
  notFound: 4,
  conflict: 5,
  unsupported: 6,
  internal: 10,
} as const;

export class LoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const invalidArgument = (message: string, details?: Record<string, unknown>) =>
  new LoreError("INVALID_ARGUMENT", message, EXIT.invalidArguments, details);

export const invalidOkf = (message: string, details?: Record<string, unknown>) =>
  new LoreError("INVALID_OKF", message, EXIT.invalidOkf, details);

export const notFound = (code: string, message: string, details?: Record<string, unknown>) =>
  new LoreError(code, message, EXIT.notFound, details);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new LoreError("MUTATION_CONFLICT", message, EXIT.conflict, details);

export const unsupported = (message: string, details?: Record<string, unknown>) =>
  new LoreError("UNSUPPORTED_CAPABILITY", message, EXIT.unsupported, details);

export const graphTooLarge = (details: Record<string, unknown>) =>
  new LoreError("GRAPH_TOO_LARGE", "Selected graph exceeds the visualisation node limit", EXIT.unsupported, details);
