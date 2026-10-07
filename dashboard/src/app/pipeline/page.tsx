"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { PipelineView } from "@/components/pipeline-view";
import { ThemeToggle } from "@/components/theme-toggle";

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Orkestrasi job, event, dan ringkasan bisnis lintas agen."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <PipelineView />
      </PageBody>
    </>
  );
}
