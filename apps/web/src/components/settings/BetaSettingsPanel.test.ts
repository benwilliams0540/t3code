import { describe, expect, it } from "vite-plus/test";

import { composerShortcutPatch, shouldShowRoomsBetaSettings } from "./BetaSettingsPanel";

describe("Beta settings", () => {
  it("writes only the selected composer setting", () => {
    expect(composerShortcutPatch("channel", "modifier_always")).toEqual({
      channelComposerSendShortcut: "modifier_always",
    });
    expect(composerShortcutPatch("thread", "enter")).toEqual({
      threadComposerSendShortcut: "enter",
    });
  });

  it("shows Rooms configuration only for sidebar version 3", () => {
    expect(shouldShowRoomsBetaSettings("v1")).toBe(false);
    expect(shouldShowRoomsBetaSettings("v2")).toBe(false);
    expect(shouldShowRoomsBetaSettings("v3")).toBe(true);
  });
});
