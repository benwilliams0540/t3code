import type { RoomsDataSourceState, RoomsSourceRoom } from "../dataSource";
import { RoomsNativeThreadSurface } from "../threads/RoomsNativeThreadSurface";
import type { RoomsWorkspaceSurface } from "./navigation";
import { RoomsHumanWorkspaceSurfaceView } from "./RoomsHumanWorkspaceSurface";
import { RoomsLocalWorkspaceSurfaceView } from "./RoomsLocalWorkspaceSurface";
import type { RoomsWorkspaceNavigate } from "./RoomsWorkspaceNavigation";

export function RoomsWorkspaceSurfaceView({
  navigate,
  room,
  sourceState,
  surface,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly sourceState: Extract<RoomsDataSourceState, { readonly status: "ready" }>;
  readonly surface: RoomsWorkspaceSurface;
}) {
  if (surface.kind === "native-thread" || surface.kind === "native-draft") {
    return (
      <RoomsNativeThreadSurface
        roomId={room.id}
        roomSlug={room.slug}
        sourceMode={sourceState.mode}
        surface={surface}
      />
    );
  }

  if (sourceState.mode === "local") {
    return (
      <RoomsLocalWorkspaceSurfaceView
        navigate={navigate}
        room={room}
        surface={surface}
        workspace={sourceState.workspace}
      />
    );
  }

  return (
    <RoomsHumanWorkspaceSurfaceView
      navigate={navigate}
      room={room}
      surface={surface}
      workspace={sourceState.workspace}
    />
  );
}
