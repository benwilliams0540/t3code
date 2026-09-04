import type { RoomsHumanHttpRequest } from "@t3tools/contracts";
import {
  resolveRoomsHumanRequestUrl,
  validateRoomsHumanRequestBody,
} from "@t3tools/shared/roomsTransport";
import * as Schema from "effect/Schema";

import {
  RoomsHumanChangeResponse,
  RoomsDeliveryAcknowledgementResponse,
  RoomsHumanErrorResponse,
  RoomsHumanFeed,
  RoomsHumanMessage,
  RoomsHumanSession,
  RoomsHumanStoriesResponse,
  RoomsHumanStoryV2,
  RoomsHumanWorkspace,
  type RoomsHumanStoryV2 as RoomsHumanStoryV2Type,
} from "./contract";

export class RoomsMobileClientError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly afterSeq: number | null;
  readonly headSeq: number | null;

  constructor(
    code: string,
    message: string,
    status: number | null = null,
    cursors: { readonly afterSeq?: number; readonly headSeq?: number } = {},
  ) {
    super(message);
    this.name = "RoomsMobileClientError";
    this.code = code;
    this.status = status;
    this.afterSeq = cursors.afterSeq ?? null;
    this.headSeq = cursors.headSeq ?? null;
  }
}

type RoomsFetch = (input: string, init: RequestInit) => Promise<Response>;

const decodeSession = Schema.decodeUnknownSync(RoomsHumanSession);
const decodeWorkspace = Schema.decodeUnknownSync(RoomsHumanWorkspace);
const decodeStories = Schema.decodeUnknownSync(RoomsHumanStoriesResponse);
const decodeFeed = Schema.decodeUnknownSync(RoomsHumanFeed);
const decodeMessage = Schema.decodeUnknownSync(RoomsHumanMessage);
const decodeChange = Schema.decodeUnknownSync(RoomsHumanChangeResponse);
const decodeDeliveryAcknowledgement = Schema.decodeUnknownSync(
  RoomsDeliveryAcknowledgementResponse,
);
const decodeStoryV2 = Schema.decodeUnknownSync(RoomsHumanStoryV2);
const decodeError = Schema.decodeUnknownSync(RoomsHumanErrorResponse);

async function parseResponse<T>(response: Response, decoder: (input: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new RoomsMobileClientError(
      "rooms_invalid_json",
      "The Rooms server returned invalid JSON.",
      response.status,
    );
  }
  if (!response.ok) {
    try {
      const failure = decodeError(body);
      throw new RoomsMobileClientError(failure.error, failure.message, response.status, {
        ...(failure.after_seq === undefined ? {} : { afterSeq: failure.after_seq }),
        ...(failure.head_seq === undefined ? {} : { headSeq: failure.head_seq }),
      });
    } catch (cause) {
      if (cause instanceof RoomsMobileClientError) throw cause;
      throw new RoomsMobileClientError(
        "rooms_http_error",
        `The Rooms server returned HTTP ${response.status}.`,
        response.status,
      );
    }
  }
  try {
    return decoder(body);
  } catch {
    throw new RoomsMobileClientError(
      "rooms_contract_mismatch",
      "The Rooms response does not match the supported rooms.human-shared contract.",
      response.status,
    );
  }
}

