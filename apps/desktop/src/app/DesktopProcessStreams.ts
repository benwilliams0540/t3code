const CLOSED_OUTPUT_ERROR_CODES = new Set(["EIO", "EPIPE"]);

export function handleProcessOutputError(error: NodeJS.ErrnoException): void {
  if (error.code && CLOSED_OUTPUT_ERROR_CODES.has(error.code)) return;
  throw error;
}
