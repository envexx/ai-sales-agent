"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowUpRight, Search, X, Workflow, Clock3, CircleCheck, CircleAlert, Activity } from "lucide-react";
import { useAgentStatus, useBusinessBoard } from "@/lib/hooks";
import type { BusinessRecord, BusinessProgress } from "@/lib/api";
import { ACTIVITY_LABELS } from "@/lib/agent-experience";
import { cn } from "@/lib/utils";
import { ErrorState } from "./states";

export const STATE_LABEL: Record<string, string> = { running: "Sedang bekerja", waiting: "Menunggu", owner: "Perlu Anda", blocked: "Perlu perhatian", done: "Selesai", closed: "Ditutup", unknown: "Belum ada bukti" };
const AGENT_LABEL: Record<string, string> = { prospecting: "Riset & Audit", sales: "Sales", scoper: "Scoper / PRD", legal: "Legal & Finance", intake: "Intake", owner: "Anda", qa: "QA & Dokumentasi", handover: "Serah terima", developer: "Developer", content: "Content", support: "Support" };
const COLUMN_AGENT: Record<string, string> = { research: "prospecting", prospects: "prospecting", sales: "sales", preparation: "scoper", build: "OWNER", review: "qa", handover: "handover", done: "content" };

/** Kolom per agent worker (Supervisor tidak ikut) + kolom pekerjaan owner. */
function buildAgentColumns(agents: { slug: string; name: string; persona: string }[]): { id: string; label: string }[] {
  const workers = agents.filter((agent) => agent.slug !== "supervisor" && agent.slug !== "owner");
  return [
    ...workers.map((agent) => ({ id: agent.slug, label: agent.persona || agent.name })),
    { id: "OWNER", label: "Anda · Pembangunan" },
  ];
}

