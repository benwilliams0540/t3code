import { cn } from "~/lib/utils";

export function ThreadspaceMark({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden className={cn("size-6 shrink-0", className)} fill="none" viewBox="0 0 32 32">
      <rect
        height="27"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.2"
        width="27"
        x="2.5"
        y="2.5"
      />
      <path d="M5.5 6h13v4H14v16h-4V10H5.5z" fill="currentColor" />
      <path
        d="M14 17h5.5v-6.5H23M19.5 17H25v6"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <rect height="4.5" stroke="currentColor" strokeWidth="1.4" width="4.5" x="22.5" y="8" />
      <rect height="4.5" stroke="currentColor" strokeWidth="1.4" width="4.5" x="22.75" y="22" />
      <rect fill="currentColor" height="4" width="4" x="17.5" y="15" />
    </svg>
  );
}

export function ThreadspaceBrand({
  compact = false,
  showMark = true,
}: {
  readonly compact?: boolean;
  readonly showMark?: boolean;
}) {
  return (
    <div
      aria-label="Threadspace"
      className="flex shrink-0 items-center gap-2 text-[var(--threadspace-cyan)]"
      role="img"
    >
      {showMark ? <ThreadspaceMark /> : null}
      {compact ? null : (
        <span className="threadspace-wordmark hidden font-mono text-xs font-semibold tracking-[0.19em] text-foreground min-[720px]:inline">
          THREAD
          <span className="mx-1 inline-block -skew-x-12 text-[var(--threadspace-cyan)]">/</span>
          SPACE
        </span>
      )}
    </div>
  );
}
