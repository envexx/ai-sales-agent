import Link from "next/link";
import { PageBody, PageHeader } from "@/components/page-header";
import { BusinessKanban } from "@/components/business-kanban";
export default function HomePage() {
  return <><PageHeader title="Proses bisnis" actions={<Link href="/workflow" className="rounded-lg bg-foreground px-4 py-2 text-sm text-background">Lihat workflow ↗</Link>} /><PageBody className="pt-2 lg:pt-2"><BusinessKanban /></PageBody></>;
}
