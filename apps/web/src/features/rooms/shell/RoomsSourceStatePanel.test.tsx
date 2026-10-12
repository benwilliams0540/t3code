import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vite-plus/test";

import { RoomsSourceStatePanel } from "./RoomsSourceStatePanel";

it("keeps real connection recovery controls without a Sample escape", () => {
  const markup = renderToStaticMarkup(
    <RoomsSourceStatePanel
      errorCode="rooms_local_disabled"
      message="The local service is unavailable."
      onOpenSettings={() => undefined}
      onRetry={() => undefined}
      title="Local workspace unavailable"
    />,
  );
  expect(markup).toContain("Retry connection");
  expect(markup).toContain("Threadspace settings");
  expect(markup).toContain("rooms_local_disabled");
  expect(markup).not.toContain("Sample");
  const withoutRetry = renderToStaticMarkup(
    <RoomsSourceStatePanel
      message="Configure the service in settings."
      onOpenSettings={() => undefined}
      title="Invalid configuration"
    />,
  );
  expect(withoutRetry).not.toContain("Retry connection");
  expect(withoutRetry).toContain("Threadspace settings");
});
