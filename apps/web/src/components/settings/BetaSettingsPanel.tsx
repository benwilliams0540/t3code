import * as Schema from "effect/Schema";
import {
  type ComposerSendShortcut,
  DEFAULT_ROOMS_LOCAL_API_BASE_URL,
} from "@t3tools/contracts/settings";
import { useEffect, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useRoomsDataSource, type RoomsDataSourceMode } from "../../features/rooms/dataSource";
import { buildRoomsDiagnostics } from "../../features/rooms/dataSource/diagnostics";
import { resetRoomsBetaSettings } from "../../features/rooms/dataSource/reset";
import { validateRoomsLocalApiBaseUrl } from "../../features/rooms/dataSource/localChannelsClient";
import { ROOMS_LAST_ROUTE_STORAGE_KEY } from "../../features/rooms/shell/navigation";
import {
  ROOMS_PROJECT_BINDINGS_STORAGE_KEY,
  RoomsProjectBindings,
  type RoomsProjectBindings as RoomsProjectBindingsType,
} from "../../features/rooms/threads/roomProjectBindings";
import { type AppSidebarVariant, useAppSidebarVariantSelection } from "../appSidebarVariant";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Radio, RadioGroup } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const AUTO_SETTLE_MIN_DAYS = 1;
const AUTO_SETTLE_MAX_DAYS = 90;
const AUTO_SETTLE_DEFAULT_DAYS = 3;

const COMPOSER_SEND_SHORTCUT_OPTIONS = [
  ["enter", "Enter", "Enter sends; Shift+Enter inserts a newline."],
  [
    "modifier_when_multiline",
    "Modifier for multiline",
    "Enter sends one line. After a newline, use ⌘/Ctrl+Enter.",
  ],
  ["modifier_always", "Always use modifier", "Only ⌘/Ctrl+Enter sends."],
] as const satisfies readonly (readonly [ComposerSendShortcut, string, string])[];

export function composerShortcutPatch(target: "channel" | "thread", value: ComposerSendShortcut) {
  return target === "channel"
    ? { channelComposerSendShortcut: value }
    : { threadComposerSendShortcut: value };
}

