import { LogInIcon, ServerIcon, ShieldAlertIcon, TicketCheckIcon } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";

import { shouldMountClerkProvider } from "~/cloud/publicConfig";
import { useT3ConnectAuthPrompt } from "~/components/clerk/useT3ConnectAuthPrompt";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import {
  useRoomsDataSource,
  type RoomsAuthProviderName,
  type RoomsHumanSourceFailure,
} from "../dataSource";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import { ThreadspaceBrand } from "./ThreadspaceIdentity";
import { RoomsCreateRoomButton } from "./RoomsCreateRoomButton";

interface AccessError {
  readonly code: string;
  readonly message: string;
}

function accessError(cause: unknown): AccessError {
  return isRoomsLocalClientError(cause)
    ? { code: cause.code, message: cause.message }
    : { code: "human_access_failed", message: "The shared Threadspace access request failed." };
}

function validCredential(value: string): boolean {
  return value.trim() === value && value.length > 0 && value.length <= 512 && !/[\r\n]/.test(value);
}

const MIN_PASSWORD_LENGTH = 10;

export function roomsHumanAccessCopy(
  state: RoomsHumanSourceFailure,
  provider: RoomsAuthProviderName = "clerk",
): readonly [string, string] {
  if (provider === "local") {
    switch (state.status) {
      case "authenticating":
        return [
          "Connecting to the server",
          "Checking the stored session with the selected server.",
        ];
      case "signed-out":
        return [
          "Sign in to this server",
          "Use your username and password, join with an invitation, or set up a new server.",
        ];
      case "expired":
        return ["Server session ended", "Sign in again with your username and password."];
      case "invalid-configuration":
        return ["No server selected", "Add the URL of a Threadspace server to continue."];
      default:
        break;
    }
  }
  switch (state.status) {
    case "authenticating":
      return ["Authenticating with T3 Connect", "Waiting for the current Clerk account session."];
    case "signed-out":
      return [
        "Sign in to shared Threadspace",
        "Sign in with your T3 Connect account to load the rooms you belong to.",
      ];
    case "authenticated-nonmember":
      return [
        "Create your first room",
        "You’re signed in. Start a room of your own or join one with an invitation.",
      ];
    case "invited":
      return ["Invitation ready", "Review the bounded room and role metadata before joining."];
    case "expired":
      return [
        "Threadspace session expired",
        "Sign in to T3 Connect again, then retry the session.",
      ];
    case "authorization-failure":
      return [
        "Shared Threadspace authorization failed",
        state.error?.message ?? "Access was denied.",
      ];
    case "invalid-configuration":
      return [
        "Shared Threadspace is not configured",
        "This build needs the dedicated Threadspace API origin and Clerk JWT template.",
      ];
    case "error":
      return ["Shared Threadspace is unavailable", state.error?.message ?? "The request failed."];
  }
}

// The Rooms workspace replaces the app sidebar with its own rail, so the only
// place a signed-out person can reach the T3 Connect sign-in is this panel.
export function roomsHumanAccessOffersSignIn(state: RoomsHumanSourceFailure): boolean {
  return state.status === "signed-out" || state.status === "expired";
}

// A local server shows its own forms whenever a session is what is missing.
export function roomsLocalAccessOffersForms(state: RoomsHumanSourceFailure): boolean {
  return (
    state.status === "signed-out" ||
    state.status === "expired" ||
    state.status === "authorization-failure"
  );
}

