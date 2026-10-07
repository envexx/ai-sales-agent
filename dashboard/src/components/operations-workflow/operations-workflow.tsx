"use client";

import * as React from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import {
  Activity,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Headphones,
  Megaphone,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Siren,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgentStatus } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentLiveStatus, AgentStatus } from "@/lib/api";

const STATUS_META: Record<
  AgentLiveStatus,
  { label: string; dot: string; text: string; bg: string; priority: number }
> = {
  error: {
    label: "Bermasalah",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-500/10",
    priority: 5,
  },
  working: {
    label: "Bekerja",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    priority: 4,
  },
  queued: {
    label: "Dalam antrean",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
    bg: "bg-sky-500/10",
    priority: 3,
  },
  idle: {
    label: "Siap",
    dot: "bg-slate-400",
    text: "text-muted-foreground",
    bg: "bg-muted",
    priority: 2,
  },
  disabled: {
    label: "Nonaktif",
    dot: "bg-slate-300 dark:bg-slate-700",
    text: "text-muted-foreground",
    bg: "bg-muted/70",
    priority: 1,
  },
};

const DIVISION_META = {
  D0: {
    stage: "Pengawasan",
    outcome: "Tinjau anomali dan briefing; tidak merutekan chat",
    accent: "#8b5cf6",
    icon: Bot,
  },
  D1: {
    stage: "01 · Akuisisi",
    outcome: "Prospek lolos gate; Sales menjadi kanal klien",
    accent: "#0ea5e9",
    icon: Radar,
  },
  D2: {
    stage: "02 · Deal desk",
    outcome: "PRD, legal, DP, dan akses siap untuk preview",
    accent: "#f59e0b",
    icon: BriefcaseBusiness,
  },
  D3: {
    stage: "03 · Delivery",
    outcome: "QA setelah BUILT; dokumentasi menaikkan ke done",
    accent: "#10b981",
    icon: BadgeCheck,
  },
  D4: {
    stage: "04 · Layanan klien",
    outcome: "Handover, support via Sales, monitor, dan retensi",
    accent: "#6366f1",
    icon: Headphones,
  },
  D5: {
    stage: "05 · Flywheel",
    outcome: "Studi kasus mengisi knowledge untuk Sales & Scout",
    accent: "#d946ef",
    icon: Megaphone,
  },
} satisfies Record<
  string,
  { stage: string; outcome: string; accent: string; icon: React.ElementType }
>;

const MAIN_FLOW = ["D1", "D2", "D3", "D4", "D5"] as const;
const DIVISION_WIDTH = 308;
const COLUMN_STEP = 368;
const EMPTY_AGENTS: AgentStatus[] = [];

interface AgentArchitecture {
  nature: "Push" | "Pull" | "Turn-based" | "Gate";
  flow: string;
  note: string;
}

const AGENT_ARCHITECTURE: Record<string, AgentArchitecture> = {
  supervisor: {
    nature: "Push",
    flow: "Jejak seluruh agent → laporan harian & anomali",
    note: "Peninjau, bukan router. Chat klien tidak melewati Supervisor.",
  },
  prospecting: {
    nature: "Push",
    flow: "Niche + kota → prospek discovered → audit → scouted_ready",
    note: "Cari prospek (hari-1 100, lalu 5/hari), lalu audit (maks 15/hari) sampai lead siap untuk Sales.",
  },
  sales: {
    nature: "Turn-based",
    flow: "Chat WhatsApp → kualifikasi, booking, dan jalur demo/meeting",
    note: "Satu-satunya kanal ke klien. L1 selalu menjawab kembali melalui Sales.",
  },
  scoper: {
    nature: "Pull",
    flow: "Transkrip chat/meeting → PRD proyek",
    note: "Ditarik oleh Sales. Jalur meeting wajib memiliki transkrip.",
  },
  legal: {
    nature: "Pull",
    flow: "PRD + data klien → SPK, NDA, dan invoice DP",
    note: "Tidak berjalan tanpa permintaan Sales atau owner.",
  },
  intake: {
    nature: "Pull",
    flow: "PRD → link aman → kredensial terenkripsi → preview",
    note: "Nilai rahasia hanya disimpan di vault, tidak di workspace proyek.",
  },
  qa: {
    nature: "Gate",
    flow: "done_review → pengujian → lulus → SOP & panduan → done",
    note: "Berjalan setelah owner menandai BUILT; lulus memicu dokumentasi lalu menaikkan proyek ke done.",
  },
  handover: {
    nature: "Push",
    flow: "Proyek done → BAST + invoice pelunasan",
    note: "Pengiriman handover membutuhkan persetujuan owner.",
  },
  support: {
    nature: "Turn-based",
    flow: "Keluhan → jawaban dari SOP / tiket / eskalasi",
    note: "Menjawab ke Sales, bukan langsung ke klien.",
  },
  monitor: {
    nature: "Push",
    flow: "Metrik infra & biaya → monitor.alert",
    note: "Berjalan harian dan mengangkat kondisi darurat ke owner.",
  },
  developer: {
    nature: "Push",
    flow: "Pelunasan / permintaan owner → audit situs & rencana → OpenCode → PR GitHub",
    note: "Push & deploy hanya setelah persetujuan owner; engine memakai OpenCode.",
  },
  content: {
    nature: "Push",
    flow: "Hasil proyek → studi kasus anonim → knowledge base",
    note: "Menutup flywheel; knowledge dipakai kembali oleh Sales dan Scout.",
  },
};

