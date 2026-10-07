import { Check, TrendingUp } from "lucide-react";
import type { EvaluationItem } from "@/lib/api";
import { formatDateTime, toStringList } from "@/lib/format";
import { cn } from "@/lib/utils";

function Score10({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums">{value}/10</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EvaluationCard({ item }: { item: EvaluationItem }) {
  const e = item.payload.evaluation ?? {};
  const strengths = toStringList(e.strengths);
  const improvements = toStringList(e.improvements);

  return (
    <article className="min-w-0 rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-4 sm:px-6">
        <span className="font-mono text-sm tabular-nums">
          {e.overall != null ? e.overall.toFixed(1) : "—"}
          <span className="text-muted-foreground">/10</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(item.createdAt)}
        </span>
        <span className="min-w-0 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere] sm:ml-auto">
          {item.threadId.replace(/^wa:/, "").replace(/@s\.whatsapp\.net$/, "")}
        </span>
      </header>

      <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-6">
        <Score10 value={e.relevance ?? 0} label="Relevansi" />
        <Score10 value={e.groundedness ?? 0} label="Grounded pada konteks" />
        <Score10 value={e.tone ?? 0} label="Nada & bahasa" />
        <Score10 value={e.conversionLikelihood ?? 0} label="Peluang konversi" />
      </div>

      {e.critique ? (
        <p className="break-words border-t px-4 py-4 text-sm leading-6 text-muted-foreground sm:px-6">
          {e.critique}
        </p>
      ) : null}

      {strengths.length || improvements.length ? (
        <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2 sm:px-6">
          {strengths.length ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <Check className="size-3.5 text-emerald-600" />
                Kekuatan
              </p>
              <ul className="space-y-1.5">
                {strengths.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {improvements.length ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <TrendingUp className="size-3.5 text-amber-600" />
                Perlu diperbaiki
              </p>
              <ul className="space-y-1.5">
                {improvements.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function Score10Inline({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums">{value.toFixed(1)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }}
        />
      </div>
    </div>
  );
}
