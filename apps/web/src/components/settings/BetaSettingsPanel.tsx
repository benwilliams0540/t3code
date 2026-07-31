import { useEffect, useState } from "react";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { type AppSidebarVariant, useAppSidebarVariantSelection } from "../appSidebarVariant";
import { Input } from "../ui/input";
import { Radio, RadioGroup } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const AUTO_SETTLE_MIN_DAYS = 1;
const AUTO_SETTLE_MAX_DAYS = 90;
const AUTO_SETTLE_DEFAULT_DAYS = 3;

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

export function BetaSettingsPanel() {
  const [sidebarVariant, setSidebarVariant] = useAppSidebarVariantSelection();
  const sidebarAutoSettleAfterDays = useClientSettings(
    (settings) => settings.sidebarAutoSettleAfterDays,
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
      </SettingsSection>
    </SettingsPageContainer>
  );
}
