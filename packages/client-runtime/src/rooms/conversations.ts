import type { RoomsConnectionRequest } from "./connection.ts";
import type { RoomsConversationClient } from "./conversationClient.ts";
import type {
  RoomsConversation,
  RoomsConversationProjection,
  RoomsHumanFeed,
  RoomsConversationCapabilities,
} from "./humanWire.ts";
import { loadRoomsFeedSnapshot } from "./feedSnapshot.ts";

interface ConversationSnapshot {
  readonly capabilities: RoomsConversationCapabilities | null;
  readonly conversations: readonly RoomsConversation[];
  readonly selectedId: string | null;
  readonly projection: RoomsConversationProjection | null;
  readonly feed: RoomsHumanFeed | null;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly error: unknown;
}
const empty: ConversationSnapshot = {
  capabilities: null,
  conversations: [],
  selectedId: null,
  projection: null,
  feed: null,
  loading: false,
  pending: false,
  error: null,
};

interface RoomsConversationOptions {
  readonly clientFor: (request: RoomsConnectionRequest) => RoomsConversationClient;
  readonly isCurrent: (request: RoomsConnectionRequest) => boolean;
  readonly createRequestId: () => string;
}

/** Human projection and commands stay scoped to a captured room connection, never a runtime session. */
export class RoomsConversations {
  private scope: { room: string; channel: string; request: RoomsConnectionRequest } | null = null;
  private generation = 0;
  private loadGeneration = 0;
  private snapshot: ConversationSnapshot = empty;
  private readonly listeners = new Set<() => void>();
  private readonly commandIds = new Map<string, string>();
  private readonly options: RoomsConversationOptions;
  constructor(options: RoomsConversationOptions) {
    this.options = options;
  }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly getSnapshot = () => this.snapshot;
  private publish(value: ConversationSnapshot) {
    this.snapshot = value;
    for (const listener of this.listeners) listener();
  }
  configure(room: string, channel: string, request: RoomsConnectionRequest) {
    if (
      this.scope?.room === room &&
      this.scope.channel === channel &&
      this.scope.request.generation === request.generation &&
      this.scope.request.server === request.server &&
      this.scope.request.accountId === request.accountId &&
      this.scope.request.source === request.source
    )
      return;
    this.generation += 1;
    this.loadGeneration += 1;
    this.commandIds.clear();
    this.scope = { room, channel, request };
    this.publish(empty);
  }
  stop() {
    this.generation += 1;
    this.loadGeneration += 1;
    this.scope = null;
    this.publish(empty);
  }
  private capture() {
    const scope = this.scope;
    if (!scope || !this.options.isCurrent(scope.request))
      throw new Error("The room connection changed.");
    const generation = this.generation;
    const current = () => generation === this.generation && this.options.isCurrent(scope.request);
    return { ...scope, current, client: this.options.clientFor(scope.request) };
  }
  async refresh() {
    const scope = this.capture();
    const loading = ++this.loadGeneration;
    const current = () => scope.current() && loading === this.loadGeneration;
    this.publish({ ...this.snapshot, loading: true, error: null });
    try {
      const list = await scope.client.list(scope.room, scope.channel);
      if (!current()) return;
      const selectedId =
        this.snapshot.selectedId &&
        list.conversations.some((value) => value.id === this.snapshot.selectedId)
          ? this.snapshot.selectedId
          : null;
      let projection: RoomsConversationProjection | null = null;
      let feed: RoomsHumanFeed | null = null;
      if (selectedId) {
        const result = await Promise.all([
          scope.client.read(scope.room, scope.channel, selectedId),
          loadRoomsFeedSnapshot({
            loadPage: (input) => scope.client.feed(scope.room, scope.channel, selectedId, input),
            isCurrent: current,
          }),
        ]);
        [projection, feed] = result;
      }
      if (current())
        this.publish({
          ...this.snapshot,
          capabilities: list.capabilities,
          conversations: list.conversations,
          selectedId,
          projection,
          feed,
          loading: false,
          error: null,
        });
    } catch (error) {
      if (current()) this.publish({ ...this.snapshot, loading: false, error });
    }
  }
  async select(id: string | null) {
    if (id !== null && !this.snapshot.conversations.some((value) => value.id === id)) return;
    this.generation += 1;
    this.loadGeneration += 1;
    this.publish({
      ...this.snapshot,
      pending: false,
      selectedId: id,
      projection: null,
      feed: null,
      error: null,
    });
    await this.refresh();
  }
  private requestId(key: string) {
    const value = this.commandIds.get(key) ?? this.options.createRequestId();
    this.commandIds.set(key, value);
    return value;
  }
  private async command<T>(
    key: string,
    operation: (scope: ReturnType<RoomsConversations["capture"]>, requestId: string) => Promise<T>,
  ): Promise<T> {
    if (this.snapshot.pending) throw new Error("A conversation command is already pending.");
    const scope = this.capture();
    const id = this.requestId(key);
    this.publish({ ...this.snapshot, pending: true, error: null });
    try {
      const value = await operation(scope, id);
      if (!scope.current()) throw new Error("The room connection changed.");
      this.commandIds.delete(key);
      return value;
    } catch (error) {
      if (scope.current()) this.publish({ ...this.snapshot, error });
      throw error;
    } finally {
      if (scope.current()) this.publish({ ...this.snapshot, pending: false });
    }
  }
  async create(title: string) {
    const scope = this.capture();
    if (this.snapshot.capabilities?.["conversations.create"] !== true)
      throw new Error("Conversation creation is not authorized.");
    const result = await this.command(`create:${title}`, (scope, id) =>
      scope.client.create(scope.room, scope.channel, id, title),
    );
    if (!scope.current()) throw new Error("The room connection changed.");
    this.publish({
      ...this.snapshot,
      conversations: [
        ...this.snapshot.conversations.filter((value) => value.id !== result.conversation.id),
        result.conversation,
      ],
      selectedId: result.conversation.id,
    });
    await this.refresh();
    return result;
  }
  async send(body: string) {
    const scope = this.capture();
    if (this.snapshot.capabilities?.["conversations.message"] !== true)
      throw new Error("Conversation follow-up is not authorized.");
    const selectedId = this.snapshot.selectedId;
    if (!selectedId) throw new Error("Choose a conversation before sending a follow-up.");
    const result = await this.command(`send:${selectedId}:${body}`, (scope, id) =>
      scope.client.send(scope.room, scope.channel, selectedId, id, body),
    );
    if (!scope.current()) throw new Error("The room connection changed.");
    await this.refresh();
    return result;
  }
}