export function roomsLocalAccessOffersSignOut(state: RoomsHumanSourceFailure): boolean {
  return (
    state.status === "authenticated-nonmember" ||
    state.status === "invited" ||
    state.status === "authorization-failure" ||
    state.status === "expired" ||
    state.status === "error"
  );
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

function RoomsServerChooser() {
  const { authProvider, connectServer, forgetServer, humanApiBaseUrl, serverProfile } =
    useRoomsDataSource();
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AccessError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (url.trim() === "") return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const discovered = await connectServer(url);
      setUrl("");
      setNotice(
        discovered.provider === "local"
          ? discovered.setup_required
            ? "This server has no owner yet. Set it up below."
            : "This server uses its own sign-in."
          : "This server uses T3 Connect sign-in.",
      );
    } catch (cause) {
      setError(accessError(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="mt-6 grid gap-3 border-t border-border pt-5"
      onSubmit={(event) => void connect(event)}
    >
      <div className="flex items-center gap-2 text-sm text-foreground">
        <ServerIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">Server</span>
        <span className="break-all font-mono text-xs text-muted-foreground">
          {humanApiBaseUrl || "not configured"}
        </span>
        <span className="text-xs text-muted-foreground">
          · {authProvider === "local" ? "own sign-in" : "T3 Connect"}
        </span>
      </div>
      <div>
        <Label htmlFor={inputId}>Change server</Label>
        <Input
          autoComplete="off"
          id={inputId}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://rooms.your-tailnet.ts.net"
          value={url}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          HTTPS, or HTTP on this computer. Nothing stored for another server is sent here.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || url.trim() === ""} type="submit" variant="outline">
          {pending ? "Connecting…" : "Connect"}
        </Button>
        {serverProfile ? (
          <Button
            disabled={pending}
            onClick={() => void forgetServer()}
            type="button"
            variant="ghost"
          >
            Forget this server
          </Button>
        ) : null}
      </div>
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      {error ? (
        <p className="text-sm text-destructive">
          {error.message} <code className="text-[10px]">{error.code}</code>
        </p>
      ) : null}
    </form>
  );
}

type LocalView = "sign-in" | "join" | "set-up" | "reset";

function RoomsLocalSignInForms() {
  const { enrollLocal, resetLocalPassword, serverProfile, setUpLocalServer, signInLocal } =
    useRoomsDataSource();
  const setupRequired = serverProfile?.setupRequired ?? false;
  const [view, setView] = useState<LocalView>(setupRequired ? "set-up" : "sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AccessError | null>(null);
  const ids = {
    username: useId(),
    password: useId(),
    displayName: useId(),
    roomId: useId(),
    inviteToken: useId(),
    setupToken: useId(),
    resetToken: useId(),
  };

  const passwordOk = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit =
    !pending &&
    (view === "sign-in"
      ? username.trim() !== "" && password !== ""
      : view === "join"
        ? roomId.trim() !== "" &&
          validCredential(inviteToken) &&
          username.trim() !== "" &&
          passwordOk &&
          displayName.trim() !== ""
        : view === "set-up"
          ? validCredential(setupToken) &&
            username.trim() !== "" &&
            passwordOk &&
            displayName.trim() !== ""
          : validCredential(resetToken) && passwordOk);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      if (view === "sign-in") {
        await signInLocal({ username: username.trim(), password });
      } else if (view === "join") {
        await enrollLocal({
          roomId: roomId.trim(),
          inviteToken,
          username: username.trim(),
          password,
          displayName: displayName.trim(),
        });
      } else if (view === "set-up") {
        await setUpLocalServer({
          setupToken,
          username: username.trim(),
          password,
          displayName: displayName.trim(),
        });
      } else {
        await resetLocalPassword({ resetToken, password });
      }
      setPassword("");
      setInviteToken("");
      setSetupToken("");
      setResetToken("");
    } catch (cause) {
      setError(accessError(cause));
    } finally {
      setPending(false);
    }
  };

  const tab = (candidate: LocalView, label: string) => (
    <Button
      disabled={pending}
      key={candidate}
      onClick={() => {
        setView(candidate);
        setError(null);
      }}
      size="sm"
      type="button"
      variant={view === candidate ? "default" : "outline"}
    >
      {label}
    </Button>
  );

  return (
    <form
      className="mt-6 grid gap-4 border-t border-border pt-5"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex flex-wrap gap-2">
        {tab("sign-in", "Sign in")}
        {tab("join", "Join with invitation")}
        {setupRequired ? tab("set-up", "Set up server") : null}
        {tab("reset", "Reset password")}
      </div>

      {view === "join" ? (
        <>
          <div>
            <Label htmlFor={ids.roomId}>Room ID</Label>
            <Input
              autoComplete="off"
              id={ids.roomId}
              onChange={(event) => setRoomId(event.target.value)}
              value={roomId}
            />
          </div>
          <div>
            <Label htmlFor={ids.inviteToken}>Invite token</Label>
            <Input
              autoComplete="off"
              id={ids.inviteToken}
              maxLength={512}
              onChange={(event) => setInviteToken(event.target.value)}
              type="password"
              value={inviteToken}
            />
          </div>
        </>
      ) : null}
      {view === "set-up" ? (
        <div>
          <Label htmlFor={ids.setupToken}>Setup token</Label>
          <Input
            autoComplete="off"
            id={ids.setupToken}
            maxLength={512}
            onChange={(event) => setSetupToken(event.target.value)}
            type="password"
            value={setupToken}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Printed once by <code>bin/rails rooms:local:issue_setup</code> on the server. You become
            its first owner.
          </p>
        </div>
      ) : null}
      {view === "reset" ? (
        <div>
          <Label htmlFor={ids.resetToken}>Reset token</Label>
          <Input
            autoComplete="off"
            id={ids.resetToken}
            maxLength={512}
            onChange={(event) => setResetToken(event.target.value)}
            type="password"
            value={resetToken}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Issued by the server owner. Redeeming it signs out every other device.
          </p>
        </div>
      ) : null}
      {view !== "reset" ? (
        <div>
          <Label htmlFor={ids.username}>Username</Label>
          <Input
            autoCapitalize="none"
            autoComplete="username"
            id={ids.username}
            maxLength={32}
            onChange={(event) => setUsername(event.target.value)}
            value={username}
          />
        </div>
      ) : null}
      <div>
        <Label htmlFor={ids.password}>{view === "sign-in" ? "Password" : "New password"}</Label>
        <Input
          autoComplete={view === "sign-in" ? "current-password" : "new-password"}
          id={ids.password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        {view !== "sign-in" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        ) : null}
      </div>
      {view === "join" || view === "set-up" ? (
        <div>
          <Label htmlFor={ids.displayName}>Display name</Label>
          <Input
            autoComplete="name"
            id={ids.displayName}
            maxLength={100}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </div>
      ) : null}
      <div>
        <Button disabled={!canSubmit} type="submit">
          {pending
            ? "Working…"
            : view === "sign-in"
              ? "Sign in"
              : view === "join"
                ? "Join room"
                : view === "set-up"
                  ? "Set up server"
                  : "Reset password"}
        </Button>
      </div>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          <p>{error.message}</p>
          <code className="mt-1 block text-[10px]">{error.code}</code>
        </div>
      ) : null}
    </form>
  );
}

