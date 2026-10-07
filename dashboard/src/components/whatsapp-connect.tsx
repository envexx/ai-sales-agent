"use client";

import * as React from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  Loader2,
  LogOut,
  Plug,
  Smartphone,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { api, type WaState } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATE_META: Record<WaState, { label: string; className: string }> = {
  idle: {
    label: "Belum terhubung",
    className: "border-border bg-muted text-muted-foreground",
  },
  connecting: {
    label: "Menghubungkan…",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  qr: {
    label: "Menunggu scan QR",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  connected: {
    label: "Terhubung",
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  logged_out: {
    label: "Sesi dihapus",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
};

export function WhatsAppConnect() {
  const { data, mutate, isLoading } = useSWR("wa-status", api.whatsappStatus, {
    refreshInterval: 3000,
    keepPreviousData: true,
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await mutate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const state = data?.state ?? "idle";
  const meta = STATE_META[state];
  const usingConsole = data?.transport === "console";

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="size-4 text-muted-foreground" />
          Koneksi WhatsApp
        </CardTitle>
        <span
          className={cn(
            "rounded border px-2 py-0.5 font-mono text-[11px]",
            meta.className,
          )}
        >
          {meta.label}
        </span>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {usingConsole ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <code className="font-mono">WA_TRANSPORT=console</code> — pesan keluar masih
              dicetak ke log, belum dikirim. Anda tetap bisa menautkan WhatsApp di sini,
              lalu set <code className="font-mono">WA_TRANSPORT=baileys</code> saat siap.
            </span>
          </p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-4">
          {state === "qr" && data?.qrDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.qrDataUrl}
                alt="QR WhatsApp"
                width={220}
                height={220}
                className="rounded-lg border bg-white p-2"
              />
              <p className="max-w-[220px] text-center text-xs text-muted-foreground">
                WhatsApp → <b>Perangkat tertaut</b> → <b>Tautkan perangkat</b> → scan.
              </p>
            </div>
          ) : null}

          <div className="min-w-0 flex-1 basis-56 space-y-4">
            {state === "connected" && data?.me ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{data.me.name ?? "WhatsApp terhubung"}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {data.me.id.split(":")[0]}
                  </p>
                </div>
              </div>
            ) : null}

            {data?.lastError && state !== "connected" ? (
              <p className="text-xs text-muted-foreground">{data.lastError}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {state !== "connected" ? (
                <Button
                  size="sm"
                  onClick={() => run("connect", api.whatsappConnect)}
                  disabled={busy !== null || isLoading}
                >
                  {busy === "connect" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Plug className="size-3.5" />
                  )}
                  Hubungkan
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run("disconnect", api.whatsappDisconnect)}
                  disabled={busy !== null}
                >
                  {busy === "disconnect" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Unplug className="size-3.5" />
                  )}
                  Putuskan
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => run("logout", api.whatsappLogout)}
                disabled={busy !== null}
                title="Hapus sesi dan tampilkan QR baru"
              >
                {busy === "logout" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LogOut className="size-3.5" />
                )}
                Hapus Sesi (QR Baru)
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Terakhir diperbarui{" "}
              {data?.updatedAt
                ? new Date(data.updatedAt).toLocaleTimeString("id-ID")
                : "—"}
              . Status diperbarui otomatis tiap 3 detik.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
