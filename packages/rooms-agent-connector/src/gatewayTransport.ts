import type {
  OpenClawSessionBinding,
  ResidentAgentFailure,
  ResidentAgentInvocation,
  ResidentAgentResultStatus,
} from "./contracts.ts";

export interface GatewayHealth {
  readonly available: boolean;
  readonly continuationSupported?: boolean;
  readonly version?: string;
  readonly safeMessage?: string;
}

export interface GatewayRunOutcome {
  readonly status: ResidentAgentResultStatus;
  readonly replyMarkdown?: string;
  readonly failure?: ResidentAgentFailure;
  readonly agentVersion?: string;
}

export interface GatewayInvocationOptions {
  readonly signal?: AbortSignal;
  readonly abortMode?: "cancel" | "detach";
  readonly onAccepted: (runId: string) => void | Promise<void>;
}

export interface GatewayResumeOptions {
  readonly signal?: AbortSignal;
  readonly abortMode?: "cancel" | "detach";
}

export interface ResidentAgentGatewayTransport {
  readonly health: () => Promise<GatewayHealth>;
  readonly initializeSession?: (input: {
    readonly bindingId: string;
    readonly conversationId: string;
    readonly sessionKey: string;
  }) => Promise<OpenClawSessionBinding>;
  readonly invoke: (
    invocation: ResidentAgentInvocation,
    options: GatewayInvocationOptions,
  ) => Promise<GatewayRunOutcome>;
  readonly resume: (
    invocation: ResidentAgentInvocation,
    runId: string,
    options?: GatewayResumeOptions,
  ) => Promise<GatewayRunOutcome>;
}

export type GatewayTransportErrorKind =
  | "unavailable"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "uncertain";

export class GatewayTransportError extends Error {
  readonly kind: GatewayTransportErrorKind;
  readonly code: string;
  readonly retryable: boolean;
  readonly runStopped: boolean;

  constructor(input: {
    readonly kind: GatewayTransportErrorKind;
    readonly code: string;
    readonly safeMessage: string;
    readonly retryable: boolean;
    readonly cause?: unknown;
    readonly runStopped?: boolean;
  }) {
    // Keep underlying errors out of the public object: token providers and socket stacks may
    // include credential-bearing detail. The typed safe fields are the only logging surface.
    super(input.safeMessage);
    this.name = "GatewayTransportError";
    this.kind = input.kind;
    this.code = input.code;
    this.retryable = input.retryable;
    this.runStopped = input.runStopped ?? false;
  }
}
