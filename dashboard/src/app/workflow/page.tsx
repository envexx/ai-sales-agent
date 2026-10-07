import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/page-header";
import { BusinessWorkflow } from "@/components/business-workflow";
export default function WorkflowPage() {
  return <><PageHeader title="Workflow bisnis" /><PageBody className="pt-2 lg:pt-2"><Suspense fallback={<p>Memuat workflow…</p>}><BusinessWorkflow /></Suspense></PageBody></>;
}
