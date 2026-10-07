"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Card } from "@/components/ui/card";
import { WorkflowCustomNode, type WorkflowNodeData } from "./workflow-custom-node";
import { WORKFLOW_NODES } from "./workflow-data";

const nodeTypes = { workflowNode: WorkflowCustomNode };

/**
 * Left-to-right layout.
 *
 * The main pipeline runs horizontally along y = 0. Nodes are 280px wide, so a
 * 420px column step leaves ~140px between them — enough for the connector line
 * and its label. Branches fan out vertically (up / down) and merge back into
 * `scheduling` through its top / left / bottom handles.
 */
const STEP = 420;
const col = (n: number) => n * STEP;

const Y = {
  branch: -440, // filter sub-branch
  up: -330, // nurture
  main: 0, // main pipeline
  down: 330, // closing
};

const INITIAL_NODES: Node<WorkflowNodeData>[] = [
  {
    id: "START",
    type: "workflowNode",
    position: { x: col(0), y: Y.main },
    data: { ...WORKFLOW_NODES.START },
  },
  {
    id: "triageMessage",
    type: "workflowNode",
    position: { x: col(1), y: Y.main },
    data: { ...WORKFLOW_NODES.triageMessage },
  },
  {
    id: "filter",
    type: "workflowNode",
    position: { x: col(2), y: Y.branch },
    data: { ...WORKFLOW_NODES.filter },
  },
  {
    id: "rag",
    type: "workflowNode",
    position: { x: col(2), y: Y.main },
    data: { ...WORKFLOW_NODES.rag },
  },
  {
    id: "END_BOT",
    type: "workflowNode",
    position: { x: col(3), y: Y.branch },
    data: {
      id: "END_BOT",
      name: "Bot Discarded (Drop)",
      langGraphId: "END",
      category: "terminal",
      badge: "Selesai · Nol Biaya",
      iconName: "Flag",
      color: "rose",
      summary: "Pesan bot atau broadcast selesai diabaikan. Eksekusi turn berakhir aman.",
      description:
        "Terminal penghentian untuk pesan bot/spam. Tidak ada balasan terkirim.",
      file: "src/graph/nodes/filter.ts",
      inputs: ["state.filtered"],
      outputs: ["trace"],
      businessLogic: ["Menghemat inferensi LLM", "Tidak mencemari percakapan"],
      codeSnippet: `// Terminal edge untuk bot\n.addEdge("filter", END)`,
    },
  },
  {
    id: "leadScoring",
    type: "workflowNode",
    position: { x: col(3), y: Y.main },
    data: { ...WORKFLOW_NODES.leadScoring },
  },
  {
    id: "nurture",
    type: "workflowNode",
    position: { x: col(4), y: Y.up },
    data: { ...WORKFLOW_NODES.nurture },
  },
  {
    id: "objection",
    type: "workflowNode",
    position: { x: col(4), y: Y.main },
    data: { ...WORKFLOW_NODES.objection },
  },
  {
    id: "closing",
    type: "workflowNode",
    position: { x: col(4), y: Y.down },
    data: { ...WORKFLOW_NODES.closing },
  },
  {
    id: "scheduling",
    type: "workflowNode",
    position: { x: col(5), y: Y.main },
    data: { ...WORKFLOW_NODES.scheduling },
  },
  {
    id: "responseGeneration",
    type: "workflowNode",
    position: { x: col(6), y: Y.main },
    data: { ...WORKFLOW_NODES.responseGeneration },
  },
  {
    id: "dispatch",
    type: "workflowNode",
    position: { x: col(7), y: Y.main },
    data: { ...WORKFLOW_NODES.dispatch },
  },
  {
    id: "bookingFlow",
    type: "workflowNode",
    position: { x: col(8), y: Y.main },
    data: { ...WORKFLOW_NODES.bookingFlow },
  },
  {
    id: "critique",
    type: "workflowNode",
    position: { x: col(9), y: Y.main },
    data: { ...WORKFLOW_NODES.critique },
  },
  {
    id: "reflect",
    type: "workflowNode",
    position: { x: col(10), y: Y.main },
    data: { ...WORKFLOW_NODES.reflect },
  },
  {
    id: "longTermMemory",
    type: "workflowNode",
    position: { x: col(11), y: Y.main },
    data: { ...WORKFLOW_NODES.longTermMemory },
  },
  {
    id: "END",
    type: "workflowNode",
    position: { x: col(12), y: Y.main },
    data: { ...WORKFLOW_NODES.END },
  },
];

interface EdgeSpec {
  id: string;
  source: string;
  target: string;
  color: string;
  label: string;
  sourceHandle?: string;
  targetHandle?: string;
  dashed?: boolean;
  animated?: boolean;
}

const R = "source-right";
const L = "target-left";

