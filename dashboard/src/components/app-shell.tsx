"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  CircleGauge,
  FolderKanban,
  ShieldCheck,
  TicketCheck,
  UsersRound,
  Workflow,
  BookOpen, CalendarClock, ReceiptText, Settings2, Box, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "@/components/sidebar-nav";
import { StatusPill } from "@/components/status-pill";

const MOBILE_NAV = [
  { href: "/", label: "Kanban", icon: CircleGauge, exact: true },
  { href: "/supervisor", label: "Supervisor", icon: ShieldCheck },
  { href: "/workflow", label: "Alur", icon: Workflow },
  { href: "/approvals", label: "Approval", icon: ShieldCheck },
  { href: "/tickets", label: "Tiket", icon: TicketCheck },
  { href: "/leads", label: "Leads", icon: UsersRound },
  { href: "/projects", label: "Proyek", icon: FolderKanban },
  { href: "/pipeline", label: "Aktivitas", icon: Activity },
  { href: "/invoices", label: "Invoice", icon: ReceiptText },
  { href: "/booking", label: "Booking", icon: CalendarClock },
  { href: "/kualitas", label: "Kualitas", icon: ShieldCheck },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/pertumbuhan", label: "Pertumbuhan", icon: TrendingUp },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings2 },
  { href: process.env.NEXT_PUBLIC_DELEGATION_URL ?? "http://127.0.0.1:3005/the-delegation/", label: "Delegation ↗", icon: Box },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh bg-background">
      <Suspense fallback={<aside className="hidden h-svh w-[220px] shrink-0 border-r bg-sidebar md:block" />}>
        <SidebarNav />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/90 px-3 backdrop-blur-xl md:hidden">
          <Link href="/" className="flex items-center gap-2 text-base font-medium tracking-tight"><Workflow className="size-5 shrink-0" /><span className="whitespace-nowrap">Agent Company</span></Link>
          <div className="ml-auto">
            <StatusPill compact />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar sticky top-16 z-20 flex items-center gap-1.5 overflow-x-auto border-b bg-card/90 px-3 py-2 backdrop-blur-xl md:hidden">
      {MOBILE_NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
