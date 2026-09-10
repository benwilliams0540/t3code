import { createClerkBridge } from "@clerk/electron";
import { storage } from "@clerk/electron/storage";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import * as Electron from "electron";

import { clerkFrontendApiHostnameFromPublishableKey } from "@t3tools/shared/relayAuth";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

declare const __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__: string | undefined;

export class DesktopClerkBridgeInitializationError extends Schema.TaggedErrorClass<DesktopClerkBridgeInitializationError>()(
  "DesktopClerkBridgeInitializationError",
  {
    stateDir: Schema.String,
    isDevelopment: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to initialize the desktop Clerk bridge for state directory "${this.stateDir}" (development: ${this.isDevelopment}).`;
  }
}

export class DesktopClerkBridgeCleanupError extends Schema.TaggedErrorClass<DesktopClerkBridgeCleanupError>()(
  "DesktopClerkBridgeCleanupError",
  {
    stateDir: Schema.String,
    isDevelopment: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to clean up the desktop Clerk bridge for state directory "${this.stateDir}" (development: ${this.isDevelopment}).`;
  }
}

export class DesktopClerk extends Context.Service<
  DesktopClerk,
  {
    readonly configure: Effect.Effect<
      void,
      never,
      ElectronApp.ElectronApp | ElectronWindow.ElectronWindow | Scope.Scope
    >;
    readonly installNativeRequestHeaders: Effect.Effect<void, never, Scope.Scope>;
  }
>()("@t3tools/desktop/app/DesktopClerk") {}

export interface DesktopClerkBeforeSendHeadersDetails {
  readonly url: string;
  readonly requestHeaders: Record<string, string>;
}

export type DesktopClerkBeforeSendHeadersCallback = (response: {
  readonly requestHeaders: Record<string, string>;
}) => void;

const findHeaderName = (headers: Record<string, string>, name: string): string | undefined =>
  Object.keys(headers).find((headerName) => headerName.toLowerCase() === name);

const hasBearerCredential = (value: string | undefined): boolean =>
  /^Bearer\s+\S/i.test(value?.trim() ?? "");

export function createDesktopClerkBeforeSendHeadersHandler(frontendApiHostname: string) {
  const normalizedHostname = frontendApiHostname.toLowerCase();

  return (
    details: DesktopClerkBeforeSendHeadersDetails,
    callback: DesktopClerkBeforeSendHeadersCallback,
  ): void => {
    let requestUrl: URL;
    try {
      requestUrl = new URL(details.url);
    } catch {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }

    const authorizationHeader = findHeaderName(details.requestHeaders, "authorization");
    const originHeader = findHeaderName(details.requestHeaders, "origin");
    const isAuthenticatedNativeClerkRequest =
      requestUrl.protocol === "https:" &&
      requestUrl.hostname.toLowerCase() === normalizedHostname &&
      requestUrl.searchParams.get("_is_native") === "1" &&
      hasBearerCredential(
        authorizationHeader === undefined ? undefined : details.requestHeaders[authorizationHeader],
      ) &&
      originHeader !== undefined;

    if (!isAuthenticatedNativeClerkRequest) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }

    const requestHeaders = { ...details.requestHeaders };
    for (const headerName of Object.keys(requestHeaders)) {
      if (headerName.toLowerCase() === "origin") delete requestHeaders[headerName];
    }
    callback({ requestHeaders });
  };
}

export function installDesktopClerkNativeRequestHeaders(
  webRequest: Pick<Electron.WebRequest, "onBeforeSendHeaders">,
  frontendApiHostname: string | undefined,
): () => void {
  if (!frontendApiHostname) return () => undefined;

  const filter = { urls: [`https://${frontendApiHostname}/*`] };
  webRequest.onBeforeSendHeaders(
    filter,
    createDesktopClerkBeforeSendHeadersHandler(frontendApiHostname),
  );

  return () => webRequest.onBeforeSendHeaders(filter, null);
}

export function resolveDesktopClerkFrontendApiHostname(
  publishableKey: string | undefined,
): string | undefined {
  const normalizedKey = publishableKey?.trim();
  if (!normalizedKey) return undefined;

  try {
    return clerkFrontendApiHostnameFromPublishableKey(normalizedKey);
  } catch {
    return undefined;
  }
}

export const desktopClerkFrontendApiHostname = resolveDesktopClerkFrontendApiHostname(
  typeof __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__ === "undefined"
    ? undefined
    : __T3CODE_BUILD_CLERK_PUBLISHABLE_KEY__,
);

export function createDesktopClerkBridge(
  stateDir: string,
  isDevelopment: boolean,
  passkeysEnabled: boolean,
) {
  return createClerkBridge({
    storage: storage({ path: stateDir }),
    passkeys: passkeysEnabled,
    renderer: {
      scheme: ElectronProtocol.getDesktopScheme(isDevelopment),
      host: ElectronProtocol.DESKTOP_HOST,
    },
  });
}

export const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        createDesktopClerkBridge(
          environment.stateDir,
          environment.isDevelopment,
          environment.clerkPasskeysEnabled,
        ),
      catch: (cause) =>
        new DesktopClerkBridgeInitializationError({
          stateDir: environment.stateDir,
          isDevelopment: environment.isDevelopment,
          cause,
        }),
    }),
    (bridge) =>
      Effect.try({
        try: () => bridge.cleanup(),
        catch: (cause) =>
          new DesktopClerkBridgeCleanupError({
            stateDir: environment.stateDir,
            isDevelopment: environment.isDevelopment,
            cause,
          }),
      }).pipe(Effect.orDie),
  );

  return DesktopClerk.of({
    configure: Effect.gen(function* () {
      const electronApp = yield* ElectronApp.ElectronApp;
      const electronWindow = yield* ElectronWindow.ElectronWindow;
      const context = yield* Effect.context<ElectronWindow.ElectronWindow>();
      const runPromise = Effect.runPromiseWith(context);

      if (!(yield* electronApp.requestSingleInstanceLock)) {
        yield* electronApp.quit;
        return yield* Effect.interrupt;
      }

      yield* electronApp.on("second-instance", () => {
        void runPromise(
          Effect.gen(function* () {
            const mainWindow = yield* electronWindow.currentMainOrFirst;
            if (Option.isSome(mainWindow)) {
              yield* electronWindow.reveal(mainWindow.value);
            }
          }),
        );
      });
    }).pipe(Effect.withSpan("desktop.clerk.configure")),
    installNativeRequestHeaders: Effect.acquireRelease(
      Effect.sync(() =>
        installDesktopClerkNativeRequestHeaders(
          Electron.session.defaultSession.webRequest,
          desktopClerkFrontendApiHostname,
        ),
      ),
      (cleanup) => Effect.sync(cleanup),
    ).pipe(Effect.asVoid, Effect.withSpan("desktop.clerk.installNativeRequestHeaders")),
  });
});

export const layer = Layer.effect(DesktopClerk, make);
