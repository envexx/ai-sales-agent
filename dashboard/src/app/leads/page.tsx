"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { LeadTable } from "@/components/lead-table";
import { EmptyState, ErrorState } from "@/components/states";
import { TableSkeleton } from "@/components/skeletons";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLeads } from "@/lib/hooks";

export default function LeadsPage() {
  const { data, error, isLoading } = useLeads();

  return (
    <>
      <PageHeader
        title="Leads"
        description="Semua prospek yang pernah menghubungi, diurutkan berdasarkan skor."
        actions={<ThemeToggle />}
      />
      <PageBody className="space-y-6">
        {error ? <ErrorState message={error.message} /> : null}
        {isLoading && !data ? <TableSkeleton rows={8} /> : null}
        {data && data.length > 0 ? <LeadTable leads={data} /> : null}
        {data && data.length === 0 ? (
          <EmptyState
            title="Belum ada lead"
            description="Lead muncul di sini begitu ada pesan WhatsApp masuk dan diproses agen."
          />
        ) : null}
      </PageBody>
    </>
  );
}
