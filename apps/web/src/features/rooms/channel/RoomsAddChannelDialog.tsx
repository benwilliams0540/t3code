import { type FormEvent, useRef, useState } from "react";

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
import { Textarea } from "~/components/ui/textarea";

import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import type { RoomsLocalChannel } from "../dataSource/localChannelsContract";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import {
  finishStableRoomsSubmission,
  prepareStableRoomsCommand,
  tryStartStableRoomsSubmission,
  type StableRoomsCommand,
} from "./stableCommand";

interface ChannelDraft {
  readonly name: string;
  readonly purpose: string | null;
}

export function RoomsAddChannelDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  readonly onCreated: (channel: RoomsLocalChannel) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const { createLocalChannel } = useRoomsDataSource();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<ChannelDraft> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const edit = (update: () => void) => {
    update();
    setCommand(null);
    setError(null);
  };

  const reset = () => {
    setName("");
    setPurpose("");
    setCommand(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "" || !tryStartStableRoomsSubmission(pendingRef)) return;
    const next = prepareStableRoomsCommand(
      command,
      { name, purpose: purpose === "" ? null : purpose },
      createLowercaseUuidV7,
    );
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      const result = await createLocalChannel({
        requestId: next.requestId,
        name: next.payload.name,
        purpose: next.payload.purpose,
      });
      reset();
      onOpenChange(false);
      onCreated(result.value);
    } catch (cause) {
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "unexpected_channel_error", message: "Could not create the channel." },
      );
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) return;
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={!pending}>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Add channel</DialogTitle>
            <DialogDescription>
              Create a durable human discussion channel in this Local workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="rooms-channel-name">Name</Label>
              <Input
                autoFocus
                disabled={pending}
                id="rooms-channel-name"
                maxLength={100}
                onChange={(event) => edit(() => setName(event.target.value))}
                placeholder="infra"
                value={name}
              />
              <p className="text-xs text-muted-foreground">
                The server normalizes this to a lowercase # channel slug.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rooms-channel-purpose">Purpose (optional)</Label>
              <Textarea
                disabled={pending}
                id="rooms-channel-purpose"
                maxLength={280}
                onChange={(event) => edit(() => setPurpose(event.target.value))}
                placeholder="Infrastructure work"
                size="sm"
                value={purpose}
              />
            </div>
            {error ? (
              <div
                aria-live="polite"
                className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
              >
                <p>{error.message}</p>
                <code className="mt-1 block text-[10px]">{error.code}</code>
              </div>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={pending || name.trim() === ""} type="submit">
              {pending ? "Creating…" : command ? "Retry creation" : "Create channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
