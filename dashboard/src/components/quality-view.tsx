"use client";

import { Stat, StatStrip } from "@/components/stat";
import { EvaluationCard } from "@/components/evaluation-card";
import { QualityRadar, type QualityDimension } from "@/components/quality-radar";
import { EmptyState, ErrorState } from "@/components/states";
import { CardsSkeleton, TableSkeleton } from "@/components/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvaluations } from "@/lib/hooks";

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function QualityView() {
  const { data, error, isLoading } = useEvaluations(50);
  const evals = data ?? [];
  const scored = evals.map((e) => e.payload.evaluation ?? {});

  const overall = avg(scored.map((e) => e.overall ?? 0).filter((n) => n > 0));
  const relevance = avg(scored.map((e) => e.relevance ?? 0).filter((n) => n > 0));
  const groundedness = avg(scored.map((e) => e.groundedness ?? 0).filter((n) => n > 0));
  const tone = avg(scored.map((e) => e.tone ?? 0).filter((n) => n > 0));
  const conversion = avg(
    scored.map((e) => e.conversionLikelihood ?? 0).filter((n) => n > 0),
  );

  const dims: QualityDimension[] = [
    { label: "Relevansi", value: Number(relevance.toFixed(1)) },
    { label: "Grounded", value: Number(groundedness.toFixed(1)) },
    { label: "Nada", value: Number(tone.toFixed(1)) },
    { label: "Konversi", value: Number(conversion.toFixed(1)) },
  ];

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error.message} /> : null}

      {evals.length ? (
        <StatStrip>
          <Stat label="Penilaian" value={evals.length} hint="terakhir" />
          <Stat label="Keseluruhan" value={overall.toFixed(1)} hint="dari 10" />
          <Stat label="Relevansi" value={relevance.toFixed(1)} />
          <Stat label="Grounded" value={groundedness.toFixed(1)} />
          <Stat label="Peluang konversi" value={conversion.toFixed(1)} />
        </StatStrip>
      ) : null}

      {isLoading && !data ? <CardsSkeleton count={3} /> : null}

      {evals.length ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="self-start">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Profil kualitas rata-rata</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <QualityRadar data={dims} />
            </CardContent>
          </Card>

          <div className="space-y-4 xl:col-span-2">
            {evals.slice(0, 6).map((item) => (
              <EvaluationCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}

      {data && evals.length === 0 ? (
        <EmptyState
          title="Belum ada evaluasi"
          description="Evaluation/Critique berjalan setiap kali agen membalas lead."
        />
      ) : null}

      {isLoading && !data ? <TableSkeleton rows={4} /> : null}
    </div>
  );
}
