import { MarkerType, type Edge } from "@xyflow/react";

// Directions are explicit so the return paths never pass through the stage cards.
export const BUSINESS_LAYOUT = [
  ["prospecting", "Riset & audit", 0, 0, "Temukan & audit calon klien (scouted_ready)"],
  ["sales", "Sales", 560, 0, "Kualifikasi · pilih demo atau meeting"],
  ["demo", "Demo", 840, -100, "Percakapan & demo sebagai bahan PRD"],
  ["meeting", "Meeting", 840, 100, "Catatan meeting harus diunggah"],
  ["scoper", "Scoper · PRD", 1120, 0, "Rangkum lingkup & kebutuhan klien"],
  ["legal", "Kontrak & invoice DP", 1120, 300, "SPK, NDA & uang muka"],
  ["dp", "DP dibayar", 840, 300, "Intake berjalan setelah DP dikonfirmasi"],
  ["intake", "Intake · akses", 560, 300, "Kumpulkan akses melalui vault"],
  ["owner", "Pembangunan · Anda", 280, 300, "Bangun sistem → tandai done_review"],
  ["qa", "QA & dokumen", 0, 300, "Uji rilis → lulus → SOP & panduan"],
  ["handover", "Serah terima", 280, 600, "BAST & invoice pelunasan"],
  ["final", "Pelunasan dibayar", 560, 600, "Konfirmasi pembayaran terakhir"],
  ["delivered", "Proyek diserahkan", 840, 600, "Status delivered setelah pelunasan"],
  ["content", "Content & knowledge", 1120, 500, "Studi kasus → knowledge bersama"],
  ["developer", "Developer", 1120, 700, "Kelola & tingkatkan situs + bangun otomasi"],
  ["support", "Support", 560, -260, "Jawaban dikembalikan melalui Sales"],
  ["supervisor", "Supervisor & briefing", 1120, -260, "Review laporan seluruh agent → Anda"],
  ["monitor", "Monitor (layanan + kinerja agent)", 280, -260, "Pantau infra & kinerja agent, alert & usulan perbaikan → Anda"],
] as const;
export const PROCESS_GATES = new Set(["demo", "meeting", "dp", "final", "delivered"]);
type Side = "left" | "right" | "top" | "bottom";
function edge(source: string, target: string, from: Side, to: Side, label?: string, branch = false): Edge {
  return { id: `${source}-${target}`, source, target, sourceHandle: `${from}-out`, targetHandle: `${to}-in`, type: "smoothstep", label,
    labelStyle: { fontSize: 11, fill: branch ? "#71717a" : "#3f3f46" }, labelBgStyle: { fill: "#fafafa" }, labelBgPadding: [6, 4],
    style: { stroke: branch ? "#a1a1aa" : "#85858b", strokeWidth: 1.5, strokeDasharray: branch ? "5 5" : undefined }, markerEnd: { type: MarkerType.ArrowClosed, color: "#85858b", width: 16, height: 16 } };
}
export const BUSINESS_CONNECTIONS = [
  edge("prospecting", "sales", "right", "left", "Siap"),
  edge("sales", "demo", "right", "left", "Demo"), edge("sales", "meeting", "right", "left", "Meeting"),
  edge("demo", "scoper", "right", "left", "Chat"), edge("meeting", "scoper", "right", "left", "Catatan"),
  edge("scoper", "legal", "bottom", "top", "PRD"), edge("legal", "dp", "left", "right"),
  edge("dp", "intake", "left", "right", "DP lunas"), edge("intake", "owner", "left", "right", "Akses"),
  edge("owner", "qa", "left", "right", "Review"), edge("qa", "owner", "top", "top", "Gagal · perbaiki & ajukan QA", true),
  edge("qa", "handover", "bottom", "left", "Lulus · dokumen"),
  edge("handover", "final", "right", "left"), edge("final", "delivered", "right", "left", "Lunas"),
  edge("delivered", "content", "right", "left"), edge("delivered", "developer", "right", "left"),
  edge("sales", "support", "top", "bottom", "Keluhan / jawaban L1", true),
  edge("support", "sales", "left", "left", "Jawaban ke Sales", true),
  // Monitor (fungsi ganda): pantau kinerja agent & mutu, kirim alert + usulan ke Supervisor/owner.
  edge("monitor", "prospecting", "bottom", "top", "Pantau kinerja", true),
  edge("monitor", "sales", "bottom", "top", "Pantau kinerja", true),
  edge("monitor", "qa", "bottom", "top", "Pantau mutu", true),
  edge("monitor", "supervisor", "right", "left", "Alert & pertumbuhan", true),
];
export const FLOW_PHASES = [
  { label: "Seluruh alur", ids: BUSINESS_LAYOUT.map((node) => node[0]) },
  { label: "Penjualan", ids: ["prospecting", "sales", "demo", "meeting", "scoper"] },
  { label: "Pembangunan & QA", ids: ["legal", "dp", "intake", "owner", "qa"] },
  { label: "Serah terima", ids: ["handover", "final", "delivered", "content", "developer"] },
  { label: "Pemantauan & perbaikan", ids: ["supervisor", "monitor"] },
];


