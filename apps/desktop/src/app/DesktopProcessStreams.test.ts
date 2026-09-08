import { assert, describe, expect, it } from "@effect/vitest";

import { handleProcessOutputError } from "./DesktopProcessStreams.ts";

function outputError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("handleProcessOutputError", () => {
  it("ignores closed pipe errors", () => {
    assert.doesNotThrow(() => handleProcessOutputError(outputError("EPIPE")));
  });

  it("ignores closed terminal errors", () => {
    assert.doesNotThrow(() => handleProcessOutputError(outputError("EIO")));
  });

  it("rethrows unrelated output errors", () => {
    const error = outputError("EACCES");
    expect(() => handleProcessOutputError(error)).toThrow(error);
  });
});
