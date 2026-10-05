import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact metric readout. Deliberately not the oversized hero-metric card:
 * value and label share one line so a row of these reads as a status bar
 * rather than four competing headlines.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 px-4 py-3", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xl tabular-nums">{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border bg-card sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
      {children}
    </div>
  );
}
