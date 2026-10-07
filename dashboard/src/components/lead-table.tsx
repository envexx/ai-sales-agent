"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SegmentBadge } from "@/components/segment-badge";
import { ScoreMeter } from "@/components/score-meter";
import { initials, phoneFromJid, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lead, Segment } from "@/lib/api";

type SegmentFilter = "all" | "nurture" | "objection" | "closing";
type SortKey = "score" | "recent";

/** Info bisnis yang tersimpan di meta lead (dari prospecting/scout). */
function businessInfo(lead: Lead): {
  company: string | null;
  niche: string | null;
  location: string | null;
  website: string | null;
} {
  const meta = lead.meta as {
    prospect?: { niche?: string; location?: string; website?: string };
    scout?: { industry?: string };
  };
  return {
    company: lead.company,
    niche: meta.prospect?.niche ?? meta.scout?.industry ?? null,
    location: meta.prospect?.location ?? null,
    website: meta.prospect?.website ?? null,
  };
}

export function LeadTable({ leads }: { leads: Lead[] }) {
  const [q, setQ] = React.useState("");
  const [segment, setSegment] = React.useState<SegmentFilter>("all");
  const [sort, setSort] = React.useState<SortKey>("score");

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads
      .filter((l) => (segment === "all" ? true : l.segment === (segment as Segment)))
      .filter((l) =>
        needle
          ? (l.name ?? "").toLowerCase().includes(needle) ||
            l.waJid.toLowerCase().includes(needle) ||
            (businessInfo(l).company ?? "").toLowerCase().includes(needle) ||
            (businessInfo(l).niche ?? "").toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) =>
        sort === "score"
          ? b.score - a.score
          : new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
      );
  }, [leads, q, segment, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-full xl:basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau nomor…"
            className="h-9 pl-8"
            aria-label="Cari lead"
          />
        </div>

        <Select value={segment} onValueChange={(v) => setSegment(v as SegmentFilter)}>
          <SelectTrigger className="h-10 w-auto min-w-0 flex-1 sm:max-w-48 xl:flex-none" aria-label="Filter segmen">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua segmen</SelectItem>
            <SelectItem value="closing">Closing (≥75)</SelectItem>
            <SelectItem value="objection">Objection (40–74)</SelectItem>
            <SelectItem value="nurture">Nurture (&lt;40)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-10 w-auto min-w-0 flex-1 sm:max-w-48 xl:flex-none" aria-label="Urutkan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Skor tertinggi</SelectItem>
            <SelectItem value="recent">Terbaru</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[30%]">Lead</TableHead>
              <TableHead className="hidden lg:table-cell">Bisnis</TableHead>
              <TableHead className="w-28">Segmen</TableHead>
              <TableHead className="w-32">
                <span className="inline-flex items-center gap-1">
                  Skor <ArrowUpDown className="size-3" />
                </span>
              </TableHead>
              <TableHead className="hidden md:table-cell">Tahap</TableHead>
              <TableHead className="w-28 text-right">Terakhir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => {
              const b = businessInfo(lead);
              return (
              <TableRow key={lead.id} className="group">
                <TableCell>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="flex items-center gap-2.5"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background font-mono text-[11px]">
                      {initials(lead.name, lead.waJid)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium group-hover:underline">
                          {lead.name ?? phoneFromJid(lead.waJid)}
                        </span>
                        {lead.optOut ? (
                          <span className="shrink-0 rounded border border-rose-500/25 bg-rose-500/10 px-1 py-0 text-[10px] text-rose-700 dark:text-rose-400">
                            opt-out
                          </span>
                        ) : lead.kind === "prospect" ? (
                          <span className="shrink-0 rounded border border-sky-500/25 bg-sky-500/10 px-1 py-0 text-[10px] text-sky-700 dark:text-sky-400">
                            prospek · {lead.outreachStatus.replace("_", " ")}
                          </span>
                        ) : null}
                        {(lead.meta as { scout?: unknown } | undefined)?.scout ? (
                          <span className="shrink-0 rounded border border-emerald-500/25 bg-emerald-500/10 px-1 py-0 text-[10px] text-emerald-700 dark:text-emerald-400">
                            scout ✓
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {phoneFromJid(lead.waJid)}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {b.company || b.niche ? (
                    <span className="block min-w-0">
                      {b.company ? (
                        <span className="block truncate text-sm">{b.company}</span>
                      ) : null}
                      {b.niche || b.location ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[b.niche, b.location].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <SegmentBadge segment={lead.segment} withBand />
                </TableCell>
                <TableCell>
                  <ScoreMeter score={lead.score} />
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {lead.stage.replace(/-/g, " ")}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {relativeTime(lead.lastSeen)}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {rows.length === 0 ? (
          <p className={cn("px-4 py-10 text-center text-sm text-muted-foreground")}>
            Tidak ada lead yang cocok dengan filter.
          </p>
        ) : null}
      </div>
    </div>
  );
}
