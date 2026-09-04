import type {
  RoomsHumanFeedItem,
  RoomsHumanPrincipal,
  RoomsHumanWorkspace,
} from "../dataSource/humanSharedContract";
import type { RoomsLocalChannel } from "../dataSource/localChannelsContract";

export interface RoomsDesktopNotificationCandidate {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function cleanBody(markdown: string): string {
  return truncate(
    markdown
      .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
      .replace(/[`*_>#~]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    240,
  );
}

function writerName(principal: RoomsHumanPrincipal | undefined, principalId: string): string {
  const displayName = principal?.display_name?.trim() ?? "";
  if (displayName && !/^Human [0-9a-f]{8}$/i.test(displayName)) return displayName;
  if (principal?.type === "agent" || principalId.startsWith("a:")) return "Agent";
  return "Room member";
}

export function selectRoomsDesktopNotifications(input: {
  readonly workspace: RoomsHumanWorkspace;
  readonly channel: RoomsLocalChannel;
  readonly items: readonly RoomsHumanFeedItem[];
  readonly afterSeq: number;
  readonly headSeq: number;
}): readonly RoomsDesktopNotificationCandidate[] {
  const principals = new Map(
    input.workspace.principals.map((principal) => [principal.id, principal]),
  );
  const seen = new Set<string>();
  const candidates: RoomsDesktopNotificationCandidate[] = [];

  for (const item of input.items) {
    if (
      item.kind !== "human_message" ||
      item.source_event.type !== "message.created" ||
      item.source_event.seq <= input.afterSeq ||
      item.source_event.seq > input.headSeq ||
      item.attribution.writer_principal_id === input.workspace.principal.id ||
      seen.has(item.source_event.event_id)
    ) {
      continue;
    }
    const body = cleanBody(item.payload.body_markdown);
    if (!body) continue;
    seen.add(item.source_event.event_id);
    const author = writerName(
      principals.get(item.attribution.writer_principal_id),
      item.attribution.writer_principal_id,
    );
    candidates.push({
      id: item.source_event.event_id,
      title: truncate(`${author} in #${input.channel.slug}`, 120),
      body,
    });
  }

  return candidates;
}
