"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { ProjectsView } from "@/components/projects-view";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Proyek"
        description="Satu folder untuk konteks, dokumen, dan perjalanan setiap proyek."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <ProjectsView />
      </PageBody>
    </>
  );
}
