import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as Client from "./client.ts";
import {
  ArchivedThreadSummaryInput,
  ChannelContextInput,
  ContextInput,
  RoomsAgentToolError,
  StoryAttachEvidenceInput,
  StoryClaimInput,
  StoryCompleteInput,
  StoryCreateInput,
  StoryGetInput,
  StoryListInput,
  StoryReleaseInput,
  StoryRequestReviewInput,
  StorySearchInput,
  StoryTransitionInput,
} from "./contracts.ts";

const dependencies = [Client.RoomsAgentClient];

const readonlyTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;

const workTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, true)
    .annotate(Tool.Idempotent, true) as T;

export const RoomsContextGetTool = readonlyTool(
  Tool.make("rooms_context_get", {
    description:
      "Return verified Rooms Agent identity, room, membership, authentication profile, invocation, heads, and projection freshness.",
    parameters: ContextInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get Rooms Agent context"),
);

export const RoomsStoryListTool = readonlyTool(
  Tool.make("rooms_story_list", {
    description:
      "List a bounded cursor page of server-authoritative story projections in the authenticated room.",
    parameters: StoryListInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "List Rooms stories"),
);

export const RoomsStoryGetTool = readonlyTool(
  Tool.make("rooms_story_get", {
    description:
      "Get one server-authoritative story with bounded activity and its safe native-thread reference.",
    parameters: StoryGetInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get Rooms story"),
);

export const RoomsStorySearchTool = readonlyTool(
  Tool.make("rooms_story_search", {
    description: "Search authenticated-room story titles with bounded deterministic ranking.",
    parameters: StorySearchInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Search Rooms stories"),
);

export const RoomsStoryCreateTool = workTool(
  Tool.make("rooms_story_create", {
    description:
      "Create a story in the authenticated room and optionally link the verified invoking native thread.",
    parameters: StoryCreateInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Create Rooms story"),
);

export const RoomsStoryClaimTool = workTool(
  Tool.make("rooms_story_claim", {
    description: "Claim a story using a bounded server-time lease and an expected semantic stage.",
    parameters: StoryClaimInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Claim Rooms story"),
);

export const RoomsStoryReleaseTool = workTool(
  Tool.make("rooms_story_release", {
    description: "Release the current Agent's live story claim at the expected semantic stage.",
    parameters: StoryReleaseInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Release Rooms story"),
);

export const RoomsStoryTransitionTool = workTool(
  Tool.make("rooms_story_transition", {
    description:
      "Move a claimed story through an allowed pinned-workflow transition using its expected semantic stage.",
    parameters: StoryTransitionInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Transition Rooms story"),
);

export const RoomsStoryAttachEvidenceTool = workTool(
  Tool.make("rooms_story_attach_evidence", {
    description:
      "Attach an already-verified CAS evidence object to a claimed story at its expected semantic stage.",
    parameters: StoryAttachEvidenceInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Attach Rooms story evidence"),
);

export const RoomsStoryRequestReviewTool = workTool(
  Tool.make("rooms_story_request_review", {
    description:
      "Request the pinned human QA review transition for a claimed story at its expected semantic stage.",
    parameters: StoryRequestReviewInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Request Rooms story review"),
);

export const RoomsStoryCompleteTool = workTool(
  Tool.make("rooms_story_complete", {
    description:
      "Complete a claimed story using the exact evidence IDs covered by its prior approved review.",
    parameters: StoryCompleteInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Complete Rooms story"),
);

export const RoomsChannelContextGetTool = readonlyTool(
  Tool.make("rooms_channel_context_get", {
    description:
      "Read bounded channel context fixed by the live server invocation; room, channel, and cutoff are not caller-selectable.",
    parameters: ChannelContextInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get Rooms channel context"),
);

export const RoomsArchivedThreadSummaryGetTool = readonlyTool(
  Tool.make("rooms_archived_thread_summary_get", {
    description:
      "Read a bounded allow-listed summary for an archived native thread linked to a story in the authenticated room.",
    parameters: ArchivedThreadSummaryInput,
    success: Schema.Unknown,
    failure: RoomsAgentToolError,
    dependencies,
  }).annotate(Tool.Title, "Get archived Rooms thread summary"),
);

export const RoomsAgentToolkit = Toolkit.make(
  RoomsContextGetTool,
  RoomsStoryListTool,
  RoomsStoryGetTool,
  RoomsStorySearchTool,
  RoomsStoryCreateTool,
  RoomsStoryClaimTool,
  RoomsStoryReleaseTool,
  RoomsStoryTransitionTool,
  RoomsStoryAttachEvidenceTool,
  RoomsStoryRequestReviewTool,
  RoomsStoryCompleteTool,
  RoomsChannelContextGetTool,
  RoomsArchivedThreadSummaryGetTool,
);

const invoke = Effect.fn("RoomsAgentToolkit.invoke")(function* (
  tool: Parameters<Client.RoomsAgentClientShape["invoke"]>[0],
  input: Readonly<Record<string, unknown>>,
) {
  const client = yield* Client.RoomsAgentClient;
  return yield* client.invoke(tool, input);
});

export const RoomsAgentToolkitHandlersLive = RoomsAgentToolkit.toLayer({
  rooms_context_get: (input) => invoke("rooms_context_get", input ?? {}),
  rooms_story_list: (input) => invoke("rooms_story_list", input),
  rooms_story_get: (input) => invoke("rooms_story_get", input),
  rooms_story_search: (input) => invoke("rooms_story_search", input),
  rooms_story_create: (input) => invoke("rooms_story_create", input),
  rooms_story_claim: (input) => invoke("rooms_story_claim", input),
  rooms_story_release: (input) => invoke("rooms_story_release", input),
  rooms_story_transition: (input) => invoke("rooms_story_transition", input),
  rooms_story_attach_evidence: (input) => invoke("rooms_story_attach_evidence", input),
  rooms_story_request_review: (input) => invoke("rooms_story_request_review", input),
  rooms_story_complete: (input) => invoke("rooms_story_complete", input),
  rooms_channel_context_get: (input) => invoke("rooms_channel_context_get", input),
  rooms_archived_thread_summary_get: (input) => invoke("rooms_archived_thread_summary_get", input),
});
