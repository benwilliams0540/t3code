import * as Schema from "effect/Schema";
import { useCallback } from "react";

import { useLocalStorage } from "../hooks/useLocalStorage";
import { useSidebarV2Enabled } from "../hooks/useSettings";

export const APP_SIDEBAR_VARIANT_STORAGE_KEY = "t3code.app-sidebar-variant.v1";

export const AppSidebarVariant = Schema.Literals(["v1", "v2", "v3"]);
export type AppSidebarVariant = typeof AppSidebarVariant.Type;

export function resolveAppSidebarVariantSelection(input: {
  readonly configuredVariant: AppSidebarVariant | null;
  readonly sidebarV2Enabled: boolean;
}): AppSidebarVariant {
  return input.configuredVariant ?? (input.sidebarV2Enabled ? "v2" : "v1");
}

export function useAppSidebarVariantSelection(): readonly [
  AppSidebarVariant,
  (variant: AppSidebarVariant) => void,
] {
  const sidebarV2Enabled = useSidebarV2Enabled();
  const [configuredVariant, setConfiguredVariant] = useLocalStorage(
    APP_SIDEBAR_VARIANT_STORAGE_KEY,
    null,
    Schema.NullOr(AppSidebarVariant),
  );
  const setVariant = useCallback(
    (variant: AppSidebarVariant) => setConfiguredVariant(variant),
    [setConfiguredVariant],
  );

  return [resolveAppSidebarVariantSelection({ configuredVariant, sidebarV2Enabled }), setVariant];
}
