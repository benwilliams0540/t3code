import { describe, expect, it, vi } from "vite-plus/test";

import { createRoomsMobileClient, RoomsMobileClientError } from "./client";

const baseUrl = "https://rooms.tail.example.test";
const roomId = "room:019fed3b-e36c-7730-aed8-4a927abc756a";
const channelId = "channel:019fed3b-e36c-7730-aed8-4a927abc756b";
const contract = {
  id: "rooms.human-shared",
  version: 1,
  schema_uri: "contracts/rooms/human-shared/v1/schema.json",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Rooms native mobile client", () => {
  it("reads a fresh bearer and decodes the pinned session contract", async () => {
    const fetchRequest = vi.fn(async () =>
      jsonResponse({
        contract,
        status: "ready",
        principal: { id: "h:ben", type: "human", display_name: "Ben", role: "admin" },
        rooms: [
          { id: roomId, slug: "dogfood", name: "Dogfood", locality: "shared", role: "admin" },
        ],
      }),
    );
    const readToken = vi.fn(async () => "fresh-bearer");
    const client = createRoomsMobileClient({ baseUrl, readToken, fetch: fetchRequest });

    await expect(client.getSession()).resolves.toMatchObject({ status: "ready" });
    expect(readToken).toHaveBeenCalledTimes(1);
    expect(fetchRequest).toHaveBeenCalledWith(
      `${baseUrl}/rooms/human/v1/session`,
      expect.objectContaining({
        credentials: "omit",
        method: "GET",
        redirect: "error",
        headers: { Authorization: "Bearer fresh-bearer" },
      }),
    );
  });

  it("sends a stable message command only through the exact room and channel route", async () => {
    const fetchRequest = vi.fn(async () =>
      jsonResponse({
        id: "feed-item:019fed3b-e36c-7730-aed8-4a927abc756c",
        room_id: roomId,
        channel_id: channelId,
        kind: "human_message",
        occurred_at: "2026-08-10T22:00:00.000Z",
        summary: "Hello from mobile",
        source_event: {
          seq: 10,
          event_id: "019fed3b-e36c-7730-aed8-4a927abc756d",
          type: "message.created",
          schema: 1,
        },
        attribution: {
          mode: "explicit_principal",
          writer_principal_id: "h:ben",
          actor_principal_id: "h:ben",
        },
        payload: { body_markdown: "Hello from mobile" },
      }),
    );
    const client = createRoomsMobileClient({
      baseUrl,
      readToken: async () => "fresh-bearer",
      fetch: fetchRequest,
    });
    const requestId = "019fed3b-e36c-7730-aed8-4a927abc756e";

    await client.createMessage(roomId, channelId, requestId, "Hello from mobile");
    expect(fetchRequest).toHaveBeenCalledWith(
      `${baseUrl}/rooms/human/v1/rooms/${encodeURIComponent(roomId)}/channels/${encodeURIComponent(channelId)}/messages`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ request_id: requestId, body_markdown: "Hello from mobile" }),
      }),
    );
  });

  it("fails closed before fetch for an invalid origin or missing token", async () => {
    const fetchRequest = vi.fn();
    const invalid = createRoomsMobileClient({
      baseUrl: "http://rooms.example.test",
      readToken: async () => "bearer",
      fetch: fetchRequest,
    });
    await expect(invalid.getSession()).rejects.toMatchObject({ code: "rooms_transport_policy" });
    expect(fetchRequest).not.toHaveBeenCalled();

    const signedOut = createRoomsMobileClient({
      baseUrl,
      readToken: async () => null,
      fetch: fetchRequest,
    });
    await expect(signedOut.getSession()).rejects.toEqual(
      new RoomsMobileClientError("rooms_signed_out", "Sign in to open Shared Rooms.", 401),
    );
  });
});
