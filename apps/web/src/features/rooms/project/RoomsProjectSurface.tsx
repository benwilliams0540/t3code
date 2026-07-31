import { CircleHelpIcon } from "lucide-react";

import { RoomsAuditDecisions } from "../audit";
import { RoomsVisionDocument } from "../documents";
import { RoomsEvidenceList } from "../evidence";
import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { RoomsProjectIndex } from "./RoomsProjectIndex";
import { RoomsStoriesList } from "./RoomsStoriesList";
import { resolveRoomsProjectSection } from "./projection";

export function RoomsProjectSurface(props: RoomsWorkspaceSlotProps) {
  const section = resolveRoomsProjectSection(props.surface);
  switch (section) {
    case "index":
      return <RoomsProjectIndex {...props} />;
    case "vision":
      return <RoomsVisionDocument {...props} />;
    case "stories":
      return <RoomsStoriesList {...props} />;
    case "evidence":
      return <RoomsEvidenceList {...props} />;
    case "audit-decisions":
      return <RoomsAuditDecisions {...props} />;
    case "unknown":
      return (
        <div
          className="flex min-h-[22rem] items-center justify-center p-6"
          data-rooms-project-state="unknown"
        >
          <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <CircleHelpIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">Unknown project section</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This route is not declared by the workspace project navigation.
            </p>
          </div>
        </div>
      );
  }
}
