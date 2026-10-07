"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpen, CalendarClock, FolderKanban, ReceiptText, Settings2, ShieldCheck, TicketCheck, UsersRound, Workflow, PanelsTopLeft, Box, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "./status-pill";
const GROUPS = [
  { label: "Bisnis", items: [{ href: "/supervisor", label: "Supervisor", icon: ShieldCheck }, { href: "/", label: "Proses bisnis", icon: PanelsTopLeft }, { href: "/workflow", label: "Workflow", icon: Workflow }, { href: "/approvals", label: "Approval", icon: ShieldCheck }, { href: "/tickets", label: "Tiket", icon: TicketCheck }] },
  { label: "Data & Operasi", items: [{ href: "/leads", label: "Leads & percakapan", icon: UsersRound }, { href: "/projects", label: "Proyek", icon: FolderKanban }, { href: "/invoices", label: "Invoice", icon: ReceiptText }, { href: "/booking", label: "Booking", icon: CalendarClock }, { href: "/kualitas", label: "Kualitas balasan", icon: ShieldCheck }, { href: "/knowledge", label: "Knowledge", icon: BookOpen }, { href: "/pipeline", label: "Aktivitas bisnis", icon: Activity }, { href: "/pertumbuhan", label: "Pertumbuhan agent", icon: TrendingUp }] },
];
export function SidebarNav() {
  const pathname = usePathname();
  return <aside className="sticky top-0 hidden h-svh w-[220px] shrink-0 flex-col bg-sidebar md:flex">
    <Link href="/" className="flex items-center gap-2.5 px-6 py-7 text-base font-medium tracking-tight"><Workflow className="size-5 shrink-0" /><span className="whitespace-nowrap">Agent Company</span></Link>
    <nav aria-label="Navigasi utama" className="flex-1 space-y-7 overflow-y-auto px-3 py-2">{GROUPS.map((group) => <div key={group.label} className="space-y-1"><p className="mb-2 px-3 text-[11px] text-muted-foreground">{group.label}</p>{group.items.map((item) => {
      const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12px] transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><item.icon className="size-4 shrink-0" />{item.label}</Link>;
    })}</div>)}</nav>
    <div className="space-y-1 px-3 pb-5 pt-4"><a href={process.env.NEXT_PUBLIC_DELEGATION_URL ?? "http://127.0.0.1:3005/the-delegation/"} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted"><Box className="size-4" />Delegation office ↗</a><Link href="/pengaturan" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted"><Settings2 className="size-4" />Pengaturan</Link><div className="px-3 pt-3"><StatusPill compact /></div></div>
  </aside>;
}
