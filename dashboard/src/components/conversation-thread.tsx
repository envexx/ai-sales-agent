import { Bot, User } from "lucide-react";
import type { ConversationMessage } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * WhatsApp-style transcript. Inbound (lead) sits left on a muted ground;
 * outbound (agent) sits right on the accent tint so the two voices are
 * distinguishable at a glance while scanning.
 */
export function ConversationThread({ messages }: { messages: ConversationMessage[] }) {

  return (
    <div className="flex flex-col gap-3">
      {messages.map((m, i) => {
        const day = dayLabel(m.createdAt);
        const showDay = i === 0 || day !== dayLabel(messages[i - 1].createdAt);
        const outbound = m.direction === "outbound";

        return (
          <div key={i} className="flex flex-col gap-3">
            {showDay ? (
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">{day}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}

            <div
              className={cn(
                "flex min-w-0 max-w-[95%] gap-2.5 sm:max-w-[85%]",
                outbound ? "ml-auto flex-row-reverse" : "mr-auto",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                  outbound ? "bg-foreground text-background" : "bg-muted",
                )}
                aria-hidden
              >
                {outbound ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
              </span>
              <div
                className={cn(
                  "min-w-0 rounded-lg border px-3.5 py-2.5",
                  outbound
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "bg-muted/50",
                )}
              >
                <p className="text-[11px] font-medium text-muted-foreground">
                  {outbound ? "Agen" : "Prospek"}
                  <span className="ml-2 font-mono font-normal">
                    {formatClock(m.createdAt)}
                  </span>
                </p>
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {m.content}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
