type VisibleChannel = {
  readonly roomId: string;
  readonly channelId: string;
} | null;

let visibleChannel: VisibleChannel = null;
const invalidationListeners = new Set<(roomId: string) => void>();

export function setRoomsVisibleChannel(value: VisibleChannel): void {
  visibleChannel = value;
}

export function getRoomsVisibleChannel(): VisibleChannel {
  return visibleChannel;
}

export function emitRoomsInvalidation(roomId: string): void {
  for (const listener of invalidationListeners) listener(roomId);
}

export function subscribeRoomsInvalidations(listener: (roomId: string) => void): () => void {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}
