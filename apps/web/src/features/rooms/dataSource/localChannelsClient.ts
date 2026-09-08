import type { RoomsLocalHttpRequest, RoomsLocalHttpResponse } from "@t3tools/contracts";
import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";
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
import {
  type RoomsLocalAttachEvidenceInput,
  RoomsLocalCasTuple,
  type RoomsLocalCreateStoryInput,
  type RoomsLocalLinkStoryThreadInput,
  type RoomsLocalReviewStoryInput,
  RoomsLocalStoriesResponse,
  type RoomsLocalStoriesResponse as RoomsLocalStoriesResponseType,
  RoomsLocalStory,
  type RoomsLocalStory as RoomsLocalStoryType,
  type RoomsLocalStoryV2,
  type RoomsLocalTransitionStoryInput,
  type RoomsLocalUploadCasInput,
  isRoomsLocalStoryV2,
} from "./localStoriesContract";

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

export type RoomsLocalApiBaseUrlValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

export function validateRoomsLocalApiBaseUrl(value: string): RoomsLocalApiBaseUrlValidation {
  const normalized = normalizeRoomsOrigin("local", value);
  return normalized === null
    ? { ok: false, message: "Use an HTTP loopback origin such as http://127.0.0.1:3000." }
    : { ok: true, value: normalized };
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
  readonly getStories: (roomId: string) => Promise<RoomsLocalStoriesResponseType>;
  readonly getStory: (roomId: string, storyId: string) => Promise<RoomsLocalStoryType>;
  readonly createStory: (
    roomId: string,
    input: RoomsLocalCreateStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryType>>;
  readonly linkStoryThread: (
    roomId: string,
    storyId: string,
    input: RoomsLocalLinkStoryThreadInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryType>>;
  readonly uploadCas: (input: RoomsLocalUploadCasInput) => Promise<RoomsLocalCasTuple>;
  readonly attachStoryEvidence: (
    roomId: string,
    storyId: string,
    input: RoomsLocalAttachEvidenceInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryV2>>;
  readonly transitionStory: (
    roomId: string,
    storyId: string,
    input: RoomsLocalTransitionStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryV2>>;
  readonly reviewStory: (
    roomId: string,
    storyId: string,
    input: RoomsLocalReviewStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryV2>>;
}

const decodeWorkspace = Schema.decodeUnknownSync(RoomsLocalWorkspace);
const decodeChannel = Schema.decodeUnknownSync(RoomsLocalChannel);
const decodeFeed = Schema.decodeUnknownSync(RoomsLocalFeed);
const decodeHumanMessage = Schema.decodeUnknownSync(RoomsLocalHumanMessage);
const decodeChangeResponse = Schema.decodeUnknownSync(RoomsLocalChangeResponse);
const decodeChangeCursorAhead = Schema.decodeUnknownSync(RoomsLocalChangeCursorAhead);
const decodeError = Schema.decodeUnknownSync(RoomsLocalErrorResponse);
const decodeStories = Schema.decodeUnknownSync(RoomsLocalStoriesResponse);
const decodeStory = Schema.decodeUnknownSync(RoomsLocalStory);
const decodeCasTuple = Schema.decodeUnknownSync(RoomsLocalCasTuple);

function parseJson(response: RoomsLocalHttpResponse): unknown {
  try {
    return JSON.parse(response.body);
  } catch (cause) {
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: response.status,
      code: "invalid_json_response",
      message: "The Threadspace Local API returned a response that was not JSON.",
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
      message: `The Threadspace Local API returned HTTP ${response.status} without a valid error body.`,
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
      message: `The Threadspace Local API response does not match ${contractId}.`,
      cause,
    });
  }
}

function replayed(response: RoomsLocalHttpResponse): boolean {
  return Object.entries(response.headers).some(
    ([name, value]) => name.toLowerCase() === "idempotency-replayed" && value === "true",
  );
}

function validateStory(story: RoomsLocalStoryType, roomId: string, storyId?: string): void {
  const link = story.native_thread;
  const commonValid =
    story.room_id === roomId &&
    (storyId === undefined || story.id === storyId) &&
    story.created_seq > 0 &&
    story.source_event.seq === story.created_seq &&
    story.source_event.type === "task.created" &&
    story.source_event.schema === 2 &&
    (link === null ||
      (link.room_id === roomId &&
        link.story_id === story.id &&
        link.linked_seq > story.created_seq &&
        link.source_event.seq === link.linked_seq &&
        link.source_event.type === "task.thread-linked" &&
        link.source_event.schema === 1));
  const v2Valid = !isRoomsLocalStoryV2(story) || validateV2Story(story);
  if (!commonValid || !v2Valid) {
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: 200,
      code: "story_contract_invariant_failed",
      message:
        "The Threadspace Local story response contradicts its room, identity, or ledger source.",
    });
  }
}

function validCasTuple(cas: RoomsLocalCasTuple): boolean {
  return /^[0-9a-f]{64}$/.test(cas.hash) && cas.bytes >= 0 && cas.media_type.trim() !== "";
}

function validateV2Story(story: RoomsLocalStoryV2): boolean {
  const evidenceIds = new Set(story.evidence.map((evidence) => evidence.id));
  const reviewIds = new Set(story.reviews.map((review) => review.id));
  return (
    story.scope_head_seq >= story.created_seq &&
    story.as_of_seq >= story.scope_head_seq &&
    story.evidence.every(
      (evidence) =>
        evidence.story_id === story.id &&
        evidence.id === evidence.source_event.event_id &&
        evidence.attached_seq === evidence.source_event.seq &&
        evidence.source_event.type === "evidence.attached" &&
        evidence.source_event.schema === 2 &&
        validCasTuple(evidence.cas),
    ) &&
    story.reviews.every(
      (review) =>
        review.story_id === story.id &&
        review.id === review.source_event.event_id &&
        review.reviewed_seq === review.source_event.seq &&
        review.source_event.type === "task.reviewed",
    ) &&
    (story.completion === null ||
      (story.completion.story_id === story.id &&
        story.completion.completed_seq === story.completion.source_event.seq &&
        story.completion.source_event.type === "task.completed" &&
        story.completion.evidence.every((id) => evidenceIds.has(id)))) &&
    (story.gate === null ||
      (story.gate.eligible_evidence.every((id) => evidenceIds.has(id)) &&
        (story.gate.approved_review_id === null ||
          reviewIds.has(story.gate.approved_review_id)))) &&
    story.audit.every(
      (entry, index) =>
        index === 0 || story.audit[index - 1]!.source_event.seq < entry.source_event.seq,
    ) &&
    (story.audit.at(-1)?.source_event.seq ?? 0) <= story.as_of_seq
  );
}

function defaultTransport(): RoomsLocalTransport {
  const transport = ensureLocalApi().roomsLocal;
  if (!transport) {
    throw new RoomsLocalClientError({
      kind: "transport",
      code: "local_transport_unavailable",
      message: "This app shell cannot reach the Threadspace Local API.",
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
        message: `Could not reach the Threadspace Local API at ${validation.value}.`,
        cause,
      });
    }
  }

  async function requestRaw(input: {
    readonly path: string;
    readonly method: "GET" | "POST";
    readonly body: string;
    readonly bodyEncoding: "base64";
    readonly contentType: string;
  }): Promise<RoomsLocalHttpResponse> {
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
        path: input.path,
        method: input.method,
        body: input.body,
        bodyEncoding: input.bodyEncoding,
        contentType: input.contentType,
      });
    } catch (cause) {
      if (cause instanceof RoomsLocalClientError) throw cause;
      throw new RoomsLocalClientError({
        kind: "transport",
        code: "local_api_unreachable",
        message: `Could not reach the Threadspace Local API at ${validation.value}.`,
        cause,
      });
    }
  }

  function decodeV2StoryResponse(
    response: RoomsLocalHttpResponse,
    roomId: string,
    storyId: string,
  ): RoomsLocalStoryV2 {
    const value = decodeSuccess(response, decodeStory, "rooms.local-stories");
    validateStory(value, roomId, storyId);
    if (!isRoomsLocalStoryV2(value)) {
      throw new RoomsLocalClientError({
        kind: "invalid_response",
        status: response.status,
        code: "story_v2_required",
        message: "The Threadspace Local lifecycle command did not return a version-2 story.",
      });
    }
    return value;
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
          message:
            "The Threadspace Local change response contradicts its request or cursor outcome.",
        });
      }
      return response;
    },
    getStories: async (roomId) => {
      const result = decodeSuccess(
        await request(`/rooms/${encodeURIComponent(roomId)}/stories`, "GET"),
        decodeStories,
        "rooms.local-stories",
      );
      const ordered = result.stories.every(
        (story, index) => index === 0 || result.stories[index - 1]!.created_seq < story.created_seq,
      );
      if (result.room_id !== roomId || !ordered) {
        throw new RoomsLocalClientError({
          kind: "invalid_response",
          status: 200,
          code: "story_collection_invariant_failed",
          message:
            "The Threadspace Local story collection contradicts its requested room or ordering.",
        });
      }
      result.stories.forEach((story) => validateStory(story, roomId));
      return result;
    },
    getStory: async (roomId, storyId) => {
      const value = decodeSuccess(
        await request(
          `/rooms/${encodeURIComponent(roomId)}/stories/${encodeURIComponent(storyId)}`,
          "GET",
        ),
        decodeStory,
        "rooms.local-stories",
      );
      validateStory(value, roomId, storyId);
      return value;
    },
    createStory: async (roomId, input) => {
      const response = await request(`/rooms/${encodeURIComponent(roomId)}/stories`, "POST", {
        request_id: input.requestId,
        title: input.title,
        story_type: input.storyType,
      });
      const value = decodeSuccess(response, decodeStory, "rooms.local-stories");
      validateStory(value, roomId);
      return { value, replayed: replayed(response) };
    },
    linkStoryThread: async (roomId, storyId, input) => {
      const response = await request(
        `/rooms/${encodeURIComponent(roomId)}/stories/${encodeURIComponent(storyId)}/thread`,
        "POST",
        {
          request_id: input.requestId,
          environment_id: input.environmentId,
          project_id: input.projectId,
          thread_id: input.threadId,
        },
      );
      const value = decodeSuccess(response, decodeStory, "rooms.local-stories");
      validateStory(value, roomId, storyId);
      return { value, replayed: replayed(response) };
    },
    uploadCas: async (input) => {
      const response = await requestRaw({
        path: "/cas",
        method: "POST",
        body: input.bodyBase64,
        bodyEncoding: "base64",
        contentType: input.mediaType,
      });
      const value = decodeSuccess(response, decodeCasTuple, "Threadspace CAS tuple");
      if (!validCasTuple(value)) {
        throw new RoomsLocalClientError({
          kind: "invalid_response",
          status: response.status,
          code: "cas_tuple_invariant_failed",
          message: "The Threadspace CAS response does not contain a valid SHA-256 tuple.",
        });
      }
      return value;
    },
    attachStoryEvidence: async (roomId, storyId, input) => {
      const response = await request(
        `/rooms/${encodeURIComponent(roomId)}/stories/${encodeURIComponent(storyId)}/evidence`,
        "POST",
        {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          kind: input.kind,
          cas: input.cas,
          note: input.note,
        },
      );
      return {
        value: decodeV2StoryResponse(response, roomId, storyId),
        replayed: replayed(response),
      };
    },
    transitionStory: async (roomId, storyId, input) => {
      const response = await request(
        `/rooms/${encodeURIComponent(roomId)}/stories/${encodeURIComponent(storyId)}/transitions`,
        "POST",
        {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          to: input.to,
          evidence: input.evidence,
        },
      );
      return {
        value: decodeV2StoryResponse(response, roomId, storyId),
        replayed: replayed(response),
      };
    },
    reviewStory: async (roomId, storyId, input) => {
      const response = await request(
        `/rooms/${encodeURIComponent(roomId)}/stories/${encodeURIComponent(storyId)}/reviews`,
        "POST",
        {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          decision: input.decision,
          evidence: input.evidence,
        },
      );
      return {
        value: decodeV2StoryResponse(response, roomId, storyId),
        replayed: replayed(response),
      };
    },
  };
}
