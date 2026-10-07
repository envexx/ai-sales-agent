"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { TicketsView } from "@/components/tickets-view";
import { ThemeToggle } from "@/components/theme-toggle";

export default function TicketsPage() {
  return (
    <>
      <PageHeader
        title="Tiket"
        description="Laporan dukungan L1 dari klien dan status eskalasinya."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <TicketsView />
      </PageBody>
    </>
  );
}
