import { RoomsMobileClientError } from "./client";

export const ROOMS_MOBILE_CHANGE_WAIT_TIMEOUT_MS = 25_000;
export const ROOMS_MOBILE_CHANGE_RETRY_INITIAL_MS = 500;
export const ROOMS_MOBILE_CHANGE_RETRY_MAX_MS = 5_000;

import type { RoomsRealtimeEvent } from "./contract";

export type RoomsMobileLiveUpdatesStatus = "stopped" | "catching_up" | "connected" | "reconnecting";

export interface RoomsMobileChangeInvalidation {
  readonly roomId: string;
  readonly afterSeq: number;
  readonly headSeq: number;
  readonly initial: boolean;
  readonly reason: "advanced" | "cursor_ahead";
  readonly realtimeEvents: readonly RoomsRealtimeEvent[];
}

export interface RoomsMobileChangeLoopOptions {
  readonly client: {
    readonly waitForChanges: (
      roomId: string,
      input: {
        readonly afterSeq: number;
        readonly timeoutMs?: number;
        readonly signal?: AbortSignal;
        readonly realtime?: boolean;
        readonly clientId?: string;
      },
    ) => Promise<{
      readonly changed: boolean;
      readonly head_seq: number;
      readonly realtime_events?: readonly RoomsRealtimeEvent[];
    }>;
  };
  readonly onInvalidate: (invalidation: RoomsMobileChangeInvalidation) => Promise<void>;
  readonly onStatusChange?: (status: RoomsMobileLiveUpdatesStatus) => void;
  readonly scheduleRetry?: (callback: () => void, delayMs: number) => () => void;
  readonly waitTimeoutMs?: number;
  readonly clientId?: string;
  readonly cursorStore?: {
    readonly load: (roomId: string) => Promise<number>;
    readonly save: (roomId: string, cursor: number) => Promise<void>;
  };
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

export class RoomsMobileChangeLoop {
  private readonly client: RoomsMobileChangeLoopOptions["client"];
  private readonly onInvalidate: RoomsMobileChangeLoopOptions["onInvalidate"];
  private readonly onStatusChange: NonNullable<RoomsMobileChangeLoopOptions["onStatusChange"]>;
  private readonly scheduleRetry: NonNullable<RoomsMobileChangeLoopOptions["scheduleRetry"]>;
  private readonly waitTimeoutMs: number;
  private readonly clientId: string | undefined;
  private readonly cursorStore: NonNullable<RoomsMobileChangeLoopOptions["cursorStore"]>;
  private active: ActiveSession | null = null;
  private abortController: AbortController | null = null;
  private cancelRetry: (() => void) | null = null;
  private generation = 0;
  private inFlight = false;
  private status: RoomsMobileLiveUpdatesStatus = "stopped";

  constructor(options: RoomsMobileChangeLoopOptions) {
    this.client = options.client;
    this.onInvalidate = options.onInvalidate;
    this.onStatusChange = options.onStatusChange ?? (() => undefined);
    this.scheduleRetry = options.scheduleRetry ?? defaultScheduleRetry;
    this.waitTimeoutMs = options.waitTimeoutMs ?? ROOMS_MOBILE_CHANGE_WAIT_TIMEOUT_MS;
    this.clientId = options.clientId;
    this.cursorStore = options.cursorStore ?? {
      load: async () => 0,
      save: async () => undefined,
    };
  }

  start(roomId: string): void {
    this.invalidateSession();
    const session: ActiveSession = {
      generation: this.generation,
      roomId,
      afterSeq: 0,
      initialized: false,
      retryAttempt: 0,
    };
    this.active = session;
    this.publishStatus("catching_up");
    void this.cursorStore
      .load(roomId)
      .then((cursor) => {
        if (!this.isCurrent(session)) return;
        session.afterSeq = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
        this.pump();
      })
      .catch(() => {
        if (this.isCurrent(session)) this.pump();
      });
  }

  stop(): void {
    this.invalidateSession();
    this.active = null;
    this.publishStatus("stopped");
  }

  private invalidateSession(): void {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  private isCurrent(session: ActiveSession): boolean {
    return this.active === session && session.generation === this.generation;
  }

  private publishStatus(status: RoomsMobileLiveUpdatesStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange(status);
  }

  private retry(session: ActiveSession): void {
    if (!this.isCurrent(session)) return;
    this.publishStatus("reconnecting");
    const delayMs = Math.min(
      ROOMS_MOBILE_CHANGE_RETRY_INITIAL_MS * 2 ** session.retryAttempt,
      ROOMS_MOBILE_CHANGE_RETRY_MAX_MS,
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
    const controller = new AbortController();
    this.abortController = controller;
    this.inFlight = true;
    void this.wait(session, controller.signal).finally(() => {
      if (this.abortController === controller) this.abortController = null;
      this.inFlight = false;
      if (this.active && !this.cancelRetry) this.pump();
    });
  }

  private async wait(session: ActiveSession, signal: AbortSignal): Promise<void> {
    try {
      const response = await this.client.waitForChanges(session.roomId, {
        afterSeq: session.afterSeq,
        timeoutMs: session.initialized ? this.waitTimeoutMs : 1_000,
        signal,
        realtime: session.initialized,
        ...(this.clientId ? { clientId: this.clientId } : {}),
      });
      if (!this.isCurrent(session)) return;
      if (response.changed) {
        await this.onInvalidate({
          roomId: session.roomId,
          afterSeq: session.afterSeq,
          headSeq: response.head_seq,
          initial: !session.initialized,
          reason: "advanced",
          realtimeEvents: response.realtime_events ?? [],
        });
        if (!this.isCurrent(session)) return;
      }
      session.afterSeq = response.head_seq;
      await this.cursorStore.save(session.roomId, session.afterSeq);
      if (!this.isCurrent(session)) return;
      session.initialized = true;
      session.retryAttempt = 0;
      this.publishStatus("connected");
    } catch (error) {
      if (!this.isCurrent(session)) return;
      if (
        error instanceof RoomsMobileClientError &&
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
            realtimeEvents: [],
          });
          if (!this.isCurrent(session)) return;
          session.afterSeq = error.headSeq;
          await this.cursorStore.save(session.roomId, session.afterSeq);
          if (!this.isCurrent(session)) return;
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
