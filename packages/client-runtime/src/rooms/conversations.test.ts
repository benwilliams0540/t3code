import { describe, expect, it } from "vite-plus/test";
import list from "./fixtures/conversations-v2-list.json" with { type: "json" };
import projection from "./fixtures/conversations-v2.json" with { type: "json" };
import created from "./fixtures/conversations-v2-created.json" with { type: "json" };
import message from "./fixtures/conversation-message-v2.json" with { type: "json" };
import feed from "./fixtures/conversation-feed-v2.json" with { type: "json" };
import { RoomsConversations } from "./conversations.ts";
import { createRoomsConversationClient } from "./conversationClient.ts";
import type { RoomsConnectionRequest } from "./connection.ts";
const request: RoomsConnectionRequest = {
  source: "shared",
  server: "https://rooms.test",
  accountId: "account:first",
  authenticationGeneration: 1,
  authenticationStatus: "signed-in",
  configured: true,
  generation: 1,
};
const { room_id: room, channel_id: channel, id } = projection.conversation;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

describe("shared human conversation projection/command ownership", () => {
  it("retains a stable ID for an uncertain write and loads its pinned forward snapshot", async () => {
    const ids: unknown[] = [];
    const pages: string[] = [];
    let fail = true;
    const client = createRoomsConversationClient(async (path, method, decode, body) => {
      if (method === "POST") {
        ids.push(body?.request_id);
        if (fail) {
          fail = false;
          throw new Error("uncertain");
        }
        return decode(message);
      }
      if (path.includes("/messages?")) {
        pages.push(path);
        return decode(
          pages.length % 2
            ? {
                ...feed,
                items: [feed.items[0]],
                page_info: { ...feed.page_info, after_seq: 0, next_cursor: 11, has_more: true },
              }
            : {
                ...feed,
                items: feed.items.slice(1),
                page_info: { ...feed.page_info, after_seq: 11 },
              },
        );
      }
      return decode(path.endsWith("/conversations") ? list : projection);
    });
    let next = 0;
    const owner = new RoomsConversations({
      clientFor: () => client,
      isCurrent: () => true,
      createRequestId: () => `id:${++next}`,
    });
    owner.configure(room, channel, request);
    await owner.refresh();
    await owner.select(id);
    expect(owner.getSnapshot().feed?.items).toEqual(feed.items);
    await expect(owner.send(message.item.payload.body_markdown)).rejects.toThrow("uncertain");
    await owner.send(message.item.payload.body_markdown);
    expect(ids).toEqual(["id:1", "id:1"]);
    expect(pages[1]).toContain("after_seq=11&snapshot_head_seq=17");
  });
  it("does not publish an old command reply or clear the newer account's pending attempt", async () => {
    const old = deferred<unknown>();
    const newer = deferred<unknown>();
    let sends = 0;
    const client = createRoomsConversationClient(async (path, method, decode) => {
      if (method === "POST") return decode(await (++sends === 1 ? old.promise : newer.promise));
      return decode(
        path.endsWith("/conversations") ? list : path.includes("/messages?") ? feed : projection,
      );
    });
    const owner = new RoomsConversations({
      clientFor: () => client,
      isCurrent: () => true,
      createRequestId: () => "scoped-id",
    });
    owner.configure(room, channel, request);
    await owner.refresh();
    const first = owner.create("Build plan");
    owner.configure(room, channel, { ...request, accountId: "account:second", generation: 2 });
    await owner.refresh();
    const second = owner.create("Build plan");
    old.resolve(created);
    await expect(first).rejects.toThrow("changed");
    expect(owner.getSnapshot().pending).toBe(true);
    expect(owner.getSnapshot().selectedId).toBeNull();
    newer.resolve(created);
    await second;
    expect(owner.getSnapshot().selectedId).toBe(id);
  });
  it("keeps the selected conversation isolated when a late follow-up resolves after selection changes", async () => {
    const pending = deferred<unknown>();
    const client = createRoomsConversationClient(async (path, method, decode) =>
      decode(
        method === "POST"
          ? await pending.promise
          : path.endsWith("/conversations")
            ? list
            : path.includes("/messages?")
              ? feed
              : projection,
      ),
    );
    const owner = new RoomsConversations({
      clientFor: () => client,
      isCurrent: () => true,
      createRequestId: () => "stable-send",
    });
    owner.configure(room, channel, request);
    await owner.refresh();
    await owner.select(id);
    const send = owner.send(message.item.payload.body_markdown);
    await owner.select(null);
    pending.resolve(message);
    await expect(send).rejects.toThrow("changed");
    expect(owner.getSnapshot().selectedId).toBeNull();
    expect(owner.getSnapshot().feed).toBeNull();
  });
});
