"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  GaugeCircle,
  LayoutDashboard,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/status-pill";

const NAV = [
  { href: "/", label: "Ringkasan", icon: LayoutDashboard, exact: true },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/kualitas", label: "Kualitas Agen", icon: GaugeCircle },
  { href: "/booking", label: "Booking", icon: CalendarCheck },
  { href: "/workflow", label: "Workflow", icon: Workflow },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-md bg-foreground text-background">
            <Workflow className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Sales Agent</p>
            <p className="text-[11px] text-muted-foreground">LangGraph · DeepSeek</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <StatusPill />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:hidden">
          <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
            <Workflow className="size-3.5" />
          </span>
          <span className="text-sm font-semibold">Sales Agent</span>
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
    <nav className="flex items-center gap-1 overflow-x-auto border-b bg-background px-3 py-1.5 md:hidden">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs whitespace-nowrap",
              active ? "bg-muted font-medium" : "text-muted-foreground",
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
