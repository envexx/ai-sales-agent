"use client";

import { PageBody, PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { WhatsAppConnect } from "@/components/whatsapp-connect";
import { LeadImport } from "@/components/lead-import";
import { OutreachPanel } from "@/components/outreach-panel";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Hubungkan WhatsApp, impor lead, dan atur outreach otomatis."
        actions={<ThemeToggle />}
      />
      <PageBody className="space-y-6">
        <WhatsAppConnect />
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <LeadImport />
          <OutreachPanel />
        </div>
      </PageBody>
    </>
  );
}
