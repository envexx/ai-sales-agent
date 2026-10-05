"use client";

import React from "react";
import {
  Bot,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  FileCode,
  Flag,
  Gauge,
  HardDrive,
  HelpCircle,
  Layers,
  MessageSquare,
  SearchCheck,
  Send,
  ShieldAlert,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorkflowNodeMetadata } from "./workflow-data";

interface WorkflowNodeDetailProps {
  node: WorkflowNodeMetadata | null;
  onClose: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  MessageSquare,
  Bot,
  ShieldAlert,
  Database,
  Gauge,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Cpu,
  Send,
  CalendarCheck,
  SearchCheck,
  Brain,
  HardDrive,
  Flag,
};

export function WorkflowNodeDetail({ node, onClose }: WorkflowNodeDetailProps) {
  if (!node) return null;

  const Icon = ICON_MAP[node.iconName] || Workflow;

  return (
    <aside className="flex h-full w-full flex-col border-l bg-card text-card-foreground shadow-lg md:w-[380px] lg:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{node.name}</h2>
            <p className="font-mono text-xs text-muted-foreground truncate">
              {node.langGraphId}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Tutup detail node"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Content scroll */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 text-xs">
          {/* Badge & Category */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-normal text-[11px]">
              Kategori: <span className="ml-1 font-semibold capitalize">{node.category}</span>
            </Badge>
            <Badge variant="secondary" className="text-[11px]">
              {node.badge}
            </Badge>
            {node.segment && (
              <Badge
                className={
                  node.segment === "closing"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : node.segment === "objection"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                }
              >
                Segmen {node.segment}
              </Badge>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="size-3.5 text-muted-foreground" />
              Peran dalam Alur
            </h3>
            <p className="leading-relaxed text-muted-foreground">{node.description}</p>
          </div>

          {/* File location */}
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground flex items-center gap-1.5">
              <FileCode className="size-3.5 text-muted-foreground" />
              Lokasi Kode
            </h3>
            <div className="rounded-md border bg-muted/50 p-2 font-mono text-[11px] break-all">
              {node.file}
            </div>
          </div>

          {/* State inputs & outputs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border p-2.5 space-y-1 bg-muted/20">
              <span className="font-semibold text-[11px] text-foreground block">
                Input State:
              </span>
              <ul className="space-y-0.5 text-muted-foreground font-mono text-[10.5px]">
                {node.inputs.map((inp, i) => (
                  <li key={i} className="truncate" title={inp}>
                    • {inp}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border p-2.5 space-y-1 bg-muted/20">
              <span className="font-semibold text-[11px] text-foreground block">
                Output Update:
              </span>
              <ul className="space-y-0.5 text-muted-foreground font-mono text-[10.5px]">
                {node.outputs.map((out, i) => (
                  <li key={i} className="truncate" title={out}>
                    • {out}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Business Logic */}
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground">Logika & Keputusan Bisnis</h3>
            <ul className="space-y-1 rounded-md border bg-card p-2.5 text-muted-foreground">
              {node.businessLogic.map((logic, i) => (
                <li key={i} className="flex items-start gap-1.5 leading-relaxed">
                  <span className="text-primary font-bold text-[12px]">•</span>
                  <span>{logic}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Prompt excerpt if available */}
          {node.promptExcerpt && (
            <div className="space-y-1.5">
              <h3 className="font-semibold text-foreground">Kutipan Prompt LLM</h3>
              <div className="rounded-md border bg-muted/40 p-2.5 text-muted-foreground font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {node.promptExcerpt}
              </div>
            </div>
          )}

          {/* Code Snippet */}
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground flex items-center gap-1.5">
              <Code2 className="size-3.5 text-muted-foreground" />
              Potongan Kode Sumber
            </h3>
            <pre className="overflow-x-auto rounded-md border bg-muted/70 p-2.5 font-mono text-[10.5px] leading-relaxed text-foreground">
              <code>{node.codeSnippet}</code>
            </pre>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
