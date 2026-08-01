import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { DropdownMenuLabel } from "~/components/ui/menu";

import { RoomsMenuGroup } from "./RoomsThreadNavigation";

describe("Rooms thread menu groups", () => {
  it("keeps every group label inside the Base UI menu-group context", () => {
    expect(() => renderToStaticMarkup(<DropdownMenuLabel>Unwrapped</DropdownMenuLabel>)).toThrow(
      /MenuGroupContext is missing/,
    );

    const markup = renderToStaticMarkup(
      <RoomsMenuGroup label="Local room projects">
        <span>Rooms</span>
      </RoomsMenuGroup>,
    );

    expect(markup).toContain('data-slot="menu-group"');
    expect(markup).toContain('data-slot="menu-label"');
    expect(markup).toContain("Local room projects");
  });
});
