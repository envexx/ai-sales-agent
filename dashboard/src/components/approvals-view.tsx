"use client";

import * as React from "react";
import { useSWRConfig } from "swr";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/states";
import { api, type ApprovalItem } from "@/lib/api";
import { useApprovals } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  expired: "border-border bg-muted text-muted-foreground",
};

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] uppercase",
        tone ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function ApprovalsView() {
  const { mutate } = useSWRConfig();
  const { data, error } = useApprovals();
  const [busy, setBusy] = React.useState<string | null>(null);

  const decide = async (approval: ApprovalItem, action: "approve" | "reject") => {
    setBusy(approval.id);
    try {
      if (action === "approve") await api.approve(approval.id);
      else await api.reject(approval.id);
      await mutate(() => true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error.message} /> : null}

      {(data ?? []).map((approval) => {
        const pending = approval.status === "pending";
        return (
          <Card key={approval.id}>
            <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:gap-6">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={STATUS_TONE[approval.status]}>{approval.status}</Pill>
                  <Pill>{approval.kind}</Pill>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(approval.createdAt)}
                  </span>
                </div>
                <p className="text-sm font-medium">{approval.title}</p>
                {approval.summary ? (
                  <p className="break-words text-sm leading-6 text-muted-foreground">{approval.summary}</p>
                ) : null}
                {approval.decisionNote ? (
                  <p className="text-xs text-muted-foreground">Catatan: {approval.decisionNote}</p>
                ) : null}
                <p className="font-mono text-[11px] text-muted-foreground">
                  ID {approval.id.slice(0, 8).toUpperCase()}
                </p>
              </div>

              {pending ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <Button
                      size="sm"
                      onClick={() => void decide(approval, "approve")}
                      disabled={busy === approval.id}
                    >
                      {busy === approval.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Setujui
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decide(approval, "reject")}
                      disabled={busy === approval.id}
                    >
                      <X className="size-3.5" />
                      Tolak
                    </Button>
              </div> : null}
            </CardContent>
          </Card>
        );
      })}

      {data && data.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center text-sm text-muted-foreground">
          Tidak ada approval.
        </p>
      ) : null}
    </div>
  );
}