export function createRoomsMobileClient(options: {
  readonly baseUrl: string;
  readonly readToken: () => Promise<string | null>;
  readonly fetch?: RoomsFetch;
  readonly assertCurrent?: () => void;
}) {
  const fetchRequest = options.fetch ?? globalThis.fetch;

  const request = async <T>(
    path: string,
    method: "GET" | "POST",
    decoder: (input: unknown) => T,
    body?: Readonly<Record<string, unknown>>,
    requestOptions: { readonly signal?: AbortSignal } = {},
  ): Promise<T> => {
    const bearer = await options.readToken();
    if (!bearer) {
      throw new RoomsMobileClientError("rooms_signed_out", "Sign in to open Shared Rooms.", 401);
    }
    const transportRequest: RoomsHumanHttpRequest = {
      baseUrl: options.baseUrl,
      path,
      method,
      bearer,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    let target: URL;
    let validatedBody: ReturnType<typeof validateRoomsHumanRequestBody>;
    try {
      target = resolveRoomsHumanRequestUrl(transportRequest);
      validatedBody = validateRoomsHumanRequestBody(transportRequest);
    } catch (cause) {
      if (cause instanceof RoomsMobileClientError) throw cause;
      throw new RoomsMobileClientError(
        "rooms_transport_policy",
        "The Rooms request is outside the native transport policy.",
      );
    }
    let response: Response;
    try {
      response = await fetchRequest(target.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          ...(validatedBody ? { "Content-Type": validatedBody.contentType } : {}),
        },
        ...(validatedBody ? { body: validatedBody.body } : {}),
        credentials: "omit",
        redirect: "error",
        ...(requestOptions.signal === undefined ? {} : { signal: requestOptions.signal }),
      });
      options.assertCurrent?.();
    } catch (cause) {
      if (cause instanceof RoomsMobileClientError) throw cause;
      throw new RoomsMobileClientError(
        "rooms_unreachable",
        "Could not reach the private Rooms service. Check Tailscale and try again.",
      );
    }
    return parseResponse(response, decoder);
  };

  const roomPath = (roomId: string) => `/rooms/human/v1/rooms/${encodeURIComponent(roomId)}`;
  const roomFeedPath = (roomId: string) => `/rooms/human/v2/rooms/${encodeURIComponent(roomId)}`;

  return {
    getSession: () => request("/rooms/human/v1/session", "GET", decodeSession),
    getWorkspace: async (roomId: string) => {
      const workspace = await request(`${roomPath(roomId)}/workspace`, "GET", decodeWorkspace);
      if (workspace.room.id !== roomId) {
        throw new RoomsMobileClientError(
          "rooms_workspace_identity_mismatch",
          "The Rooms workspace does not match the requested room.",
        );
      }
      return workspace;
    },
    getStories: async (roomId: string) => {
      const stories = await request(`${roomPath(roomId)}/stories`, "GET", decodeStories);
      if (stories.room_id !== roomId) {
        throw new RoomsMobileClientError(
          "rooms_story_identity_mismatch",
          "The Rooms stories do not match the requested room.",
        );
      }
      return stories;
    },
    getFeed: async (roomId: string, channelId: string) => {
      const feed = await request(
        `${roomFeedPath(roomId)}/channels/${encodeURIComponent(channelId)}/feed?limit=100`,
        "GET",
        decodeFeed,
      );
      if (feed.room_id !== roomId || feed.channel_id !== channelId) {
        throw new RoomsMobileClientError(
          "rooms_feed_identity_mismatch",
          "The Rooms feed does not match the requested room and channel.",
        );
      }
      return feed;
    },
    createMessage: (roomId: string, channelId: string, requestId: string, bodyMarkdown: string) =>
      request(
        `${roomPath(roomId)}/channels/${encodeURIComponent(channelId)}/messages`,
        "POST",
        decodeMessage,
        { request_id: requestId, body_markdown: bodyMarkdown },
      ),
    waitForChanges: async (
      roomId: string,
      input: {
        readonly afterSeq: number;
        readonly timeoutMs?: number;
        readonly signal?: AbortSignal;
        readonly realtime?: boolean;
        readonly clientId?: string;
      },
    ) => {
      const query = new URLSearchParams({
        after_seq: String(input.afterSeq),
        timeout_ms: String(input.timeoutMs ?? 25_000),
        realtime: input.realtime ? "1" : "0",
      });
      if (input.clientId) query.set("client_id", input.clientId);
      const change = await request(
        `${roomPath(roomId)}/changes?${query.toString()}`,
        "GET",
        decodeChange,
        undefined,
        { signal: input.signal },
      );
      const matchesRequest = change.room_id === roomId && change.after_seq === input.afterSeq;
      const validOutcome = change.changed
        ? change.head_seq > change.after_seq
        : change.head_seq === change.after_seq;
      if (!matchesRequest || !validOutcome) {
        throw new RoomsMobileClientError(
          "rooms_change_contract_mismatch",
          "The Rooms change response contradicts its requested cursor.",
        );
      }
      return change;
    },
    acknowledgeDeliveries: async (roomId: string, eventIds: readonly string[]) => {
      const acknowledgement = await request(
        `${roomPath(roomId)}/delivery-acknowledgements`,
        "POST",
        decodeDeliveryAcknowledgement,
        { event_ids: [...eventIds] },
      );
      if (acknowledgement.room_id !== roomId) {
        throw new RoomsMobileClientError(
          "rooms_delivery_ack_mismatch",
          "The Rooms acknowledgement does not match the requested room.",
        );
      }
      return acknowledgement;
    },
    transitionStory: (
      roomId: string,
      storyId: string,
      input: {
        readonly requestId: string;
        readonly expectedHeadSeq: number;
        readonly to: string;
        readonly evidence: readonly string[];
      },
    ): Promise<RoomsHumanStoryV2Type> =>
      request(
        `${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}/transitions`,
        "POST",
        decodeStoryV2,
        {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          to: input.to,
          evidence: input.evidence,
        },
      ),
    reviewStory: (
      roomId: string,
      storyId: string,
      input: {
        readonly requestId: string;
        readonly expectedHeadSeq: number;
        readonly evidence: readonly string[];
      },
    ): Promise<RoomsHumanStoryV2Type> =>
      request(
        `${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}/reviews`,
        "POST",
        decodeStoryV2,
        {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          decision: "approved",
          evidence: input.evidence,
        },
      ),
  } as const;
}

export type RoomsMobileClient = ReturnType<typeof createRoomsMobileClient>;
