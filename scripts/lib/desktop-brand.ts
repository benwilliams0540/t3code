export type DesktopBrand = "t3code" | "threadspace";

declare const __T3CODE_DESKTOP_BRAND__: DesktopBrand | undefined;

// A build-time choice keeps an installed ThreadSpace instance independent of
// whichever T3 environment the launching shell happens to configure.
export const DESKTOP_BUILD_BRAND: DesktopBrand =
  typeof __T3CODE_DESKTOP_BRAND__ === "undefined" ? "t3code" : __T3CODE_DESKTOP_BRAND__;

export const THREADSPACE_DESKTOP = {
  baseName: "ThreadSpace",
  appId: "com.threadspace.alpha",
  dataDirName: "threadspace-alpha",
  scheme: "threadspace",
  developmentScheme: "threadspace-dev",
  macIconPng: "apps/mobile/assets/threadspace-alpha-dark-1024.png",
} as const;
