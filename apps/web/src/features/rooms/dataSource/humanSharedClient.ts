import type { RoomsHumanHttpRequest, RoomsHumanHttpResponse } from "@t3tools/contracts";
import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";
import * as Schema from "effect/Schema";

import { readRoomsClerkToken, RoomsAuthenticationError } from "~/cloud/roomsAuth";
import { ensureLocalApi } from "~/localApi";

import {
  RoomsHumanCasTuple,
  RoomsHumanChangeResponse,
  RoomsHumanChannel,
  RoomsHumanErrorResponse,
  RoomsHumanFeed,
  RoomsHumanInviteInspection,
  RoomsHumanInviteIssuance,
  RoomsHumanMembershipRedemption,
  RoomsHumanMessage,
  RoomsHumanSession,
  RoomsHumanStoriesResponse,
  RoomsHumanStory,
  RoomsHumanStoryV2,
  RoomsHumanWorkspace,
  type RoomsHumanRole,
} from "./humanSharedContract";
import { RoomsLocalClientError, type RoomsLocalCommandResult } from "./localChannelsClient";
import type {
  RoomsLocalChangeWaitInput,
  RoomsLocalCreateChannelInput,
  RoomsLocalCreateMessageInput,
  RoomsLocalFeedPageInput,
} from "./localChannelsContract";
import type {
  RoomsLocalAttachEvidenceInput,
  RoomsLocalCreateStoryInput,
  RoomsLocalLinkStoryThreadInput,
  RoomsLocalReviewStoryInput,
  RoomsLocalTransitionStoryInput,
  RoomsLocalUploadCasInput,
} from "./localStoriesContract";

export interface RoomsHumanTransport {
  readonly request: (request: RoomsHumanHttpRequest) => Promise<RoomsHumanHttpResponse>;
}