/** Agent worker yang sedang menangani satu kartu (aktif → step aktif → tahap). */
function agentForRecord(record: BusinessRecord, workerSlugs: Set<string>): string {
  if (record.currentAgent === "owner") return "OWNER";
  if (record.currentAgent && workerSlugs.has(record.currentAgent)) return record.currentAgent;
  const active = record.steps.find((step) => step.state === "running") ?? record.steps.find((step) => step.state === "blocked");
  if (active && workerSlugs.has(active.agent)) return active.agent;
  return COLUMN_AGENT[record.column] ?? "OWNER";
}
const STAGE_LABEL: Record<string, string> = { scoping: "PRD & persiapan", preview: "Pembangunan", building: "Pembangunan", done_review: "QA & dokumen", built: "QA & dokumen", qa: "QA & dokumen", done: "Siap serah terima", handover: "Serah terima", delivered: "Sudah diserahkan", retained: "Retainer aktif", discovered: "Prospek ditemukan", scouted_ready: "Siap di Sales", in_sales: "Proses penjualan", won: "Deal disepakati", lost: "Lead ditutup", queued: "Menunggu jadwal", running: "Sedang bekerja", failed: "Perlu perhatian" };
export function WorkStatus({ state }: { state: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium", state === "running" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : state === "blocked" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" : state === "owner" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-muted text-muted-foreground")}><span className={cn("size-1.5 rounded-full bg-current", state === "running" && "animate-pulse")} />{STATE_LABEL[state] ?? state}</span>;
}
function date(value: string) { return new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

const PROGRESS_PHASE: Record<string, string> = { maps: "Mencari di Google Maps", enrich: "Melengkapi kontak", save: "Menyimpan prospek", done: "Selesai", failed: "Gagal" };

function progressPercent(progress: BusinessProgress): number {
  if (progress.phase === "done") return 100;
  if (progress.total > 0) return Math.min(100, Math.round((progress.processed / progress.total) * 100));
  return progress.phase === "maps" ? 8 : 0;
}

/** Bar progres live untuk satu proses riset. */
export function ProspectProgressBar({ progress, compact = false }: { progress: BusinessProgress; compact?: boolean }) {
  const percent = progressPercent(progress);
  const counters = `tersimpan ${progress.saved} · dilewati ${progress.skipped}${progress.excluded > 0 ? ` · dikecualikan ${progress.excluded}` : ""}${(progress.duplicates ?? 0) > 0 ? ` · duplikat ${progress.duplicates}` : ""}`;
  return <div className="space-y-1.5">
    <div className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${percent}%` }} /></span><span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{progress.processed}/{progress.total || "…"}</span></div>
    {!compact && <p className="text-[11px] leading-4 text-muted-foreground">{PROGRESS_PHASE[progress.phase] ?? progress.phase} · {counters}</p>}
    {progress.message && <p className="break-words text-[11px] leading-4 text-destructive">{progress.message}</p>}
  </div>;
}

function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  if (diffDays === 0) return `Hari ini · ${label}`;
  if (diffDays === 1) return `Kemarin · ${label}`;
  return label;
}

/** Kelompokkan record per hari (berdasarkan update terakhir), terbaru dulu. */
function groupByDay(records: BusinessRecord[]): { key: string; label: string; items: BusinessRecord[] }[] {
  const map = new Map<string, BusinessRecord[]>();
  for (const record of records) {
    const key = dayKey(record.updatedAt);
    const list = map.get(key) ?? [];
    list.push(record);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({ key, label: dayLabel(items[0]!.updatedAt), items }));
}

export function RecordDetails({ record }: { record: BusinessRecord }) {
  return <div className="space-y-6 text-sm">
    <div className="space-y-3"><WorkStatus state={record.status} /><p className="leading-6 text-muted-foreground">Tahap saat ini: <span className="font-medium text-foreground">{STAGE_LABEL[record.stage] ?? record.stage}</span>{record.currentAgent ? <> · {AGENT_LABEL[record.currentAgent] ?? record.currentAgent}</> : null}</p><p className="text-xs text-muted-foreground">Diperbarui {date(record.updatedAt)}</p><Link href={`/workflow?case=${encodeURIComponent(record.id)}`} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted"><Workflow className="size-4" />Lihat posisi dalam workflow<ArrowUpRight className="size-3.5" /></Link></div>
    {record.approvals.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:bg-amber-950"><p className="font-medium">Menunggu keputusan Anda</p>{record.approvals.map((approval) => <p className="mt-2 leading-6" key={approval.id}>{approval.title}</p>)}<Link className="mt-3 inline-block underline underline-offset-4" href="/approvals">Buka approval</Link></div>}
    {record.progress && <section className="space-y-2 rounded-lg border bg-muted/40 p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">Progres riset</h3><span className="text-[11px] text-muted-foreground">{record.progress.location}</span></div><p className="text-xs text-muted-foreground">{record.progress.niche}</p><ProspectProgressBar progress={record.progress} /></section>}
    <section className="space-y-3"><h3 className="font-medium">Pekerjaan & hasil</h3>{record.jobs.length ? record.jobs.map((job) => <div key={job.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{ACTIVITY_LABELS[job.type] ?? job.type}</p><WorkStatus state={job.status === "failed" ? "blocked" : job.status === "queued" ? "waiting" : job.status} /></div><p className="text-xs text-muted-foreground">{date(job.updatedAt)} · <span className="break-all">{job.id.slice(0, 8)}</span></p>{job.status === "queued" && <p className="text-xs text-muted-foreground">Dijadwalkan {date(job.runAt)}</p>}{job.error && <p className="break-words leading-6 text-destructive">{job.error}</p>}</div>) : <p className="leading-6 text-muted-foreground">Belum ada job tercatat untuk proses ini.</p>}</section>
    <section className="space-y-3"><h3 className="font-medium">Jejak proses</h3>{record.evidence.length ? <ol className="space-y-4 border-l pl-4">{record.evidence.map((event) => <li key={event.id} className="space-y-1"><p>{ACTIVITY_LABELS[event.type] ?? event.type}</p>{event.summary && <p className="break-words text-xs leading-5 text-muted-foreground">{event.summary}</p>}<p className="text-[11px] text-muted-foreground">{date(event.at)} · #{event.id}</p></li>)}</ol> : <p className="leading-6 text-muted-foreground">Belum ada laporan. Tahap berikutnya belum dianggap selesai.</p>}</section>
    <div className="flex flex-wrap gap-3 border-t pt-4">{record.leadId && <Link className="underline underline-offset-4" href={`/leads/${record.leadId}`}>Lead & percakapan</Link>}{record.projectId && <Link className="underline underline-offset-4" href={`/projects/${encodeURIComponent(record.projectId)}`}>Folder proyek</Link>}</div>
  </div>;
}

export function BusinessKanban() {
  const { data, error, isLoading } = useBusinessBoard();
  const { data: agents } = useAgentStatus();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"agent" | "stage">("agent");
  const [todayOnly, setTodayOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleDay = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  if (error) return <ErrorState message={error.message} />;
  if (isLoading || !data || (view === "agent" && !agents)) return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-label="Memuat kanban" />;
  const todayKey = dayKey(new Date());
  const records = data.records.filter((record) => `${record.title} ${record.company ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || record.status === filter) && (!todayOnly || dayKey(record.updatedAt) === todayKey));
  const workerSlugs = new Set((agents ?? []).filter((agent) => agent.slug !== "supervisor").map((agent) => agent.slug));
  const viewColumns = view === "agent" ? buildAgentColumns(agents ?? []) : data.columns;
  const cardsFor = (columnId: string): BusinessRecord[] =>
    records.filter((record) => view === "agent" ? agentForRecord(record, workerSlugs) === columnId : record.column === columnId);
  const active = data.records.find((record) => record.id === selected);
  const stats = [
    { label: "Proses aktif", count: data.records.filter((r) => r.column !== "done").length, icon: Activity },
    { label: "Sedang bekerja", count: data.records.filter((r) => r.status === "running").length, icon: Clock3 },
    { label: "Perlu Anda", count: data.records.filter((r) => r.status === "owner" || r.status === "blocked").length, icon: CircleAlert },
    { label: "Selesai / ditutup", count: data.records.filter((r) => r.column === "done").length, icon: CircleCheck },
  ];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 divide-x divide-border rounded-xl border bg-card py-4 shadow-sm lg:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="flex items-center gap-3 px-4 py-2 sm:px-5"><span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/80 text-background sm:flex"><stat.icon className="size-4" /></span><div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="mt-1 text-xl font-medium tabular-nums">{stat.count}</p></div></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><button onClick={() => setView("agent")} aria-pressed={view === "agent"} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", view === "agent" ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>Per agent</button><button onClick={() => setView("stage")} aria-pressed={view === "stage"} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", view === "stage" ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>Tahap proses</button><button onClick={() => setTodayOnly((v) => !v)} aria-pressed={todayOnly} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", todayOnly ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-card text-muted-foreground hover:bg-muted")}>{todayOnly ? "Hari ini" : "Semua hari"}</button>{[{ id: "all", label: "Semua" }, { id: "running", label: "Sedang bekerja" }, { id: "owner", label: "Perlu Anda" }, { id: "blocked", label: "Terhambat" }].map((item) => <button key={item.id} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", filter === item.id ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}>{item.label}</button>)}</div><label className="flex min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs"><Search className="size-3.5 text-muted-foreground" /><input aria-label="Cari proses" placeholder="Cari lead atau proyek" value={search} onChange={(event) => setSearch(event.target.value)} className="w-44 min-w-0 bg-transparent outline-none" /></label></div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>Ikuti proses dari riset hingga serah terima. Klik kartu untuk melihat detail.</p><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" />Live · {date(data.generatedAt)}</span></div>
    {data.limited && <p className="text-xs text-muted-foreground">Menampilkan 200 lead/proyek terbaru. Data lengkap tersedia di Data & Operasi.</p>}
    <Dialog.Root open={Boolean(active)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <div className="overflow-x-auto pb-4" aria-label="Kanban proses bisnis"><div className="flex min-h-[450px] items-start gap-3">{viewColumns.map((column) => {
        const cards = cardsFor(column.id);
        return <section key={column.id} className={cn("w-[215px] shrink-0 space-y-2 rounded-xl p-2", column.id === "done" ? "bg-emerald-100/50 dark:bg-emerald-950/30" : "bg-muted/80")} aria-label={column.label}><div className="flex items-center justify-between gap-2 px-1 py-1.5"><h2 className="text-xs font-medium">{column.label}<span className="ml-2 rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{cards.length}</span>{view === "agent" && cards.some((record) => record.status === "running") ? <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">bekerja</span> : null}</h2></div>{groupByDay(cards).map((group) => { const gid = `${column.id}:${group.key}`; return <div key={group.key} className="space-y-2"><button onClick={() => toggleDay(gid)} aria-expanded={expanded.has(gid)} className={cn("flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-2.5 py-2 text-left shadow-sm transition hover:bg-muted", expanded.has(gid) && "border-foreground/30")}><span className="min-w-0"><span className="block truncate text-xs font-medium">{group.label}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{group.items.length} {group.items.length === 1 ? "proses" : "proses"} · {column.label}</span></span><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{expanded.has(gid) ? "Tutup" : "Buka"}</span></button>{expanded.has(gid) && <div className="space-y-2 pl-1">{group.items.map((record) => <Dialog.Trigger asChild key={record.id}><button onClick={() => setSelected(record.id)} className="group w-full space-y-3 rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"><div className="flex items-start gap-2.5"><span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium", column.id === "done" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>{record.title[0]?.toUpperCase()}</span><div className="min-w-0"><p className="line-clamp-2 text-xs font-medium leading-5">{record.title}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{record.company ?? (record.projectId ? "Proyek" : record.leadId ? "Lead" : "Riset")}</p></div></div><WorkStatus state={record.status} />{record.progress && <ProspectProgressBar progress={record.progress} compact />}<div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="truncate">{record.currentAgent ? AGENT_LABEL[record.currentAgent] ?? record.currentAgent : "Menunggu alur"}</span><span className="shrink-0">{date(record.updatedAt)}</span></div>{record.approvals.length > 0 && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">{record.approvals.length} approval menunggu</p>}</button></Dialog.Trigger>)}</div>}</div>;})}{!cards.length && <p className="rounded-lg border border-dashed p-4 text-center text-[11px] leading-5 text-muted-foreground">{filter !== "all" || search ? "Tidak ada proses yang cocok" : view === "agent" ? "Belum ada proses di agent ini" : "Belum ada proses di tahap ini"}</p>}</section>;
      })}</div></div>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" /><Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-[460px] overflow-y-auto border-l bg-background p-5 shadow-xl sm:p-6"><div className="mb-6 flex items-start justify-between gap-4"><div className="min-w-0"><Dialog.Title className="break-words text-lg font-medium">{active?.title}</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted-foreground">Detail proses & laporan terkini</Dialog.Description></div><Dialog.Close className="rounded-lg border bg-card p-2 hover:bg-muted" aria-label="Tutup detail"><X className="size-4" /></Dialog.Close></div>{active && <RecordDetails record={active} />}</Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}

