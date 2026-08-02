import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import {
  applyClientSettingsPatch,
  mergeEnvironmentSettings,
  resolveEnvironmentIdentificationMode,
} from "./useSettings";

describe("resolveEnvironmentIdentificationMode", () => {
  it("keeps identification hidden until client settings hydrate", () => {
    expect(resolveEnvironmentIdentificationMode({ mode: "artwork", settingsHydrated: false })).toBe(
      "none",
    );
    expect(resolveEnvironmentIdentificationMode({ mode: "pill", settingsHydrated: true })).toBe(
      "pill",
    );
  });
});

describe("applyClientSettingsPatch", () => {
  it("persists channel and thread composer shortcuts independently", () => {
    const channelUpdated = applyClientSettingsPatch(DEFAULT_CLIENT_SETTINGS, {
      channelComposerSendShortcut: "modifier_always",
    });
    expect(channelUpdated.channelComposerSendShortcut).toBe("modifier_always");
    expect(channelUpdated.threadComposerSendShortcut).toBe(
      DEFAULT_CLIENT_SETTINGS.threadComposerSendShortcut,
    );

    const threadUpdated = applyClientSettingsPatch(channelUpdated, {
      threadComposerSendShortcut: "modifier_when_multiline",
    });
    expect(threadUpdated.channelComposerSendShortcut).toBe("modifier_always");
    expect(threadUpdated.threadComposerSendShortcut).toBe("modifier_when_multiline");
  });
});

describe("mergeEnvironmentSettings", () => {
  it("combines the selected environment's server settings with client preferences", () => {
    const serverSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("codex_remote")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: true,
        },
      },
    };
    const clientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      favorites: [
        {
          provider: ProviderInstanceId.make("codex_remote"),
          model: "gpt-5.4",
        },
      ],
    };

    const settings = mergeEnvironmentSettings(serverSettings, clientSettings);

    expect(settings.providerInstances).toBe(serverSettings.providerInstances);
    expect(settings.favorites).toBe(clientSettings.favorites);
  });
});
