import type {
  GatewayHealth,
  GatewayInvocationOptions,
  GatewayResumeOptions,
  GatewayRunOutcome,
  ResidentAgentGatewayTransport,
} from "../src/gatewayTransport.ts";
import type { ResidentAgentInvocation } from "../src/contracts.ts";

export class FakeGatewayTransport implements ResidentAgentGatewayTransport {
  readonly invocations: ResidentAgentInvocation[] = [];
  readonly resumed: Array<{
    readonly invocation: ResidentAgentInvocation;
    readonly runId: string;
  }> = [];
  healthResult: GatewayHealth = { available: true, version: "fake-1" };
  nextOutcome: GatewayRunOutcome = { status: "completed", replyMarkdown: "Fake reply." };
  nextError: Error | undefined;
  invokeHook: (() => void | Promise<void>) | undefined;

  async health(): Promise<GatewayHealth> {
    return this.healthResult;
  }

  async invoke(
    invocation: ResidentAgentInvocation,
    options: GatewayInvocationOptions,
  ): Promise<GatewayRunOutcome> {
    this.invocations.push(invocation);
    await options.onAccepted(`run-${invocation.invocationId}`);
    await this.invokeHook?.();
    if (this.nextError) throw this.nextError;
    return this.nextOutcome;
  }

  async resume(
    invocation: ResidentAgentInvocation,
    runId: string,
    _options?: GatewayResumeOptions,
  ): Promise<GatewayRunOutcome> {
    this.resumed.push({ invocation, runId });
    if (this.nextError) throw this.nextError;
    return this.nextOutcome;
  }
}
