import { describe, expect, it } from "vite-plus/test";

import { composerShortcutPatch } from "./BetaSettingsPanel";

describe("composerShortcutPatch", () => {
  it("writes only the selected composer setting", () => {
    expect(composerShortcutPatch("channel", "modifier_always")).toEqual({
      channelComposerSendShortcut: "modifier_always",
    });
    expect(composerShortcutPatch("thread", "enter")).toEqual({
      threadComposerSendShortcut: "enter",
    });
  });
});
