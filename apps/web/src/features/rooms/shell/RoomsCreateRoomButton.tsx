import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";

import { resolveCloudPublicConfig } from "~/cloud/publicConfig";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import {
  finishStableRoomsSubmission,
  prepareStableRoomsCommand,
  tryStartStableRoomsSubmission,
  type StableRoomsCommand,
} from "../channel/stableCommand";

export function RoomsCreateRoomButton({ compact = false }: { readonly compact?: boolean }) {
  const { state } = useRoomsDataSource();
  if (state.mode !== "shared") return null;
  return <RoomsCreateRoomForm key={state.authenticationGeneration} compact={compact} />;
}

function RoomsCreateRoomForm({ compact }: { readonly compact: boolean }) {
  const { createHumanRoom, state } = useRoomsDataSource();
  const navigate = useNavigate();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<string> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const available =
    state.mode === "shared" &&
    (state.status === "ready" ||
      state.status === "authenticated-nonmember" ||
      state.status === "invited");
  const server = resolveCloudPublicConfig().roomsApiUrl;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!available || !name.trim() || !tryStartStableRoomsSubmission(pendingRef)) return;
    const next = prepareStableRoomsCommand(command, name.trim(), createLowercaseUuidV7);
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      const result = await createHumanRoom(next.payload, next.requestId);
      setOpen(false);
      setName("");
      setCommand(null);
      void navigate({
        to: "/rooms/$roomSlug/channels/$channelSlug",
        params: { roomSlug: result.room.slug, channelSlug: "general" },
      });
    } catch (cause) {
      setError(
        isRoomsLocalClientError(cause) ? cause.message : "Could not create the room. Please retry.",
      );
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  if (!available) return null;

  return (
    <>
      <Button
        aria-label="New room"
        className={compact ? "size-10 shrink-0 rounded-sm" : undefined}
        onClick={() => setOpen(true)}
        size={compact ? "icon" : "default"}
        title="New room"
        variant={compact ? "outline" : "default"}
      >
        <PlusIcon />
        {compact ? null : "New room"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!pendingRef.current) setOpen(nextOpen);
        }}
      >
        <DialogPopup className="max-w-md" showCloseButton={!pending}>
          <form onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>New room</DialogTitle>
              <DialogDescription>
                Start a shared space for conversation and work. You’ll be its admin.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={inputId}>Room name</Label>
                <Input
                  autoFocus
                  disabled={pending}
                  id={inputId}
                  maxLength={100}
                  onChange={(event) => {
                    setName(event.target.value);
                    setCommand(null);
                    setError(null);
                  }}
                  placeholder="Your project or team"
                  value={name}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Your room starts with a #general channel.
              </p>
              <p className="break-all text-xs text-muted-foreground">Server: {server}</p>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <Button
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending || !name.trim()} type="submit">
                {pending ? "Creating…" : command ? "Retry creation" : "Create room"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </>
  );
}
