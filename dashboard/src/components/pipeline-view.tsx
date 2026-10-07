"use client";

import * as React from "react";
import { useSWRConfig } from "swr";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Stat, StatStrip } from "@/components/stat";
import { ErrorState } from "@/components/states";
import { useEvents, useJobs, usePipelineSnapshot } from "@/lib/hooks";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const JOB_TONE: Record<string, string> = {
  queued: "border-border bg-muted text-muted-foreground",
  running: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  canceled: "border-border bg-muted text-muted-foreground",
};

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] uppercase",
        tone ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

const inline = (record: Record<string, number>): string =>
  Object.entries(record)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ") || "-";

export function PipelineView() {
  const { mutate } = useSWRConfig();
  const snapshot = usePipelineSnapshot();
  const jobs = useJobs(40);
  const events = useEvents(40);
  const [running, setRunning] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const tick = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await api.pipelineTick();
      setMessage(`Job diproses: ${res.processed}`);
      await mutate(() => true);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const error = snapshot.error ?? jobs.error ?? events.error;

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={(error as Error).message} /> : null}

      {snapshot.data ? (
        <StatStrip>
          <Stat label="Lead" value={snapshot.data.leads} hint={inline(snapshot.data.segments)} />
          <Stat label="Prospek/Outreach" value={inline(snapshot.data.outreach)} />
          <Stat
            label="Proyek"
            value={Object.values(snapshot.data.projectStages).reduce((a, b) => a + b, 0)}
            hint={inline(snapshot.data.projectStages)}
          />
          <Stat
            label="Approval"
            value={snapshot.data.approvalsPending}
            hint="menunggu"
          />
          <Stat
            label="Tiket"
            value={Object.values(snapshot.data.ticketsOpen).reduce((a, b) => a + b, 0)}
            hint={inline(snapshot.data.ticketsOpen)}
          />
        </StatStrip>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={tick} disabled={running}>
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Jalankan tick
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void mutate(() => true)}
        >
          <RefreshCw className="size-3.5" />
          Muat ulang
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Job Terjadwal</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tipe</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-20">Coba</TableHead>
                <TableHead className="hidden md:table-cell">Jadwal</TableHead>
                <TableHead className="hidden md:table-cell">Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs.data ?? []).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs">{job.type}</TableCell>
                  <TableCell>
                    <Pill tone={JOB_TONE[job.status]}>{job.status}</Pill>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {job.attempts}/{job.maxAttempts}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {relativeTime(job.runAt)}
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate text-xs text-muted-foreground md:table-cell">
                    {job.lastError ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.data && jobs.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada job.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Event Terbaru</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {(events.data ?? []).map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-2 border-b border-dashed pb-1.5 text-xs last:border-0"
            >
              <span className="font-mono font-medium">{event.type}</span>
              {event.entityId ? (
                <span className="truncate font-mono text-muted-foreground">
                  {event.entityType}:{event.entityId.slice(0, 8)}
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-muted-foreground">
                {relativeTime(event.createdAt)}
              </span>
            </div>
          ))}
          {events.data && events.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada event.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
