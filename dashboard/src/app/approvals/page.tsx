"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { ApprovalsView } from "@/components/approvals-view";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approval"
        description="Persetujuan human-in-the-loop yang menunggu keputusan Anda."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <ApprovalsView />
      </PageBody>
    </>
  );
}
