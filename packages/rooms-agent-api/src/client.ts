import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http";

import {
  isReadTool,
  RoomsAgentProfile as RoomsAgentProfileSchema,
  type RoomsAgentProfile,
  RoomsAgentToolError,
  type RoomsAgentToolName,
  RoomsReadContractResponse,
  RoomsServerErrorBody,
  RoomsWorkContractResponse,
} from "./contracts.ts";

export interface RoomsAgentClientOptions {
  readonly baseUrl: string;
  readonly bearerToken?: string | undefined;
  readonly profile: RoomsAgentProfile;
  readonly invocationId?: string | undefined;
  readonly connectorId?: string | undefined;
  readonly configurationEpoch?: number | undefined;
}

export interface RoomsAgentClientShape {
  readonly profile: RoomsAgentProfile;
  readonly invoke: (
    tool: RoomsAgentToolName,
    input: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<unknown, RoomsAgentToolError>;
}

export class RoomsAgentClient extends Context.Service<RoomsAgentClient, RoomsAgentClientShape>()(
  "@t3tools/rooms-agent-api/client/RoomsAgentClient",
) {}

const clientError = (
  code: string,
  message: string,
  options: {
    readonly status?: number;
    readonly retryable?: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
  } = {},
) =>
  new RoomsAgentToolError({
    code,
    status: options.status ?? 503,
    message,
    retryable: options.retryable ?? false,
    details: options.details ?? {},
    source: "client",
  });

const normalizeRoomsBaseUrl = (
  value: string,
): { readonly baseUrl?: string; readonly error?: RoomsAgentToolError } => {
  const baseUrl = normalizeRoomsOrigin("shared", value);
  if (baseUrl === null) {
    return {
      error: clientError(
        "rooms_agent_origin_required",
        "Rooms Agent accepts only credential-free HTTPS or HTTP loopback origins.",
        { status: 400 },
      ),
    };
  }
  return { baseUrl };
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const encodeUnknownJsonString = Schema.encodeUnknownEffect(Schema.UnknownFromJsonString);
const decodeRoomsAgentProfile = Schema.decodeUnknownEffect(RoomsAgentProfileSchema);

const makeToolCallId = Effect.fn("RoomsAgentClient.makeToolCallId")(function* (
  crypto: Crypto.Crypto,
  invocationId: string,
  tool: RoomsAgentToolName,
  input: Readonly<Record<string, unknown>>,
) {
  const intent = yield* encodeUnknownJsonString({
    invocationId,
    tool,
    input: canonicalize(input),
  }).pipe(
    Effect.mapError(() =>
      clientError("rooms_agent_request_invalid", "Rooms Agent request is not JSON encodable.", {
        status: 400,
      }),
    ),
  );
  const digest = yield* crypto
    .digest("SHA-256", new TextEncoder().encode(intent))
    .pipe(
      Effect.mapError(() =>
        clientError(
          "rooms_agent_tool_call_id_unavailable",
          "Rooms Agent could not derive a stable tool-call identity.",
        ),
      ),
    );
  return `m5c:${bytesToHex(digest)}`;
});

const queryValue = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.join(",");
  return String(value);
};

const compactQuery = (input: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      const normalized = queryValue(value);
      return normalized === undefined ? [] : [[key, normalized]];
    }),
  );

const storyPath = (input: Readonly<Record<string, unknown>>): string =>
  encodeURIComponent(String(input.story_id));

const threadPath = (input: Readonly<Record<string, unknown>>): string =>
  encodeURIComponent(String(input.thread_id));

const without = (
  input: Readonly<Record<string, unknown>>,
  ...keys: ReadonlyArray<string>
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));

