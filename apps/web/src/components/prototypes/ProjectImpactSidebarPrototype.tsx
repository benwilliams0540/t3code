// PROTOTYPE: three sidebar treatments for project-scoped agent and host impact.
// Switch with `?project-impact=a|b|c`. Synthetic data only; never ship this component.
import {
  ActivityIcon,
  BarChart3Icon,
  BotIcon,
  CpuIcon,
  FlameIcon,
  MemoryStickIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type ProjectImpactPrototypeVariant = "a" | "b" | "c";

const VARIANTS: readonly ProjectImpactPrototypeVariant[] = ["a", "b", "c"];
const VARIANT_NAMES: Record<ProjectImpactPrototypeVariant, string> = {
  a: "Pulse strip",
  b: "Agent roster",
  c: "Trend deck",
};

interface PrototypeMetrics {
  readonly agents: number;
  readonly cpu: number;
  readonly memoryGb: string;
  readonly temperature: number;
  readonly tasks: readonly string[];
  readonly cpuTrend: readonly number[];
  readonly memoryTrend: readonly number[];
  readonly heatTrend: readonly number[];
}

function metricSeed(value: string): number {
  return [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function prototypeMetrics(projectKey: string): PrototypeMetrics {
  const seed = metricSeed(projectKey);
  const cpu = 18 + (seed % 49);
  const temperature = 48 + (seed % 27);
  const trend = (offset: number, scale: number) =>
    Array.from({ length: 10 }, (_, index) => 18 + ((seed + index * scale + offset) % 68));
  return {
    agents: 1 + (seed % 4),
    cpu,
    memoryGb: (1.2 + (seed % 28) / 10).toFixed(1),
    temperature,
    tasks: ["Implementing story telemetry", "Reviewing resource attribution", "Running checks"],
    cpuTrend: trend(7, 11),
    memoryTrend: trend(21, 7),
    heatTrend: trend(34, 5),
  };
}

function Sparkline({ bars, tone }: { readonly bars: readonly number[]; readonly tone: string }) {
  return (
    <span className="flex h-5 items-end gap-px" aria-hidden>
      {bars.map((height, index) => (
        <span
          className={`w-1 rounded-[1px] ${tone}`}
          key={`${height}-${index}`}
          style={{ height: `${Math.max(18, Math.min(100, height))}%` }}
        />
      ))}
    </span>
  );
}

function Meter({ value, tone }: { readonly value: number; readonly tone: string }) {
  return (
    <span className="h-1.5 overflow-hidden rounded-full bg-sidebar-border/60">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
    </span>
  );
}

function PulseStrip({ metrics }: { readonly metrics: PrototypeMetrics }) {
  return (
    <div className="mx-1.5 mb-1.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 px-2.5 py-2">
      <div className="flex items-center gap-2 text-[10px] text-sidebar-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium text-emerald-500">
          <BotIcon className="size-3" /> {metrics.agents} active
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <CpuIcon className="size-3" /> {metrics.cpu}%
        </span>
        <span className="inline-flex items-center gap-1">
          <MemoryStickIcon className="size-3" /> {metrics.memoryGb}G
        </span>
        <span
          className={`inline-flex items-center gap-1 ${metrics.temperature >= 70 ? "text-amber-500" : ""}`}
        >
          <FlameIcon className="size-3" /> {metrics.temperature}°
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-[10px] text-sidebar-foreground/75">
          {metrics.tasks[0]}
        </span>
        <Sparkline bars={metrics.cpuTrend} tone="bg-cyan-500/75" />
      </div>
    </div>
  );
}

function AgentRoster({ metrics }: { readonly metrics: PrototypeMetrics }) {
  return (
    <div className="mx-1.5 mb-1.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 p-2.5">
      <div className="mb-2 flex items-center justify-between text-[10px]">
        <span className="font-semibold tracking-wide text-sidebar-foreground/80 uppercase">
          {metrics.agents} agents working
        </span>
        <span className="text-sidebar-muted-foreground">Live · host local</span>
      </div>
      <div className="space-y-1.5">
        {metrics.tasks.slice(0, Math.min(2, metrics.agents)).map((task, index) => (
          <div className="flex items-center gap-2" key={task}>
            <span
              className={`size-1.5 shrink-0 rounded-full ${index === 0 ? "bg-emerald-500" : "bg-cyan-500"}`}
            />
            <span className="min-w-0 flex-1 truncate text-[10px] text-sidebar-foreground/75">
              {index === 0 ? "Codex" : "Claw"} · {task}
            </span>
            <span className="text-[9px] tabular-nums text-sidebar-muted-foreground">
              {Math.max(4, metrics.cpu - index * 13)}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-[1fr_auto] items-center gap-2">
        <Meter value={metrics.cpu} tone={metrics.cpu > 60 ? "bg-amber-500" : "bg-emerald-500"} />
        <span className="text-[9px] tabular-nums text-sidebar-muted-foreground">
          project share {metrics.cpu}% CPU
        </span>
      </div>
    </div>
  );
}

function TrendMetric({
  bars,
  label,
  tone,
  value,
}: {
  readonly bars: readonly number[];
  readonly label: string;
  readonly tone: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-sidebar-background/45 px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] text-sidebar-muted-foreground">{label}</span>
        <span className="text-[9px] font-medium tabular-nums text-sidebar-foreground/80">
          {value}
        </span>
      </div>
      <Sparkline bars={bars} tone={tone} />
    </div>
  );
}

function TrendDeck({ metrics }: { readonly metrics: PrototypeMetrics }) {
  return (
    <div className="mx-1.5 mb-1.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 p-2">
      <div className="grid grid-cols-3 gap-1.5">
        <TrendMetric
          bars={metrics.cpuTrend}
          label="CPU"
          tone="bg-cyan-500/80"
          value={`${metrics.cpu}%`}
        />
        <TrendMetric
          bars={metrics.memoryTrend}
          label="RAM"
          tone="bg-violet-500/80"
          value={`${metrics.memoryGb}G`}
        />
        <TrendMetric
          bars={metrics.heatTrend}
          label="HEAT"
          tone={metrics.temperature >= 70 ? "bg-amber-500/85" : "bg-emerald-500/80"}
          value={`${metrics.temperature}°`}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-sidebar-muted-foreground">
        <ActivityIcon className="size-3 text-emerald-500" />
        <span>{metrics.agents} agents</span>
        <span>·</span>
        <span className="min-w-0 flex-1 truncate">{metrics.tasks[0]}</span>
        <BarChart3Icon className="size-3" />
      </div>
    </div>
  );
}

export function ProjectImpactPrototypePanel({
  projectKey,
  variant,
}: {
  readonly projectKey: string;
  readonly variant: ProjectImpactPrototypeVariant;
}) {
  const metrics = prototypeMetrics(projectKey);
  if (variant === "a") return <PulseStrip metrics={metrics} />;
  if (variant === "b") return <AgentRoster metrics={metrics} />;
  return <TrendDeck metrics={metrics} />;
}

function readVariant(): ProjectImpactPrototypeVariant | null {
  if (!import.meta.env.DEV) return null;
  const candidate = new URLSearchParams(window.location.search).get("project-impact");
  return candidate === "a" || candidate === "b" || candidate === "c" ? candidate : null;
}

export function useProjectImpactPrototypeVariant(): ProjectImpactPrototypeVariant | null {
  const [variant, setVariant] = useState<ProjectImpactPrototypeVariant | null>(readVariant);

  useEffect(() => {
    const sync = () => setVariant(readVariant());
    window.addEventListener("popstate", sync);
    window.addEventListener("project-impact-prototype-change", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("project-impact-prototype-change", sync);
    };
  }, []);

  return variant;
}

export function ProjectImpactPrototypeSwitcher({
  variant,
}: {
  readonly variant: ProjectImpactPrototypeVariant;
}) {
  const cycle = useCallback(
    (direction: -1 | 1) => {
      const current = VARIANTS.indexOf(variant);
      const next = VARIANTS[(current + direction + VARIANTS.length) % VARIANTS.length]!;
      const url = new URL(window.location.href);
      url.searchParams.set("project-impact", next);
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(new Event("project-impact-prototype-change"));
    },
    [variant],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycle]);

  return (
    <div className="fixed bottom-4 left-1/2 z-100 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/20 bg-neutral-950 px-2 py-1.5 text-xs text-white shadow-2xl">
      <button
        aria-label="Previous project impact prototype"
        className="grid size-7 place-items-center rounded-full hover:bg-white/10"
        onClick={() => cycle(-1)}
        type="button"
      >
        ←
      </button>
      <span className="min-w-36 text-center">
        Prototype {variant.toUpperCase()} · {VARIANT_NAMES[variant]}
      </span>
      <button
        aria-label="Next project impact prototype"
        className="grid size-7 place-items-center rounded-full hover:bg-white/10"
        onClick={() => cycle(1)}
        type="button"
      >
        →
      </button>
      <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
        synthetic
      </span>
    </div>
  );
}
