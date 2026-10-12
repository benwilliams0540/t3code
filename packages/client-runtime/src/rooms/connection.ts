export type RoomsConnectionSource = "local" | "shared";

export function normalizeRoomsDataSourceMode(value: string): RoomsConnectionSource {
  return value === "local" ? "local" : "shared";
}

export interface RoomsConnectionRoom {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role?: "observer" | "operator" | "admin" | null;
}

export interface RoomsConnectionIdentity {
  readonly source: RoomsConnectionSource;
  readonly server: string;
  readonly accountId: string | null;
  readonly authenticationGeneration: number;
  readonly authenticationStatus: "authenticating" | "signed-out" | "signed-in";
  readonly configured: boolean;
}

export interface RoomsConnectionRequest extends RoomsConnectionIdentity {
  readonly generation: number;
}

export interface RoomsConnectionAdapter<Session, Workspace> {
  readonly discover: (request: RoomsConnectionRequest) => Promise<{
    readonly session: Session | null;
    readonly rooms: readonly RoomsConnectionRoom[];
    readonly workspace?: Workspace;
  }>;
  readonly loadWorkspace: (roomId: string, request: RoomsConnectionRequest) => Promise<Workspace>;
  readonly workspaceRoomId: (workspace: Workspace) => string;
}

export interface RoomsConnectionSnapshot<Session, Workspace> {
  readonly identity: RoomsConnectionRequest | null;
  readonly status:
    | "connecting"
    | "authenticating"
    | "signed-out"
    | "invalid-configuration"
    | "authenticated-nonmember"
    | "invited"
    | "ready"
    | "error";
  readonly session: Session | null;
  readonly rooms: readonly RoomsConnectionRoom[];
  readonly selectedRoomId: string | null;
  readonly workspace: Workspace | null;
  readonly error: unknown;
  readonly invitation?: unknown;
}

export class RoomsConnectionChangedError extends Error {
  readonly code = "rooms_connection_changed";

  constructor() {
    super("The Threadspace source, server, account or selection changed during this request.");
    this.name = "RoomsConnectionChangedError";
  }
}

function sameIdentity(
  left: RoomsConnectionIdentity | null,
  right: RoomsConnectionIdentity,
): boolean {
  return (
    left?.source === right.source &&
    left.server === right.server &&
    left.accountId === right.accountId &&
    left.authenticationGeneration === right.authenticationGeneration &&
    left.authenticationStatus === right.authenticationStatus &&
    left.configured === right.configured
  );
}

interface RoomsConnectionOptions {
  readonly selected?: Readonly<Partial<Record<RoomsConnectionSource, string | null>>>;
  readonly onSelection?: (source: RoomsConnectionSource, roomId: string | null) => void;
  readonly loadSelectedWorkspace?: boolean;
  readonly liveRooms?: "selected" | "all";
  readonly createLiveSubscription?: (
    roomId: string,
    request: RoomsConnectionRequest,
  ) => { readonly start: (roomId: string) => void; readonly stop: () => void };
}

/** Owns source/account identity, discovery, selection and late reply rejection for every client. */
export class RoomsConnection<Session, Workspace> {
  private identity: RoomsConnectionIdentity | null = null;
  private adapter: RoomsConnectionAdapter<Session, Workspace> | null = null;
  private generation = 0;
  private loadGeneration = 0;
  private workspaceGeneration = 0;
  private active = true;
  private sharedIdentity: RoomsConnectionIdentity | null = null;
  private readonly liveSubscriptions = new Map<string, { readonly stop: () => void }>();
  private readonly listeners = new Set<() => void>();
  private readonly selected = new Map<RoomsConnectionSource, string | null>();
  private snapshot: RoomsConnectionSnapshot<Session, Workspace> = {
    identity: null,
    status: "authenticating",
    session: null,
    rooms: [],
    selectedRoomId: null,
    workspace: null,
    error: null,
  };

  private readonly options: RoomsConnectionOptions;
  constructor(options: RoomsConnectionOptions = {}) {
    this.options = options;
    this.selected.set("local", options.selected?.local ?? null);
    this.selected.set("shared", options.selected?.shared ?? null);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): RoomsConnectionSnapshot<Session, Workspace> => this.snapshot;

  matches(identity: RoomsConnectionIdentity): boolean {
    return sameIdentity(this.identity, identity);
  }

