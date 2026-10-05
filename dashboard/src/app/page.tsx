"use client";

import { CalendarCheck, Database, GaugeCircle, Sparkles, Users } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-header";
import { Stat, StatStrip } from "@/components/stat";
import { PipelineBoard } from "@/components/pipeline-board";
import { VolumeChart } from "@/components/volume-chart";
import { RecentEvaluations } from "@/components/recent-evaluations";
import { EmptyState, ErrorState } from "@/components/states";
import { TableSkeleton } from "@/components/skeletons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeads, useMetrics } from "@/lib/hooks";
import { phoneFromJid } from "@/lib/format";

export default function OverviewPage() {
  const metrics = useMetrics();
  const leads = useLeads();

  const leadNames = Object.fromEntries(
    (leads.data ?? []).map((l) => [l.id, l.name ?? phoneFromJid(l.waJid)]),
  );
  const totalLeads = (metrics.data?.leadsByDay ?? []).reduce((a, b) => a + b.count, 0);
  const peakDay = Math.max(0, ...(metrics.data?.leadsByDay ?? []).map((d) => d.count));

  return (
    <>
      <PageHeader
        title="Ringkasan"
        description="Aliran lead WhatsApp, skor, dan kualitas balasan agen."
        actions={<ThemeToggle />}
      />

      <PageBody className="space-y-5">
        {metrics.error ? <ErrorState message={metrics.error.message} /> : null}

        {metrics.data ? (
          <StatStrip>
            <Stat
              label="Leads"
              value={metrics.data.totals.leads}
              hint={`${Object.values(metrics.data.segments).reduce((a, b) => a + b, 0)} tersegmentasi`}
              icon={<Users className="size-3.5" />}
            />
            <Stat
              label="Rata-rata skor"
              value={metrics.data.avgScore}
              hint="dari 100"
              icon={<Sparkles className="size-3.5" />}
            />
            <Stat
              label="Evaluasi"
              value={
                metrics.data.avgEvaluation != null
                  ? metrics.data.avgEvaluation.toFixed(1)
                  : "—"
              }
              hint={`${metrics.data.totals.evaluations} penilaian`}
              icon={<GaugeCircle className="size-3.5" />}
            />
            <Stat
              label="Booking"
              value={metrics.data.totals.bookings}
              hint={`${metrics.data.bookingsByStatus.confirmed ?? 0} terkonfirmasi`}
              icon={<CalendarCheck className="size-3.5" />}
            />
            <Stat
              label="Memori LTM"
              value={metrics.data.totals.memories}
              hint="reflection tersimpan"
              icon={<Database className="size-3.5" />}
            />
          </StatStrip>
        ) : !metrics.error ? (
          <TableSkeleton rows={1} className="[&>div]:h-20" />
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Pipeline berdasarkan segmen skor
          </h2>
          {leads.data ? (
            leads.data.length ? (
              <PipelineBoard leads={leads.data} />
            ) : (
              <EmptyState
                title="Belum ada lead"
                description="Kirim pesan pertama lewat WhatsApp atau jalankan `npm run sim` untuk mengisi data contoh."
              />
            )
          ) : (
            <TableSkeleton rows={3} />
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Volume lead · 14 hari terakhir
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2 pt-0">
              {metrics.data ? (
                <>
                  <div className="min-h-52 flex-1">
                    <VolumeChart data={metrics.data.leadsByDay} />
                  </div>
                  <p className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                    <span>
                      Total{" "}
                      <span className="font-mono text-foreground">{totalLeads}</span>{" "}
                      lead baru
                    </span>
                    <span>
                      Puncak harian{" "}
                      <span className="font-mono text-foreground">{peakDay}</span>
                    </span>
                  </p>
                </>
              ) : (
                <TableSkeleton rows={4} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Evaluasi terbaru</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {metrics.data ? (
                <RecentEvaluations
                  items={metrics.data.recentEvaluations}
                  leadNames={leadNames}
                />
              ) : (
                <div className="p-4">
                  <TableSkeleton rows={4} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
