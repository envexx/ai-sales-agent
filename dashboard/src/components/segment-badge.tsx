import { cn } from "@/lib/utils";
import { segmentMeta, type SegmentMeta } from "@/lib/format";
import type { Segment } from "@/lib/api";

const STYLE: Record<"nurture" | "objection" | "closing", string> = {
  nurture: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  objection: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  closing: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export function SegmentBadge({
  segment,
  withBand = false,
  className,
}: {
  segment: Segment;
  withBand?: boolean;
  className?: string;
}) {
  const meta: SegmentMeta | null = segmentMeta(segment);
  if (!meta || !segment) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground",
          className,
        )}
      >
        Belum diskor
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        STYLE[segment],
        className,
      )}
    >
      {meta.label}
      {withBand ? <span className="font-mono opacity-70">{meta.band}</span> : null}
    </span>
  );
}
