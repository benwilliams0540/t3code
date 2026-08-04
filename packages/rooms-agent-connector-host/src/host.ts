// @effect-diagnostics globalDate:off globalTimers:off globalFetch:off nodeBuiltinImport:off - This executable owns its process runtime boundaries.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeTimers from "node:timers";

import {
  OpenClawGatewayTransport,
  RoomsInvocationHttpClient,
  RoomsResidentAgentConnector,
  RoomsResidentAgentConsumer,
  RoomsServerClientError,
  RoomsServerInvocationMappingStore,
  SqliteInvocationStore,
  makeRoomsAgentClientFactory,
  type RoomsResidentConsumerOutcome,
} from "@t3tools/rooms-agent-connector";

import {
  ensureStateDirectory,
  readOpenClawGatewayToken,
  readRoomsBearer,
  type ResidentHostConfig,
} from "./config.ts";
import { DeliveryCursorStore } from "./cursorStore.ts";
import {
  AgentDeliveryHttpClient,
  DeliveryClientError,
  type AgentDeliveryPage,
  toInboundEvent,
} from "./deliveryClient.ts";

export interface SafeHostLog {
  readonly event: string;
  readonly status: "ok" | "retry" | "failed";
  readonly code?: string;
  readonly cursor?: number;
  readonly delivered?: number;
  readonly ignored?: number;
}

export type SafeLogger = (entry: SafeHostLog) => void;

interface ConsumerLike {
  handleInbound(input: {
    readonly event: ReturnType<typeof toInboundEvent>;
    readonly environmentId: string;
    readonly projectId: string;
    readonly threadId: string;
    readonly sourceHeadSequence: number;
    readonly signal?: AbortSignal;
  }): Promise<RoomsResidentConsumerOutcome>;
}

export class ResidentHostError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "ResidentHostError";
    this.code = code;
    this.retryable = retryable;
  }
}

const assertBinding = (config: ResidentHostConfig, page: AgentDeliveryPage): void => {
  if (
    page.binding.roomId !== config.rooms.roomId ||
    page.binding.agentPrincipalId !== config.rooms.agentPrincipalId ||
    page.binding.hostMachinePrincipalId !== config.rooms.hostMachinePrincipalId ||
    page.binding.profile !== "read_write"
  ) {
    throw new ResidentHostError(
      "delivery_binding_mismatch",
      "Rooms delivery binding does not match the resident host configuration.",
    );
  }
};

