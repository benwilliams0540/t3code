export interface StableRoomsCommand<T> {
  readonly requestId: string;
  readonly payload: T;
}

export function tryStartStableRoomsSubmission(pending: { current: boolean }): boolean {
  if (pending.current) return false;
  pending.current = true;
  return true;
}

export function finishStableRoomsSubmission(pending: { current: boolean }): void {
  pending.current = false;
}

export function prepareStableRoomsCommand<T>(
  current: StableRoomsCommand<T> | null,
  payload: T,
  createRequestId: () => string,
): StableRoomsCommand<T> {
  return current ?? { requestId: createRequestId(), payload };
}
