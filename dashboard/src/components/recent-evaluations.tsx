import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { EvaluationItem } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function tone(overall: number | null): string {
  if (overall == null) return "text-muted-foreground";
  if (overall >= 8.5) return "text-emerald-700 dark:text-emerald-400";
  if (overall >= 7) return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
}

export function RecentEvaluations({
  items,
  leadNames = {},
}: {
  items: EvaluationItem[];
  leadNames?: Record<string, string>;
}) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Belum ada evaluasi.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => {
        const critique = item.payload.evaluation?.critique ?? "";
        const body = (
          <>
            <span
              className={cn(
                "mt-0.5 w-9 shrink-0 text-right font-mono text-sm tabular-nums",
                tone(item.overall),
              )}
            >
              {item.overall != null ? item.overall.toFixed(1) : "—"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm leading-snug">{critique}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {item.leadId && leadNames[item.leadId] ? (
                  <>
                    <span className="truncate font-medium text-foreground/70">
                      {leadNames[item.leadId]}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <span className="font-mono">{relativeTime(item.createdAt)}</span>
              </span>
            </span>
          </>
        );

        return (
          <li key={item.id}>
            {item.leadId ? (
              <Link
                href={`/leads/${item.leadId}`}
                className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                {body}
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