const requestForTool = (
  baseUrl: string,
  tool: RoomsAgentToolName,
  input: Readonly<Record<string, unknown>>,
): HttpClientRequest.HttpClientRequest => {
  switch (tool) {
    case "rooms_context_get":
      return HttpClientRequest.get(`${baseUrl}/agent/v2/context`);
    case "rooms_story_list": {
      const filters = (input.filters ?? {}) as Readonly<Record<string, unknown>>;
      return HttpClientRequest.get(`${baseUrl}/agent/v2/stories`, {
        urlParams: compactQuery({ ...without(input, "filters"), ...filters }),
      });
    }
    case "rooms_story_get":
      return HttpClientRequest.get(`${baseUrl}/agent/v2/stories/${storyPath(input)}`, {
        urlParams: compactQuery(without(input, "story_id")),
      });
    case "rooms_story_search":
      return HttpClientRequest.get(`${baseUrl}/agent/v2/stories/search`, {
        urlParams: compactQuery(input),
      });
    case "rooms_story_create":
      return HttpClientRequest.post(`${baseUrl}/agent/v1/work/stories`).pipe(
        HttpClientRequest.bodyJsonUnsafe(input),
      );
    case "rooms_story_claim":
      return HttpClientRequest.post(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/claim`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(without(input, "story_id")));
    case "rooms_story_release":
      return HttpClientRequest.post(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/release`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(without(input, "story_id")));
    case "rooms_story_transition":
      return HttpClientRequest.post(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/transition`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(without(input, "story_id")));
    case "rooms_story_attach_evidence":
      return HttpClientRequest.post(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/evidence`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(without(input, "story_id")));
    case "rooms_story_request_review":
      return HttpClientRequest.post(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/review-request`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(without(input, "story_id")));
    case "rooms_story_complete":
      return HttpClientRequest.post(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/complete`,
      ).pipe(HttpClientRequest.bodyJsonUnsafe(without(input, "story_id")));
    case "rooms_channel_context_get":
      return HttpClientRequest.get(`${baseUrl}/agent/v1/work/channel-context`, {
        urlParams: compactQuery(input),
      });
    case "rooms_archived_thread_summary_get":
      return HttpClientRequest.get(
        `${baseUrl}/agent/v1/work/stories/${storyPath(input)}/archived-threads/${threadPath(input)}/summary`,
        { urlParams: compactQuery(without(input, "story_id", "thread_id")) },
      );
  }
};

const validateSuccess = Effect.fn("RoomsAgentClient.validateSuccess")(function* (
  tool: RoomsAgentToolName,
  body: unknown,
) {
  const schema = isReadTool(tool) ? RoomsReadContractResponse : RoomsWorkContractResponse;
  yield* Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError(() =>
      clientError(
        "rooms_agent_contract_drift",
        "Rooms Agent response does not match the pinned contract version.",
        { status: 502 },
      ),
    ),
  );
  return body;
});

const decodeResponse = Effect.fn("RoomsAgentClient.decodeResponse")(function* (
  tool: RoomsAgentToolName,
  response: HttpClientResponse.HttpClientResponse,
) {
  if (response.status >= 200 && response.status < 300) {
    const body = yield* HttpClientResponse.schemaBodyJson(Schema.Unknown)(response).pipe(
      Effect.mapError(() =>
        clientError("rooms_agent_response_invalid", "Rooms Agent returned invalid JSON.", {
          status: 502,
        }),
      ),
    );
    return yield* validateSuccess(tool, body);
  }
  const body = yield* HttpClientResponse.schemaBodyJson(RoomsServerErrorBody)(response).pipe(
    Effect.mapError(() =>
      clientError(
        "rooms_agent_error_invalid",
        "Rooms Agent returned an invalid structured error.",
        { status: 502 },
      ),
    ),
  );
  return yield* new RoomsAgentToolError({
    code: body.error,
    status: response.status,
    message: body.message,
    retryable: body.retryable,
    details: body.details,
    source: "server",
  });
});

