"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  ListTodo,
  PlayCircle,
  ShieldAlert,
  TriangleAlert,
  Workflow,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  working: "Bekerja",
  queued: "Menunggu",
  error: "Bermasalah",
  disabled: "Nonaktif",
  idle: "Siap",
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

export function ControlRoomOverview() {
  const agents = useAgentStatus();
  const snapshot = usePipelineSnapshot();
  const events = useEvents(8);
  const [showAgents, setShowAgents] = React.useState(false);

  const list = agents.data ?? [];
  const working = list.filter((agent) => agent.status === "working").length;
  const queued = list.filter((agent) => agent.status === "queued").length;
  const idle = list.filter((agent) => agent.status === "idle").length;
  const errored = list.filter((agent) => agent.status === "error").length;
  const approvals = list.reduce((total, agent) => total + agent.approvalsPending, 0);
  const emergency = snapshot.data?.ticketsOpen.emergency ?? 0;
  const actionCount = approvals + emergency + errored;

  const groups: { code: string; name: string; agents: AgentStatus[] }[] = [];
  for (const agent of list) {
    let group = groups.find((item) => item.code === agent.divisionCode);
    if (!group) {
      group = { code: agent.divisionCode, name: agent.division, agents: [] };
      groups.push(group);
    }
    group.agents.push(agent);
  }

  return (
    <div className="space-y-6">
      {agents.error ? <ErrorState message={agents.error.message} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Apa yang ingin Anda kerjakan?</CardTitle>
          <CardDescription>Tim menangani prospek hingga serah terima. Anda meninjau keputusan, membangun proyek, dan menangani eskalasi.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Siapkan penjualan", description: "Hubungkan WhatsApp dan periksa kesiapan outreach.", href: "/pengaturan" },
            { title: "Ikuti calon klien", description: "Baca percakapan, hasil audit, dan perkembangan lead.", href: "/leads" },
            { title: "Kerjakan proyek", description: "Tinjau PRD dan akses pada preview; ajukan hasil ke QA.", href: "/projects" },
            { title: "Pahami tim agent", description: "Lihat pemicu, hasil, dan peran setiap agent dalam alur bisnis.", href: "/operasional" },
          ].map((item) => <Link key={item.href} href={item.href} className="group rounded-xl border bg-background/50 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"><p className="flex items-center justify-between gap-2 text-sm font-semibold">{item.title}<Workflow className="size-4 text-muted-foreground group-hover:text-primary" /></p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p></Link>)}
        </CardContent>
      </Card>

      <StatStrip>
        <Stat
          label="Total Agent"
          value={list.length}
          hint={`${groups.length} divisi`}
          icon={<Bot className="size-4" />}
          tone="primary"
        />
        <Stat
          label="Sedang Bekerja"
          value={working}
          hint={working > 0 ? "aktif sekarang" : "belum aktif"}
          icon={<PlayCircle className="size-4" />}
          tone={working > 0 ? "success" : "default"}
        />
        <Stat
          label="Dalam Antrean"
          value={queued}
          hint="job menunggu"
          icon={<ListTodo className="size-4" />}
          tone={queued > 0 ? "warning" : "default"}
        />
        <Stat
          label="Perlu Tindakan"
          value={actionCount}
          hint="item prioritas"
          icon={<ShieldAlert className="size-4" />}
          tone={actionCount > 0 ? "danger" : "success"}
        />
      </StatStrip>

      {actionCount > 0 ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-500/25 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold tracking-[-0.01em]">
              {actionCount} hal membutuhkan perhatian Anda
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Prioritaskan keputusan yang menahan pekerjaan agent dan tiket dengan dampak tertinggi.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {approvals > 0 ? (
              <Button asChild variant="outline">
                <Link href="/approvals">{approvals} approval</Link>
              </Button>
            ) : null}
            {emergency > 0 ? (
              <Button asChild variant="outline">
                <Link href="/tickets">{emergency} tiket darurat</Link>
              </Button>
            ) : null}
            {errored > 0 ? (
              <span className="inline-flex h-8 items-center rounded-lg bg-rose-500/10 px-2.5 text-sm font-medium text-rose-700 dark:text-rose-400">
                {errored} agent error
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-card px-4 py-3.5 text-sm shadow-sm">
          <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
          </span>
          <div>
            <p className="font-medium">Operasional berjalan normal</p>
            <p className="text-muted-foreground">Tidak ada keputusan yang menunggu Anda.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Status agent</CardTitle>
          <CardDescription>Ringkasan kondisi tim saat ini. Alur lengkap tersedia di menu terpisah.</CardDescription>
          <CardAction>
            <span className="rounded-full bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {list.length} total
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              { label: "Bekerja", value: working, color: "bg-emerald-500" },
              { label: "Menunggu", value: queued, color: "bg-sky-500" },
              { label: "Bermasalah", value: errored, color: "bg-rose-500" },
              { label: "Siap", value: idle, color: "bg-muted-foreground/40" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 rounded-xl border bg-background/55 p-3 text-sm">
                <span className={cn("size-2 rounded-full", item.color)} />
                <span className="flex-1 text-muted-foreground">{item.label}</span>
                <span className="font-mono font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAgents((current) => !current)}
              aria-expanded={showAgents}
            >
              {showAgents ? "Sembunyikan detail" : "Lihat semua agent"}
              <ChevronDown className={cn("size-4 transition-transform", showAgents && "rotate-180")} />
            </Button>
            <Button asChild>
              <Link href="/operasional">
                <Workflow />
                Buka alur operasional
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {showAgents ? (
        <section className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
          <div>
            <h2 className="font-semibold tracking-[-0.015em]">Detail agent</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Informasi lengkap ditampilkan hanya saat diperlukan.
            </p>
          </div>
          {groups.map((group) => (
            <div key={group.code} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-muted px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                  {group.code}
                </span>
                <h3 className="text-sm font-semibold">{group.name}</h3>
                <span className="text-xs text-muted-foreground">{group.agents.length} agent</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.agents.map((agent) => {
                  const activity = lastActivity(agent);
                  return (
                    <Link
                      key={agent.slug}
                      href={`/agents/${agent.slug}`}
                      className="group rounded-xl border border-border/80 bg-background/50 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/[0.025] hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <Dot status={agent.status} ping />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-primary">
                          {agent.persona}
                        </span>
                        <span className="text-xs text-muted-foreground">{LABEL[agent.status]}</span>
                        {agent.approvalsPending > 0 ? (
                          <span className="rounded-full bg-amber-500/12 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-400">
                            {agent.approvalsPending}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                        {agent.role}
                      </p>
                      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {activity ? relativeTime(activity) : "Belum ada aktivitas"}
                        <span className="ml-auto font-mono">{agent.jobs.done} job</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Aktivitas terbaru
          </CardTitle>
          <CardDescription>Perubahan paling baru di seluruh workflow.</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/pipeline">Lihat semua</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="divide-y divide-border/70">
          {(events.data ?? []).slice(0, 5).map((event) => (
            <div key={event.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.type}</span>
              {event.entityId ? (
                <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
                  {event.entityType}:{event.entityId.slice(0, 8)}
                </span>
              ) : null}
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeTime(event.createdAt)}
              </span>
            </div>
          ))}
          {events.data && events.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
