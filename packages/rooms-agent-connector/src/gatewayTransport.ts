import type {
  ResidentAgentFailure,
  ResidentAgentInvocation,
  ResidentAgentResultStatus,
} from "./contracts.ts";

export interface GatewayHealth {
  readonly available: boolean;
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
  readonly onAccepted: (runId: string) => void | Promise<void>;
}

export interface GatewayResumeOptions {
  readonly signal?: AbortSignal;
}

export interface ResidentAgentGatewayTransport {
  readonly health: () => Promise<GatewayHealth>;
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

export type GatewayTransportErrorKind = "unavailable" | "failed" | "timed_out" | "cancelled";

export class GatewayTransportError extends Error {
  readonly kind: GatewayTransportErrorKind;
  readonly code: string;
  readonly retryable: boolean;

  constructor(input: {
    readonly kind: GatewayTransportErrorKind;
    readonly code: string;
    readonly safeMessage: string;
    readonly retryable: boolean;
    readonly cause?: unknown;
  }) {
    // Keep underlying errors out of the public object: token providers and socket stacks may
    // include credential-bearing detail. The typed safe fields are the only logging surface.
    super(input.safeMessage);
    this.name = "GatewayTransportError";
    this.kind = input.kind;
    this.code = input.code;
    this.retryable = input.retryable;
  }
}
