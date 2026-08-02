import { describe, expect, it } from "vite-plus/test";

import { composerQuickActionInsertion, selectedComposerImageFiles } from "./composerQuickActions";

describe("composer quick actions", () => {
  it("opens a line for the command trigger only when the prompt is mid-line", () => {
    expect(composerQuickActionInsertion("command", "")).toEqual({
      text: "/",
      ensureLeadingBoundary: false,
    });
    expect(composerQuickActionInsertion("command", "explain this\n")).toEqual({
      text: "/",
      ensureLeadingBoundary: false,
    });
    expect(composerQuickActionInsertion("command", "explain this")).toEqual({
      text: "\n/",
      ensureLeadingBoundary: false,
    });
  });

  it("inserts token triggers with a word boundary so they parse", () => {
    expect(composerQuickActionInsertion("path", "look at")).toEqual({
      text: "@",
      ensureLeadingBoundary: true,
    });
    expect(composerQuickActionInsertion("skill", "run")).toEqual({
      text: "$",
      ensureLeadingBoundary: true,
    });
  });

  it("treats a missing file selection as no attachment", () => {
    expect(selectedComposerImageFiles(null)).toEqual([]);
  });
});