  configure(
    identity: RoomsConnectionIdentity,
    adapter: RoomsConnectionAdapter<Session, Workspace>,
  ): void {
    this.adapter = adapter;
    if (sameIdentity(this.identity, identity)) return;
    const previous = this.sharedIdentity;
    this.invalidate();
    this.identity = identity;
    if (
      identity.source === "shared" &&
      previous &&
      (previous.server !== identity.server || previous.accountId !== identity.accountId)
    ) {
      this.rememberSelection("shared", null);
    }
    if (identity.source === "shared") this.sharedIdentity = identity;
    this.publish({
      identity: this.capture(),
      status: this.unavailableStatus() ?? "connecting",
      session: null,
      rooms: [],
      selectedRoomId: null,
      workspace: null,
      error: null,
    });
  }

  capture(): RoomsConnectionRequest {
    if (!this.identity) throw new RoomsConnectionChangedError();
    return { ...this.identity, generation: this.generation };
  }

  isCurrent(request: RoomsConnectionRequest): boolean {
    return (
      this.active && request.generation === this.generation && sameIdentity(this.identity, request)
    );
  }

  assertCurrent(request: RoomsConnectionRequest, currentIdentity = this.identity): void {
    if (!this.isCurrent(request) || !currentIdentity || !sameIdentity(currentIdentity, request)) {
      throw new RoomsConnectionChangedError();
    }
  }

  accessRequest(): RoomsConnectionRequest {
    const request = this.capture();
    this.assertCurrent(request);
    if (this.unavailableStatus()) throw new RoomsConnectionChangedError();
    return request;
  }

  readyRequest(roomId?: string): RoomsConnectionRequest {
    const request = this.accessRequest();
    if (
      this.snapshot.status !== "ready" ||
      (roomId !== undefined && this.snapshot.selectedRoomId !== roomId)
    ) {
      throw new RoomsConnectionChangedError();
    }
    return request;
  }

  presentInvitation(invitation: unknown): void {
    this.invalidate();
    this.publish({
      ...this.snapshot,
      identity: this.capture(),
      status: "invited",
      invitation,
      rooms: [],
      workspace: null,
      error: null,
    });
  }

  async run<Value>(operation: (request: RoomsConnectionRequest) => Promise<Value>): Promise<Value> {
    const request = this.capture();
    this.assertCurrent(request);
    const value = await operation(request);
    this.assertCurrent(request);
    return value;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.invalidate();
    this.active = active;
    if (this.identity)
      this.publish({
        ...this.snapshot,
        identity: this.capture(),
        status: active ? (this.unavailableStatus() ?? "connecting") : this.snapshot.status,
      });
  }

  private invalidate(): void {
    this.generation += 1;
    this.loadGeneration += 1;
    this.workspaceGeneration += 1;
    for (const subscription of this.liveSubscriptions.values()) subscription.stop();
    this.liveSubscriptions.clear();
  }

  private unavailableStatus(): RoomsConnectionSnapshot<Session, Workspace>["status"] | null {
    if (!this.identity?.configured) return "invalid-configuration";
    if (this.identity.source === "local") return null;
    if (this.identity.authenticationStatus === "authenticating") return "authenticating";
    if (this.identity.authenticationStatus !== "signed-in" || !this.identity.accountId)
      return "signed-out";
    return null;
  }