export function RoomsHumanAccessPanel({ state }: { readonly state: RoomsHumanSourceFailure }) {
  const {
    authProvider,
    inspectHumanInvite,
    redeemHumanBootstrap,
    redeemHumanInvite,
    retryHumanSession,
    signOutLocal,
  } = useRoomsDataSource();
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [roomId, setRoomId] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [pending, setPending] = useState<"bootstrap" | "inspect" | "accept" | "sign-out" | null>(
    null,
  );
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

  const signOut = async () => {
    setPending("sign-out");
    setError(null);
    try {
      await signOutLocal();
    } finally {
      setPending(null);
    }
  };

  const copy = roomsHumanAccessCopy(state, authProvider);
  const local = authProvider === "local";

  return (
    <section className="flex min-h-full flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-7">
        <ThreadspaceBrand />
        {state.status === "signed-out" ? (
          <LogInIcon className="mt-6 size-6 text-muted-foreground" />
        ) : state.status === "invited" ? (
          <TicketCheckIcon className="mt-6 size-6 text-muted-foreground" />
        ) : (
          <ShieldAlertIcon className="mt-6 size-6 text-muted-foreground" />
        )}
        <h1 className="mt-4 text-lg font-semibold">{copy[0]}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy[1]}</p>

        <RoomsServerChooser />

        {local && roomsLocalAccessOffersForms(state) ? <RoomsLocalSignInForms /> : null}

        {(state.status === "authenticated-nonmember" || state.status === "invited") && (
          <div className="mt-6 grid gap-5 border-t border-border pt-5">
            <RoomsCreateRoomButton />
            {state.status === "authenticated-nonmember" && !local ? (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Have an operator setup token?
                </summary>
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
                    {pending === "bootstrap" ? "Redeeming…" : "Redeem setup token"}
                  </Button>
                </form>
              </details>
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
          {!local && roomsHumanAccessOffersSignIn(state) && shouldMountClerkProvider() ? (
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
          {local && roomsLocalAccessOffersSignOut(state) ? (
            <Button disabled={pending !== null} onClick={() => void signOut()} variant="ghost">
              {pending === "sign-out" ? "Signing out…" : "Sign out"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
