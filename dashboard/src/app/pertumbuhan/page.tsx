"use client";

import { useState } from "react";
import { Check, Minus, Sparkles, TrendingDown, TrendingUp, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { ThemeToggle } from "@/components/theme-toggle";
import { useGrowth, useImprovements } from "@/lib/hooks";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function GrowthPage() {
  const { data: growth, error, mutate: mutateGrowth } = useGrowth(14);
  const { data: improvements, mutate: mutateImprovements } = useImprovements();
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <>
        <PageHeader title="Pertumbuhan Agent" actions={<ThemeToggle />} />
        <PageBody className="space-y-6">
          <ErrorState message={error.message} />
        </PageBody>
      </>
    );
  }

  const agents = [...(growth?.agents ?? [])].sort(
    (a, b) => b.done + b.failed - (a.done + a.failed),
  );
  const pending = (improvements ?? []).filter(
    (item) => item.kind === "suggestion" && item.status === "proposed",
  );

  async function runOptimize() {
    setBusy(true);
    try {
      await api.runOptimize();
      await Promise.all([mutateGrowth(), mutateImprovements()]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(true);
    try {
      await (action === "approve"
        ? api.approveImprovement(id)
        : api.rejectImprovement(id));
      await mutateImprovements();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pertumbuhan Agent"
        description="Setiap agent belajar dari hasil kerjanya: kinerja, pelajaran, dan usulan perbaikan."
        actions={<ThemeToggle />}
      />
      <PageBody className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {agents.filter((a) => a.done + a.failed > 0).length} agent aktif ·{" "}
            {pending.length} usulan menunggu · jendela {growth?.days ?? 14} hari
          </p>
          <Button size="sm" onClick={runOptimize} disabled={busy}>
            <Sparkles className="size-3.5" />
            {busy ? "Menganalisis…" : "Jalankan analisis"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kinerja per agent</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {agents.map((a) => (
              <div
                key={a.slug}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {a.divisionCode} · selesai {a.done} · gagal {a.failed} · pelajaran{" "}
                    {a.lessons7d} · usulan {a.suggestionsPending}
                    {a.suggestionsApplied ? ` · disetujui ${a.suggestionsApplied}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendChip trend={a.trend} />
                  <SuccessChip rate={a.successRate} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Usulan perbaikan ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.length ? (
              pending.map((item) => (
                <div key={item.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.agent} · {relativeTime(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide(item.id, "reject")}
                        disabled={busy}
                      >
                        <X className="size-3.5" />
                        Tolak
                      </Button>
                      <Button size="sm" onClick={() => decide(item.id, "approve")} disabled={busy}>
                        <Check className="size-3.5" />
                        Setujui
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada usulan. Klik “Jalankan analisis”.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] leading-5 text-muted-foreground">
          Usulan yang Anda setujui otomatis masuk ke <b>Knowledge</b> (kategori Playbook) sehingga
          dipakai agen pada pekerjaan berikutnya — begitulah agent makin baik dari waktu ke waktu.
        </p>
      </PageBody>
    </>
  );
}

function TrendChip({ trend }: { trend: number }) {
  if (trend === 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        <Minus className="size-3" />
        stabil
      </span>
    );
  const up = trend > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
        up
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
      )}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {trend}
    </span>
  );
}

function SuccessChip({ rate }: { rate: number | null }) {
  if (rate === null)
    return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
      {rate}% sukses
    </span>
  );
}