  private publish(snapshot: RoomsConnectionSnapshot<Session, Workspace>): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
    this.syncLiveSubscriptions();
  }

  private syncLiveSubscriptions(): void {
    if (!this.options.createLiveSubscription) return;
    if (!this.active || this.snapshot.status !== "ready") {
      for (const subscription of this.liveSubscriptions.values()) subscription.stop();
      this.liveSubscriptions.clear();
      return;
    }
    const roomIds =
      this.options.liveRooms === "all"
        ? this.snapshot.rooms.map((room) => room.id)
        : this.snapshot.selectedRoomId
          ? [this.snapshot.selectedRoomId]
          : [];
    for (const [roomId, subscription] of this.liveSubscriptions) {
      if (roomIds.includes(roomId)) continue;
      subscription.stop();
      this.liveSubscriptions.delete(roomId);
    }
    const request = this.capture();
    for (const roomId of roomIds) {
      if (this.liveSubscriptions.has(roomId)) continue;
      const subscription = this.options.createLiveSubscription(roomId, request);
      this.liveSubscriptions.set(roomId, subscription);
      subscription.start(roomId);
    }
  }

  private rememberSelection(source: RoomsConnectionSource, roomId: string | null): void {
    if (this.selected.get(source) === roomId) return;
    this.selected.set(source, roomId);
    this.options.onSelection?.(source, roomId);
  }

  async refresh(preferredRoomId?: string | null, preserveReady = false): Promise<Workspace | null> {
    if (!this.identity || !this.adapter || !this.active) return null;
    const unavailable = this.unavailableStatus();
    if (unavailable) {
      this.publish({
        ...this.snapshot,
        status: unavailable,
        rooms: [],
        session: null,
        workspace: null,
        error: null,
      });
      return null;
    }
    const request = this.capture();
    const adapter = this.adapter;
    this.workspaceGeneration += 1;
    const loading = ++this.loadGeneration;
    const isCurrent = () => this.isCurrent(request) && loading === this.loadGeneration;
    if (!preserveReady || this.snapshot.status !== "ready") {
      this.publish({ ...this.snapshot, status: "connecting", error: null });
    }
    try {
      const discovery = await adapter.discover(request);
      if (!isCurrent()) return null;
      const preferred = preferredRoomId ?? this.selected.get(request.source);
      const room =
        discovery.rooms.find((candidate) => candidate.id === preferred) ?? discovery.rooms[0];
      if (!room) {
        this.publish({
          ...this.snapshot,
          status: "authenticated-nonmember",
          session: discovery.session,
          rooms: [],
          selectedRoomId: null,
          workspace: null,
          error: null,
        });
        return null;
      }
      let workspace: Workspace | null = null;
      if (this.options.loadSelectedWorkspace !== false) {
        workspace = discovery.workspace ?? (await adapter.loadWorkspace(room.id, request));
        if (!isCurrent()) return null;
        if (adapter.workspaceRoomId(workspace) !== room.id) throw new RoomsConnectionChangedError();
      }
      this.rememberSelection(request.source, room.id);
      this.publish({
        identity: request,
        status: "ready",
        session: discovery.session,
        rooms: discovery.rooms,
        selectedRoomId: room.id,
        workspace,
        error: null,
      });
      return workspace;
    } catch (error) {
      if (!isCurrent()) return null;
      if (preserveReady && this.snapshot.status === "ready") return null;
      this.publish({ ...this.snapshot, status: "error", error, rooms: [], workspace: null });
      return null;
    }
  }

  async selectRoom(roomId: string): Promise<Workspace | null> {
    if (!this.identity || !this.snapshot.rooms.some((room) => room.id === roomId)) return null;
    if (this.snapshot.selectedRoomId === roomId && this.snapshot.workspace)
      return this.snapshot.workspace;
    if (this.snapshot.selectedRoomId !== roomId) {
      this.invalidate();
      this.rememberSelection(this.identity.source, roomId);
      this.publish({
        ...this.snapshot,
        identity: this.capture(),
        selectedRoomId: roomId,
        workspace: null,
      });
    }
    return this.loadWorkspace(roomId);
  }

  updateWorkspace(
    request: RoomsConnectionRequest,
    update: (workspace: Workspace) => Workspace,
  ): void {
    this.assertCurrent(request);
    if (!this.snapshot.workspace) return;
    this.publish({ ...this.snapshot, workspace: update(this.snapshot.workspace) });
  }

  async loadWorkspace(roomId = this.snapshot.selectedRoomId): Promise<Workspace | null> {
    if (!this.active || !roomId || !this.adapter || !this.snapshot.rooms.some((room) => room.id === roomId))
      return null;
    const request = this.capture();
    const adapter = this.adapter;
    this.loadGeneration += 1;
    const loading = ++this.workspaceGeneration;
    const isCurrent = () => this.isCurrent(request) && loading === this.workspaceGeneration;
    try {
      const workspace = await adapter.loadWorkspace(roomId, request);
      if (!isCurrent()) return null;
      if (adapter.workspaceRoomId(workspace) !== roomId) throw new RoomsConnectionChangedError();
      this.rememberSelection(request.source, roomId);
      this.publish({
        ...this.snapshot,
        identity: request,
        status: "ready",
        selectedRoomId: roomId,
        workspace,
        error: null,
      });
      return workspace;
    } catch (error) {
      if (!isCurrent()) return null;
      this.publish({ ...this.snapshot, error });
      throw error;
    }
  }
}