type Filter = "all" | "active" | "attention" | "ready";

interface DivisionNodeData extends Record<string, unknown> {
  code: string;
  name: string;
  agents: AgentStatus[];
  visibleAgents: AgentStatus[];
  status: AgentLiveStatus;
  dimmed: boolean;
  onSelectAgent: (agent: AgentStatus) => void;
}

function highestStatus(agents: AgentStatus[]): AgentLiveStatus {
  return agents.reduce<AgentLiveStatus>((highest, agent) => {
    return STATUS_META[agent.status].priority > STATUS_META[highest].priority
      ? agent.status
      : highest;
  }, "disabled");
}

function mostRecentActivity(agent: AgentStatus): string | null {
  const timestamps = [agent.lastJobAt, agent.lastEventAt].filter(Boolean) as string[];
  if (timestamps.length === 0) return null;
  return timestamps.sort().at(-1) ?? null;
}

function StatusDot({ status, ping = false }: { status: AgentLiveStatus; ping?: boolean }) {
  return (
    <span className="relative flex size-2.5 shrink-0">
      {ping && status === "working" ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" />
      ) : null}
      <span className={cn("relative inline-flex size-2.5 rounded-full", STATUS_META[status].dot)} />
    </span>
  );
}

const DivisionNode = React.memo(function DivisionNode({ data }: NodeProps<Node<DivisionNodeData>>) {
  const meta = DIVISION_META[data.code as keyof typeof DIVISION_META] ?? DIVISION_META.D0;
  const Icon = meta.icon;
  const approvals = data.agents.reduce((total, agent) => total + agent.approvalsPending, 0);
  const running = data.agents.reduce(
    (total, agent) => total + agent.jobs.running + agent.jobs.queued,
    0,
  );

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_10px_35px_rgba(15,23,42,0.08)] transition-opacity",
        data.dimmed && "opacity-45",
      )}
      style={{ width: DIVISION_WIDTH, borderTopColor: meta.accent, borderTopWidth: 3 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!size-3 !border-2 !border-background !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: meta.accent }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!size-3 !border-2 !border-background !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: meta.accent }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="!size-3 !border-2 !border-background !bg-muted-foreground"
      />

      <div className="border-b border-border/70 p-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-sm"
            style={{ backgroundColor: meta.accent }}
          >
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {meta.stage}
              </p>
              <span className="font-mono text-[10px] text-muted-foreground">{data.code}</span>
            </div>
            <h3 className="mt-1 truncate text-sm font-semibold tracking-[-0.01em]">{data.name}</h3>
          </div>
        </div>
        <p className="mt-3 min-h-9 text-xs leading-4.5 text-muted-foreground">{meta.outcome}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium",
              STATUS_META[data.status].bg,
              STATUS_META[data.status].text,
            )}
          >
            <StatusDot status={data.status} ping />
            {STATUS_META[data.status].label}
          </span>
          {running > 0 ? (
            <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-400">
              {running} job aktif
            </span>
          ) : null}
          {approvals > 0 ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {approvals} approval
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 p-2.5">
        {data.visibleAgents.map((agent) => {
          const architecture = AGENT_ARCHITECTURE[agent.slug];
          return (
            <button
              key={agent.slug}
              type="button"
              onClick={() => data.onSelectAgent(agent)}
              className="nodrag nopan group/agent flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StatusDot status={agent.status} ping />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block min-w-0 flex-1 truncate text-xs font-semibold group-hover/agent:text-primary">
                    {agent.persona}
                  </span>
                  {architecture ? (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {architecture.nature}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {architecture?.flow ?? agent.role}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                {agent.jobs.running + agent.jobs.queued > 0
                  ? `${agent.jobs.running + agent.jobs.queued} job`
                  : agent.jobs.done > 0
                    ? `${agent.jobs.done} done`
                    : "Siap"}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
});

const nodeTypes = { division: DivisionNode };

function AgentDetail({ agent, onClose }: { agent: AgentStatus; onClose: () => void }) {
  const activity = mostRecentActivity(agent);
  const meta = DIVISION_META[agent.divisionCode as keyof typeof DIVISION_META] ?? DIVISION_META.D0;
  const architecture = AGENT_ARCHITECTURE[agent.slug];

  return (
    <aside className="absolute inset-x-2 bottom-2 z-30 max-h-[72%] overflow-y-auto rounded-2xl border bg-card/97 p-4 shadow-2xl backdrop-blur-xl md:inset-y-3 md:right-3 md:left-auto md:max-h-none md:w-[360px] md:p-5">
      <div className="flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
          style={{ backgroundColor: meta.accent }}
        >
          <Bot className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {agent.divisionCode} · {agent.division}
          </p>
          <h2 className="mt-1 text-base font-semibold">{agent.persona}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Tutup detail agent">
          <X />
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-y py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            STATUS_META[agent.status].bg,
            STATUS_META[agent.status].text,
          )}
        >
          <StatusDot status={agent.status} ping />
          {STATUS_META[agent.status].label}
        </span>
        {architecture ? (
          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
            {architecture.nature}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {agent.enabled ? "Agent aktif" : "Agent dinonaktifkan"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {[
          { label: "Antrean", value: agent.jobs.queued },
          { label: "Berjalan", value: agent.jobs.running },
          { label: "Selesai", value: agent.jobs.done },
          { label: "Gagal", value: agent.jobs.failed },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border bg-background/70 p-3">
            <p className="font-mono text-lg font-semibold tabular-nums">{item.value}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-4 text-sm">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Peran</p>
          <p className="mt-1.5 leading-5">{agent.role}</p>
        </div>
        {architecture ? (
          <>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Input → output</p>
              <p className="mt-1.5 leading-5 text-muted-foreground">{architecture.flow}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Gate / catatan</p>
              <p className="mt-1.5 leading-5 text-muted-foreground">{architecture.note}</p>
            </div>
          </>
        ) : (
          <div>
            <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Pemicu</p>
            <p className="mt-1.5 leading-5 text-muted-foreground">{agent.trigger}</p>
          </div>
        )}
        <div className="rounded-xl bg-muted/55 p-3 text-xs">
          <div className="flex items-center gap-2">
            <Clock3 className="size-3.5 text-muted-foreground" />
            <span className="font-medium">Aktivitas terakhir</span>
          </div>
          <p className="mt-1.5 text-muted-foreground">
            {activity ? relativeTime(activity) : "Belum ada aktivitas"}
            {agent.lastEventType ? ` · ${agent.lastEventType}` : ""}
          </p>
        </div>
        {agent.approvalsPending > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert className="size-4 shrink-0" />
            {agent.approvalsPending} keputusan menunggu persetujuan.
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-2 border-t pt-4">
        <Button asChild className="w-full justify-between">
          <Link href={`/agents/${agent.slug}`}>
            Buka halaman agent
            <ExternalLink />
          </Link>
        </Button>
        {agent.dataLinks.map((link) => (
          <Button key={`${link.href}-${link.label}`} asChild variant="outline" className="w-full justify-between">
            <Link href={link.href}>
              {link.label}
              <ExternalLink />
            </Link>
          </Button>
        ))}
      </div>
    </aside>
  );
}

function matchesFilter(agent: AgentStatus, filter: Filter): boolean {
  if (filter === "active") return agent.status === "working" || agent.status === "queued";
  if (filter === "attention") return agent.status === "error" || agent.approvalsPending > 0;
  if (filter === "ready") return agent.status === "idle";
  return true;
}

export function OperationsWorkflow() {
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const agentsQuery = useAgentStatus();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [selectedAgent, setSelectedAgent] = React.useState<AgentStatus | null>(null);

  const agents = agentsQuery.data ?? EMPTY_AGENTS;
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

  const groups = React.useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; agents: AgentStatus[] }>();
    for (const agent of agents) {
      const existing = byCode.get(agent.divisionCode);
      if (existing) existing.agents.push(agent);
      else byCode.set(agent.divisionCode, {
        code: agent.divisionCode,
        name: agent.division,
        agents: [agent],
      });
    }
    return byCode;
  }, [agents]);

  const nodes = React.useMemo<Node<DivisionNodeData>[]>(() => {
    const codes = ["D0", ...MAIN_FLOW];
    return codes.flatMap((code) => {
      const group = groups.get(code);
      if (!group) return [];

      const visibleAgents = group.agents.filter((agent) => {
        const matchesStatus = matchesFilter(agent, filter);
        const haystack = `${agent.name} ${agent.persona} ${agent.role} ${agent.division}`.toLocaleLowerCase("id-ID");
        return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
      });
      const flowIndex = MAIN_FLOW.indexOf(code as (typeof MAIN_FLOW)[number]);
      const isSupervisor = code === "D0";

      return [{
        id: code,
        type: "division",
        position: isSupervisor
          ? { x: COLUMN_STEP * 2, y: -350 }
          : { x: COLUMN_STEP * flowIndex, y: 80 },
        draggable: false,
        selectable: true,
        data: {
          code,
          name: group.name,
          agents: group.agents,
          visibleAgents,
          status: highestStatus(group.agents),
          dimmed: visibleAgents.length === 0,
          onSelectAgent: setSelectedAgent,
        },
      }];
    });
  }, [filter, groups, normalizedQuery]);

  const edges = React.useMemo<Edge[]>(() => {
    const groupStatus = (code: string) => highestStatus(groups.get(code)?.agents ?? []);
    const mainEdges = MAIN_FLOW.slice(0, -1).map((code, index) => {
      const target = MAIN_FLOW[index + 1];
      const accent = DIVISION_META[code].accent;
      const active = [groupStatus(code), groupStatus(target)].some(
        (status) => status === "working" || status === "queued",
      );
      const labels = [
        "QUALIFY / booking",
        "DP lunas → Preview → BUILT",
        "QA lulus → Docs siap",
        "Pelunasan final",
      ];
      return {
        id: `${code}-${target}`,
        source: code,
        target,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        type: "smoothstep",
        animated: active,
        style: { stroke: accent, strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: accent },
        label: labels[index],
        labelStyle: { fill: accent, fontWeight: 650, fontSize: 10 },
        labelBgStyle: { fill: "var(--card)", fillOpacity: 0.94 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 5,
      } satisfies Edge;
    });

    const supervisorEdge: Edge = {
      id: "D0-D3",
      source: "D0",
      target: "D3",
      sourceHandle: "source-bottom",
      targetHandle: "target-top",
      type: "smoothstep",
      animated: groupStatus("D0") === "working" || groupStatus("D0") === "queued",
      style: { stroke: DIVISION_META.D0.accent, strokeWidth: 2, strokeDasharray: "6 5" },
      markerEnd: { type: MarkerType.ArrowClosed, color: DIVISION_META.D0.accent },
      label: "Pantau & koreksi",
      labelStyle: { fill: DIVISION_META.D0.accent, fontWeight: 650, fontSize: 10 },
      labelBgStyle: { fill: "var(--card)", fillOpacity: 0.94 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 5,
    };

    const flywheelEdge: Edge = {
      id: "D5-D1-loop",
      source: "D5",
      target: "D1",
      sourceHandle: "source-bottom",
      targetHandle: "target-bottom",
      type: "smoothstep",
      animated: true,
      style: { stroke: DIVISION_META.D5.accent, strokeWidth: 2, strokeDasharray: "7 6" },
      markerEnd: { type: MarkerType.ArrowClosed, color: DIVISION_META.D5.accent },
      label: "Knowledge → pertumbuhan berikutnya",
      labelStyle: { fill: DIVISION_META.D5.accent, fontWeight: 650, fontSize: 10 },
      labelBgStyle: { fill: "var(--card)", fillOpacity: 0.94 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 5,
    };

    return [...mainEdges, supervisorEdge, flywheelEdge];
  }, [groups]);

  const working = agents.filter((agent) => agent.status === "working").length;
  const queued = agents.filter((agent) => agent.status === "queued").length;
  const errors = agents.filter((agent) => agent.status === "error").length;
  const approvals = agents.reduce((total, agent) => total + agent.approvalsPending, 0);
  const completed = agents.reduce((total, agent) => total + agent.jobs.done, 0);
  const filterOptions: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "Semua", count: agents.length },
    { value: "active", label: "Aktif", count: working + queued },
    { value: "attention", label: "Perhatian", count: agents.filter((agent) => agent.status === "error" || agent.approvalsPending > 0).length },
    { value: "ready", label: "Siap", count: agents.filter((agent) => agent.status === "idle").length },
  ];

  if (agentsQuery.error) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-card p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto size-8 text-rose-500" />
        <h2 className="mt-3 font-semibold">Status operasional belum dapat dimuat</h2>
        <p className="mt-1 text-sm text-muted-foreground">{agentsQuery.error.message}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void agentsQuery.mutate()}>
          <RefreshCw />
          Coba lagi
        </Button>
      </div>
    );
  }

  if (agentsQuery.isLoading && agents.length === 0) {
    return (
      <div className="grid min-h-[620px] place-items-center rounded-2xl border bg-card">
        <div className="text-center">
          <RefreshCw className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Memuat alur operasional…</p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Agent aktif", value: working + queued, hint: `${working} bekerja · ${queued} antre`, icon: Activity, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "Perlu perhatian", value: errors + approvals, hint: `${errors} error · ${approvals} approval`, icon: ShieldAlert, tone: errors + approvals > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600" },
          { label: "Job selesai", value: completed, hint: "seluruh divisi", icon: CheckCircle2, tone: "text-primary" },
          { label: "Cakupan", value: groups.size, hint: `${agents.length} agent operasional`, icon: Workflow, tone: "text-violet-600 dark:text-violet-400" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <Icon className={cn("size-4", item.tone)} />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-[-0.04em] tabular-nums">{item.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-primary/[0.025] px-4 py-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs leading-5">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            <span className="font-semibold">Interaksi owner hanya di:</span>
            <span className="rounded-full border bg-card px-2 py-1">Preview</span>
            <span className="rounded-full border bg-card px-2 py-1">Approval</span>
            <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-1">
              <Siren className="size-3 text-rose-500" />
              Emergency
            </span>
          </div>
          <p className="text-xs text-muted-foreground lg:ml-auto">
            Supervisor meninjau sistem; chat klien tetap langsung ke Sales.
          </p>
        </div>
        <div className="flex flex-col gap-3 border-b p-3 sm:p-4 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1 xl:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari agent, divisi, atau peran…"
              className="h-9 pl-9"
              aria-label="Cari dalam alur operasional"
            />
          </div>
          <div className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                aria-pressed={filter === option.value}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filter === option.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
                <span className="font-mono text-[10px] opacity-70">{option.count}</span>
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => void agentsQuery.mutate()}>
            <RefreshCw className={cn(agentsQuery.isValidating && "animate-spin")} />
            Segarkan
          </Button>
        </div>

        <div ref={canvasRef} className="relative h-[620px] w-full bg-background/70 sm:h-[700px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            defaultViewport={{ x: 24, y: 260, zoom: 0.72 }}
            onInit={(instance) => {
              if (canvasRef.current && canvasRef.current.clientWidth < 640) {
                void instance.setViewport({ x: 16, y: 32, zoom: 0.72 });
              }
            }}
            minZoom={0.2}
            maxZoom={1.4}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color={resolvedTheme === "dark" ? "#333338" : "#dfe3e8"}
            />
            <Controls position="top-right" className="!border !bg-card !text-foreground !shadow-sm" showInteractive={false} />
            <MiniMap
              zoomable
              pannable
              className="!border !bg-card !shadow-sm max-md:hidden"
              nodeColor={(node) =>
                DIVISION_META[node.id as keyof typeof DIVISION_META]?.accent ?? "#94a3b8"
              }
            />
            <Panel position="bottom-left" className="m-3 max-sm:hidden">
              <div className="rounded-xl border bg-card/92 p-2.5 text-[10px] shadow-md backdrop-blur">
                <p className="font-semibold">Cara membaca</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  <span>Garis penuh: handoff utama</span>
                  <span>Garis putus: pengawasan / flywheel</span>
                  <span>Klik agent: buka detail</span>
                </div>
              </div>
            </Panel>
          </ReactFlow>

          {selectedAgent ? (
            <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-[11px] text-muted-foreground">
          {(Object.keys(STATUS_META) as AgentLiveStatus[]).map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <StatusDot status={status} />
              {STATUS_META[status].label}
            </span>
          ))}
          <span className="ml-auto">Status diperbarui otomatis dari orchestrator.</span>
        </div>
      </div>
    </section>
  );
}
