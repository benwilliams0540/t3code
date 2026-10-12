import { describe, expect, it, vi } from "vite-plus/test";

import {
  RoomsConnection,
  type RoomsConnectionAdapter,
  type RoomsConnectionIdentity,
} from "./connection.ts";

const room = (id: string) => ({ id, slug: id, name: id, role: "operator" as const });
type Session = { readonly rooms: readonly ReturnType<typeof room>[] };
type Workspace = { readonly room: { readonly id: string } };
const shared: RoomsConnectionIdentity = {
  source: "shared",
  server: "https://rooms.example",
  accountId: "account-a",
  authenticationGeneration: 1,
  authenticationStatus: "signed-in",
  configured: true,
};
const local: RoomsConnectionIdentity = {
  ...shared,
  source: "local",
  server: "http://localhost:3000",
  accountId: null,
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function adapter(
  rooms = [room("first"), room("second")],
): RoomsConnectionAdapter<Session, Workspace> {
  return {
    discover: async () => ({ session: { rooms }, rooms }),
    loadWorkspace: async (id) => ({ room: { id } }),
    workspaceRoomId: (workspace) => workspace.room.id,
  };
}

describe("shared Rooms connection ownership", () => {
  it("preserves explicit source selection across a mode detour and clears it for another server/account", async () => {
    const selected = vi.fn();
    const connection = new RoomsConnection<Session, Workspace>({
      selected: { shared: "second" },
      onSelection: selected,
    });
    connection.configure(shared, adapter());
    await connection.refresh();
    expect(connection.getSnapshot().selectedRoomId).toBe("second");
    connection.configure(local, adapter([room("local")]));
    await connection.refresh();
    connection.configure(shared, adapter());
    await connection.refresh();
    expect(connection.getSnapshot().selectedRoomId).toBe("second");
    connection.configure(
      { ...shared, accountId: "account-b", authenticationGeneration: 2 },
      adapter(),
    );
    await connection.refresh();
    expect(connection.getSnapshot().selectedRoomId).toBe("first");
    expect(selected).toHaveBeenCalledWith("shared", null);
  });

  it("rejects late discovery/workspace results after source, account and selection changes", async () => {
    const discovery = deferred<{ session: Session; rooms: Session["rooms"] }>();
    const first = adapter();
    const connection = new RoomsConnection<Session, Workspace>();
    connection.configure(shared, { ...first, discover: () => discovery.promise });
    const pending = connection.refresh();
    connection.configure(local, adapter([room("local")]));
    await connection.refresh();
    discovery.resolve({ session: { rooms: [room("old")] }, rooms: [room("old")] });
    await pending;
    expect(connection.getSnapshot().selectedRoomId).toBe("local");
    const workspace = deferred<Workspace>();
    connection.configure(shared, {
      ...first,
      loadWorkspace: (id) =>
        id === "first" ? workspace.promise : first.loadWorkspace(id, connection.capture()),
    });
    const loading = connection.refresh();
    await Promise.resolve();
    connection.configure({ ...shared, authenticationStatus: "signed-out", accountId: null }, first);
    workspace.resolve({ room: { id: "first" } });
    await loading;
    expect(connection.getSnapshot().status).toBe("signed-out");
    expect(connection.getSnapshot().workspace).toBeNull();
  });

  it("serializes ownership of superseded startup completions and stops room subscriptions on suspension", async () => {
    const old = deferred<{ session: Session; rooms: Session["rooms"] }>();
    const next = deferred<{ session: Session; rooms: Session["rooms"] }>();
    const starts: string[] = [];
    const stop = vi.fn();
    const discover = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const connection = new RoomsConnection<Session, Workspace>({
      loadSelectedWorkspace: false,
      liveRooms: "all",
      createLiveSubscription: () => ({ start: (id) => starts.push(id), stop }),
    });
    connection.configure(shared, { ...adapter(), discover });
    const first = connection.refresh();
    const second = connection.refresh();
    next.resolve({ session: { rooms: [room("new")] }, rooms: [room("new")] });
    await second;
    old.resolve({ session: { rooms: [room("old")] }, rooms: [room("old")] });
    await first;
    expect(starts).toEqual(["new"]);
    connection.setActive(false);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keeps a ready projection on a transient refresh failure and guards commands issued under old identity", async () => {
    const connection = new RoomsConnection<Session, Workspace>();
    connection.configure(shared, adapter());
    await connection.refresh();
    const previous = connection.getSnapshot().workspace;
    connection.configure(shared, {
      ...adapter(),
      discover: async () => {
        throw new Error("offline");
      },
    });
    expect(await connection.refresh(null, true)).toBeNull();
    expect(connection.getSnapshot().workspace).toBe(previous);
    const reply = deferred<string>();
    const command = connection.run(() => reply.promise);
    connection.configure({ ...shared, server: "https://another.example" }, adapter());
    reply.resolve("accepted on original server");
    await expect(command).rejects.toMatchObject({ code: "rooms_connection_changed" });
  });

  it("stops previously authorized subscriptions when discovery loses membership", async () => {
    const stop = vi.fn();
    const connection = new RoomsConnection<Session, Workspace>({
      loadSelectedWorkspace: false,
      createLiveSubscription: () => ({ start: () => undefined, stop }),
    });
    connection.configure(shared, adapter());
    await connection.refresh();
    connection.configure(shared, adapter([]));
    await connection.refresh(null, true);
    expect(connection.getSnapshot().status).toBe("authenticated-nonmember");
    expect(stop).toHaveBeenCalledOnce();
  });
});