const EDGE_SPECS: EdgeSpec[] = [
  { id: "e-start-triage", source: "START", target: "triageMessage", sourceHandle: R, targetHandle: L, color: "#6366f1", label: "Pesan Masuk", animated: true },
  { id: "e-triage-filter", source: "triageMessage", target: "filter", sourceHandle: "source-top", targetHandle: L, color: "#f43f5e", label: "isBot == true", dashed: true },
  { id: "e-filter-endbot", source: "filter", target: "END_BOT", sourceHandle: R, targetHandle: L, color: "#f43f5e", label: "Abaikan" },
  { id: "e-triage-rag", source: "triageMessage", target: "rag", sourceHandle: R, targetHandle: L, color: "#10b981", label: "isBot == false (Human)" },
  { id: "e-rag-scoring", source: "rag", target: "leadScoring", sourceHandle: R, targetHandle: L, color: "#06b6d4", label: "Konteks RAG & Memori" },
  { id: "e-scoring-nurture", source: "leadScoring", target: "nurture", sourceHandle: "source-top", targetHandle: L, color: "#0284c7", label: "Skor < 40 (Cold)" },
  { id: "e-scoring-objection", source: "leadScoring", target: "objection", sourceHandle: R, targetHandle: L, color: "#d97706", label: "Skor 40–74 (Warm)" },
  { id: "e-scoring-closing", source: "leadScoring", target: "closing", sourceHandle: "source-bottom", targetHandle: L, color: "#059669", label: "Skor ≥ 75 (Hot)" },
  { id: "e-nurture-scheduling", source: "nurture", target: "scheduling", sourceHandle: R, targetHandle: "target-top", color: "#0284c7", label: "Panduan Nurture" },
  { id: "e-objection-scheduling", source: "objection", target: "scheduling", sourceHandle: R, targetHandle: L, color: "#d97706", label: "Playbook Keberatan" },
  { id: "e-closing-scheduling", source: "closing", target: "scheduling", sourceHandle: R, targetHandle: "target-bottom", color: "#059669", label: "Direct CTA" },
  { id: "e-scheduling-response", source: "scheduling", target: "responseGeneration", sourceHandle: R, targetHandle: L, color: "#10b981", label: "Slot / Booking (Cal.com MCP)" },
  { id: "e-response-dispatch", source: "responseGeneration", target: "dispatch", sourceHandle: R, targetHandle: L, color: "#8b5cf6", label: "Draf WhatsApp Siap" },
  { id: "e-dispatch-booking", source: "dispatch", target: "bookingFlow", sourceHandle: R, targetHandle: L, color: "#10b981", label: "Terkirim (DRY_RUN check)" },
  { id: "e-booking-critique", source: "bookingFlow", target: "critique", sourceHandle: R, targetHandle: L, color: "#6366f1", label: "Jadwal Disinkron" },
  { id: "e-critique-reflect", source: "critique", target: "reflect", sourceHandle: R, targetHandle: L, color: "#d946ef", label: "Audit Kualitas 0–10" },
  { id: "e-reflect-ltm", source: "reflect", target: "longTermMemory", sourceHandle: R, targetHandle: L, color: "#a855f7", label: "Pelajaran Terstruktur" },
  { id: "e-ltm-end", source: "longTermMemory", target: "END", sourceHandle: R, targetHandle: L, color: "#64748b", label: "Selesai (Checkpointer)" },
  { id: "e-ltm-rag-loop", source: "longTermMemory", target: "rag", sourceHandle: "source-bottom", targetHandle: "target-bottom", color: "#06b6d4", label: "Memori Tersimpan ──► RAG", dashed: true, animated: true },
];

const INITIAL_EDGES: Edge[] = EDGE_SPECS.map((spec) => ({
  id: spec.id,
  source: spec.source,
  target: spec.target,
  sourceHandle: spec.sourceHandle ?? R,
  targetHandle: spec.targetHandle ?? L,
  type: "smoothstep",
  animated: spec.animated ?? false,
  style: {
    stroke: spec.color,
    strokeWidth: 2.5,
    ...(spec.dashed ? { strokeDasharray: "6 4" } : {}),
  },
  markerEnd: { type: MarkerType.ArrowClosed, color: spec.color },
  label: spec.label,
  labelStyle: { fill: spec.color, fontWeight: 600, fontSize: 11 },
  // A solid label background keeps the text readable where lines cross nodes.
  labelBgStyle: { fill: "var(--card)", fillOpacity: 0.92 },
  labelBgPadding: [6, 3],
  labelBgBorderRadius: 4,
}));

export function WorkflowCanvas() {
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES);

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[560px] w-full overflow-hidden rounded-xl border bg-background shadow-xs">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        // Open at the left edge of the pipeline at a readable zoom; the flow is
        // wide, so it is panned/scrolled rather than shrunk to fit.
        defaultViewport={{ x: 24, y: 330, zoom: 0.7 }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color={resolvedTheme === "dark" ? "#333338" : "#e5e7eb"}
        />
        <Controls position="top-left" className="!bg-card !border !shadow-sm !text-foreground" />
        <MiniMap
          zoomable
          pannable
          className="!bg-card !border !shadow-sm hidden md:block"
          nodeColor={(n) => {
            const meta = WORKFLOW_NODES[n.id];
            if (!meta) return "#94a3b8";
            if (meta.color === "emerald") return "#10b981";
            if (meta.color === "amber") return "#f59e0b";
            if (meta.color === "rose") return "#f43f5e";
            if (meta.color === "sky") return "#0ea5e9";
            if (meta.color === "purple") return "#a855f7";
            if (meta.color === "cyan") return "#06b6d4";
            return "#6366f1";
          }}
        />

        <Panel position="bottom-left" className="m-3">
          <Card className="space-y-1.5 border bg-card/90 p-2.5 text-[10px] shadow-md backdrop-blur">
            <span className="block font-semibold text-foreground">Keterangan Alur:</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500" />
                <span>Bot Drop (Filter)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-sky-500" />
                <span>Nurture (&lt; 40)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" />
                <span>Objection (40–74)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Closing (≥ 75)</span>
              </div>
              <div className="col-span-2 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-cyan-500" />
                <span>Feedback Loop LTM → RAG</span>
              </div>
            </div>
          </Card>
        </Panel>
      </ReactFlow>
    </div>
  );
}
