import { assert, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  make,
  type ElectronNotificationHandle,
  type ElectronNotificationRuntime,
} from "./ElectronNotification.ts";

const request = { id: "event-1", title: "Claw in #general", body: "Done" } as const;

function testRuntime(overrides: Partial<ElectronNotificationRuntime> = {}) {
  const listeners = new Map<string, () => void>();
  const handle: ElectronNotificationHandle = {
    once: (event, listener) => listeners.set(event, listener),
    show: vi.fn(),
  };
  const runtime: ElectronNotificationRuntime = {
    create: vi.fn(() => handle),
    isFocused: vi.fn(() => false),
    isSupported: vi.fn(() => true),
    reveal: vi.fn(),
    ...overrides,
  };
  return { handle, listeners, runtime };
}

describe("ElectronNotification", () => {
  it.effect("shows once, deduplicates by event id, and reveals on click", () =>
    Effect.gen(function* () {
      const test = testRuntime();
      const service = make(test.runtime);

      expect(yield* service.show(request)).toBe("shown");
      expect(yield* service.show(request)).toBe("duplicate");
      expect(test.handle.show).toHaveBeenCalledOnce();
      test.listeners.get("click")?.();
      expect(test.runtime.reveal).toHaveBeenCalledOnce();
    }),
  );

  it.effect("suppresses focused windows and unsupported platforms", () =>
    Effect.gen(function* () {
      const focused = make(testRuntime({ isFocused: () => true }).runtime);
      const unsupported = make(testRuntime({ isSupported: () => false }).runtime);
      assert.strictEqual(yield* focused.show(request), "focused");
      assert.strictEqual(yield* unsupported.show(request), "unsupported");
    }),
  );
});
