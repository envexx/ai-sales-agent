"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { PageBody, PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { ThemeToggle } from "@/components/theme-toggle";
import { useInvoices } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  sent: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  draft: "border-border bg-muted text-muted-foreground",
  overdue: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

const idr = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export default function InvoicesPage() {
  const { data, error } = useInvoices();

  return (
    <>
      <PageHeader
        title="Invoice"
        description="DP, pelunasan, dan retainer yang tercatat dari proyek klien."
        actions={<ThemeToggle />}
      />
      <PageBody>
        {error ? <ErrorState message={error.message} /> : null}
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24">Jenis</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Jatuh tempo</TableHead>
                  <TableHead className="hidden md:table-cell">Dibayar</TableHead>
                  <TableHead className="w-32 text-right">Dibuat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <span className="rounded border bg-muted px-1.5 py-px font-mono text-[10px] uppercase">
                        {invoice.kind}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {idr(invoice.amount)} {invoice.currency}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-px font-mono text-[10px] uppercase",
                          TONE[invoice.status] ?? TONE.draft,
                        )}
                      >
                        {invoice.status}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {invoice.dueAt ? formatDateTime(invoice.dueAt) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {invoice.paidAt ? formatDateTime(invoice.paidAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(invoice.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Belum ada invoice.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
