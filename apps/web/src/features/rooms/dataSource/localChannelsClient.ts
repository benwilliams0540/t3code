import type { RoomsLocalHttpRequest, RoomsLocalHttpResponse } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { ensureLocalApi } from "~/localApi";

import {
  RoomsLocalChannel,
  RoomsLocalChangeCursorAhead,
  RoomsLocalChangeResponse,
  type RoomsLocalChangeWaitInput,
  type RoomsLocalCreateChannelInput,
  type RoomsLocalCreateMessageInput,
  RoomsLocalErrorResponse,
  RoomsLocalFeed,
  type RoomsLocalFeedPageInput,
  RoomsLocalHumanMessage,
  RoomsLocalWorkspace,
} from "./localChannelsContract";

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

export type RoomsLocalClientErrorKind =
  | "invalid_configuration"
  | "transport"
  | "invalid_response"
  | "server";

export class RoomsLocalClientError extends Error {
  readonly kind: RoomsLocalClientErrorKind;
  readonly status: number | null;
  readonly code: string;
  readonly afterSeq: number | null;
  readonly headSeq: number | null;

  constructor(input: {
    readonly kind: RoomsLocalClientErrorKind;
    readonly message: string;
    readonly status?: number | null | undefined;
    readonly code: string;
    readonly afterSeq?: number | null | undefined;
    readonly headSeq?: number | null | undefined;
    readonly cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "RoomsLocalClientError";
    this.kind = input.kind;
    this.status = input.status ?? null;
    this.code = input.code;
    this.afterSeq = input.afterSeq ?? null;
    this.headSeq = input.headSeq ?? null;
  }
}

export function isRoomsLocalClientError(error: unknown): error is RoomsLocalClientError {
  return error instanceof RoomsLocalClientError;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]" || normalized === "::1") return true;
  if (!LOOPBACK_IPV4.test(normalized)) return false;
  return normalized
    .split(".")
    .every((part) => Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= 255);
}

export type RoomsLocalApiBaseUrlValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

export function validateRoomsLocalApiBaseUrl(value: string): RoomsLocalApiBaseUrlValidation {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "http:" ||
      !isLoopbackHostname(url.hostname) ||
      url.username !== "" ||
      url.password !== "" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return {
        ok: false,
        message: "Use an HTTP loopback origin such as http://127.0.0.1:3000.",
      };
    }
    return { ok: true, value: url.origin };
  } catch {
    return { ok: false, message: "Enter a valid loopback URL including the port." };
  }
}

export interface RoomsLocalTransport {
  readonly request: (request: RoomsLocalHttpRequest) => Promise<RoomsLocalHttpResponse>;
}

export interface RoomsLocalCommandResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export interface RoomsLocalChannelsClient {
  readonly getWorkspace: () => Promise<RoomsLocalWorkspace>;
  readonly createChannel: (
    roomId: string,
    input: RoomsLocalCreateChannelInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalChannel>>;
  readonly getFeed: (
    roomId: string,
    channelId: string,
    input?: RoomsLocalFeedPageInput,
  ) => Promise<RoomsLocalFeed>;
  readonly createMessage: (
    roomId: string,
    channelId: string,
    input: RoomsLocalCreateMessageInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalHumanMessage>>;
  readonly waitForChanges: (
    roomId: string,
    input: RoomsLocalChangeWaitInput,
  ) => Promise<RoomsLocalChangeResponse>;
}

const decodeWorkspace = Schema.decodeUnknownSync(RoomsLocalWorkspace);
const decodeChannel = Schema.decodeUnknownSync(RoomsLocalChannel);
const decodeFeed = Schema.decodeUnknownSync(RoomsLocalFeed);
const decodeHumanMessage = Schema.decodeUnknownSync(RoomsLocalHumanMessage);
const decodeChangeResponse = Schema.decodeUnknownSync(RoomsLocalChangeResponse);
const decodeChangeCursorAhead = Schema.decodeUnknownSync(RoomsLocalChangeCursorAhead);
const decodeError = Schema.decodeUnknownSync(RoomsLocalErrorResponse);

function parseJson(response: RoomsLocalHttpResponse): unknown {
  try {
    return JSON.parse(response.body);
  } catch (cause) {
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: response.status,
      code: "invalid_json_response",
      message: "The Rooms Local API returned a response that was not JSON.",
      cause,
    });
  }
}

function throwServerError(response: RoomsLocalHttpResponse, body: unknown): never {
  if (response.status === 409) {
    try {
      const error = decodeChangeCursorAhead(body);
      throw new RoomsLocalClientError({
        kind: "server",
        status: response.status,
        code: error.error,
        message: error.message,
        afterSeq: error.after_seq,
        headSeq: error.head_seq,
      });
    } catch (cause) {
      if (cause instanceof RoomsLocalClientError) throw cause;
    }
  }
  try {
    const error = decodeError(body);
    throw new RoomsLocalClientError({
      kind: "server",
      status: response.status,
      code: error.error,
      message: error.message,
    });
  } catch (cause) {
    if (cause instanceof RoomsLocalClientError) throw cause;
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: response.status,
      code: "invalid_error_response",
      message: `The Rooms Local API returned HTTP ${response.status} without a valid error body.`,
      cause,
    });
  }
}

