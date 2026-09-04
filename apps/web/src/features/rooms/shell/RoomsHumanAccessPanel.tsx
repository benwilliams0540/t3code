import { LogInIcon, ShieldAlertIcon, TicketCheckIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { shouldMountClerkProvider } from "~/cloud/publicConfig";
import { useT3ConnectAuthPrompt } from "~/components/clerk/useT3ConnectAuthPrompt";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import { useRoomsDataSource, type RoomsHumanSourceFailure } from "../dataSource";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";

interface AccessError {
  readonly code: string;
  readonly message: string;
}

function accessError(cause: unknown): AccessError {
  return isRoomsLocalClientError(cause)
    ? { code: cause.code, message: cause.message }
    : { code: "human_access_failed", message: "The shared Rooms access request failed." };
}

function validCredential(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 512 && !/[\r\n]/.test(value);
}

export function roomsHumanAccessCopy(state: RoomsHumanSourceFailure): readonly [string, string] {
  switch (state.status) {
    case "authenticating":
      return ["Authenticating with T3 Connect", "Waiting for the current Clerk account session."];
    case "signed-out":
      return [
        "Sign in to shared Rooms",
        "Sign in with your T3 Connect account to load the rooms you belong to.",
      ];
    case "authenticated-nonmember":
      return [
        "Authenticated, not yet a member",
        "This account reached Rooms successfully but has no shared-room membership.",
      ];
    case "invited":
      return ["Invitation ready", "Review the bounded room and role metadata before joining."];
    case "expired":
      return ["Rooms session expired", "Sign in to T3 Connect again, then retry the session."];
    case "authorization-failure":
      return ["Shared Rooms authorization failed", state.error?.message ?? "Access was denied."];
    case "invalid-configuration":
      return [
        "Shared Rooms is not configured",
        "This build needs the dedicated Rooms API origin and Clerk JWT template.",
      ];
    case "error":
      return ["Shared Rooms is unavailable", state.error?.message ?? "The request failed."];
  }
}

// The Rooms workspace replaces the app sidebar with its own rail, so the only
// place a signed-out person can reach the T3 Connect sign-in is this panel.
export function roomsHumanAccessOffersSignIn(state: RoomsHumanSourceFailure): boolean {
  return state.status === "signed-out" || state.status === "expired";
}

// Mounted only when Clerk is configured: the Clerk hooks throw without a provider.
function RoomsSignInButton() {
  const { authPrompt, openAuthPrompt } = useT3ConnectAuthPrompt();
  return (
    <>
      <Button onClick={openAuthPrompt}>
        <LogInIcon />
        Sign in to T3 Connect
      </Button>
      {authPrompt}
    </>
  );
}

export function RoomsHumanAccessPanel({ state }: { readonly state: RoomsHumanSourceFailure }) {
  const { inspectHumanInvite, redeemHumanBootstrap, redeemHumanInvite, retryHumanSession } =
    useRoomsDataSource();
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [roomId, setRoomId] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [pending, setPending] = useState<"bootstrap" | "inspect" | "accept" | null>(null);
  const [error, setError] = useState<AccessError | null>(null);

  useEffect(() => {
    if (state.status === "signed-out" || state.status === "authenticating") {
      setBootstrapToken("");
      setRoomId("");
      setInviteToken("");
      setError(null);
    }
  }, [state.status]);

  const redeemBootstrap = async (event: FormEvent) => {
    event.preventDefault();
    if (!validCredential(bootstrapToken)) return;
    setPending("bootstrap");
    setError(null);
    try {
      await redeemHumanBootstrap(bootstrapToken);
      setBootstrapToken("");
    } catch (cause) {
      setError(accessError(cause));
    } finally {
      setPending(null);
    }
  };

  const inspectInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (roomId.trim() === "" || !validCredential(inviteToken)) return;
    setPending("inspect");
    setError(null);
    try {
      await inspectHumanInvite(roomId.trim(), inviteToken);
    } catch (cause) {
      setError(accessError(cause));
    } finally {
      setPending(null);
    }
  };

  const acceptInvite = async () => {
    if (!state.invitation || roomId.trim() === "" || !validCredential(inviteToken)) return;
    setPending("accept");
    setError(null);
    try {
      await redeemHumanInvite(roomId.trim(), inviteToken);
      setRoomId("");
      setInviteToken("");
    } catch (cause) {
      setError(accessError(cause));
    } finally {
      setPending(null);
    }
  };

  const copy = roomsHumanAccessCopy(state);

  return (
    <section className="flex min-h-full flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-7">
        {state.status === "signed-out" ? (
          <LogInIcon className="size-6 text-muted-foreground" />
        ) : state.status === "invited" ? (
          <TicketCheckIcon className="size-6 text-muted-foreground" />
        ) : (
          <ShieldAlertIcon className="size-6 text-muted-foreground" />
        )}
        <h1 className="mt-4 text-lg font-semibold">{copy[0]}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy[1]}</p>

        {(state.status === "authenticated-nonmember" || state.status === "invited") && (
          <div className="mt-6 grid gap-5 border-t border-border pt-5">
            {state.status === "authenticated-nonmember" ? (
              <form className="grid gap-3" onSubmit={(event) => void redeemBootstrap(event)}>
                <div>
                  <Label htmlFor="rooms-bootstrap-token">First-admin bootstrap</Label>
                  <Input
                    autoComplete="off"
                    id="rooms-bootstrap-token"
                    maxLength={512}
                    onChange={(event) => setBootstrapToken(event.target.value)}
                    type="password"
                    value={bootstrapToken}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used once for explicit operator-issued room creation; never saved to settings.
                  </p>
                </div>
                <Button
                  disabled={pending !== null || !validCredential(bootstrapToken)}
                  type="submit"
                >
                  {pending === "bootstrap" ? "Redeeming…" : "Create shared room as admin"}
                </Button>
              </form>
            ) : null}

            <form className="grid gap-3" onSubmit={(event) => void inspectInvite(event)}>
              <div>
                <Label htmlFor="rooms-invite-room">Room ID</Label>
                <Input
                  autoComplete="off"
                  id="rooms-invite-room"
                  onChange={(event) => setRoomId(event.target.value)}
                  value={roomId}
                />
              </div>
              <div>
                <Label htmlFor="rooms-invite-token">Opaque invite</Label>
                <Input
                  autoComplete="off"
                  id="rooms-invite-token"
                  maxLength={512}
                  onChange={(event) => setInviteToken(event.target.value)}
                  type="password"
                  value={inviteToken}
                />
              </div>
              <Button
                disabled={pending !== null || roomId.trim() === "" || !validCredential(inviteToken)}
                type="submit"
                variant="outline"
              >
                {pending === "inspect" ? "Inspecting…" : "Inspect invitation"}
              </Button>
            </form>

            {state.status === "invited" && state.invitation ? (
              <div className="rounded-xl border border-border bg-muted/25 p-4">
                <p className="font-medium text-foreground">{state.invitation.room.name}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {state.invitation.room.id}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Role: <strong className="text-foreground">{state.invitation.role}</strong> ·
                  expires {new Date(state.invitation.expires_at).toLocaleString()}
                </p>
                <Button
                  className="mt-4"
                  disabled={pending !== null}
                  onClick={() => void acceptInvite()}
                >
                  {pending === "accept" ? "Joining…" : "Accept invitation"}
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            <p>{error.message}</p>
            <code className="mt-1 block text-[10px]">{error.code}</code>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {roomsHumanAccessOffersSignIn(state) && shouldMountClerkProvider() ? (
            <RoomsSignInButton />
          ) : null}
          {state.status !== "authenticating" && state.status !== "signed-out" ? (
            <Button
              disabled={pending !== null}
              onClick={() => void retryHumanSession()}
              variant="outline"
            >
              Retry session
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
