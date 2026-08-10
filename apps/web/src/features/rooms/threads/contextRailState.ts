export const ROOMS_CONTEXT_RAIL_OPEN_STORAGE_KEY = "t3code:rooms-context-rail-open:v1";

export function toggleRoomsContextRail(open: boolean): boolean {
  return !open;
}

export function findRoomsContextStory<
  TStory extends {
    readonly native_thread: null | {
      readonly environment_id: string;
      readonly project_id: string;
      readonly thread_id: string;
    };
  },
>(
  stories: readonly TStory[],
  target: { readonly environmentId: string; readonly projectId: string; readonly threadId: string },
): TStory | null {
  return (
    stories.find(
      (story) =>
        story.native_thread?.environment_id === target.environmentId &&
        story.native_thread.project_id === target.projectId &&
        story.native_thread.thread_id === target.threadId,
    ) ?? null
  );
}
