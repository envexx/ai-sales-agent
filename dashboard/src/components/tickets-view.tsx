"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states";
import { useTickets } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<string, string> = {
  l1: "border-border bg-muted text-muted-foreground",
  l2: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  emergency: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const STATUS_TONE: Record<string, string> = {
  open: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  escalated: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] uppercase",
        tone ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function TicketsView() {
  const { data, error } = useTickets();

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error.message} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tiket Dukungan (L1)</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Subjek</TableHead>
                <TableHead className="w-24">Severity</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="hidden md:table-cell">Kanal</TableHead>
                <TableHead className="w-28 text-right">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="max-w-80">
                    <p className="truncate text-sm font-medium">{ticket.subject ?? "(tanpa subjek)"}</p>
                    {ticket.resolution ? (
                      <p className="truncate text-xs text-muted-foreground">{ticket.resolution}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Pill tone={SEVERITY_TONE[ticket.severity]}>{ticket.severity}</Pill>
                  </TableCell>
                  <TableCell>
                    <Pill tone={STATUS_TONE[ticket.status]}>{ticket.status}</Pill>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {ticket.channel ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {relativeTime(ticket.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
              {data && data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada tiket.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
