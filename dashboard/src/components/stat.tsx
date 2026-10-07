import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  default: "bg-card",
  primary: "border-primary/20 bg-primary/[0.035]",
  success: "border-emerald-500/20 bg-emerald-500/[0.035]",
  warning: "border-amber-500/25 bg-amber-500/[0.045]",
  danger: "border-rose-500/20 bg-rose-500/[0.035]",
};

const ICON_TONES = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl border border-border/80 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.025)]",
        TONES[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {label}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="min-w-0 break-words font-mono text-2xl font-medium tracking-[-0.04em] tabular-nums">
            {value}
          </span>
          {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        </div>
      </div>
      {icon ? (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", ICON_TONES[tone])}>
          {icon}
        </span>
      ) : null}
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-4">
      {children}
    </div>
  );
}
