import {
  roomsActivityRegister,
  type RoomsActivityRegister,
  type RoomsProjectedActivity,
} from "./projection";

export type RoomsActivityRow =
  | {
      readonly kind: "day";
      readonly key: string;
      readonly dayKey: string;
      readonly isoDate: string;
    }
  | {
      readonly kind: "activity";
      readonly key: string;
      readonly activity: RoomsProjectedActivity;
      readonly register: RoomsActivityRegister;
      readonly showHeader: boolean;
    };

/** Consecutive conversation items from one writer collapse into a single spoken block. */
export const ROOMS_ACTIVITY_GROUPING_WINDOW_MS = 5 * 60 * 1000;

export function roomsActivityDayKey(occurredAt: string): string | null {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function elapsedMs(previous: string, current: string): number | null {
  const from = new Date(previous).getTime();
  const to = new Date(current).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return to - from;
}

/**
 * Turns an ordered activity list into rendered rows: day separators plus per-item header
 * suppression. Only the conversation register groups; excerpt and record rows always carry their
 * own header so a lifecycle or governance fact is never mistaken for someone speaking.
 */
export function groupRoomsActivityRows(
  activities: readonly RoomsProjectedActivity[],
  options: { readonly windowMs?: number } = {},
): readonly RoomsActivityRow[] {
  const windowMs = options.windowMs ?? ROOMS_ACTIVITY_GROUPING_WINDOW_MS;
  const rows: RoomsActivityRow[] = [];
  let previous: RoomsProjectedActivity | null = null;
  let previousDayKey: string | null = null;

  for (const activity of activities) {
    const register = roomsActivityRegister(activity.cardKind);
    const dayKey = roomsActivityDayKey(activity.item.occurred_at);

    if (dayKey !== null && dayKey !== previousDayKey) {
      rows.push({
        kind: "day",
        key: `day:${dayKey}:${activity.item.id}`,
        dayKey,
        isoDate: activity.item.occurred_at,
      });
      previous = null;
    }

    const previousRegister = previous ? roomsActivityRegister(previous.cardKind) : null;
    const gap = previous ? elapsedMs(previous.item.occurred_at, activity.item.occurred_at) : null;
    const continuesBlock =
      register === "conversation" &&
      previousRegister === "conversation" &&
      previous !== null &&
      previous.attribution.writer.id === activity.attribution.writer.id &&
      previous.attribution.mode === activity.attribution.mode &&
      gap !== null &&
      gap >= 0 &&
      gap <= windowMs;

    rows.push({
      kind: "activity",
      key: activity.item.id,
      activity,
      register,
      showHeader: !continuesBlock,
    });

    previous = activity;
    if (dayKey !== null) previousDayKey = dayKey;
  }

  return rows;
}
