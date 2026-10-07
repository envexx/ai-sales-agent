"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Folder, Search } from "lucide-react";
import { ErrorState } from "./states";
import { useProjects } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export const PROJECT_STAGE: Record<string, string> = { scoping: "PRD & persiapan", preview: "Pembangunan", building: "Pembangunan", done_review: "QA & dokumen", built: "QA & dokumen", done: "Siap serah terima", handover: "Serah terima", delivered: "Sudah diserahkan", retained: "Retainer" };
const COLORS = ["#efedf9", "#e8f3f9", "#fcf0e6", "#ecf4ed"];

export function ProjectsView() {
  const { data, error, isLoading } = useProjects();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  if (error) return <ErrorState message={error.message} />;
  const projects = (data ?? []).filter((project) => project.title.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "finished" ? ["delivered", "retained"].includes(project.stage) : !["delivered", "retained"].includes(project.stage))));
  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <label className="flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm sm:w-72"><Search className="size-4 shrink-0 text-muted-foreground" /><input aria-label="Cari folder proyek" placeholder="Cari proyek…" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      <div className="flex flex-wrap gap-2">{[{ id: "all", label: "Semua" }, { id: "active", label: "Aktif" }, { id: "finished", label: "Diserahkan" }].map((item) => <button key={item.id} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={cn("rounded-full border px-3 py-1.5 text-xs", filter === item.id ? "bg-black text-white" : "bg-card text-muted-foreground")}>{item.label}</button>)}</div>
    </div>
    <section aria-label="Folder proyek" className="space-y-5">
      <div className="flex items-center gap-2"><h2 className="text-base font-medium">Folder proyek</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{projects.length}</span></div>
      {isLoading ? <div className="h-48 animate-pulse rounded-xl bg-muted" /> : projects.length ? <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{projects.map((project, index) => <Link key={project.id} href={`/projects/${encodeURIComponent(project.id)}`} className="project-folder group relative mt-5 block min-w-0 rounded-2xl border border-black/5 p-5 text-black shadow-sm transition hover:-translate-y-1 hover:shadow-md focus-visible:outline-2 focus-visible:outline-black" style={{ backgroundColor: COLORS[index % COLORS.length], "--folder-color": COLORS[index % COLORS.length] } as React.CSSProperties}>
        <div className="relative flex items-center justify-between gap-3"><Folder className="size-5 opacity-50" /><ArrowUpRight className="size-4 opacity-40 transition group-hover:opacity-100" /></div>
        <h3 className="relative mt-6 line-clamp-2 min-h-12 text-base font-medium leading-6">{project.title}</h3>
        <p className="relative mt-2 text-xs text-black/60">{PROJECT_STAGE[project.stage] ?? project.stage}</p>
        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-black/10 pt-3 text-[11px] text-black/60"><span>Konteks & dokumen</span><span>{new Date(project.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span></div>
      </Link>)}</div> : <div className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center"><Folder className="mx-auto mb-4 size-8 text-muted-foreground/50" /><h3 className="text-sm font-medium">{data?.length ? "Tidak ada proyek yang cocok" : "Belum ada folder proyek"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{data?.length ? "Ubah pencarian atau filter untuk melihat proyek lainnya." : "Folder dibuat ketika Scoper menyusun PRD. Konteks klien dan hasil setiap tahap akan tersedia di dalamnya."}</p></div>}
    </section>
  </div>;
}
