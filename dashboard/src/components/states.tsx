import type { ReactNode } from "react";
import { AlertTriangle, Database } from "lucide-react";
import { API_URL } from "@/lib/api";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/50 px-6 py-14 text-center">
      <span className="grid size-9 place-items-center rounded-md border bg-muted text-muted-foreground">
        {icon ?? <Database className="size-4" />}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 space-y-2 break-words">
        <p className="font-medium text-foreground">Tidak bisa memuat data</p>
        <p className="text-muted-foreground">
          {message}. Pastikan API berjalan di <code className="font-mono">{API_URL}</code>{" "}
          (<code className="font-mono">npm run dev</code>).
        </p>
      </div>
    </div>
  );
}
