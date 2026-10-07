"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { ACTIVITY_LABELS } from "@/lib/agent-experience";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReactFlow, Background, Controls, Handle, Position, type NodeProps, type Node, type Edge, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAgentStatus, useBusinessBoard } from "@/lib/hooks";
import { ErrorState } from "./states";
import { RecordDetails, WorkStatus } from "./business-kanban";
import { cn } from "@/lib/utils";
import { BUSINESS_LAYOUT as LAYOUT, BUSINESS_CONNECTIONS as CONNECTIONS, FLOW_PHASES, PROCESS_GATES } from "@/lib/business-topology";
type FlowNode = Node<{ label: string; state: string; detail: string }, "business">;
function BusinessNode({ data, selected }: NodeProps<FlowNode>) {
  return <div className={cn("w-[210px] min-h-[140px] space-y-3 rounded-xl border bg-card p-4 shadow-sm", selected && "ring-2 ring-foreground", data.state === "running" && "border-emerald-400", data.state === "blocked" && "border-rose-400")}>
    {[Position.Left, Position.Right, Position.Top, Position.Bottom].map((position) => <span key={position}><Handle id={`${position}-in`} type="target" position={position} className="!size-1.5 !border-0 !bg-muted-foreground/40" /><Handle id={`${position}-out`} type="source" position={position} className="!size-1.5 !border-0 !bg-muted-foreground/40" /></span>)}
    <p className="text-sm font-medium">{data.label}</p><WorkStatus state={data.state} /><p className="text-[11px] leading-5 text-muted-foreground">{data.detail}</p>
  </div>;
}
const NODE_TYPES = { business: BusinessNode };
export function BusinessWorkflow() {
  const params = useSearchParams();
  const { data, error } = useBusinessBoard();
  const { data: agents } = useAgentStatus();
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const flowRef = useRef<ReactFlowInstance<FlowNode>>(null);
  const requested = params.get("case");
  const focused = data?.records.find((record) => record.id === requested);
  const project = useSWR(focused?.projectId ? ["project", focused.projectId] : null, () => api.project(focused!.projectId!), { refreshInterval: 5000 });
  const detailRecord = data?.records.find((record) => record.id === selectedRecord);
  const focusAgent = selectedNode ?? params.get("agent");
  const history = useSWR(focusAgent && focusAgent !== "owner" && !PROCESS_GATES.has(focusAgent) ? ["agent-workflow", focusAgent] : null, () => api.agentWorkflow(focusAgent!), { refreshInterval: 5000 });
  if (error) return <ErrorState message={error.message} />;
  if (!data) return <div className="h-[600px] animate-pulse rounded-xl bg-muted" />;
  const nodes: FlowNode[] = LAYOUT.map(([id, label, x, y, description]) => {
    const agent = agents?.find((item) => item.slug === id);
    const step = focused?.steps.find((item) => item.agent === id);
    const working = data.records.filter((record) => record.steps.some((item) => item.agent === id && item.state === "running"));
    let state = focused ? id === "owner" ? focused.column === "build" ? "owner" : ["done_review", "done", "delivered", "retained"].includes(focused.stage) ? "done" : "unknown" : step?.state ?? "unknown" : id === "owner" ? data.records.some((record) => record.column === "build") ? "owner" : "waiting" : agent?.status === "working" ? "running" : agent?.status === "error" ? "blocked" : "waiting";
    if (PROCESS_GATES.has(id)) {
      state = "unknown";
      if (focused && ["demo", "meeting"].includes(id) && focused.salesPath === id) {
        state = focused.projectId ? "done" : focused.steps.find((item) => item.agent === "scoper")?.state === "blocked" ? "blocked" : "waiting";
      }
      if (focused && ["dp", "final"].includes(id)) {
        const invoice = project.data?.invoices.find((item) => item.kind === id);
        const paid = invoice?.status === "paid" || focused.evidence.some((event) => event.type === `invoice.${id}_paid`);
        state = paid ? "done" : invoice ? "waiting" : "unknown";
      }
      if (id === "delivered" && focused) state = ["delivered", "retained"].includes(focused.stage) ? "done" : "unknown";
    }
    return { id, type: "business", position: { x, y }, selected: focusAgent === id, data: { label, state, detail: `${description}${focused && step?.evidence ? ` · Bukti #${step.evidence.slice(0, 8)}` : !focused && agent ? ` · ${working.length} proses aktif` : ""}` } };
  });
  const edges: Edge[] = CONNECTIONS.map((edge) => ({ ...edge, animated: nodes.find((node) => node.id === edge.source)?.data.state === "running", style: { ...edge.style, stroke: focused?.steps.find((step) => step.agent === edge.source)?.state === "done" ? "#7baf76" : edge.style?.stroke } }));
  const matching = focusAgent ? data.records.filter((record) => focusAgent === "owner" ? record.column === "build" : record.steps.some((step) => step.agent === focusAgent && step.state !== "unknown")) : [];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><p className="text-sm font-medium">{focused ? focused.title : "Satu alur bisnis, seluruh agent"}</p><p className="text-xs leading-5 text-muted-foreground">{focused ? "Posisi dan hasil berdasarkan bukti untuk proses ini." : "Klik agent untuk melihat proses terkait. Pilih kartu kanban untuk menelusuri satu proses."}</p></div><div className="flex items-center gap-3 text-xs"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />Live</span><Link className="rounded-lg border bg-card px-3 py-2" href="/">Buka kanban</Link>{requested && <Link className="underline underline-offset-4" href="/workflow">Semua proses</Link>}</div></div>
    {requested && !focused && <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">Proses ini tidak ada dalam 200 data terbaru. Periksa Leads atau Proyek.</p>}
    <div className="space-y-5">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card"><div className="flex flex-wrap gap-2 border-b p-3">{FLOW_PHASES.map((phase) => <button key={phase.label} className="rounded-lg border px-3 py-2 text-xs hover:bg-muted" onClick={() => void flowRef.current?.fitView({ nodes: phase.ids.map((id) => ({ id })), padding: 0.15, duration: 400, maxZoom: 1 })}>{phase.label}</button>)}</div><div className="h-[650px] sm:h-[800px]" aria-label="Workflow bisnis live"><ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} onInit={(instance) => { flowRef.current = instance; }} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => { setSelectedNode(node.id); setSelectedRecord(null); detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><Background color="#e3e5e0" gap={24} size={1} /><Controls showInteractive={false} position="top-left" /></ReactFlow></div><div className="space-y-1 border-t px-4 py-3 text-xs leading-5 text-muted-foreground"><p>Garis penuh: handoff utama. Garis putus-putus: dukungan atau perbaikan. Supervisor meninjau seluruh laporan; Monitor mengirim alert ke Anda.</p><p>Demo/meeting adalah pilihan jalur; statusnya menunggu bukti. Pembayaran ditandai selesai hanya setelah konfirmasi tercatat.</p></div></div>
      <aside ref={detailRef} className="min-w-0 scroll-mt-6 space-y-4 rounded-xl border bg-card p-5">
        {detailRecord || focused ? <><button onClick={() => setSelectedRecord(null)} className={cn("text-xs underline underline-offset-4", !detailRecord && "hidden")}>Kembali ke daftar proses</button>{focusAgent && <div className="space-y-2 border-b pb-4"><h2 className="text-sm font-medium">{LAYOUT.find((node) => node[0] === focusAgent)?.[1] ?? focusAgent}</h2><WorkStatus state={detailRecord ? detailRecord.steps.find((step) => step.agent === focusAgent)?.state ?? "unknown" : nodes.find((node) => node.id === focusAgent)?.data.state ?? "unknown"} /></div>}<RecordDetails record={(detailRecord ?? focused)!} /></> : <><h2 className="text-sm font-medium">{focusAgent ? LAYOUT.find((node) => node[0] === focusAgent)?.[1] ?? focusAgent : "Detail workflow"}</h2><p className="text-xs leading-5 text-muted-foreground">{focusAgent ? "Proses dengan aktivitas tercatat pada tahap ini." : "Pilih agent di diagram untuk membuka proses dan laporannya."}</p>{matching.map((record) => <button key={record.id} onClick={() => setSelectedRecord(record.id)} className="w-full space-y-2 rounded-lg border p-3 text-left hover:bg-muted"><p className="break-words text-xs font-medium">{record.title}</p><WorkStatus state={record.steps.find((step) => step.agent === focusAgent)?.state ?? record.status} /></button>)}{focusAgent && !matching.length && <p className="text-xs leading-5 text-muted-foreground">Belum ada proses terkait dalam data terbaru.</p>}{history.error && <ErrorState message={history.error.message} />}{history.data && <section className="space-y-3 border-t pt-4"><h3 className="text-sm font-medium">Riwayat pekerjaan tahap ini</h3>{history.data.tasks.length ? history.data.tasks.slice(0, 12).map((task) => <div key={task.id} className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{ACTIVITY_LABELS[task.title] ?? task.title}</p><WorkStatus state={task.workState} /></div><p className="text-xs leading-6 text-muted-foreground">{task.result}</p><p className="text-[11px] text-muted-foreground">{new Date(task.updatedAt).toLocaleString("id-ID")} · #{task.id.slice(0, 8)}</p></div>) : <p className="text-xs text-muted-foreground">Belum ada pekerjaan tercatat.</p>}</section>}</>}
      </aside>
    </div>
  </div>;
}


