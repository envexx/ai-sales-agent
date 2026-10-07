"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { api, type ImportResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EXAMPLE = `[
  { "name": "Andi", "phone": "081200000000", "company": "PT Maju Jaya",
    "source": "instagram", "notes": "Butuh otomatisasi order", "queue": true }
]`;

export function LeadImport() {
  const [raw, setRaw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError("JSON tidak valid. Periksa tanda kutip dan koma.");
      return;
    }

    const body = Array.isArray(parsed) ? { leads: parsed } : parsed;
    setBusy(true);
    try {
      setResult(await api.importLeads(body as never));
      setRaw("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Upload className="size-4 text-muted-foreground" />
          Impor Lead (Outbound)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="break-words text-xs leading-5 text-muted-foreground">
          Tempel satu objek lead, array, atau <code className="font-mono">{"{ leads: [...] }"}</code>.
          Hanya <code className="font-mono">phone</code> yang wajib; field lain:{" "}
          <code className="font-mono">name · company · source · notes · tags · countryCode · queue</code>.
          Alias seperti <code className="font-mono">nomor</code>, <code className="font-mono">nama</code>,{" "}
          <code className="font-mono">perusahaan</code>, <code className="font-mono">kebutuhan</code> juga
          diterima. Lead masuk sebagai <code className="font-mono">kind=prospect</code> dan otomatis
          masuk antrean outreach (<code className="font-mono">&quot;queue&quot;: false</code> untuk menyimpan saja).
        </p>
        <p className="rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
          POST /webhook/leads · spesifikasi: GET /webhook/leads/schema
        </p>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          rows={7}
          className="w-full rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={submit} disabled={busy || raw.trim().length === 0}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Impor ke Database
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setRaw(EXAMPLE)}
          >
            Isi contoh
          </Button>
        </div>

        {error ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {result.created} lead berhasil diimpor
              {result.failed ? `, ${result.failed} gagal` : ""}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {result.leads.slice(0, 5).map((l) => (
                <li key={l.id} className="truncate font-mono">
                  {l.name ?? "-"} · {l.waJid.split("@")[0]} · {l.outreachStatus}
                </li>
              ))}
              {result.errors.map((e) => (
                <li key={e.phone} className="font-mono text-destructive">
                  {e.phone}: {e.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
