import Link from "next/link";
import { ScoreMeter } from "@/components/score-meter";
import { initials, phoneFromJid, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lead, Segment } from "@/lib/api";

const COLUMNS: {
  segment: Segment;
  key: "nurture" | "objection" | "closing";
  title: string;
  band: string;
  meaning: string;
  dot: string;
}[] = [
  {
    segment: "closing",
    key: "closing",
    title: "Closing",
    band: "≥ 75",
    meaning: "Amankan langkah berikutnya",
    dot: "bg-emerald-500",
  },
  {
    segment: "objection",
    key: "objection",
    title: "Objection",
    band: "40–74",
    meaning: "Tangani keberatan",
    dot: "bg-amber-500",
  },
  {
    segment: "nurture",
    key: "nurture",
    title: "Nurture",
    band: "< 40",
    meaning: "Bangun kepercayaan",
    dot: "bg-sky-500",
  },
];

/**
 * The pipeline is the primary object on the overview: leads grouped by the
 * segment the scorer assigned them. It replaces the generic "metric cards"
 * scaffold with the thing an operator actually acts on.
 */
export function PipelineBoard({ leads }: { leads: Lead[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = leads
          .filter((l) => l.segment === col.segment)
          .sort((a, b) => b.score - a.score);
        return (
          <section
            key={col.key}
            className="flex flex-col rounded-lg border bg-card"
            aria-label={`Pipeline ${col.title}`}
          >
            <header className="flex items-center gap-2 border-b px-3 py-2.5">
              <span className={cn("size-2 rounded-full", col.dot)} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{col.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {col.band} · {col.meaning}
                </p>
              </div>
              <span className="ml-auto font-mono text-sm tabular-nums">
                {items.length}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-1.5 p-2">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Belum ada lead
                </p>
              ) : (
                items.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="group flex items-center gap-2.5 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted/50"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background font-mono text-[11px]">
                      {initials(lead.name, lead.waJid)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {lead.name ?? phoneFromJid(lead.waJid)}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {lead.stage.replace(/-/g, " ")} · {relativeTime(lead.lastSeen)}
                      </span>
                    </span>
                    <ScoreMeter score={lead.score} />
                  </Link>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
