"use client";

import Link from "next/link";
import { CalendarClock, CalendarCheck } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/states";
import { TableSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBookings, useLeads } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  proposed: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  none: "border-border bg-muted text-muted-foreground",
};

export function BookingView() {
  const bookings = useBookings(50);
  const leads = useLeads();

  const leadName = (id: string | null) => {
    if (!id) return "Lead";
    return leads.data?.find((l) => l.id === id)?.name ?? `Lead ${id.slice(0, 6)}`;
  };

  return (
    <div className="space-y-6">
      {bookings.error ? <ErrorState message={bookings.error.message} /> : null}
      {bookings.isLoading && !bookings.data ? <TableSkeleton rows={4} /> : null}

      {bookings.data && bookings.data.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {bookings.data.map((b) => (
            <Card key={b.id}>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle className="flex min-w-0 flex-1 items-start gap-2 text-sm font-medium">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {b.leadId ? (
                    <Link href={`/leads/${b.leadId}`} className="min-w-0 break-words hover:underline">
                      {leadName(b.leadId)}
                    </Link>
                  ) : (
                    "Tanpa lead"
                  )}
                </CardTitle>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[11px]",
                    STATUS_STYLE[b.status] ?? STATUS_STYLE.none,
                  )}
                >
                  {b.status}
                </span>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-5 text-muted-foreground">
                  <CalendarCheck className="size-3.5 shrink-0" />
                  {b.scheduledAt
                    ? `Dijadwalkan ${formatDateTime(b.scheduledAt)}`
                    : "Belum ada slot pasti"}
                  <span className="w-full">Dibuat {formatDateTime(b.createdAt)}</span>
                </p>
                <dl className="space-y-1.5">
                  {Object.entries(b.details)
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <div key={k} className="grid grid-cols-3 gap-2 text-xs">
                        <dt className="text-muted-foreground capitalize">
                          {k.replace(/_/g, " ")}
                        </dt>
                        <dd className="col-span-2 min-w-0 break-words leading-relaxed">{String(v)}</dd>
                      </div>
                    ))}
                </dl>
                {b.leadId ? (
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/leads/${b.leadId}`}>Lihat percakapan</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {bookings.data && bookings.data.length === 0 ? (
        <EmptyState
          title="Belum ada booking"
          description="Booking muncul saat prospek menunjukkan minat untuk konsultasi atau bertemu."
        />
      ) : null}
    </div>
  );
}
