"use client";

import * as React from "react";
import useSWR from "swr";
import { Clock, Loader2, Play, Send } from "lucide-react";
import { api, type TickResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  pending: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  messaged:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  follow_up: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  replied:
    "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  done: "border-border bg-muted text-muted-foreground",
  opted_out: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  none: "border-border bg-muted text-muted-foreground",
};

const ORDER = ["pending", "messaged", "follow_up", "replied", "done", "opted_out"];

export function OutreachPanel() {
  const { data, mutate, isLoading } = useSWR("outreach", () => api.outreach(40), {
    refreshInterval: 10_000,
    keepPreviousData: true,
  });
  const [busy, setBusy] = React.useState(false);
  const [tick, setTick] = React.useState<TickResult | null>(null);

  const runTick = async (force: boolean) => {
    setBusy(true);
    try {
      setTick(await api.runOutreachTick(force));
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  const stats = data?.stats ?? {};

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Send className="size-4 text-muted-foreground" />
          Outreach Otomatis
        </CardTitle>
        <span className="flex max-w-full items-start gap-1.5 rounded border border-border bg-muted px-2 py-1 font-mono text-[11px] leading-5 text-muted-foreground">
          <Clock className="mt-1 size-3 shrink-0" />
          {data?.workingHours ?? "—"}
        </span>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <p className="text-xs text-muted-foreground">
          Agen hanya menghubungi prospek pada jam kerja di atas. Pesan dikirim bertahap
          (batch {""}
          <code className="font-mono">OUTREACH_BATCH</code>) dan berhenti otomatis untuk
          lead yang membalas <code className="font-mono">STOP</code>.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {ORDER.map((key) => (
            <span
              key={key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]",
                STATUS_STYLE[key],
              )}
            >
              <span className="font-medium">{key.replace("_", " ")}</span>
              <span className="font-mono tabular-nums">{stats[key] ?? 0}</span>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => runTick(false)} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Jalankan sekarang
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => runTick(true)}
            disabled={busy}
            title="Abaikan jam kerja (untuk pengujian)"
          >
            Paksa (abaikan jam kerja)
          </Button>
        </div>

        {tick ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
            {tick.ran
              ? `Tick berjalan — ${tick.sent} pesan diproses.`
              : `Tidak berjalan: ${tick.reason ?? "—"}`}
          </p>
        ) : null}

        <div className="rounded-md border">
          <p className="border-b px-3 py-2 text-xs font-medium">Log Outreach Terbaru</p>
          {isLoading && !data ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Memuat…</p>
          ) : data && data.log.length > 0 ? (
            <ul className="divide-y">
              {data.log.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px]",
                      STATUS_STYLE[item.status] ?? STATUS_STYLE.none,
                    )}
                  >
                    {item.status}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs">
                      <b>{item.name ?? item.waJid?.split("@")[0] ?? "Lead"}</b>{" "}
                      <span className="text-muted-foreground">
                        · percobaan {item.attempt} ({item.kind})
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">
                      {item.message}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {relativeTime(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Belum ada pesan outreach.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
