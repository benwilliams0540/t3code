export const ROOMS_CHANGE_WAIT_TIMEOUT_MS = 25_000;
export const ROOMS_CHANGE_RETRY_INITIAL_MS = 500;
export const ROOMS_CHANGE_RETRY_MAX_MS = 5_000;

export type RoomsLiveUpdatesStatus = "stopped" | "catching_up" | "connected" | "reconnecting";

export interface RoomsChangeInvalidation<Event> {
  readonly roomId: string;
  readonly afterSeq: number;
  readonly headSeq: number;
  readonly initial: boolean;
  readonly reason: "advanced" | "cursor_ahead";
  readonly events: readonly Event[];
}

export interface RoomsChangeLoopOptions<Event> {
  readonly waitForChanges: (
    roomId: string,
    input: {
      readonly afterSeq: number;
      readonly timeoutMs: number;
      readonly initialized: boolean;
      readonly signal: AbortSignal;
    },
  ) => Promise<{
    readonly changed: boolean;
    readonly headSeq: number;
    readonly events?: readonly Event[];
  }>;
  readonly cursorAheadHead: (error: unknown) => number | null;
  readonly onInvalidate: (invalidation: RoomsChangeInvalidation<Event>) => Promise<void>;
  readonly onStatusChange: (status: RoomsLiveUpdatesStatus) => void;
  readonly scheduleRetry: (callback: () => void, delayMs: number) => () => void;
  readonly waitTimeoutMs?: number | undefined;
  readonly initialWaitTimeoutMs?: number | undefined;
  readonly abortWaitOnStop?: boolean | undefined;
  readonly cursorStore?:
    | {
        readonly load: (roomId: string) => Promise<number>;
        readonly save: (roomId: string, cursor: number) => Promise<void>;
      }
    | undefined;
}

interface ActiveSession {
  readonly generation: number;
  readonly roomId: string;
  ready: boolean;
  afterSeq: number;
  initialized: boolean;
  retryAttempt: number;
}

function validCursor(cursor: number): boolean {
  return Number.isSafeInteger(cursor) && cursor >= 0;
}

/** Owns one serialized change wait and commits its cursor only after reconciliation. */
export class RoomsChangeLoop<Event = never> {
  private readonly options: RoomsChangeLoopOptions<Event>;
  private active: ActiveSession | null = null;
  private abortController: AbortController | null = null;
  private cancelRetry: (() => void) | null = null;
  private generation = 0;
  private inFlight = false;
  private status: RoomsLiveUpdatesStatus = "stopped";

  constructor(options: RoomsChangeLoopOptions<Event>) {
    this.options = options;
  }

  start(roomId: string): void {
    this.invalidateSession();
    const session: ActiveSession = {
      generation: this.generation,
      roomId,
      ready: !this.options.cursorStore,
      afterSeq: 0,
      initialized: false,
      retryAttempt: 0,
    };
    this.active = session;
    this.publishStatus("catching_up");
    if (!this.options.cursorStore) {
      this.pump();
      return;
    }
    void this.options.cursorStore.load(roomId).then(
      (cursor) => {
        if (!this.isCurrent(session)) return;
        session.afterSeq = validCursor(cursor) ? cursor : 0;
        session.ready = true;
        this.pump();
      },
      () => {
        if (!this.isCurrent(session)) return;
        session.ready = true;
        this.pump();
      },
    );
  }

  stop(): void {
    this.invalidateSession();
    this.active = null;
    this.publishStatus("stopped");
  }

  private invalidateSession(): void {
    this.generation += 1;
    if (this.options.abortWaitOnStop) this.abortController?.abort();
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  private isCurrent(session: ActiveSession): boolean {
    return this.active === session && session.generation === this.generation;
  }

  private publishStatus(status: RoomsLiveUpdatesStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange(status);
  }

  private retry(session: ActiveSession): void {
    if (!this.isCurrent(session)) return;
    this.publishStatus("reconnecting");
    const delayMs = Math.min(
      ROOMS_CHANGE_RETRY_INITIAL_MS * 2 ** session.retryAttempt,
      ROOMS_CHANGE_RETRY_MAX_MS,
    );
    session.retryAttempt += 1;
    this.cancelRetry = this.options.scheduleRetry(() => {
      if (!this.isCurrent(session)) return;
      this.cancelRetry = null;
      this.pump();
    }, delayMs);
  }

  private pump(): void {
    const session = this.active;
    if (!session?.ready || this.inFlight || this.cancelRetry) return;
    const controller = new AbortController();
    this.abortController = controller;
    this.inFlight = true;
    void this.wait(session, controller.signal).finally(() => {
      if (this.abortController === controller) this.abortController = null;
      this.inFlight = false;
      if (this.active && !this.cancelRetry) this.pump();
    });
  }

  private async commitCursor(session: ActiveSession, cursor: number): Promise<void> {
    if (this.options.cursorStore) await this.options.cursorStore.save(session.roomId, cursor);
    if (!this.isCurrent(session)) return;
    session.afterSeq = cursor;
    session.initialized = true;
    session.retryAttempt = 0;
    this.publishStatus("connected");
  }

  private async wait(session: ActiveSession, signal: AbortSignal): Promise<void> {
    try {
      const response = await this.options.waitForChanges(session.roomId, {
        afterSeq: session.afterSeq,
        timeoutMs: session.initialized
          ? (this.options.waitTimeoutMs ?? ROOMS_CHANGE_WAIT_TIMEOUT_MS)
          : (this.options.initialWaitTimeoutMs ??
            this.options.waitTimeoutMs ??
            ROOMS_CHANGE_WAIT_TIMEOUT_MS),
        initialized: session.initialized,
        signal,
      });
      if (!this.isCurrent(session)) return;
      if (response.changed) {
        await this.options.onInvalidate({
          roomId: session.roomId,
          afterSeq: session.afterSeq,
          headSeq: response.headSeq,
          initial: !session.initialized,
          reason: "advanced",
          events: response.events ?? [],
        });
        if (!this.isCurrent(session)) return;
      }
      await this.commitCursor(session, response.headSeq);
    } catch (error) {
      if (!this.isCurrent(session)) return;
      const head = this.options.cursorAheadHead(error);
      // A reset must move backwards. Repeated or malformed errors use bounded backoff.
      if (head !== null && validCursor(head) && head < session.afterSeq) {
        try {
          await this.options.onInvalidate({
            roomId: session.roomId,
            afterSeq: session.afterSeq,
            headSeq: head,
            initial: true,
            reason: "cursor_ahead",
            events: [],
          });
          if (!this.isCurrent(session)) return;
          await this.commitCursor(session, head);
          return;
        } catch {
          if (!this.isCurrent(session)) return;
        }
      }
      this.retry(session);
    }
  }
}
