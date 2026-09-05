import type { RoomsHumanHttpRequest } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createRoomsLocalAuthClient } from "./localAuthClient";
import { RoomsLocalClientError } from "./localChannelsClient";

const contract = {
  id: "rooms.local-auth",
  version: 1,
  schema_uri: "contracts/rooms/local-auth/v1/schema.json",
};
const room = {
  id: "room:0198f7e2-1234-789a-8abc-123456789abc",
  slug: "splats",
  name: "Splats",
  locality: "shared",
};
const signedIn = {
  contract,
  status: "signed_in",
  server: { id: "srv:0198f7e2-1234-789a-8abc-123456789abd" },
  account: {
    id: "acct:0198f7e2-1234-789a-8abc-123456789abe",
    username: "ben",
    display_name: "Ben",
  },
  principal: { id: "h:0198f7e2-1234-789a-8abc-123456789abf", type: "human", display_name: "Ben" },
  session: {
    id: "sess:0198f7e2-1234-789a-8abc-123456789ac0",
    token: "rhs1_x",
    expires_at: "2026-12-04T00:00:00.000Z",
  },
};

function transportRecording(body: unknown, status = 201) {
  const requests: RoomsHumanHttpRequest[] = [];
  const client = createRoomsLocalAuthClient("https://rooms.tailnet.example/", () => ({
    request: async (request) => {
      requests.push(request);
      return { status, headers: {}, body: JSON.stringify(body) };
    },
  }));
  return { client, requests };
}

describe("local auth client", () => {
  it("discovers the provider without a bearer", async () => {
    const { client, requests } = transportRecording(
      { contract, provider: "local", server: null, setup_required: true },
      200,
    );
    const provider = await client.getAuthProvider();
    expect(provider).toMatchObject({ provider: "local", setup_required: true, server: null });
    expect(requests[0]).toEqual({
      baseUrl: "https://rooms.tailnet.example",
      path: "/rooms/human/v1/auth-provider",
      method: "GET",
    });
    expect(requests[0]).not.toHaveProperty("bearer");
  });

  it("enrolls with the exact body and checks the returned room", async () => {
    const { client, requests } = transportRecording({ ...signedIn, room, role: "operator" });
    const result = await client.enroll({
      roomId: room.id,
      inviteToken: "rhi1_invite",
      username: "ben",
      password: "ben's long passphrase",
      displayName: "Ben",
      deviceLabel: "Pixel",
    });
    expect(result.session.token).toBe("rhs1_x");
    expect(JSON.parse(requests[0]!.body!)).toEqual({
      room_id: room.id,
      invite_token: "rhi1_invite",
      username: "ben",
      password: "ben's long passphrase",
      display_name: "Ben",
      device_label: "Pixel",
    });
    expect(requests[0]!.path).toBe("/rooms/human/v1/local/enrollments");

    const mismatch = transportRecording({
      ...signedIn,
      room: { ...room, id: "room:0198f7e2-1234-789a-8abc-000000000000" },
      role: "operator",
    });
    await expect(
      mismatch.client.enroll({
        roomId: room.id,
        inviteToken: "rhi1_invite",
        username: "ben",
        password: "ben's long passphrase",
        displayName: "Ben",
      }),
    ).rejects.toMatchObject({ code: "local_enrollment_room_mismatch" });
  });

  it("surfaces stable server errors and rejects malformed one-time credentials locally", async () => {
    const { client, requests } = transportRecording(
      {
        error: "local_credentials_invalid",
        message: "username or password is incorrect",
        request_id: "r",
        details: {},
      },
      401,
    );
    await expect(client.signIn({ username: "monroe", password: "wrong" })).rejects.toMatchObject({
      code: "local_credentials_invalid",
      status: 401,
    });
    expect(requests[0]!.path).toBe("/rooms/human/v1/local/sessions");
    await expect(
      client.setUp({ setupToken: " padded ", username: "m", password: "p", displayName: "M" }),
    ).rejects.toBeInstanceOf(RoomsLocalClientError);
    expect(requests).toHaveLength(1);
  });

  it("signs out with the bearer it was given", async () => {
    const { client, requests } = transportRecording({ contract, status: "signed_out" }, 200);
    await client.signOut("rhs1_x");
    expect(requests[0]).toMatchObject({
      path: "/rooms/human/v1/local/sign-out",
      method: "POST",
      bearer: "rhs1_x",
    });
  });

  it("refuses non-HTTPS non-loopback servers before any request", async () => {
    const client = createRoomsLocalAuthClient("http://192.168.1.20:3000", () => {
      throw new Error("must not be called");
    });
    await expect(client.getAuthProvider()).rejects.toMatchObject({
      code: "invalid_human_api_base_url",
    });
  });
});
