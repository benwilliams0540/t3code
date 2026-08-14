import { isRoomsLocalClientError } from "./localChannelsClient";

export const ROOMS_LOCAL_CHANGE_WAIT_TIMEOUT_MS = 25_000;
export const ROOMS_LOCAL_CHANGE_RETRY_INITIAL_MS = 500;
export const ROOMS_LOCAL_CHANGE_RETRY_MAX_MS = 5_000;

export type RoomsLocalLiveUpdatesStatus = "connected" | "reconnecting";
export type RoomsLocalChangeRefreshReason = "advanced" | "cursor_ahead";

export interface RoomsLocalChangeInvalidation {
  readonly roomId: string;
  readonly afterSeq: number;
  readonly headSeq: number;
  readonly initial: boolean;
  readonly reason: RoomsLocalChangeRefreshReason;
}

export interface RoomsLocalChangeLoopOptions {
  readonly client: {
    readonly waitForChanges: (
      roomId: string,
      input: { readonly afterSeq: number; readonly timeoutMs?: number | undefined },
    ) => Promise<{
      readonly changed: boolean;
      readonly head_seq: number;
    }>;
  };
  readonly onInvalidate: (invalidation: RoomsLocalChangeInvalidation) => Promise<void>;
  readonly onStatusChange: (status: RoomsLocalLiveUpdatesStatus) => void;
  readonly scheduleRetry?: ((callback: () => void, delayMs: number) => () => void) | undefined;
  readonly waitTimeoutMs?: number | undefined;
}

interface ActiveSession {
  readonly generation: number;
  readonly roomId: string;
  afterSeq: number;
  initialized: boolean;
  retryAttempt: number;
}

function defaultScheduleRetry(callback: () => void, delayMs: number): () => void {
  const timer = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timer);
}

export class RoomsLocalChangeLoop {
  private readonly client: RoomsLocalChangeLoopOptions["client"];
  private readonly onInvalidate: RoomsLocalChangeLoopOptions["onInvalidate"];
  private readonly onStatusChange: RoomsLocalChangeLoopOptions["onStatusChange"];
  private readonly scheduleRetry: NonNullable<RoomsLocalChangeLoopOptions["scheduleRetry"]>;
  private readonly waitTimeoutMs: number;
  private active: ActiveSession | null = null;
  private cancelRetry: (() => void) | null = null;
  private generation = 0;
  private inFlight = false;
  private status: RoomsLocalLiveUpdatesStatus = "connected";

  constructor(options: RoomsLocalChangeLoopOptions) {
    this.client = options.client;
    this.onInvalidate = options.onInvalidate;
    this.onStatusChange = options.onStatusChange;
    this.scheduleRetry = options.scheduleRetry ?? defaultScheduleRetry;
    this.waitTimeoutMs = options.waitTimeoutMs ?? ROOMS_LOCAL_CHANGE_WAIT_TIMEOUT_MS;
  }

  start(roomId: string): void {
    this.invalidateSession();
    this.active = {
      generation: this.generation,
      roomId,
      afterSeq: 0,
      initialized: false,
      retryAttempt: 0,
    };
    this.publishStatus("connected");
    this.pump();
  }

  stop(): void {
    this.invalidateSession();
    this.active = null;
    this.publishStatus("connected");
  }

  private invalidateSession(): void {
    this.generation += 1;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  private isCurrent(session: ActiveSession): boolean {
    return this.active === session && session.generation === this.generation;
  }

  private publishStatus(status: RoomsLocalLiveUpdatesStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange(status);
  }

  private retry(session: ActiveSession): void {
    if (!this.isCurrent(session)) return;
    this.publishStatus("reconnecting");
    const delayMs = Math.min(
      ROOMS_LOCAL_CHANGE_RETRY_INITIAL_MS * 2 ** session.retryAttempt,
      ROOMS_LOCAL_CHANGE_RETRY_MAX_MS,
    );
    session.retryAttempt += 1;
    this.cancelRetry = this.scheduleRetry(() => {
      this.cancelRetry = null;
      if (this.isCurrent(session)) this.pump();
    }, delayMs);
  }

  private pump(): void {
    const session = this.active;
    if (!session || this.inFlight || this.cancelRetry) return;
    this.inFlight = true;
    void this.wait(session).finally(() => {
      this.inFlight = false;
      if (this.active && !this.cancelRetry) this.pump();
    });
  }

  private async wait(session: ActiveSession): Promise<void> {
    try {
      const response = await this.client.waitForChanges(session.roomId, {
        afterSeq: session.afterSeq,
        timeoutMs: this.waitTimeoutMs,
      });
      if (!this.isCurrent(session)) return;
      if (response.changed) {
        await this.onInvalidate({
          roomId: session.roomId,
          afterSeq: session.afterSeq,
          headSeq: response.head_seq,
          initial: !session.initialized,
          reason: "advanced",
        });
        if (!this.isCurrent(session)) return;
      }
      session.afterSeq = response.head_seq;
      session.initialized = true;
      session.retryAttempt = 0;
      this.publishStatus("connected");
    } catch (error) {
      if (!this.isCurrent(session)) return;
      if (
        isRoomsLocalClientError(error) &&
        error.code === "change_cursor_ahead" &&
        error.headSeq !== null
      ) {
        try {
          await this.onInvalidate({
            roomId: session.roomId,
            afterSeq: session.afterSeq,
            headSeq: error.headSeq,
            initial: true,
            reason: "cursor_ahead",
          });
          if (!this.isCurrent(session)) return;
          session.afterSeq = error.headSeq;
          session.initialized = true;
          session.retryAttempt = 0;
          this.publishStatus("connected");
          return;
        } catch {
          if (!this.isCurrent(session)) return;
        }
      }
      this.retry(session);
    }
  }
}
