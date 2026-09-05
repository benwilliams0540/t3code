import type { RoomsHumanHttpRequest, RoomsHumanHttpResponse } from "@t3tools/contracts";
import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";
import * as Schema from "effect/Schema";

import {
  decodeRoomsHumanResponse,
  defaultRoomsHumanTransport,
  type RoomsHumanTransport,
} from "./humanSharedClient";
import {
  RoomsLocalAuthProvider,
  RoomsLocalAuthSignedIn,
  RoomsLocalAuthSignedOut,
} from "./localAuthContract";
import { RoomsLocalClientError } from "./localChannelsClient";

export interface RoomsLocalSetupInput {
  readonly setupToken: string;
  readonly username: string;
  readonly password: string;
  readonly displayName: string;
  readonly deviceLabel?: string;
}

export interface RoomsLocalSignInInput {
  readonly username: string;
  readonly password: string;
  readonly deviceLabel?: string;
}

export interface RoomsLocalEnrollInput {
  readonly roomId: string;
  readonly inviteToken: string;
  readonly username: string;
  readonly password: string;
  readonly displayName: string;
  readonly deviceLabel?: string;
}

export interface RoomsLocalPasswordResetInput {
  readonly resetToken: string;
  readonly password: string;
  readonly deviceLabel?: string;
}

// The sign-in half of a self-hosted server. Nothing here carries a bearer except
// sign-out, and every credential in an input lives only for the request.
export interface RoomsLocalAuthClient {
  readonly getAuthProvider: () => Promise<RoomsLocalAuthProvider>;
  readonly setUp: (input: RoomsLocalSetupInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly signIn: (input: RoomsLocalSignInInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly enroll: (input: RoomsLocalEnrollInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly resetPassword: (input: RoomsLocalPasswordResetInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly signOut: (bearer: string) => Promise<RoomsLocalAuthSignedOut>;
}

const decoders = {
  provider: Schema.decodeUnknownSync(RoomsLocalAuthProvider),
  signedIn: Schema.decodeUnknownSync(RoomsLocalAuthSignedIn),
  signedOut: Schema.decodeUnknownSync(RoomsLocalAuthSignedOut),
};

export function validateRoomsLocalOpaqueCredential(value: string): string {
  if (value.trim() === "" || value !== value.trim() || /[\r\n]/.test(value) || value.length > 512) {
    throw new RoomsLocalClientError({
      kind: "invalid_configuration",
      code: "invalid_local_credential",
      message: "The one-time server credential is missing or invalid.",
    });
  }
  return value;
}

function optionalDeviceLabel(deviceLabel: string | undefined): Record<string, string> {
  return deviceLabel === undefined ? {} : { device_label: deviceLabel };
}

export function createRoomsLocalAuthClient(
  configuredBaseUrl: string,
  transportFactory: () => RoomsHumanTransport = defaultRoomsHumanTransport,
): RoomsLocalAuthClient {
  const normalizedBaseUrl = normalizeRoomsOrigin("shared", configuredBaseUrl);

  async function request(
    path: string,
    method: "GET" | "POST",
    body?: Readonly<Record<string, unknown>>,
    bearer?: string,
  ): Promise<RoomsHumanHttpResponse> {
    if (normalizedBaseUrl === null) {
      throw new RoomsLocalClientError({
        kind: "invalid_configuration",
        code: "invalid_human_api_base_url",
        message: "Use an HTTPS origin or HTTP loopback origin for the Threadspace server.",
      });
    }
    const httpRequest: RoomsHumanHttpRequest = {
      baseUrl: normalizedBaseUrl,
      path,
      method,
      ...(bearer === undefined ? {} : { bearer }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    try {
      return await transportFactory().request(httpRequest);
    } catch (cause) {
      if (cause instanceof RoomsLocalClientError) throw cause;
      throw new RoomsLocalClientError({
        kind: "transport",
        code: "human_api_unreachable",
        message: `Could not reach the Threadspace server at ${normalizedBaseUrl}.`,
      });
    }
  }

  const signedIn = async (
    path: string,
    body: Readonly<Record<string, unknown>>,
  ): Promise<RoomsLocalAuthSignedIn> =>
    decodeRoomsHumanResponse(await request(path, "POST", body), decoders.signedIn);

  return {
    getAuthProvider: async () =>
      decodeRoomsHumanResponse(
        await request("/rooms/human/v1/auth-provider", "GET"),
        decoders.provider,
      ),
    setUp: async (input) =>
      signedIn("/rooms/human/v1/local/setup-redemptions", {
        setup_token: validateRoomsLocalOpaqueCredential(input.setupToken),
        username: input.username,
        password: input.password,
        display_name: input.displayName,
        ...optionalDeviceLabel(input.deviceLabel),
      }),
    signIn: async (input) =>
      signedIn("/rooms/human/v1/local/sessions", {
        username: input.username,
        password: input.password,
        ...optionalDeviceLabel(input.deviceLabel),
      }),
    enroll: async (input) => {
      const result = await signedIn("/rooms/human/v1/local/enrollments", {
        room_id: input.roomId,
        invite_token: validateRoomsLocalOpaqueCredential(input.inviteToken),
        username: input.username,
        password: input.password,
        display_name: input.displayName,
        ...optionalDeviceLabel(input.deviceLabel),
      });
      if (result.room?.id !== input.roomId) {
        throw new RoomsLocalClientError({
          kind: "invalid_response",
          status: 200,
          code: "local_enrollment_room_mismatch",
          message: "The enrollment response does not match the requested room.",
        });
      }
      return result;
    },
    resetPassword: async (input) =>
      signedIn("/rooms/human/v1/local/password-reset-redemptions", {
        reset_token: validateRoomsLocalOpaqueCredential(input.resetToken),
        password: input.password,
        ...optionalDeviceLabel(input.deviceLabel),
      }),
    signOut: async (bearer) =>
      decodeRoomsHumanResponse(
        await request("/rooms/human/v1/local/sign-out", "POST", {}, bearer),
        decoders.signedOut,
      ),
  };
}
