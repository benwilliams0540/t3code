import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "t3code.rooms.realtime.v1";
const MAX_SEEN_EVENT_IDS = 512;

interface RealtimePersistenceState {
  readonly cursors: Readonly<Record<string, number>>;
  readonly seenEventIds: readonly string[];
  readonly unread: Readonly<Record<string, number>>;
}

const EMPTY_STATE: RealtimePersistenceState = {
  cursors: {},
  seenEventIds: [],
  unread: {},
};

let cachedState: RealtimePersistenceState | null = null;
let mutationQueue = Promise.resolve();
const listeners = new Set<() => void>();

function cursorKey(userId: string, roomId: string): string {
  return `${userId}|${roomId}`;
}

export function unreadKey(roomId: string, channelId: string): string {
  return `${roomId}|${channelId}`;
}

function decodeState(value: string | null): RealtimePersistenceState {
  if (!value) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(value) as Partial<RealtimePersistenceState>;
    return {
      cursors: typeof parsed.cursors === "object" && parsed.cursors !== null ? parsed.cursors : {},
      seenEventIds: Array.isArray(parsed.seenEventIds)
        ? parsed.seenEventIds.filter((item): item is string => typeof item === "string")
        : [],
      unread: typeof parsed.unread === "object" && parsed.unread !== null ? parsed.unread : {},
    };
  } catch {
    return EMPTY_STATE;
  }
}

async function loadState(): Promise<RealtimePersistenceState> {
  if (cachedState) return cachedState;
  cachedState = decodeState(await SecureStore.getItemAsync(STORAGE_KEY));
  return cachedState;
}

async function mutate(
  update: (state: RealtimePersistenceState) => RealtimePersistenceState,
): Promise<RealtimePersistenceState> {
  let result = EMPTY_STATE;
  const operation = mutationQueue.then(async () => {
    result = update(await loadState());
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(result));
    cachedState = result;
    for (const listener of listeners) listener();
  });
  mutationQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

export function roomsCursorStore(userId: string) {
  return {
    load: async (roomId: string) => (await loadState()).cursors[cursorKey(userId, roomId)] ?? 0,
    save: async (roomId: string, cursor: number) => {
      await mutate((state) => ({
        ...state,
        cursors: { ...state.cursors, [cursorKey(userId, roomId)]: cursor },
      }));
    },
  };
}

export async function recordRoomsEvent(input: {
  readonly eventId: string;
  readonly unreadChannel?: { readonly roomId: string; readonly channelId: string };
}): Promise<boolean> {
  let isNew = false;
  await mutate((state) => {
    if (state.seenEventIds.includes(input.eventId)) return state;
    isNew = true;
    const nextSeen = [...state.seenEventIds, input.eventId].slice(-MAX_SEEN_EVENT_IDS);
    if (!input.unreadChannel) return { ...state, seenEventIds: nextSeen };
    const key = unreadKey(input.unreadChannel.roomId, input.unreadChannel.channelId);
    return {
      ...state,
      seenEventIds: nextSeen,
      unread: { ...state.unread, [key]: (state.unread[key] ?? 0) + 1 },
    };
  });
  return isNew;
}

export async function hasSeenRoomsEvent(eventId: string): Promise<boolean> {
  return (await loadState()).seenEventIds.includes(eventId);
}

export async function markRoomsChannelRead(roomId: string, channelId: string): Promise<void> {
  await mutate((state) => {
    const key = unreadKey(roomId, channelId);
    if (!(key in state.unread)) return state;
    const unread = { ...state.unread };
    delete unread[key];
    return { ...state, unread };
  });
}

export async function loadRoomsUnread(): Promise<Readonly<Record<string, number>>> {
  return (await loadState()).unread;
}

export function subscribeRoomsUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
