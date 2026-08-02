import { AtSignIcon, ImageIcon, PlusIcon, SlashIcon, SparklesIcon } from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator as MenuDivider, MenuTrigger } from "../ui/menu";

/**
 * The composer's ＋ control. Everything it offers already exists behind a typed trigger or a paste;
 * this makes those capabilities discoverable instead of requiring a Finder drag or knowing to type
 * a sigil.
 */
export const ComposerQuickActionsMenu = memo(function ComposerQuickActionsMenu(props: {
  attachDisabled: boolean;
  disabled: boolean;
  onAttachImages: () => void;
  onInsertCommand: () => void;
  onInsertFileReference: () => void;
  onInsertSkill: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            aria-label="Quick actions"
            className="shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80"
            data-chat-composer-quick-actions="true"
            disabled={props.disabled}
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <PlusIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuItem disabled={props.attachDisabled} onClick={props.onAttachImages}>
          <ImageIcon className="size-4 shrink-0" />
          Attach images…
        </MenuItem>
        <MenuDivider />
        <MenuItem onClick={props.onInsertFileReference}>
          <AtSignIcon className="size-4 shrink-0" />
          Reference a file
        </MenuItem>
        <MenuItem onClick={props.onInsertCommand}>
          <SlashIcon className="size-4 shrink-0" />
          Run a command
        </MenuItem>
        <MenuItem onClick={props.onInsertSkill}>
          <SparklesIcon className="size-4 shrink-0" />
          Use a skill
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
});
