"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Cpu,
  Database,
  Flag,
  Gauge,
  HardDrive,
  HelpCircle,
  MessageSquare,
  SearchCheck,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeMetadata } from "./workflow-data";

export interface WorkflowNodeData extends WorkflowNodeMetadata {
  isSelected?: boolean;
  isActiveStep?: boolean;
  isDimmed?: boolean;
  stepNumber?: number;
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

const COLOR_STYLES: Record<
  WorkflowNodeMetadata["color"],
  {
    bgIcon: string;
    textIcon: string;
    badge: string;
    borderActive: string;
    glow: string;
  }
> = {
  indigo: {
    bgIcon: "bg-indigo-500/10 dark:bg-indigo-500/20",
    textIcon: "text-indigo-600 dark:text-indigo-400",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60",
    borderActive: "border-indigo-500 shadow-indigo-500/20",
    glow: "ring-indigo-500",
  },
  purple: {
    bgIcon: "bg-purple-500/10 dark:bg-purple-500/20",
    textIcon: "text-purple-600 dark:text-purple-400",
    badge: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60",
    borderActive: "border-purple-500 shadow-purple-500/20",
    glow: "ring-purple-500",
  },
  rose: {
    bgIcon: "bg-rose-500/10 dark:bg-rose-500/20",
    textIcon: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60",
    borderActive: "border-rose-500 shadow-rose-500/20",
    glow: "ring-rose-500",
  },
  cyan: {
    bgIcon: "bg-cyan-500/10 dark:bg-cyan-500/20",
    textIcon: "text-cyan-600 dark:text-cyan-400",
    badge: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/60",
    borderActive: "border-cyan-500 shadow-cyan-500/20",
    glow: "ring-cyan-500",
  },
  amber: {
    bgIcon: "bg-amber-500/10 dark:bg-amber-500/20",
    textIcon: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60",
    borderActive: "border-amber-500 shadow-amber-500/20",
    glow: "ring-amber-500",
  },
  sky: {
    bgIcon: "bg-sky-500/10 dark:bg-sky-500/20",
    textIcon: "text-sky-600 dark:text-sky-400",
    badge: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60",
    borderActive: "border-sky-500 shadow-sky-500/20",
    glow: "ring-sky-500",
  },
  emerald: {
    bgIcon: "bg-emerald-500/10 dark:bg-emerald-500/20",
    textIcon: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60",
    borderActive: "border-emerald-500 shadow-emerald-500/20",
    glow: "ring-emerald-500",
  },
  violet: {
    bgIcon: "bg-violet-500/10 dark:bg-violet-500/20",
    textIcon: "text-violet-600 dark:text-violet-400",
    badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800/60",
    borderActive: "border-violet-500 shadow-violet-500/20",
    glow: "ring-violet-500",
  },
  fuchsia: {
    bgIcon: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
    textIcon: "text-fuchsia-600 dark:text-fuchsia-400",
    badge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:border-fuchsia-800/60",
    borderActive: "border-fuchsia-500 shadow-fuchsia-500/20",
    glow: "ring-fuchsia-500",
  },
  slate: {
    bgIcon: "bg-slate-500/10 dark:bg-slate-500/20",
    textIcon: "text-slate-600 dark:text-slate-400",
    badge: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    borderActive: "border-slate-500 shadow-slate-500/20",
    glow: "ring-slate-500",
  },
};

function WorkflowCustomNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const isSelected = selected || nodeData.isSelected;
  const isActiveStep = nodeData.isActiveStep;
  const isDimmed = nodeData.isDimmed;

  const Icon = ICON_MAP[nodeData.iconName] || Bot;
  const colorStyle = COLOR_STYLES[nodeData.color] || COLOR_STYLES.slate;

  const isStart = nodeData.id === "START";
  const isEnd = nodeData.id === "END";

  return (
    <div
      className={cn(
        "group relative w-[280px] rounded-xl border bg-card p-3.5 text-card-foreground shadow-sm transition-all duration-200",
        "hover:shadow-md hover:border-foreground/30 cursor-pointer select-none",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary shadow-md",
        isActiveStep && "ring-2 ring-offset-2 ring-offset-background animate-pulse shadow-lg scale-[1.03]",
        isActiveStep && colorStyle.glow,
        isDimmed && "opacity-25 grayscale-[60%] hover:opacity-80 transition-opacity",
      )}
    >
      {/* Simulation step indicator */}
      {isActiveStep && typeof nodeData.stepNumber === "number" ? (
        <span className="absolute -top-3 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">
          {nodeData.stepNumber}
        </span>
      ) : null}

      {/* Target Handles — main input from the left, plus top/bottom for branch merges */}
      {!isStart && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="target-left"
            className="!size-2.5 !border-2 !border-background !bg-muted-foreground transition-colors group-hover:!bg-primary"
          />
          <Handle
            type="target"
            position={Position.Top}
            id="target-top"
            className="!size-2.5 !border-2 !border-background !bg-muted-foreground/70"
          />
          <Handle
            type="target"
            position={Position.Bottom}
            id="target-bottom"
            className="!size-2.5 !border-2 !border-background !bg-muted-foreground/70"
          />
        </>
      )}

      {/* Card Header: Icon, Titles, Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-105",
              colorStyle.bgIcon,
              colorStyle.textIcon,
            )}
          >
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold tracking-tight text-foreground">
              {nodeData.name}
            </h3>
            <p className="font-mono text-[10px] text-muted-foreground truncate">
              {nodeData.langGraphId}
            </p>
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none whitespace-nowrap",
            colorStyle.badge,
          )}
        >
          {nodeData.badge}
        </span>
      </div>

      {/* Card Body: Summary Description */}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
        {nodeData.summary}
      </p>

      {/* Card Footer: Metadata pill / file tag */}
      <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
        <span className="truncate font-mono text-[9.5px]">
          {nodeData.file.split("/").pop()}
        </span>
        <span className="font-medium text-[9px] uppercase tracking-wider text-muted-foreground/80">
          {nodeData.category}
        </span>
      </div>

      {/* Source Handles — main output to the right, plus top/bottom for branches */}
      {!isEnd && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="source-right"
            className="!size-2.5 !border-2 !border-background !bg-muted-foreground transition-colors group-hover:!bg-primary"
          />
          <Handle
            type="source"
            position={Position.Top}
            id="source-top"
            className="!size-2.5 !border-2 !border-background !bg-muted-foreground/70"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="source-bottom"
            className="!size-2.5 !border-2 !border-background !bg-muted-foreground/70"
          />
        </>
      )}
    </div>
  );
}

export const WorkflowCustomNode = memo(WorkflowCustomNodeComponent);
