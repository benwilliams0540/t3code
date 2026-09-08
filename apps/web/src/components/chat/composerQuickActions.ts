/**
 * Quick actions insert the composer's existing trigger characters rather than opening a parallel
 * menu system: `@` for file references, `$` for skills, `/` for commands. The command trigger is
 * only recognized at the start of a line, so an insertion into a non-empty prompt has to open one.
 */
export type ComposerQuickActionTrigger = "path" | "skill" | "command";

export function composerQuickActionInsertion(
  trigger: ComposerQuickActionTrigger,
  prompt: string,
): { readonly text: string; readonly ensureLeadingBoundary: boolean } {
  if (trigger === "command") {
    const atLineStart = prompt.length === 0 || prompt.endsWith("\n");
    return { text: atLineStart ? "/" : "\n/", ensureLeadingBoundary: false };
  }
  return { text: trigger === "skill" ? "$" : "@", ensureLeadingBoundary: true };
}

/** Only image attachments exist in the send contract today; anything else is rejected downstream. */
export const COMPOSER_QUICK_ACTION_IMAGE_ACCEPT = "image/*";

export function selectedComposerImageFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];
  return Array.from(fileList);
}
