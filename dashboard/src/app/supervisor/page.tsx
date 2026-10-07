"use client";

import { useEffect, useRef, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSupervisorChat, useSupervisorProfile } from "@/lib/hooks";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SupervisorPage() {
  const { data: messages, error, mutate } = useSupervisorChat();
  const { data: profile, mutate: mutateProfile } = useSupervisorProfile();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [savedProfile, setSavedProfile] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile !== undefined) setDraft(profile);
  }, [profile]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  if (error) {
    return (
      <>
        <PageHeader title="Supervisor" actions={<ThemeToggle />} />
        <PageBody className="space-y-6">
          <ErrorState message={error.message} />
        </PageBody>
      </>
    );
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await api.supervisorAsk(text);
      await mutate();
    } finally {
      setSending(false);
    }
  }

  async function saveProfile() {
    await api.setSupervisorProfile(draft);
    setSavedProfile(true);
    await mutateProfile();
    setTimeout(() => setSavedProfile(false), 2000);
  }

  return (
    <>
      <PageHeader
        title="Supervisor"
        description="Penasihat strategis Anda — paham bisnis & tujuan Anda, memberi saran agar perusahaan lebih baik."
        actions={<ThemeToggle />}
      />
      <PageBody className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-5">
          {/* Obrolan */}
          <Card className="flex min-h-[32rem] flex-col xl:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="size-3.5" /> Percakapan
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 pt-0">
              <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-label="Percakapan dengan Supervisor">
                {messages?.length ? (
                  messages.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6",
                        m.role === "owner"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Mulai percakapan. Contoh: “Bagaimana cara menaikkan lead berkualitas bulan ini?”
                  </p>
                )}
                {sending ? (
                  <div className="max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Supervisor sedang menganalisis…
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>

              <div className="flex items-end gap-2 border-t pt-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Tulis pesan / pertanyaan untuk Supervisor…"
                  className="min-h-10 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label="Pesan untuk Supervisor"
                />
                <Button onClick={send} disabled={sending || !input.trim()}>
                  <Send className="size-3.5" />
                  Kirim
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profil & tujuan owner */}
          <Card className="self-start xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tujuan & profil saya</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-xs leading-5 text-muted-foreground">
                Supervisor membaca ini agar saran selaras dengan keinginan Anda. Isi tujuan, prioritas,
                dan batasan.
              </p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={16}
                className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-[12px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="Profil dan tujuan owner"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={saveProfile}>
                  Simpan tujuan
                </Button>
                {savedProfile ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Tersimpan</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
