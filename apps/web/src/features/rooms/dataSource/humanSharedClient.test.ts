import { describe, expect, it } from "vite-plus/test";
import { RoomsAuthenticationError } from "~/cloud/roomsAuth";

import {
  createRoomsHumanClient,
  validateRoomsHumanOpaqueCredential,
  type RoomsHumanTransport,
} from "./humanSharedClient";

const roomId = "room:0198f7e2-1234-789a-8abc-123456789abc";
const principalId = "h:0198f7e2-1234-789a-8abc-123456789abc";
const contract = {
  id: "rooms.human-shared",
  version: 1,
  schema_uri: "contracts/rooms/human-shared/v1/schema.json",
} as const;

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return { status, headers, body: JSON.stringify(body) };
}

describe("authenticated shared Rooms client", () => {
  it("refreshes the dedicated bearer for ordinary and long-poll requests", async () => {
    const requests: Parameters<RoomsHumanTransport["request"]>[0][] = [];
    let tokenRead = 0;
    const client = createRoomsHumanClient(
      "https://rooms.example.test",
      async () => `rooms-token-${++tokenRead}`,
      () => ({
        request: async (request) => {
          requests.push(request);
          return request.path.endsWith("/session")
            ? response({ contract, status: "ready", principal: null, rooms: [] })
            : response({
                contract,
                room_id: roomId,
                after_seq: 0,
                head_seq: 0,
                changed: false,
                reason: "timeout",
              });
        },
      }),
    );

    await client.getSession();
    await client.waitForChanges(roomId, { afterSeq: 0, timeoutMs: 1_000 });

    expect(requests.map((request) => request.bearer)).toEqual(["rooms-token-1", "rooms-token-2"]);
    expect(requests.map((request) => request.baseUrl)).toEqual([
      "https://rooms.example.test",
      "https://rooms.example.test",
    ]);
    expect(requests[1]?.path).toContain("/rooms/human/v1/rooms/");
    expect(
      JSON.stringify(requests.map(({ bearer: _bearer, ...request }) => request)),
    ).not.toContain("rooms-token");
  });

  it("keeps invite inspection and redemption explicit and role-bound", async () => {
    const paths: string[] = [];
    const token = `rhi1_${"a".repeat(43)}`;
    const room = { id: roomId, slug: "shared-room", name: "Shared room", locality: "shared" };
    const principal = {
      id: principalId,
      type: "human",
      display_name: "Human A",
      role: "operator",
    };
    const client = createRoomsHumanClient(
      "http://127.0.0.1:33102",
      async () => "bearer",
      () => ({
        request: async (request) => {
          paths.push(request.path);
          return request.path.endsWith("invite-inspections")
            ? response({
                contract,
                status: "invited",
                room,
                role: "operator",
                expires_at: "2026-08-04T01:00:00Z",
              })
            : response({ contract, status: "ready", room, principal }, 201);
        },
      }),
    );

    expect((await client.inspectInvite(roomId, token)).role).toBe("operator");
    expect((await client.redeemInvite(roomId, token)).principal.id).toBe(principalId);
    expect(paths).toEqual([
      "/rooms/human/v1/invite-inspections",
      "/rooms/human/v1/invite-redemptions",
    ]);
  });

  it("creates an opaque role-bound invite and reports idempotency replay", async () => {
    const token = `rhi1_${"b".repeat(43)}`;
    const client = createRoomsHumanClient(
      "http://127.0.0.1:33102",
      async () => "bearer",
      () => ({
        request: async (request) => {
          expect(request.path).toBe(`/rooms/human/v1/rooms/${encodeURIComponent(roomId)}/invites`);
          expect(JSON.parse(request.body ?? "{}")).toMatchObject({ role: "operator" });
          return response(
            {
              contract,
              status: "invited",
              room_id: roomId,
              invite_token: token,
              role: "operator",
              expires_at: "2026-08-04T01:00:00Z",
            },
            200,
            { "idempotency-replayed": "true" },
          );
        },
      }),
    );

    const result = await client.createInvite(roomId, {
      requestId: "0198f7e2-1234-789a-8abc-123456789abe",
      role: "operator",
    });
    expect(result.value.invite_token).toBe(token);
    expect(result.replayed).toBe(true);
  });

  it("rejects form credentials that could become headers or unbounded state", () => {
    expect(validateRoomsHumanOpaqueCredential("rhb1_valid")).toBe("rhb1_valid");
    expect(() => validateRoomsHumanOpaqueCredential("invite\r\nnext")).toThrow(
      "missing or invalid",
    );
    expect(() => validateRoomsHumanOpaqueCredential("x".repeat(513))).toThrow("missing or invalid");
  });

  it("rejects a response that completes after the authentication generation changes", async () => {
    let resolveResponse!: (value: ReturnType<typeof response>) => void;
    const pending = new Promise<ReturnType<typeof response>>((resolve) => {
      resolveResponse = resolve;
    });
    let current = true;
    const client = createRoomsHumanClient(
      "https://rooms.example.test",
      async () => "bearer",
      () => ({ request: async () => pending }),
      () => {
        if (!current) throw new RoomsAuthenticationError("rooms_auth_unavailable");
      },
    );

    const result = client.getSession();
    current = false;
    resolveResponse(response({ contract, status: "ready", principal: null, rooms: [] }));
    await expect(result).rejects.toMatchObject({ code: "rooms_auth_unavailable", status: 401 });
  });
});
