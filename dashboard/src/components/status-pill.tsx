"use client";

import { useHealth } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";

/**
 * Live connection readout for the agent backend. Encodes three facts a
 * monitoring operator checks constantly: is the API reachable, which WhatsApp
 * transport is live, and whether messages are actually being sent.
 */
export function StatusPill({ compact = false }: { compact?: boolean }) {
  const { data, error } = useHealth();

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground" />
        <span className="truncate" title={String(error.message)}>
          API offline
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
        Menghubungkan…
      </div>
    );
  }

  const live = data.transport === "baileys";
  const sending = !data.dryRun;

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-medium text-foreground">API terhubung</span>
        <span className="ml-auto font-mono text-muted-foreground">{data.model}</span>
      </div>
      {!compact ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className={cn(
              "rounded border px-1.5 py-px font-mono uppercase",
              live
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-border bg-muted",
            )}
          >
            {data.transport}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-px font-mono uppercase",
              sending
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-border bg-muted",
            )}
          >
            {sending ? "live send" : "dry-run"}
          </span>
          <span className="ml-auto truncate font-mono lowercase" title={API_URL}>
            emb:{data.embedding}
          </span>
        </div>
      ) : null}
    </div>
  );
}