function ComposerSendShortcutControl({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: ComposerSendShortcut) => void;
  readonly value: ComposerSendShortcut;
}) {
  return (
    <RadioGroup
      aria-label={label}
      className="grid gap-2 py-3 lg:grid-cols-3"
      onValueChange={(nextValue) => onChange(nextValue as ComposerSendShortcut)}
      value={value}
    >
      {COMPOSER_SEND_SHORTCUT_OPTIONS.map(([shortcut, title, description]) => (
        <label
          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-3 has-[[data-checked]]:border-primary has-[[data-checked]]:ring-1 has-[[data-checked]]:ring-primary/30"
          key={shortcut}
        >
          <Radio className="mt-0.5" value={shortcut} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  // Local draft so the field can be emptied mid-edit; the setting only moves
  // on valid input and snaps back to the persisted value on blur.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={AUTO_SETTLE_MIN_DAYS}
      max={AUTO_SETTLE_MAX_DAYS}
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        // Number(), not parseInt: "3.5" must be rejected (not truncated to a
        // committed 3 while the field shows 3.5) — commit only when the
        // persisted value matches the displayed one.
        const parsed = Number(event.target.value);
        if (
          Number.isInteger(parsed) &&
          parsed >= AUTO_SETTLE_MIN_DAYS &&
          parsed <= AUTO_SETTLE_MAX_DAYS
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label="Days of inactivity before auto-settle"
    />
  );
}

function RoomsLocalApiBaseUrlInput({
  onCommit,
  value,
}: {
  readonly onCommit: (value: string) => void;
  readonly value: string;
}) {
  const [draft, setDraft] = useState(value);
  const validation = validateRoomsLocalApiBaseUrl(draft);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (validation.ok) onCommit(validation.value);
  };

  return (
    <div className="grid w-full gap-1.5 py-3">
      <Input
        aria-invalid={!validation.ok}
        aria-label="Rooms Local API address"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        placeholder={DEFAULT_ROOMS_LOCAL_API_BASE_URL}
        value={draft}
      />
      <p className={validation.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
        {validation.ok ? "Loopback only. Alternate local ports are supported." : validation.message}
      </p>
    </div>
  );
}

export function BetaSettingsPanel() {
  const [sidebarVariant, setSidebarVariant] = useAppSidebarVariantSelection();
  const { localConfig, mode, selectedBySource, selectedRoom, setMode, state } =
    useRoomsDataSource();
  const [resetRoomsOpen, setResetRoomsOpen] = useState(false);
  const [sampleBindings] = useLocalStorage(
    ROOMS_PROJECT_BINDINGS_STORAGE_KEY,
    Object.freeze({}) as RoomsProjectBindingsType,
    RoomsProjectBindings,
  );
  const [lastRoomsRoute] = useLocalStorage(
    ROOMS_LAST_ROUTE_STORAGE_KEY,
    null,
    Schema.NullOr(Schema.String),
  );
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "Rooms diagnostics",
  });
  const sidebarAutoSettleAfterDays = useClientSettings(
    (settings) => settings.sidebarAutoSettleAfterDays,
  );
  const roomsLocalApiBaseUrl = useClientSettings((settings) => settings.roomsLocalApiBaseUrl);
  const channelComposerSendShortcut = useClientSettings(
    (settings) => settings.channelComposerSendShortcut,
  );
  const threadComposerSendShortcut = useClientSettings(
    (settings) => settings.threadComposerSendShortcut,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Beta features">
        <SettingsRow
          title="Sidebar version"
          description="Choose one navigation model. Version 1, Version 2, and Rooms never render at the same time."
        >
          <RadioGroup
            aria-label="Sidebar version"
            className="grid gap-2 py-3 sm:grid-cols-3"
            onValueChange={(value) => {
              const variant = value as AppSidebarVariant;
              setSidebarVariant(variant);
              // Preserve the established v1/v2 setting as a compatible
              // fallback if the local three-way selection is ever cleared.
              updateSettings({
                sidebarV2Enabled: variant === "v2",
                sidebarV2ConfiguredByUser: true,
              });
            }}
            value={sidebarVariant}
          >
            {(
              [
                ["v1", "Version 1", "Original project and thread tree."],
                ["v2", "Version 2", "Flat, lifecycle-oriented thread list."],
                ["v3", "Version 3", "Rooms workspaces, channels, and project context."],
              ] as const
            ).map(([value, title, description]) => (
              <label
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-3 has-[[data-checked]]:border-primary has-[[data-checked]]:ring-1 has-[[data-checked]]:ring-primary/30"
                key={value}
              >
                <Radio className="mt-0.5" value={value} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </SettingsRow>
        {sidebarVariant === "v2" ? (
          <>
            <SettingsRow
              title="Auto-settle inactive threads"
              description="Threads with no activity for this long settle automatically. Threads on merged or closed PRs always settle."
              control={
                <Switch
                  checked={sidebarAutoSettleAfterDays !== null}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      sidebarAutoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                    })
                  }
                  aria-label="Auto-settle inactive threads"
                />
              }
            />
            {sidebarAutoSettleAfterDays !== null ? (
              <SettingsRow
                title="Days of inactivity before auto-settle"
                description="Any new activity un-settles a thread automatically."
                control={
                  <AutoSettleDaysInput
                    value={sidebarAutoSettleAfterDays}
                    onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                  />
                }
              />
            ) : null}
          </>
        ) : null}
        <SettingsRow
          title="Channel send shortcut"
          description="Choose when Enter sends messages in Local Rooms channels."
        >
          <ComposerSendShortcutControl
            label="Channel send shortcut"
            onChange={(value) => updateSettings(composerShortcutPatch("channel", value))}
            value={channelComposerSendShortcut}
          />
        </SettingsRow>
        <SettingsRow
          title="Thread send shortcut"
          description="Choose when Enter sends prompts through the native T3 composer."
        >
          <ComposerSendShortcutControl
            label="Thread send shortcut"
            onChange={(value) => updateSettings(composerShortcutPatch("thread", value))}
            value={threadComposerSendShortcut}
          />
        </SettingsRow>
        <SettingsRow
          title="Rooms content"
          description="Sample is the certified demonstration workspace. Local connects to the development-only t3rooms service and keeps native T3 projects and threads."
        >
          <RadioGroup
            aria-label="Rooms content"
            className="grid gap-2 py-3 sm:grid-cols-2"
            onValueChange={(value) => setMode(value as RoomsDataSourceMode)}
            value={mode}
          >
            {(
              [
                ["sample", "Sample workspace", "Certified Rooms data for evaluation."],
                ["local", "Local workspace", "Actual local T3 projects and threads only."],
              ] as const
            ).map(([value, title, description]) => (
              <label
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-3 has-[[data-checked]]:border-primary has-[[data-checked]]:ring-1 has-[[data-checked]]:ring-primary/30"
                key={value}
              >
                <Radio className="mt-0.5" value={value} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </SettingsRow>
        <SettingsRow
          title="Local Rooms API"
          description="Development-only loopback service for one durable Local workspace. This is not remote or multiplayer connectivity."
        >
          <RoomsLocalApiBaseUrlInput
            onCommit={(value) => updateSettings({ roomsLocalApiBaseUrl: value })}
            value={roomsLocalApiBaseUrl}
          />
          <p className="pb-3 text-xs text-muted-foreground">
            Current source state:{" "}
            <span className="font-medium text-foreground">{state.status}</span>
            {state.status !== "ready" && state.error ? ` · ${state.error.code}` : ""}
          </p>
        </SettingsRow>
        <SettingsRow
          title="Rooms diagnostics"
          description="Copy a redacted snapshot of the Rooms mode, selected IDs, project references, source state, and last Rooms route."
          control={
            <Button
              onClick={() =>
                copyToClipboard(
                  buildRoomsDiagnostics({
                    mode,
                    state,
                    selectedBySource,
                    selectedRoomId: selectedRoom?.id ?? null,
                    localConfig,
                    sampleBindings,
                    lastRoomsRoute,
                    localApiBaseUrl: roomsLocalApiBaseUrl,
                  }),
                  undefined,
                )
              }
              size="sm"
              variant="outline"
            >
              {isCopied ? "Copied" : "Copy Rooms diagnostics"}
            </Button>
          }
        />
        <SettingsRow
          title="Reset Rooms beta settings"
          description="Return Rooms to Sample and clear only Rooms source, selection, project-binding, and V3 sidebar preferences. T3 projects and threads are never removed."
          control={
            <Button onClick={() => setResetRoomsOpen(true)} size="sm" variant="outline">
              Reset Rooms…
            </Button>
          }
        />
      </SettingsSection>
      <AlertDialog open={resetRoomsOpen} onOpenChange={setResetRoomsOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Rooms beta settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears only Rooms source, room selection, local bindings, and V3 sidebar layout.
              It does not delete T3 projects, threads, prompts, credentials, or app settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              onClick={() => {
                resetRoomsBetaSettings();
                updateSettings({ roomsLocalApiBaseUrl: DEFAULT_ROOMS_LOCAL_API_BASE_URL });
                setResetRoomsOpen(false);
              }}
              variant="destructive"
            >
              Reset Rooms settings
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </SettingsPageContainer>
  );
}
