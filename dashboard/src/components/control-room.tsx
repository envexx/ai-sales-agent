"use client";

import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatStrip } from "@/components/stat";
import { ErrorState } from "@/components/states";
import { useAgentStatus, useEvents, usePipelineSnapshot } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentLiveStatus, AgentStatus } from "@/lib/api";

const DOT: Record<AgentLiveStatus, string> = {
  working: "bg-emerald-500",
  queued: "bg-sky-500",
  error: "bg-rose-500",
  disabled: "bg-muted-foreground/30",
  idle: "bg-muted-foreground/40",
};

const LABEL: Record<AgentLiveStatus, string> = {
  working: "bekerja",
  queued: "menunggu",
  error: "error",
  disabled: "nonaktif",
  idle: "idle",
};

function Dot({ status, ping = false }: { status: AgentLiveStatus; ping?: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0">
      {ping && status === "working" ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", DOT[status])} />
    </span>
  );
}

function lastActivity(agent: AgentStatus): string | null {
  const stamps = [agent.lastJobAt, agent.lastEventAt].filter(Boolean) as string[];
  if (stamps.length === 0) return null;
  return stamps.sort().at(-1) ?? null;
}

export function ControlRoom() {
  const agents = useAgentStatus();
  const snapshot = usePipelineSnapshot();
  const events = useEvents(12);

  const list = agents.data ?? [];
  const working = list.filter((a) => a.status === "working").length;
  const queued = list.filter((a) => a.status === "queued").length;
  const errored = list.filter((a) => a.status === "error").length;
  const approvals = list.reduce((n, a) => n + a.approvalsPending, 0);
  const emergency = snapshot.data?.ticketsOpen.emergency ?? 0;

  const groups: { code: string; name: string; agents: AgentStatus[] }[] = [];
  for (const agent of list) {
    let group = groups.find((g) => g.code === agent.divisionCode);
    if (!group) {
      group = { code: agent.divisionCode, name: agent.division, agents: [] };
      groups.push(group);
    }
    group.agents.push(agent);
  }

  return (
    <div className="space-y-5">
      {agents.error ? <ErrorState message={agents.error.message} /> : null}

      <StatStrip>
        <Stat label="Agent" value={list.length} hint={`${working} bekerja`} />
        <Stat label="Antrean" value={queued} hint="job menunggu" />
        <Stat label="Perlu Anda" value={approvals} hint="approval" />
        <Stat
          label="Darurat"
          value={emergency}
          hint="tiket"
        />
        <Stat
          label="Gagal"
          value={errored}
          hint="agent error"
        />
      </StatStrip>

      {(approvals > 0 || emergency > 0 || errored > 0) ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
          <span className="font-medium">Butuh tindakan Anda:</span>
          {approvals > 0 ? (
            <Link href="/approvals" className="underline">
              {approvals} approval menunggu
            </Link>
          ) : null}
          {emergency > 0 ? (
            <Link href="/tickets" className="underline">
              {emergency} tiket darurat
            </Link>
          ) : null}
          {errored > 0 ? <span>{errored} agent error</span> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-500" />
          Semua aman — tidak ada yang menunggu keputusan Anda.
        </div>
      )}

      {/* Alur end-to-end */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Alur End-to-End</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
            {list.map((agent, index) => (
              <div key={agent.slug} className="flex items-center">
                <Link
                  href={`/agents/${agent.slug}`}
                  className="flex min-w-[7.5rem] flex-col gap-1 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-1.5">
                    <Dot status={agent.status} ping />
                    <span className="truncate text-xs font-medium">{agent.persona}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {LABEL[agent.status]}
                  </span>
                </Link>
                {index < list.length - 1 ? (
                  <ArrowRight className="mx-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Grid agent per divisi */}
      {groups.map((group) => (
        <div key={group.code} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded border bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
              {group.code}
            </span>
            <h2 className="text-sm font-medium">{group.name}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.agents.map((agent) => {
              const activity = lastActivity(agent);
              return (
                <Link
                  key={agent.slug}
                  href={`/agents/${agent.slug}`}
                  className="group rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <Dot status={agent.status} ping />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
                      {agent.persona}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {LABEL[agent.status]}
                    </span>
                    {agent.approvalsPending > 0 ? (
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 font-mono text-[10px] text-amber-700 dark:text-amber-400">
                        {agent.approvalsPending}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{agent.role}</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    {activity ? relativeTime(activity) : "belum ada aktivitas"}
                    <span className="ml-auto font-mono">
                      {agent.jobs.done} job
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Aktivitas live */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="size-4 text-muted-foreground" />
            Aktivitas Terbaru
          </CardTitle>
          <Link href="/pipeline" className="text-xs text-muted-foreground hover:underline">
            Lihat semua
          </Link>
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
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