export interface RoomsHumanClient {
  readonly getSession: () => Promise<RoomsHumanSession>;
  readonly redeemBootstrap: (bootstrapToken: string) => Promise<RoomsHumanMembershipRedemption>;
  readonly inspectInvite: (
    roomId: string,
    inviteToken: string,
  ) => Promise<RoomsHumanInviteInspection>;
  readonly redeemInvite: (
    roomId: string,
    inviteToken: string,
  ) => Promise<RoomsHumanMembershipRedemption>;
  readonly createInvite: (
    roomId: string,
    input: { readonly requestId: string; readonly role: RoomsHumanRole },
  ) => Promise<RoomsLocalCommandResult<RoomsHumanInviteIssuance>>;
  readonly getWorkspace: (roomId: string) => Promise<RoomsHumanWorkspace>;
  readonly createChannel: (
    roomId: string,
    input: RoomsLocalCreateChannelInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanChannel>>;
  readonly getFeed: (
    roomId: string,
    channelId: string,
    input?: RoomsLocalFeedPageInput,
  ) => Promise<RoomsHumanFeed>;
  readonly createMessage: (
    roomId: string,
    channelId: string,
    input: RoomsLocalCreateMessageInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanMessage>>;
  readonly waitForChanges: (
    roomId: string,
    input: RoomsLocalChangeWaitInput,
  ) => Promise<RoomsHumanChangeResponse>;
  readonly getStories: (roomId: string) => Promise<RoomsHumanStoriesResponse>;
  readonly getStory: (roomId: string, storyId: string) => Promise<RoomsHumanStory>;
  readonly createStory: (
    roomId: string,
    input: RoomsLocalCreateStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanStory>>;
  readonly linkStoryThread: (
    roomId: string,
    storyId: string,
    input: RoomsLocalLinkStoryThreadInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanStory>>;
  readonly uploadCas: (
    roomId: string,
    input: RoomsLocalUploadCasInput,
  ) => Promise<RoomsHumanCasTuple>;
  readonly attachStoryEvidence: (
    roomId: string,
    storyId: string,
    input: RoomsLocalAttachEvidenceInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanStoryV2>>;
  readonly transitionStory: (
    roomId: string,
    storyId: string,
    input: RoomsLocalTransitionStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanStoryV2>>;
  readonly reviewStory: (
    roomId: string,
    storyId: string,
    input: RoomsLocalReviewStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanStoryV2>>;
}

const decoders = {
  session: Schema.decodeUnknownSync(RoomsHumanSession),
  redemption: Schema.decodeUnknownSync(RoomsHumanMembershipRedemption),
  inspection: Schema.decodeUnknownSync(RoomsHumanInviteInspection),
  invite: Schema.decodeUnknownSync(RoomsHumanInviteIssuance),
  workspace: Schema.decodeUnknownSync(RoomsHumanWorkspace),
  channel: Schema.decodeUnknownSync(RoomsHumanChannel),
  feed: Schema.decodeUnknownSync(RoomsHumanFeed),
  message: Schema.decodeUnknownSync(RoomsHumanMessage),
  change: Schema.decodeUnknownSync(RoomsHumanChangeResponse),
  stories: Schema.decodeUnknownSync(RoomsHumanStoriesResponse),
  story: Schema.decodeUnknownSync(RoomsHumanStory),
  storyV2: Schema.decodeUnknownSync(RoomsHumanStoryV2),
  cas: Schema.decodeUnknownSync(RoomsHumanCasTuple),
  error: Schema.decodeUnknownSync(RoomsHumanErrorResponse),
};

function defaultTransport(): RoomsHumanTransport {
  const transport = ensureLocalApi().roomsHuman;
  if (!transport) {
    throw new RoomsLocalClientError({
      kind: "transport",
      code: "human_transport_unavailable",
      message: "This app shell cannot reach the authenticated Rooms API.",
    });
  }
  return transport;
}

export function validateRoomsHumanOpaqueCredential(value: string): string {
  if (value.trim() === "" || value !== value.trim() || /[\r\n]/.test(value) || value.length > 512) {
    throw new RoomsLocalClientError({
      kind: "invalid_configuration",
      code: "invalid_human_credential",
      message: "The one-time Rooms credential is missing or invalid.",
    });
  }
  return value;
}

function replayed(response: RoomsHumanHttpResponse): boolean {
  return Object.entries(response.headers).some(
    ([name, value]) => name.toLowerCase() === "idempotency-replayed" && value === "true",
  );
}

function parseBody(response: RoomsHumanHttpResponse): unknown {
  try {
    return JSON.parse(response.body);
  } catch {
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: response.status,
      code: "human_invalid_json_response",
      message: "The authenticated Rooms API returned invalid JSON.",
    });
  }
}

function decode<T>(response: RoomsHumanHttpResponse, parser: (body: unknown) => T): T {
  const body = parseBody(response);
  if (response.status < 200 || response.status >= 300) {
    try {
      const error = decoders.error(body);
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
        code: "human_invalid_error_response",
        message: `The authenticated Rooms API returned HTTP ${response.status}.`,
      });
    }
  }
  try {
    return parser(body);
  } catch {
    throw new RoomsLocalClientError({
      kind: "invalid_response",
      status: response.status,
      code: "human_contract_decode_failed",
      message: "The response does not match rooms.human-shared v1.",
    });
  }
}

function invariant(condition: boolean, code: string, message: string): void {
  if (condition) return;
  throw new RoomsLocalClientError({ kind: "invalid_response", status: 200, code, message });
}

export function createRoomsHumanClient(
  configuredBaseUrl: string,
  readToken: () => Promise<string> = readRoomsClerkToken,
  transportFactory: () => RoomsHumanTransport = defaultTransport,
  assertCurrent: () => void = () => undefined,
): RoomsHumanClient {
  const normalizedBaseUrl = normalizeRoomsOrigin("shared", configuredBaseUrl);

  function invalidConfiguration(): RoomsLocalClientError {
    return new RoomsLocalClientError({
      kind: "invalid_configuration",
      code: "invalid_human_api_base_url",
      message: "Use an HTTPS origin or HTTP loopback origin for Shared Rooms.",
    });
  }

  function authenticationFailure(cause: RoomsAuthenticationError): RoomsLocalClientError {
    return new RoomsLocalClientError({
      kind: "server",
      status: 401,
      code: cause.code,
      message: cause.message,
    });
  }

  async function readBearer(): Promise<string> {
    try {
      return await readToken();
    } catch (cause) {
      if (cause instanceof RoomsAuthenticationError) {
        throw authenticationFailure(cause);
      }
      throw new RoomsLocalClientError({
        kind: "server",
        status: 401,
        code: "rooms_auth_unavailable",
        message: "Rooms authentication is unavailable.",
      });
    }
  }

  async function request(
    path: string,
    method: "GET" | "POST",
    body?: Readonly<Record<string, unknown>>,
  ): Promise<RoomsHumanHttpResponse> {
    if (normalizedBaseUrl === null) throw invalidConfiguration();
    try {
      const bearer = await readBearer();
      const response = await transportFactory().request({
        baseUrl: normalizedBaseUrl,
        path,
        method,
        bearer,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assertCurrent();
      return response;
    } catch (cause) {
      if (cause instanceof RoomsLocalClientError) throw cause;
      if (cause instanceof RoomsAuthenticationError) throw authenticationFailure(cause);
      throw new RoomsLocalClientError({
        kind: "transport",
        code: "human_api_unreachable",
        message: `Could not reach the authenticated Rooms API at ${normalizedBaseUrl}.`,
      });
    }
  }

  async function requestRaw(
    roomId: string,
    input: RoomsLocalUploadCasInput,
  ): Promise<RoomsHumanHttpResponse> {
    if (normalizedBaseUrl === null) throw invalidConfiguration();
    try {
      const bearer = await readBearer();
      const response = await transportFactory().request({
        baseUrl: normalizedBaseUrl,
        path: `/rooms/human/v1/rooms/${encodeURIComponent(roomId)}/cas`,
        method: "POST",
        bearer,
        body: input.bodyBase64,
        bodyEncoding: "base64",
        contentType: input.mediaType,
      });
      assertCurrent();
      return response;
    } catch (cause) {
      if (cause instanceof RoomsLocalClientError) throw cause;
      if (cause instanceof RoomsAuthenticationError) throw authenticationFailure(cause);
      throw new RoomsLocalClientError({
        kind: "transport",
        code: "human_api_unreachable",
        message: `Could not reach the authenticated Rooms API at ${normalizedBaseUrl}.`,
      });
    }
  }

  const roomPath = (roomId: string) => `/rooms/human/v1/rooms/${encodeURIComponent(roomId)}`;
  const command = async <T>(
    response: Promise<RoomsHumanHttpResponse>,
    parser: (body: unknown) => T,
  ): Promise<RoomsLocalCommandResult<T>> => {
    const resolved = await response;
    return { value: decode(resolved, parser), replayed: replayed(resolved) };
  };

  return {
    getSession: async () =>
      decode(await request("/rooms/human/v1/session", "GET"), decoders.session),
    redeemBootstrap: async (bootstrapToken) =>
      decode(
        await request("/rooms/human/v1/bootstrap/redemptions", "POST", {
          bootstrap_token: validateRoomsHumanOpaqueCredential(bootstrapToken),
        }),
        decoders.redemption,
      ),
    inspectInvite: async (roomId, inviteToken) => {
      const invitation = decode(
        await request("/rooms/human/v1/invite-inspections", "POST", {
          room_id: roomId,
          invite_token: validateRoomsHumanOpaqueCredential(inviteToken),
        }),
        decoders.inspection,
      );
      invariant(
        invitation.room.id === roomId,
        "human_invite_room_mismatch",
        "The invitation metadata does not match the requested room.",
      );
      return invitation;
    },
    redeemInvite: async (roomId, inviteToken) => {
      const redemption = decode(
        await request("/rooms/human/v1/invite-redemptions", "POST", {
          room_id: roomId,
          invite_token: validateRoomsHumanOpaqueCredential(inviteToken),
        }),
        decoders.redemption,
      );
      invariant(
        redemption.room.id === roomId,
        "human_redemption_room_mismatch",
        "The invitation redemption does not match the requested room.",
      );
      return redemption;
    },
    createInvite: async (roomId, input) => {
      const result = await command(
        request(`${roomPath(roomId)}/invites`, "POST", {
          request_id: input.requestId,
          role: input.role,
        }),
        decoders.invite,
      );
      invariant(
        result.value.room_id === roomId && result.value.role === input.role,
        "human_invite_contract_mismatch",
        "The issued invitation contradicts its room or requested role.",
      );
      return result;
    },
    getWorkspace: async (roomId) => {
      const workspace = decode(
        await request(`${roomPath(roomId)}/workspace`, "GET"),
        decoders.workspace,
      );
      invariant(
        workspace.room.id === roomId && workspace.principal.id.startsWith("h:"),
        "human_workspace_identity_mismatch",
        "The shared workspace contradicts its requested room or human identity.",
      );
      return workspace;
    },
    createChannel: async (roomId, input) => {
      const result = await command(
        request(`${roomPath(roomId)}/channels`, "POST", {
          request_id: input.requestId,
          name: input.name,
          purpose: input.purpose,
        }),
        decoders.channel,
      );
      invariant(
        result.value.room_id === roomId,
        "human_channel_room_mismatch",
        "The created channel does not belong to the requested room.",
      );
      return result;
    },
    getFeed: async (roomId, channelId, input = {}) => {
      const query = new URLSearchParams();
      if (input.afterSeq !== undefined) query.set("after_seq", String(input.afterSeq));
      if (input.limit !== undefined) query.set("limit", String(input.limit));
      if (input.snapshotHeadSeq !== undefined)
        query.set("snapshot_head_seq", String(input.snapshotHeadSeq));
      const suffix = query.size === 0 ? "" : `?${query.toString()}`;
      const feed = decode(
        await request(
          `${roomPath(roomId)}/channels/${encodeURIComponent(channelId)}/feed${suffix}`,
          "GET",
        ),
        decoders.feed,
      );
      invariant(
        feed.room_id === roomId && feed.channel_id === channelId,
        "human_feed_identity_mismatch",
        "The shared feed contradicts its requested room or channel.",
      );
      return feed;
    },
    createMessage: (roomId, channelId, input) =>
      command(
        request(`${roomPath(roomId)}/channels/${encodeURIComponent(channelId)}/messages`, "POST", {
          request_id: input.requestId,
          body_markdown: input.bodyMarkdown,
        }),
        decoders.message,
      ),
    waitForChanges: async (roomId, input) => {
      const query = new URLSearchParams({
        after_seq: String(input.afterSeq),
        timeout_ms: String(input.timeoutMs ?? 25_000),
      });
      const change = decode(
        await request(`${roomPath(roomId)}/changes?${query.toString()}`, "GET"),
        decoders.change,
      );
      invariant(
        change.room_id === roomId &&
          change.after_seq === input.afterSeq &&
          (change.changed
            ? change.head_seq > change.after_seq
            : change.head_seq === change.after_seq),
        "human_change_contract_mismatch",
        "The shared change response contradicts its requested cursor.",
      );
      return change;
    },
    getStories: async (roomId) =>
      decode(await request(`${roomPath(roomId)}/stories`, "GET"), decoders.stories),
    getStory: async (roomId, storyId) =>
      decode(
        await request(`${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}`, "GET"),
        decoders.story,
      ),
    createStory: (roomId, input) =>
      command(
        request(`${roomPath(roomId)}/stories`, "POST", {
          request_id: input.requestId,
          title: input.title,
          story_type: input.storyType,
        }),
        decoders.story,
      ),
    linkStoryThread: (roomId, storyId, input) =>
      command(
        request(`${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}/thread`, "POST", {
          request_id: input.requestId,
          environment_id: input.environmentId,
          project_id: input.projectId,
          thread_id: input.threadId,
        }),
        decoders.story,
      ),
    uploadCas: async (roomId, input) => decode(await requestRaw(roomId, input), decoders.cas),
    attachStoryEvidence: (roomId, storyId, input) =>
      command(
        request(`${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}/evidence`, "POST", {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          kind: input.kind,
          cas: input.cas,
          note: input.note,
        }),
        decoders.storyV2,
      ),
    transitionStory: (roomId, storyId, input) =>
      command(
        request(`${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}/transitions`, "POST", {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          to: input.to,
          evidence: input.evidence,
        }),
        decoders.storyV2,
      ),
    reviewStory: (roomId, storyId, input) =>
      command(
        request(`${roomPath(roomId)}/stories/${encodeURIComponent(storyId)}/reviews`, "POST", {
          request_id: input.requestId,
          expected_head_seq: input.expectedHeadSeq,
          decision: input.decision,
          evidence: input.evidence,
        }),
        decoders.storyV2,
      ),
  };
}
