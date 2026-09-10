import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { beforeEach, vi } from "vite-plus/test";

const { createClerkBridgeMock, storageAdapter, storageMock } = vi.hoisted(() => ({
  createClerkBridgeMock: vi.fn(),
  storageAdapter: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  storageMock: vi.fn(),
}));

vi.mock("@clerk/electron", () => ({
  createClerkBridge: createClerkBridgeMock,
}));

vi.mock("@clerk/electron/storage", () => ({
  storage: storageMock,
}));

import * as DesktopClerk from "./DesktopClerk.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const makeDesktopClerkLayer = (isDevelopment = true, clerkPasskeysEnabled = true) => {
  const environment = DesktopEnvironment.DesktopEnvironment.of({
    stateDir: "/tmp/t3-state",
    isDevelopment,
    clerkPasskeysEnabled,
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]);

  return DesktopClerk.layer.pipe(
    Layer.provide(Layer.succeed(DesktopEnvironment.DesktopEnvironment, environment)),
  );
};

describe("DesktopClerk", () => {
  beforeEach(() => {
    createClerkBridgeMock.mockReset();
    storageMock.mockReset();
  });

  it("derives the Clerk Frontend API hostname used by the desktop CSP", () => {
    const publishableKey = `pk_test_${btoa("clerk.t3.codes$")}`;

    assert.equal(
      DesktopClerk.resolveDesktopClerkFrontendApiHostname(publishableKey),
      "clerk.t3.codes",
    );
    assert.equal(DesktopClerk.resolveDesktopClerkFrontendApiHostname(""), undefined);
    assert.equal(DesktopClerk.resolveDesktopClerkFrontendApiHostname("invalid"), undefined);
  });

  it("removes the renderer Origin from native Clerk requests that carry authorization", () => {
    const handle = DesktopClerk.createDesktopClerkBeforeSendHeadersHandler("clerk.t3.codes");
    const callback = vi.fn();

    handle(
      {
        url: "https://clerk.t3.codes/v1/client?_is_native=1",
        requestHeaders: {
          Authorization: "Bearer test-client-token",
          Origin: "threadspace://app",
          "User-Agent": "ThreadSpace",
        },
      },
      callback,
    );

    assert.deepEqual(callback.mock.calls, [
      [
        {
          requestHeaders: {
            Authorization: "Bearer test-client-token",
            "User-Agent": "ThreadSpace",
          },
        },
      ],
    ]);
  });

  it("matches Clerk request headers without relying on their casing", () => {
    const handle = DesktopClerk.createDesktopClerkBeforeSendHeadersHandler("clerk.t3.codes");
    const callback = vi.fn();

    handle(
      {
        url: "https://clerk.t3.codes/v1/client?_is_native=1",
        requestHeaders: {
          authorization: "Bearer test-client-token",
          origin: "null",
        },
      },
      callback,
    );

    assert.deepEqual(callback.mock.calls, [
      [{ requestHeaders: { authorization: "Bearer test-client-token" } }],
    ]);
  });

  it.each([
    {
      name: "browser-style request without authorization",
      url: "https://clerk.t3.codes/v1/client?_is_native=1",
      requestHeaders: { Origin: "threadspace://app" },
    },
    {
      name: "request with an empty bearer credential",
      url: "https://clerk.t3.codes/v1/client?_is_native=1",
      requestHeaders: {
        Authorization: "Bearer   ",
        Origin: "threadspace://app",
      },
    },
    {
      name: "non-native Clerk request",
      url: "https://clerk.t3.codes/v1/client",
      requestHeaders: {
        Authorization: "Bearer test-client-token",
        Origin: "threadspace://app",
      },
    },
    {
      name: "request to another host",
      url: "https://example.com/v1/client?_is_native=1",
      requestHeaders: {
        Authorization: "Bearer test-client-token",
        Origin: "threadspace://app",
      },
    },
    {
      name: "malformed request URL",
      url: "not a URL",
      requestHeaders: {
        Authorization: "Bearer test-client-token",
        Origin: "threadspace://app",
      },
    },
  ])("preserves headers for a $name", ({ url, requestHeaders }) => {
    const handle = DesktopClerk.createDesktopClerkBeforeSendHeadersHandler("clerk.t3.codes");
    const callback = vi.fn();

    handle({ url, requestHeaders }, callback);

    assert.deepEqual(callback.mock.calls, [[{ requestHeaders }]]);
  });

  it("registers and removes the narrowly scoped Clerk request hook", () => {
    const onBeforeSendHeaders = vi.fn();
    const onHeadersReceived = vi.fn();

    const cleanup = DesktopClerk.installDesktopClerkNativeTransportHeaders(
      { onBeforeSendHeaders, onHeadersReceived } as never,
      "clerk.t3.codes",
      "threadspace://app",
    );

    assert.equal(onBeforeSendHeaders.mock.calls.length, 1);
    assert.deepEqual(onBeforeSendHeaders.mock.calls[0]?.[0], {
      urls: ["https://clerk.t3.codes/*"],
    });
    assert.equal(typeof onBeforeSendHeaders.mock.calls[0]?.[1], "function");
    assert.equal(onHeadersReceived.mock.calls.length, 1);
    assert.deepEqual(onHeadersReceived.mock.calls[0]?.[0], {
      urls: ["https://clerk.t3.codes/*"],
    });
    assert.equal(typeof onHeadersReceived.mock.calls[0]?.[1], "function");

    cleanup();
    assert.deepEqual(onBeforeSendHeaders.mock.calls[1], [
      { urls: ["https://clerk.t3.codes/*"] },
      null,
    ]);
    assert.deepEqual(onHeadersReceived.mock.calls[1], [
      { urls: ["https://clerk.t3.codes/*"] },
      null,
    ]);
  });

  it("allows the native Clerk response back to the desktop renderer", () => {
    const handle = DesktopClerk.createDesktopClerkHeadersReceivedHandler(
      "clerk.t3.codes",
      "threadspace://app",
    );
    const callback = vi.fn();

    handle(
      {
        url: "https://clerk.t3.codes/v1/client?_is_native=1",
        responseHeaders: {
          "Content-Type": ["application/json"],
        },
      },
      callback,
    );

    assert.deepEqual(callback.mock.calls, [
      [
        {
          responseHeaders: {
            "Access-Control-Allow-Origin": ["threadspace://app"],
            "Content-Type": ["application/json"],
          },
        },
      ],
    ]);
  });

  it.each([
    "https://clerk.t3.codes/v1/client",
    "https://example.com/v1/client?_is_native=1",
    "not a URL",
  ])("preserves response headers outside the native Clerk boundary: %s", (url) => {
    const handle = DesktopClerk.createDesktopClerkHeadersReceivedHandler(
      "clerk.t3.codes",
      "threadspace://app",
    );
    const callback = vi.fn();
    const responseHeaders = { "Content-Type": ["application/json"] };

    handle({ url, responseHeaders }, callback);

    assert.deepEqual(callback.mock.calls, [[{ responseHeaders }]]);
  });

  it.effect("acquires and releases the SDK bridge with the layer", () => {
    const cleanup = vi.fn();
    storageMock.mockReturnValue(storageAdapter);
    createClerkBridgeMock.mockReturnValue({ cleanup });

    return Effect.gen(function* () {
      yield* Effect.scoped(Layer.build(makeDesktopClerkLayer()));

      assert.deepEqual(createClerkBridgeMock.mock.calls, [
        [
          {
            storage: storageAdapter,
            passkeys: true,
            renderer: { scheme: "t3code-dev", host: "app" },
          },
        ],
      ]);
      assert.equal(cleanup.mock.calls.length, 1);
      storageMock.mockClear();
      createClerkBridgeMock.mockClear();
    });
  });

  it.effect("preserves bridge initialization failures", () => {
    const cause = new Error("bridge initialization failed");
    storageMock.mockReturnValue(storageAdapter);
    createClerkBridgeMock.mockImplementationOnce(() => {
      throw cause;
    });

    return Effect.gen(function* () {
      const error = yield* Effect.scoped(Layer.build(makeDesktopClerkLayer())).pipe(Effect.flip);

      assert.instanceOf(error, DesktopClerk.DesktopClerkBridgeInitializationError);
      assert.equal(error.stateDir, "/tmp/t3-state");
      assert.equal(error.isDevelopment, true);
      assert.strictEqual(error.cause, cause);
      assert.equal(
        error.message,
        'Failed to initialize the desktop Clerk bridge for state directory "/tmp/t3-state" (development: true).',
      );
    });
  });

  it.effect("preserves bridge cleanup failures", () => {
    const cause = new Error("bridge cleanup failed");
    storageMock.mockReturnValue(storageAdapter);
    createClerkBridgeMock.mockReturnValue({
      cleanup: () => {
        throw cause;
      },
    });

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(Effect.scoped(Layer.build(makeDesktopClerkLayer(false))));

      assert.equal(exit._tag, "Failure");
      if (exit._tag === "Failure") {
        const error = Cause.squash(exit.cause);
        assert.instanceOf(error, DesktopClerk.DesktopClerkBridgeCleanupError);
        assert.equal(error.stateDir, "/tmp/t3-state");
        assert.equal(error.isDevelopment, false);
        assert.strictEqual(error.cause, cause);
        assert.equal(
          error.message,
          'Failed to clean up the desktop Clerk bridge for state directory "/tmp/t3-state" (development: false).',
        );
      }
    });
  });

  it.each([
    { isDevelopment: true, scheme: "t3code-dev" },
    { isDevelopment: false, scheme: "t3code" },
  ])("configures the SDK with the $scheme renderer origin", ({ isDevelopment, scheme }) => {
    const bridge = { cleanup: vi.fn() };
    storageMock.mockReturnValue(storageAdapter);
    createClerkBridgeMock.mockReturnValue(bridge);

    assert.equal(
      DesktopClerk.createDesktopClerkBridge("/tmp/t3-state", isDevelopment, true),
      bridge,
    );
    assert.deepEqual(storageMock.mock.calls, [[{ path: "/tmp/t3-state" }]]);
    assert.deepEqual(createClerkBridgeMock.mock.calls, [
      [
        {
          storage: storageAdapter,
          passkeys: true,
          renderer: { scheme, host: "app" },
        },
      ],
    ]);
    storageMock.mockClear();
    createClerkBridgeMock.mockClear();
  });

  it.effect("can disable passkeys for an unsigned local package", () => {
    const cleanup = vi.fn();
    storageMock.mockReturnValue(storageAdapter);
    createClerkBridgeMock.mockReturnValue({ cleanup });

    return Effect.gen(function* () {
      yield* Effect.scoped(Layer.build(makeDesktopClerkLayer(false, false)));

      assert.deepEqual(createClerkBridgeMock.mock.calls, [
        [
          {
            storage: storageAdapter,
            passkeys: false,
            renderer: { scheme: "t3code", host: "app" },
          },
        ],
      ]);
    });
  });
});
