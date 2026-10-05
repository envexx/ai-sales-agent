import { cn } from "@/lib/utils";
import { scoreTone } from "@/lib/format";

const TONE = {
  high: "bg-emerald-500",
  mid: "bg-amber-500",
  low: "bg-sky-500",
} as const;

const TEXT = {
  high: "text-emerald-700 dark:text-emerald-400",
  mid: "text-amber-700 dark:text-amber-400",
  low: "text-sky-700 dark:text-sky-400",
} as const;

/**
 * Lead score as a horizontal meter. A meter (not a ring) keeps the number and
 * the scale on one reading line, which is what scanning a lead list needs.
 */
export function ScoreMeter({
  score,
  showNumber = true,
  className,
}: {
  score: number;
  showNumber?: boolean;
  className?: string;
}) {
  const tone = scoreTone(score);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Skor lead ${score} dari 100`}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", TONE[tone])}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
        />
      </div>
      {showNumber ? (
        <span
          className={cn(
            "w-6 text-right font-mono text-xs tabular-nums",
            TEXT[tone],
          )}
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}
