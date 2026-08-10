import { useEffect, useMemo, useRef, type RefObject } from "react";

import { groupRoomsActivityRows } from "./grouping";
import { RoomsActivityRowView } from "./RoomsActivityItem";
import type { RoomsProjectedActivity } from "./projection";
import { cn } from "~/lib/utils";

/** How close to the bottom the reader must be for new activity to keep following the feed. */
const FOLLOW_THRESHOLD_PX = 120;

export function isRoomsFeedFollowing(
  metrics: {
    readonly scrollTop: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  },
  thresholdPx: number = FOLLOW_THRESHOLD_PX,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= thresholdPx;
}

/**
 * Keeps a channel anchored to its newest activity the way a conversation is read, without yanking
 * the viewport away from someone who has scrolled back into history.
 */
export function useRoomsFeedAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  itemCount: number,
): void {
  const following = useRef(true);
  const lastCount = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      following.current = isRoomsFeedFollowing(container);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || itemCount === lastCount.current) return;
    const grew = itemCount > lastCount.current;
    const firstPaint = lastCount.current === 0;
    lastCount.current = itemCount;
    if (!grew) return;
    if (firstPaint || following.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [containerRef, itemCount]);
}

/**
 * One renderer for every Rooms feed. Sample and Local sources project into the same activity shape,
 * so a channel looks the same whether its truth came from the checked-in fixture or the ledger.
 */
export function RoomsActivityFeed({
  activities,
  label,
  onActivitySelect,
  selectedActivityId,
}: {
  readonly activities: readonly RoomsProjectedActivity[];
  readonly label: string;
  readonly onActivitySelect?: ((activity: RoomsProjectedActivity) => void) | undefined;
  readonly selectedActivityId?: string | null | undefined;
}) {
  const rows = useMemo(() => groupRoomsActivityRows(activities), [activities]);
  return (
    <ol aria-label={label} className="flex flex-col" data-rooms-activity-feed="">
      {rows.map((row) => (
        <li
          className={cn(
            row.kind === "activity" && row.activity.cardKind === "message" && onActivitySelect
              ? "group/activity relative rounded-lg transition-shadow"
              : "",
            row.kind === "activity" && row.activity.item.id === selectedActivityId
              ? "ring-2 ring-amber-400/70"
              : "",
          )}
          data-rooms-activity-selected={
            row.kind === "activity" && row.activity.item.id === selectedActivityId ? "" : undefined
          }
          key={row.key}
          onClick={
            row.kind === "activity" && row.activity.cardKind === "message" && onActivitySelect
              ? () => onActivitySelect(row.activity)
              : undefined
          }
        >
          <RoomsActivityRowView row={row} />
          {row.kind === "activity" && row.activity.cardKind === "message" && onActivitySelect ? (
            <button
              aria-pressed={row.activity.item.id === selectedActivityId}
              className="absolute right-2 bottom-1 rounded-md border border-border/70 bg-background/95 px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-70 shadow-sm transition-opacity hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.stopPropagation();
                onActivitySelect(row.activity);
              }}
              type="button"
            >
              Shape story
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
