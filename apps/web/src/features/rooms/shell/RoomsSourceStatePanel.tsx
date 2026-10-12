import { Button } from "~/components/ui/button";
import { SidebarInset } from "~/components/ui/sidebar";

import { ThreadspaceBrand } from "./ThreadspaceIdentity";

export function RoomsSourceStatePanel({
  errorCode,
  message,
  onOpenSettings,
  onRetry,
  title,
}: {
  readonly errorCode?: string | undefined;
  readonly message: string;
  readonly onOpenSettings: () => void;
  readonly onRetry?: (() => void) | undefined;
  readonly title: string;
}) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <section className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-7 text-center">
          <div className="mb-6 flex justify-center">
            <ThreadspaceBrand />
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
          {errorCode ? (
            <code className="mt-2 block text-[10px] text-muted-foreground">{errorCode}</code>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {onRetry ? <Button onClick={onRetry}>Retry connection</Button> : null}
            <Button onClick={onOpenSettings} variant="outline">
              Threadspace settings
            </Button>
          </div>
        </div>
      </section>
    </SidebarInset>
  );
}
