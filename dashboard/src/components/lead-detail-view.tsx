"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck,
  Clock,
  MessagesSquare,
  Star,
  Target,
} from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-header";
import { ConversationThread } from "@/components/conversation-thread";
import { EvaluationCard, Score10Inline } from "@/components/evaluation-card";
import { SegmentBadge } from "@/components/segment-badge";
import { ScoreMeter } from "@/components/score-meter";
import { ErrorState } from "@/components/states";
import { CardsSkeleton, TableSkeleton } from "@/components/skeletons";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useLead } from "@/lib/hooks";
import { formatDateTime, initials, phoneFromJid, relativeTime } from "@/lib/format";

/** Hasil audit Scout untuk sebuah prospek. */
interface ScoutIntel {
  painPoints?: string[];
  opportunity?: string;
  offerings?: string[];
  approach?: string;
  outreachAngle?: string;
  confidence?: number;
  at?: string;
}

export function LeadDetailView({ id }: { id: string }) {
  const { data, error, isLoading } = useLead(id);

  if (error) {
    return (
      <>
        <PageHeader title="Detail lead" actions={<ThemeToggle />} />
        <PageBody className="space-y-6">
          <BackLink />
          <ErrorState message={error.message} />
        </PageBody>
      </>
    );
  }

  if (isLoading && !data) {
    return (
      <>
        <PageHeader title="Detail lead" actions={<ThemeToggle />} />
        <PageBody className="space-y-6">
          <TableSkeleton rows={1} className="[&>div]:h-24" />
          <CardsSkeleton count={2} />
        </PageBody>
      </>
    );
  }

  if (!data) return null;

  const { lead, messages, evaluations, bookings } = data;
  const latestEval = evaluations[0];
  const scout = (lead.meta as { scout?: ScoutIntel } | undefined)?.scout;
  const prospect = (
    lead.meta as { prospect?: { niche?: string; location?: string; website?: string } } | undefined
  )?.prospect;

  return (
    <>
      <PageHeader
        title={lead.name ?? phoneFromJid(lead.waJid)}
        description={phoneFromJid(lead.waJid)}
        actions={<ThemeToggle />}
      />

      <PageBody className="space-y-6">
        <BackLink />

        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full border bg-background font-mono text-sm">
                {initials(lead.name, lead.waJid)}
              </span>
              <div>
                <p className="font-medium">{lead.name ?? "Tanpa nama"}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {phoneFromJid(lead.waJid)}
                </p>
              </div>
            </div>

            <Separator orientation="vertical" className="hidden h-10 sm:block" />

            <div className="flex items-center gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground uppercase">Skor lead</p>
                <ScoreMeter score={lead.score} className="text-sm" />
              </div>
              <SegmentBadge segment={lead.segment} withBand />
            </div>

            <Separator orientation="vertical" className="hidden h-10 sm:block" />

            <QuickFact
              icon={<Target className="size-3.5" />}
              label="Tahap"
              value={lead.stage.replace(/-/g, " ")}
            />
            <QuickFact
              icon={<MessagesSquare className="size-3.5" />}
              label="Pesan"
              value={String(messages.length)}
            />
            <QuickFact
              icon={<Clock className="size-3.5" />}
              label="Terakhir"
              value={relativeTime(lead.lastSeen)}
            />
            <QuickFact
              icon={<CalendarCheck className="size-3.5" />}
              label="Booking"
              value={bookings[0]?.status ?? "—"}
            />
            {lead.company ? (
              <QuickFact
                icon={<Target className="size-3.5" />}
                label="Bisnis"
                value={lead.company}
              />
            ) : null}
            {prospect?.niche || prospect?.location ? (
              <QuickFact
                icon={<Target className="size-3.5" />}
                label="Niche"
                value={[prospect?.niche, prospect?.location].filter(Boolean).join(" · ")}
              />
            ) : null}
            {lead.source ? (
              <QuickFact
                icon={<Target className="size-3.5" />}
                label="Sumber"
                value={lead.source.replace(/_/g, " ")}
              />
            ) : null}
          </CardContent>
        </Card>

        {scout ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Target className="size-3.5" /> Intelijen Prospek (Scout)
                {typeof scout.confidence === "number" ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                    keyakinan {Math.round(scout.confidence * 100)}%
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 pt-0 md:grid-cols-2">
              {scout.painPoints?.length ? (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase text-muted-foreground">
                    Masalah (pain point)
                  </h3>
                  <ul className="list-disc space-y-1 pl-4 text-sm leading-6">
                    {scout.painPoints.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {scout.offerings?.length ? (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase text-muted-foreground">
                    Yang ditawarkan
                  </h3>
                  <ul className="list-disc space-y-1 pl-4 text-sm leading-6">
                    {scout.offerings.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {scout.opportunity ? (
                <section className="space-y-2 md:col-span-2">
                  <h3 className="text-[11px] font-medium uppercase text-muted-foreground">
                    Peluang otomasi
                  </h3>
                  <p className="text-sm leading-6">{scout.opportunity}</p>
                </section>
              ) : null}
              {scout.approach ? (
                <section className="space-y-2 md:col-span-2">
                  <h3 className="text-[11px] font-medium uppercase text-muted-foreground">
                    Cara mendekati &amp; membangun
                  </h3>
                  <p className="text-sm leading-6">{scout.approach}</p>
                </section>
              ) : null}
              {scout.outreachAngle ? (
                <section className="space-y-2 md:col-span-2">
                  <h3 className="text-[11px] font-medium uppercase text-muted-foreground">
                    Sudut outreach (value-first)
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">{scout.outreachAngle}</p>
                </section>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="self-start xl:col-span-3">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Percakapan · {messages.length} pesan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length ? (
                <div className="max-h-[36rem] overflow-y-auto pr-2">
                  <ConversationThread messages={messages} />
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada percakapan.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6 xl:col-span-2">
            {latestEval ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                    <Star className="size-3.5" /> Penilaian terakhir
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <Score10Inline
                    value={latestEval.payload.evaluation?.overall ?? 0}
                    label="Keseluruhan"
                  />
                  <Score10Inline
                    value={latestEval.payload.evaluation?.conversionLikelihood ?? 0}
                    label="Peluang konversi"
                  />
                  {latestEval.payload.evaluation?.critique ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {latestEval.payload.evaluation.critique}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {bookings.length ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Booking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-sm">
                  <p className="flex items-center gap-2">
                    <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-400">
                      {bookings[0]?.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {bookings[0] ? formatDateTime(bookings[0].createdAt) : ""}
                    </span>
                  </p>
                  <dl className="space-y-1.5">
                    {Object.entries(bookings[0]?.details ?? {}).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-3 gap-2 text-xs">
                        <dt className="text-muted-foreground capitalize">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd className="col-span-2">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Riwayat evaluasi · {evaluations.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {evaluations.length ? (
                  evaluations
                    .slice(0, 3)
                    .map((item) => <EvaluationCard key={item.id} item={item} />)
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Belum ada evaluasi.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function QuickFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm tabular-nums capitalize">{value}</p>
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 text-muted-foreground">
      <Link href="/leads">
        <ArrowLeft className="size-3.5" />
        Kembali ke Leads
      </Link>
    </Button>
  );
}
