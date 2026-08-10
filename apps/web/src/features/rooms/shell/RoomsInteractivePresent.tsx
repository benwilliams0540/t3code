import { BotIcon, CircleUserRoundIcon, MonitorIcon, type LucideIcon } from "lucide-react";

import type { RoomsInteractiveWorkspace } from "../dataSource/humanSharedContract";

interface InteractivePrincipal {
  readonly id: string;
  readonly type: "human" | "agent" | "machine";
  readonly display_name: string | null;
  readonly role?: "observer" | "operator" | "admin" | null | undefined;
}

function PrincipalGroup({
  icon: Icon,
  label,
  principals,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly principals: readonly InteractivePrincipal[];
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Icon className="size-4" /> {label} · {principals.length}
      </h2>
      <div className="mt-3 grid gap-2">
        {principals.length > 0 ? (
          principals.map((principal) => (
            <article className="rounded-xl border border-border bg-card p-4" key={principal.id}>
              <p className="font-medium text-foreground">
                {principal.display_name ?? "Name unavailable"}
              </p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {principal.type} · {principal.role ?? "no room role"}
              </p>
              <code className="mt-2 block break-all text-[10px] text-muted-foreground">
                {principal.id}
              </code>
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No {label.toLowerCase()} are exposed by this workspace contract.
          </p>
        )}
      </div>
    </section>
  );
}

export function RoomsInteractivePresent({
  workspace,
}: {
  readonly workspace: RoomsInteractiveWorkspace;
}) {
  const principals: readonly InteractivePrincipal[] =
    "principals" in workspace ? workspace.principals : [workspace.principal];
  return (
    <div className="mx-auto w-full max-w-6xl p-5 sm:p-8" data-rooms-present="distinct-principals">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">People and machines</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          People, agents, and machine registrations remain separate identities. Matching
          self-reported names never merge two machine IDs.
        </p>
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <PrincipalGroup
          icon={CircleUserRoundIcon}
          label="People"
          principals={principals.filter((principal) => principal.type === "human")}
        />
        <PrincipalGroup
          icon={BotIcon}
          label="Agents"
          principals={principals.filter((principal) => principal.type === "agent")}
        />
        <PrincipalGroup
          icon={MonitorIcon}
          label="Machines"
          principals={principals.filter((principal) => principal.type === "machine")}
        />
      </div>
    </div>
  );
}
