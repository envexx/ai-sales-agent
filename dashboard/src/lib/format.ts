import type { Segment } from "./api";

const ID = "id-ID";

/** "baru saja", "3 menit lalu", "kemarin", "12 Sep" */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "kemarin";
  if (days < 7) return `${days} hari lalu`;
  return then.toLocaleDateString(ID, { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(ID, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(ID, { hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string | null | undefined, jid: string): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/);
    return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return jid.replace(/\D/g, "").slice(-2);
}

export function phoneFromJid(jid: string): string {
  const digits = jid.split("@")[0] ?? jid;
  return `+${digits}`;
}

export interface SegmentMeta {
  label: string;
  band: string;
  meaning: string;
}

export const SEGMENTS: Record<"nurture" | "objection" | "closing", SegmentMeta> = {
  nurture: { label: "Nurture", band: "< 40", meaning: "Bangun kepercayaan" },
  objection: { label: "Objection", band: "40–74", meaning: "Tangani keberatan" },
  closing: { label: "Closing", band: "≥ 75", meaning: "Amankan langkah berikutnya" },
};

export function segmentMeta(segment: Segment): SegmentMeta | null {
  if (!segment) return null;
  return SEGMENTS[segment] ?? null;
}

/** Normalise the model output — some providers return a joined string. */
export function toStringList(value: string[] | string | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function scoreTone(score: number): "low" | "mid" | "high" {
  if (score >= 75) return "high";
  if (score >= 40) return "mid";
  return "low";
}