export const processDeliveryPage = async (input: {
  readonly config: ResidentHostConfig;
  readonly page: AgentDeliveryPage;
  readonly expectedCursor: number;
  readonly consumer: ConsumerLike;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly nextCursor: number;
  readonly delivered: number;
  readonly ignored: number;
}> => {
  assertBinding(input.config, input.page);
  if (input.page.page.afterSeq !== input.expectedCursor) {
    throw new ResidentHostError(
      "delivery_cursor_mismatch",
      "Rooms delivery response does not start at the requested cursor.",
    );
  }
  let delivered = 0;
  let ignored = 0;
  for (const delivery of input.page.deliveries) {
    if (delivery.channelId !== input.config.rooms.channelId) {
      ignored += 1;
      continue;
    }
    const outcome = await input.consumer.handleInbound({
      event: toInboundEvent(delivery, input.config.connector.id),
      environmentId: input.config.nativeT3.environmentId,
      projectId: input.config.nativeT3.projectId,
      threadId: input.config.nativeT3.threadId,
      sourceHeadSequence: input.page.page.sourceHeadSeq,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (outcome.kind === "deferred") {
      throw new ResidentHostError(
        "delivery_deferred",
        "A prior accepted invocation is still running.",
        true,
      );
    }
    delivered += 1;
  }
  return { nextCursor: input.page.page.nextCursor, delivered, ignored };
};

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = NodeTimers.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        NodeTimers.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const retryableError = (error: unknown): { readonly retryable: boolean; readonly code: string } => {
  if (error instanceof DeliveryClientError || error instanceof RoomsServerClientError) {
    return { retryable: error.retryable, code: error.code };
  }
  if (error instanceof ResidentHostError) {
    return { retryable: error.retryable, code: error.code };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return { retryable: false, code: error.code };
  }
  return { retryable: false, code: "resident_host_internal" };
};

export interface ResidentHostReadiness {
  readonly ready: true;
  readonly roomId: string;
  readonly channelId: string;
  readonly agentPrincipalId: string;
  readonly hostMachinePrincipalId: string;
  readonly cursor: number;
  readonly gatewayVersion?: string;
}

export class ResidentConnectorHost {
  readonly #config: ResidentHostConfig;
  readonly #logger: SafeLogger;
  readonly #bearer: string;
  readonly #cursorStore: DeliveryCursorStore;
  readonly #connectorStore: SqliteInvocationStore;
  readonly #mappingStore: RoomsServerInvocationMappingStore;
  readonly #deliveryClient: AgentDeliveryHttpClient;
  readonly #fetch: typeof globalThis.fetch;
  readonly #transport: OpenClawGatewayTransport;
  readonly #consumer: RoomsResidentAgentConsumer;
  #closed = false;

  constructor(input: {
    readonly config: ResidentHostConfig;
    readonly logger?: SafeLogger;
    readonly fetch?: typeof globalThis.fetch;
  }) {
    this.#config = input.config;
    this.#logger = input.logger ?? (() => undefined);
    this.#fetch = input.fetch ?? globalThis.fetch;
    ensureStateDirectory(input.config.stateDirectory);
    this.#bearer = readRoomsBearer(input.config.rooms.bearerTokenFile);
    const paths = {
      cursor: NodePath.join(input.config.stateDirectory, "delivery-cursor.sqlite"),
      connector: NodePath.join(input.config.stateDirectory, "connector.sqlite"),
      mapping: NodePath.join(input.config.stateDirectory, "server-mappings.sqlite"),
    };
    this.#cursorStore = new DeliveryCursorStore(paths.cursor);
    this.#connectorStore = new SqliteInvocationStore(paths.connector);
    this.#mappingStore = new RoomsServerInvocationMappingStore(paths.mapping);
    NodeFS.chmodSync(paths.connector, 0o600);
    NodeFS.chmodSync(paths.mapping, 0o600);
    this.#connectorStore.provisionBinding({
      connectorId: input.config.connector.id,
      connectorVersion: input.config.connector.version,
      roomId: input.config.rooms.roomId,
      channelId: input.config.rooms.channelId,
      agentPrincipalId: input.config.rooms.agentPrincipalId,
      openClawHostId: input.config.openClaw.hostId,
      openClawAgentId: input.config.openClaw.agentId,
      enabled: true,
      configVersion: input.config.connector.configurationEpoch,
    });
    this.#deliveryClient = new AgentDeliveryHttpClient({
      baseUrl: input.config.rooms.baseUrl,
      bearerToken: this.#bearer,
      ...(input.fetch ? { fetch: input.fetch } : {}),
    });
    this.#transport = new OpenClawGatewayTransport({
      url: input.config.openClaw.gatewayUrl,
      getToken: async () => readOpenClawGatewayToken(input.config.openClaw.configFile),
      hostId: input.config.openClaw.hostId,
      agentId: input.config.openClaw.agentId,
      clientVersion: "1.0.0",
      platform: "linux-arm64",
    });
    const connector = new RoomsResidentAgentConnector({
      store: this.#connectorStore,
      transport: this.#transport,
    });
    const invocations = new RoomsInvocationHttpClient({
      baseUrl: input.config.rooms.baseUrl,
      bearerToken: this.#bearer,
      ...(input.fetch ? { fetch: input.fetch } : {}),
    });
    this.#consumer = new RoomsResidentAgentConsumer({
      invocations,
      mappingStore: this.#mappingStore,
      connectorStore: this.#connectorStore,
      connector,
      roomsClientFactory: makeRoomsAgentClientFactory({
        baseUrl: input.config.rooms.baseUrl,
        bearerToken: this.#bearer,
      }),
    });
  }

  async check(signal?: AbortSignal): Promise<ResidentHostReadiness> {
    const cursor = this.#cursorStore.peek() ?? this.#config.delivery.initialCursor;
    let rails: Response;
    try {
      rails = await this.#fetch(`${this.#config.rooms.baseUrl}/up`, {
        method: "GET",
        ...(signal ? { signal } : {}),
      });
    } catch {
      throw new ResidentHostError("rails_unavailable", "Rooms Rails health check failed.", true);
    }
    if (!rails.ok) {
      throw new ResidentHostError("rails_unavailable", "Rooms Rails is not healthy.", true);
    }
    const page = await this.#deliveryClient.wait(cursor, 1_000, signal);
    assertBinding(this.#config, page);
    const health = await this.#transport.health();
    if (!health.available) {
      throw new ResidentHostError("gateway_unavailable", "OpenClaw Gateway is unavailable.", true);
    }
    return {
      ready: true,
      roomId: page.binding.roomId,
      channelId: this.#config.rooms.channelId,
      agentPrincipalId: page.binding.agentPrincipalId,
      hostMachinePrincipalId: page.binding.hostMachinePrincipalId,
      cursor,
      ...(health.version === undefined ? {} : { gatewayVersion: health.version }),
    };
  }

  async run(signal: AbortSignal, once = false): Promise<void> {
    let cursor = this.#cursorStore.initialize(this.#config.delivery.initialCursor);
    while (!signal.aborted) {
      try {
        const page = await this.#deliveryClient.wait(
          cursor,
          this.#config.delivery.timeoutMs,
          signal,
        );
        if (signal.aborted) break;
        const handled = await processDeliveryPage({
          config: this.#config,
          page,
          expectedCursor: cursor,
          consumer: this.#consumer,
          signal,
        });
        cursor = this.#cursorStore.checkpoint(cursor, handled.nextCursor);
        this.#logger({
          event: "delivery_cycle",
          status: "ok",
          cursor,
          delivered: handled.delivered,
          ignored: handled.ignored,
        });
        if (once) return;
      } catch (error) {
        if (signal.aborted) break;
        const safe = retryableError(error);
        this.#logger({
          event: "delivery_cycle",
          status: safe.retryable ? "retry" : "failed",
          code: safe.code,
          cursor,
        });
        if (!safe.retryable) throw error;
        await delay(this.#config.delivery.retryDelayMs, signal);
        if (once) throw error;
      }
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#mappingStore.close();
    this.#connectorStore.close();
    this.#cursorStore.close();
  }
}
