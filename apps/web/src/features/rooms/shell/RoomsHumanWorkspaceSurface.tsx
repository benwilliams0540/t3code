import { CircleUserRoundIcon, CopyIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

import { RoomsLocalChannelSurface } from "../channel/RoomsLocalChannelFeed";
import { useRoomsDataSource, type RoomsHumanRole, type RoomsSourceRoom } from "../dataSource";
import type { RoomsHumanWorkspace } from "../dataSource/humanSharedContract";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import { RoomsLocalStoriesSurface } from "../stories/RoomsLocalStories";
import { RoomsInteractiveDashboard } from "../dashboard/RoomsInteractiveDashboard";
import { RoomsInteractiveProjectSurface } from "../project/RoomsInteractiveProjectSurface";
import { RoomsInteractivePresent } from "./RoomsInteractivePresent";
import { RoomsThreadsSurface } from "../threads/RoomsThreadNavigation";
import type { RoomsWorkspaceSurface } from "./navigation";
import { RoomsLocalUnavailableSurface } from "./RoomsLocalWorkspaceSurface";
import type { RoomsWorkspaceNavigate } from "./RoomsWorkspaceNavigation";

export function resolveRoomsHumanWorkspaceActions(workspace: RoomsHumanWorkspace) {
  return {
    canCreateChannel: workspace.capabilities["channel.create"],
    canSendMessage: workspace.capabilities["message.create"],
    canCreateStory: workspace.capabilities["work.create"],
    canManageMembers: workspace.capabilities["membership.manage"],
    canManageRoles: workspace.capabilities["role.manage"],
  } as const;
}

export function roomsHumanInviteClipboardPayload(invite: {
  readonly roomId: string;
  readonly token: string;
}): string {
  return JSON.stringify({ room_id: invite.roomId, invite_token: invite.token });
}

function RoomsHumanDashboard({ workspace }: { readonly workspace: RoomsHumanWorkspace }) {
  const { createHumanInvite } = useRoomsDataSource();
  const [role, setRole] = useState<RoomsHumanRole>("operator");
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<{
    readonly roomId: string;
    readonly token: string;
    readonly role: RoomsHumanRole;
    readonly expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<{ readonly code: string; readonly message: string } | null>(
    null,
  );

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace.capabilities["membership.manage"]) return;
    setPending(true);
    setError(null);
    try {
      const result = await createHumanInvite(workspace.room.id, role, createLowercaseUuidV7());
      setInvite({
        roomId: result.value.room_id,
        token: result.value.invite_token,
        role: result.value.role,
        expiresAt: result.value.expires_at,
      });
      setCopied(false);
    } catch (cause) {
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "invite_creation_failed", message: "Could not create the invitation." },
      );
    } finally {
      setPending(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(roomsHumanInviteClipboardPayload(invite));
    setCopied(true);
  };

  return (
    <section className="mx-auto w-full max-w-5xl p-5 sm:p-8" data-rooms-human-dashboard="">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Authenticated shared room
          </p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">{workspace.room.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Server-backed membership, roles, capabilities, and principal directory.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-right">
          <p className="text-sm font-semibold text-foreground">
            {workspace.principal.display_name ?? workspace.principal.id}
          </p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">
            {workspace.principal.role ?? "member"}
          </p>
          <code className="mt-1 block text-[10px] text-muted-foreground">
            {workspace.principal.id}
          </code>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <CircleUserRoundIcon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-2xl font-semibold">{workspace.principals.length}</p>
          <p className="text-sm text-muted-foreground">known principals</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <ShieldCheckIcon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-2xl font-semibold">{workspace.channels.length}</p>
          <p className="text-sm text-muted-foreground">shared channels</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <ShieldCheckIcon className="size-5 text-muted-foreground" />
          <p className="mt-4 text-2xl font-semibold">
            {Object.values(workspace.capabilities).filter(Boolean).length}
          </p>
          <p className="text-sm text-muted-foreground">active capabilities</p>
        </div>
      </div>

      {resolveRoomsHumanWorkspaceActions(workspace).canManageMembers ? (
        <form
          className="mt-6 rounded-2xl border border-border bg-card p-5"
          onSubmit={(event) => void issue(event)}
        >
          <h2 className="font-semibold text-foreground">Invite one human</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The server returns one opaque, expiring, role-bound credential. It is never persisted by
            T3 Code.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rooms-human-invite-role">Role</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                id="rooms-human-invite-role"
                onChange={(event) => setRole(event.target.value as RoomsHumanRole)}
                value={role}
              >
                <option value="observer">Observer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button disabled={pending} type="submit">
              {pending ? "Creating…" : "Create invite"}
            </Button>
          </div>
          {invite ? (
            <div className="mt-4 rounded-xl border border-border bg-muted/25 p-4">
              <p className="text-sm text-muted-foreground">
                {invite.role} · expires {new Date(invite.expiresAt).toLocaleString()}
              </p>
              <code className="mt-2 block break-all text-[10px] text-foreground">
                {invite.token}
              </code>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => void copyInvite()} size="sm" type="button" variant="outline">
                  <CopyIcon /> {copied ? "Copied" : "Copy room + invite"}
                </Button>
                <Button onClick={() => setInvite(null)} size="sm" type="button" variant="outline">
                  <Trash2Icon /> Clear
                </Button>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {error.message} <code className="text-[10px]">{error.code}</code>
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

export function RoomsHumanWorkspaceSurfaceView({
  navigate,
  room,
  surface,
  workspace,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly surface: Exclude<
    RoomsWorkspaceSurface,
    { readonly kind: "native-thread" | "native-draft" }
  >;
  readonly workspace: RoomsHumanWorkspace;
}) {
  if (surface.kind === "dashboard") {
    return (
      <div className="min-h-full">
        <RoomsInteractiveDashboard navigate={navigate} room={room} workspace={workspace} />
        <details className="mx-auto mb-8 w-[calc(100%-2.5rem)] max-w-[1216px] rounded-2xl border border-border bg-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">
            Room admin and membership
          </summary>
          <div className="border-t border-border">
            <RoomsHumanDashboard workspace={workspace} />
          </div>
        </details>
      </div>
    );
  }
  if (surface.kind === "channel") {
    return <RoomsLocalChannelSurface channelSlug={surface.channelSlug} workspace={workspace} />;
  }
  if (surface.kind === "threads") {
    return <RoomsThreadsSurface navigate={navigate} room={room} sourceMode="shared" />;
  }
  if (surface.kind === "project" && surface.projectSection === "stories") {
    return (
      <RoomsLocalStoriesSurface
        key={room.id}
        navigate={navigate}
        roomId={room.id}
        sourceMode="shared"
      />
    );
  }
  if (surface.kind === "project") {
    return <RoomsInteractiveProjectSurface room={room} surface={surface} workspace={workspace} />;
  }
  if (surface.kind === "present") return <RoomsInteractivePresent workspace={workspace} />;
  return <RoomsLocalUnavailableSurface surface={surface} />;
}
