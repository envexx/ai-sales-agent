"use client";

import { useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  BookLock,
  Boxes,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  FileText,
  FolderKanban,
  Layers,
  ListChecks,
  MessagesSquare,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Tag,
  TriangleAlert,
  Undo2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageBody, PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { ThemeToggle } from "@/components/theme-toggle";
import { useKnowledge, useKnowledgeDoc } from "@/lib/hooks";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { KnowledgeItem } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Label + ikon + urutan rak untuk tiap kategori knowledge. */
const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; order: number }> = {
  profile: { label: "Profil Perusahaan", icon: Layers, order: 1 },
  policy: { label: "Kebijakan & Cara Kerja", icon: BookLock, order: 2 },
  process: { label: "Proses & Alur Kerja", icon: Workflow, order: 3 },
  service: { label: "Layanan", icon: Boxes, order: 4 },
  pricing: { label: "Harga", icon: Tag, order: 5 },
  payment: { label: "Pembayaran", icon: CreditCard, order: 6 },
  promo: { label: "Promo & Diskon", icon: BadgePercent, order: 7 },
  booking: { label: "Booking & Konsultasi", icon: CalendarCheck, order: 8 },
  qualification: { label: "Kualifikasi Prospek", icon: ListChecks, order: 9 },
  objection: { label: "Penanganan Keberatan", icon: ShieldQuestion, order: 10 },
  faq: { label: "Pertanyaan Umum (FAQ)", icon: MessagesSquare, order: 11 },
  refund: { label: "Refund", icon: Undo2, order: 12 },
  warranty: { label: "Garansi", icon: ShieldCheck, order: 13 },
  escalation: { label: "Eskalasi", icon: TriangleAlert, order: 14 },
  case_study: { label: "Studi Kasus (Flywheel)", icon: FolderKanban, order: 15 },
  case_study_snippet: { label: "Studi Kasus (Ringkas)", icon: FolderKanban, order: 16 },
};

function categoryOf(doc: KnowledgeItem): string {
  const meta = doc.metadata as { category?: unknown; kind?: unknown };
  const value =
    (typeof meta.category === "string" && meta.category) ||
    (typeof meta.kind === "string" && meta.kind) ||
    doc.source ||
    "lain";
  return value;
}

interface Drawer {
  key: string;
  label: string;
  icon: LucideIcon;
  order: number;
  items: KnowledgeItem[];
}

function buildDrawers(docs: KnowledgeItem[]): Drawer[] {
  const map = new Map<string, KnowledgeItem[]>();
  for (const doc of docs) {
    const key = categoryOf(doc);
    const list = map.get(key) ?? [];
    list.push(doc);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, items]) => {
      const meta = CATEGORY_META[key];
      return {
        key,
        label: meta?.label ?? key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        icon: meta?.icon ?? FileText,
        order: meta?.order ?? 99,
        items,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export default function KnowledgePage() {
  const { data, error } = useKnowledge();
  const docs = useMemo(() => data?.docs ?? [], [data]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return docs;
    return docs.filter((doc) =>
      `${doc.title} ${doc.preview} ${categoryOf(doc)}`.toLowerCase().includes(needle),
    );
  }, [docs, query]);

  const drawers = useMemo(() => buildDrawers(filtered), [filtered]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const select = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  };

  const searchActive = query.trim().length > 0;

  return (
    <>
      <PageHeader
        title="Lemari Pengetahuan"
        description="Dokumen internal yang dipakai agen (RAG) — termasuk studi kasus dari flywheel."
        actions={<ThemeToggle />}
      />
      <PageBody className="space-y-6">
        {error ? <ErrorState message={error.message} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{docs.length}</span> dokumen ·{" "}
            {drawers.length} kategori · sumber aktif: seed &amp; flywheel
          </p>
          <label className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari dokumen…"
              aria-label="Cari dokumen pengetahuan"
              className="w-48 min-w-0 bg-transparent outline-none"
            />
          </label>
        </div>

        <div className="grid gap-6 xl:grid-cols-5">
          {/* Lemari (drawer per kategori) */}
          <div className="space-y-3 xl:col-span-3" aria-label="Lemari dokumen">
            {drawers.map((drawer) => {
              const isOpen = open.has(drawer.key) || searchActive;
              const titles = drawer.items
                .slice(0, 3)
                .map((item) => item.title)
                .join(" · ");
              return (
                <section key={drawer.key} className="overflow-hidden rounded-xl border bg-card">
                  <button
                    onClick={() => toggle(drawer.key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <drawer.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{drawer.label}</span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                          {drawer.items.length}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {titles}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {isOpen ? (
                    <ul className="divide-y border-t">
                      {drawer.items.map((doc) => {
                        const active = doc.id === selectedId;
                        return (
                          <li key={doc.id}>
                            <button
                              onClick={() => select(doc.id)}
                              className={cn(
                                "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                                active && "bg-muted",
                              )}
                            >
                              <FileText
                                className={cn(
                                  "mt-0.5 size-4 shrink-0",
                                  active ? "text-foreground" : "text-muted-foreground",
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm leading-5">{doc.title}</span>
                                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                                  {doc.preview}
                                </span>
                              </span>
                              <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">
                                {relativeTime(doc.createdAt)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}

            {!docs.length && !error ? (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Lemari masih kosong. Jalankan <code className="font-mono">npm run seed</code> untuk
                mengisi dokumen dasar.
              </p>
            ) : null}
            {searchActive && !drawers.length ? (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                Tidak ada dokumen yang cocok dengan “{query}”.
              </p>
            ) : null}
          </div>

          {/* Laci detail */}
          <div ref={detailRef} className="scroll-mt-6 xl:col-span-2">
            <div className="xl:sticky xl:top-6">
              {selectedId ? (
                <DocDetail id={selectedId} />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
                      <FileText className="size-5" />
                    </span>
                    <p className="text-sm font-medium">Pilih dokumen</p>
                    <p className="max-w-[26ch] text-xs leading-5 text-muted-foreground">
                      Buka salah satu laci, lalu klik dokumen untuk membaca isi lengkapnya.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function DocDetail({ id }: { id: string }) {
  const { data, error, isLoading } = useKnowledgeDoc(id);

  if (error) return <ErrorState message={error.message} />;
  if (isLoading && !data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const category = categoryOf(data);
  const label = CATEGORY_META[category]?.label ?? category;
  const metaEntries = Object.entries(data.metadata ?? {}).filter(
    ([key]) => key !== "category",
  );

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 py-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded border px-1.5 py-0.5 font-mono uppercase">{label}</span>
            <span>·</span>
            <span className="font-mono">{data.source}</span>
          </div>
          <h2 className="text-base font-medium leading-6">{data.title}</h2>
          <p className="text-[11px] text-muted-foreground">
            Diperbarui {formatDateTime(data.createdAt)} · #{data.id}
          </p>
        </div>

        <div className="whitespace-pre-wrap border-t pt-4 text-sm leading-7 text-foreground/90">
          {data.content}
        </div>

        {metaEntries.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t pt-4 text-xs">
            {metaEntries.map(([key, value]) => (
              <div key={key} className="col-span-2 grid grid-cols-[minmax(72px,auto)_1fr] gap-3">
                <dt className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</dt>
                <dd className="break-words font-mono text-foreground/80">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
