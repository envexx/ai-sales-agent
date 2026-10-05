"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";

export default function WorkflowPage() {
  return (
    <>
      <PageHeader
        title="Alur Kerja Agen"
        description="State machine LangGraph: triage, RAG, scoring, penjadwalan, dan umpan balik memori jangka panjang."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <WorkflowCanvas />
      </PageBody>
    </>
  );
}