function decodeSuccess<T>(
  response: RoomsLocalHttpResponse,
  decode: (input: unknown) => T,
  contractId = "rooms.local-channels",
): T {
  const body = parseJson(response);
  if (response.status < 200 || response.status >= 300) throwServerError(response, body);
  try {
    return decode(body);
  } catch (cause) {
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: response.status,
      code: "contract_decode_failed",
      message: `The Rooms Local API response does not match ${contractId} v1.`,
      cause,
    });
  }
}

function replayed(response: RoomsLocalHttpResponse): boolean {
  return Object.entries(response.headers).some(
    ([name, value]) => name.toLowerCase() === "idempotency-replayed" && value === "true",
  );
}

function defaultTransport(): RoomsLocalTransport {
  const transport = ensureLocalApi().roomsLocal;
  if (!transport) {
    throw new RoomsLocalClientError({
      kind: "transport",
      code: "local_transport_unavailable",
      message: "This app shell cannot reach the Rooms Local API.",
    });
  }
  return transport;
}

export function createRoomsLocalChannelsClient(
  configuredBaseUrl: string,
  transportFactory: () => RoomsLocalTransport = defaultTransport,
): RoomsLocalChannelsClient {
  const validation = validateRoomsLocalApiBaseUrl(configuredBaseUrl);

  async function request(
    path: string,
    method: "GET" | "POST",
    body?: Readonly<Record<string, unknown>>,
  ): Promise<RoomsLocalHttpResponse> {
    if (!validation.ok) {
      throw new RoomsLocalClientError({
        kind: "invalid_configuration",
        code: "invalid_local_api_base_url",
        message: validation.message,
      });
    }
    try {
      return await transportFactory().request({
        baseUrl: validation.value,
        path,
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      if (cause instanceof RoomsLocalClientError) throw cause;
      throw new RoomsLocalClientError({
        kind: "transport",
        code: "local_api_unreachable",
        message: `Could not reach the Rooms Local API at ${validation.value}.`,
        cause,
      });
    }
  }

  return {
    getWorkspace: async () =>
      decodeSuccess(await request("/rooms/local/workspace", "GET"), decodeWorkspace),
    createChannel: async (roomId, input) => {
      const response = await request(`/rooms/${encodeURIComponent(roomId)}/channels`, "POST", {
        request_id: input.requestId,
        name: input.name,
        purpose: input.purpose,
      });
      return { value: decodeSuccess(response, decodeChannel), replayed: replayed(response) };
    },
    getFeed: async (roomId, channelId, input = {}) => {
      const query = new URLSearchParams();
      if (input.afterSeq !== undefined) query.set("after_seq", String(input.afterSeq));
      if (input.limit !== undefined) query.set("limit", String(input.limit));
      if (input.snapshotHeadSeq !== undefined) {
        query.set("snapshot_head_seq", String(input.snapshotHeadSeq));
      }
      const suffix = query.size === 0 ? "" : `?${query.toString()}`;
      return decodeSuccess(
        await request(
          `/rooms/${encodeURIComponent(roomId)}/channels/${encodeURIComponent(channelId)}/feed${suffix}`,
          "GET",
        ),
        decodeFeed,
      );
    },
    createMessage: async (roomId, channelId, input) => {
      const response = await request(
        `/rooms/${encodeURIComponent(roomId)}/channels/${encodeURIComponent(channelId)}/messages`,
        "POST",
        { request_id: input.requestId, body_markdown: input.bodyMarkdown },
      );
      return {
        value: decodeSuccess(response, decodeHumanMessage),
        replayed: replayed(response),
      };
    },
    waitForChanges: async (roomId, input) => {
      const query = new URLSearchParams({
        after_seq: String(input.afterSeq),
        timeout_ms: String(input.timeoutMs ?? 25_000),
      });
      const response = decodeSuccess(
        await request(`/rooms/${encodeURIComponent(roomId)}/changes?${query.toString()}`, "GET"),
        decodeChangeResponse,
        "rooms.local-changes",
      );
      const validSequence =
        Number.isSafeInteger(response.after_seq) &&
        response.after_seq >= 0 &&
        Number.isSafeInteger(response.head_seq) &&
        response.head_seq >= 0;
      const matchesRequest = response.room_id === roomId && response.after_seq === input.afterSeq;
      const validOutcome = response.changed
        ? response.head_seq > response.after_seq
        : response.head_seq === response.after_seq;
      if (!validSequence || !matchesRequest || !validOutcome) {
        throw new RoomsLocalClientError({
          kind: "invalid_response",
          status: 200,
          code: "change_contract_invariant_failed",
          message: "The Rooms Local change response contradicts its request or cursor outcome.",
        });
      }
      return response;
    },
  };
}
