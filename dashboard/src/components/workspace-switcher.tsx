"use client";

import Link from "next/link";
import { Box, Check, ChevronDown, ExternalLink, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DELEGATION_URL =
  process.env.NEXT_PUBLIC_DELEGATION_URL ?? "http://127.0.0.1:3005/the-delegation/";

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex items-center rounded-xl text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring/30",
            compact ? "gap-2 p-1.5" : "w-full gap-3 p-2",
          )}
          aria-label="Pilih workspace"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <Workflow className="size-4" />
          </span>
          <span className={cn("min-w-0 flex-1", compact && "hidden min-[350px]:block")}>
            <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Workspace
            </span>
            <span className="block truncate text-sm font-semibold tracking-[-0.01em]">
              AI Automation
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180",
              compact && "hidden min-[350px]:block",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 rounded-xl p-1.5" align="start" sideOffset={8}>
        <DropdownMenuLabel className="px-2 py-2 text-[11px] tracking-wide uppercase">
          Pilih workspace
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className="cursor-pointer gap-3 px-2.5 py-2.5">
          <Link href="/">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Workflow className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Dashboard Operasional</span>
              <span className="block text-xs text-muted-foreground">
                Ringkasan, approval, dan data bisnis
              </span>
            </span>
            <Check className="size-4 text-primary" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer gap-3 px-2.5 py-2.5">
          <a href={DELEGATION_URL} target="_blank" rel="noreferrer">
            <span className="grid size-8 place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Box className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Delegation Office</span>
              <span className="block text-xs text-muted-foreground">
                Kantor 3D — lihat agent bekerja secara live
              </span>
            </span>
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
