"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { QualityView } from "@/components/quality-view";
import { ThemeToggle } from "@/components/theme-toggle";

export default function QualityPage() {
  return (
    <>
      <PageHeader
        title="Kualitas Agen"
        description="Kritik otomatis atas setiap balasan agen: relevansi, grounded, nada, dan peluang konversi."
        actions={<ThemeToggle />}
      />
      <PageBody>
        <QualityView />
      </PageBody>
    </>
  );
}