export const make = Effect.fn("RoomsAgentClient.make")(function* (
  options: RoomsAgentClientOptions,
) {
  const httpClient = yield* HttpClient.HttpClient;
  const crypto = yield* Crypto.Crypto;
  const roomsBaseUrl = normalizeRoomsBaseUrl(options.baseUrl);

  const invoke: RoomsAgentClientShape["invoke"] = Effect.fn("RoomsAgentClient.invoke")(
    function* (tool, input) {
      if (roomsBaseUrl.error) return yield* roomsBaseUrl.error;
      if (!options.bearerToken) {
        return yield* clientError(
          "rooms_agent_not_configured",
          "Rooms Agent bearer authentication is not configured.",
        );
      }
      const read = isReadTool(tool);
      if (!read && options.profile !== "read_write") {
        return yield* clientError(
          "capability_denied",
          "A read_write Rooms Agent credential is required for work tools.",
          { status: 403 },
        );
      }
      let request = requestForTool(roomsBaseUrl.baseUrl!, tool, input).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(options.bearerToken),
      );
      if (!read) {
        const invocationId = options.invocationId;
        const connectorId = options.connectorId;
        const epoch = options.configurationEpoch;
        if (!invocationId || !connectorId || epoch === undefined || epoch < 1) {
          return yield* clientError(
            "rooms_agent_invocation_required",
            "Rooms Agent work tools require a live server invocation envelope.",
            { status: 409 },
          );
        }
        const toolCallId = yield* makeToolCallId(crypto, invocationId, tool, input);
        request = request.pipe(
          HttpClientRequest.setHeader("x-rooms-invocation-id", invocationId),
          HttpClientRequest.setHeader("x-rooms-tool-call-id", toolCallId),
          HttpClientRequest.setHeader("x-rooms-connector-id", connectorId),
          HttpClientRequest.setHeader("x-rooms-configuration-epoch", String(epoch)),
        );
      }
      const response = yield* httpClient.execute(request).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.mapError(() =>
          clientError("rooms_agent_unavailable", "Rooms Agent request failed.", {
            retryable: true,
          }),
        ),
      );
      return yield* decodeResponse(tool, response);
    },
  );

  return RoomsAgentClient.of({ profile: options.profile, invoke });
});

export const layer = (options: RoomsAgentClientOptions) =>
  Layer.effect(RoomsAgentClient, make(options));

const EnvConfig = Config.all({
  baseUrl: Config.string("ROOMS_AGENT_BASE_URL").pipe(Config.withDefault("http://127.0.0.1:3000")),
  bearerToken: Config.redacted("ROOMS_AGENT_BEARER_TOKEN").pipe(Config.option),
  profile: Config.string("ROOMS_AGENT_PROFILE").pipe(Config.withDefault("read_only")),
  invocationId: Config.string("ROOMS_AGENT_INVOCATION_ID").pipe(Config.option),
  connectorId: Config.string("ROOMS_AGENT_CONNECTOR_ID").pipe(Config.option),
  configurationEpoch: Config.number("ROOMS_AGENT_CONFIGURATION_EPOCH").pipe(Config.option),
});

export const layerFromEnv = Layer.effect(
  RoomsAgentClient,
  Effect.gen(function* () {
    const config = yield* EnvConfig;
    const profile = yield* decodeRoomsAgentProfile(config.profile).pipe(
      Effect.mapError(() =>
        clientError(
          "rooms_agent_configuration_invalid",
          "ROOMS_AGENT_PROFILE must be read_only or read_write.",
          { status: 400 },
        ),
      ),
    );
    return yield* make({
      baseUrl: config.baseUrl,
      bearerToken: Option.isSome(config.bearerToken)
        ? Redacted.value(config.bearerToken.value)
        : undefined,
      profile,
      invocationId: Option.getOrUndefined(config.invocationId),
      connectorId: Option.getOrUndefined(config.connectorId),
      configurationEpoch: Option.getOrUndefined(config.configurationEpoch),
    });
  }),
);
