import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import type { DevPlan, DevSignals, DevTargetRecord } from "./types.js";

const log = loggerFor("developer:plan");

const DevPlanSchema = z.object({
  summary: z.string(),
  seo: z.array(z.string()).max(10).default([]),
  deployPlatform: z.string().nullable().default(null),
  items: z
    .array(
      z.object({
        area: z.string(),
        priority: z.enum(["high", "medium", "low"]),
        action: z.string(),
        rationale: z.string(),
        automated: z.boolean().default(true),
      }),
    )
    .max(15),
});

const SYSTEM_MAINTAIN =
  "Kamu lead developer agensi digital. Berdasarkan sinyal teknis situs/repo klien, susun rencana perbaikan " +
  "yang ringkas dan berdampak: SEO/ketemuan (detectability), performa, keamanan, dan aksesibilitas. " +
  "Tandai `automated=true` hanya untuk perubahan yang bisa dikerjakan otomatis lewat coding. Jangan mengarang " +
  "data yang tidak ada di sinyal. Prioritaskan hal yang paling berdampak lebih dulu.";

const SYSTEM_BUILD =
  "Kamu lead engineer agensi. Dari permintaan owner, susun rencana implementasi otomasi / AI agent yang jelas: " +
  "arsitektur singkat, langkah, integrasi, dan cara uji. Tandai `automated=true` untuk langkah coding. " +
  "Ringkas, konkret, dan jangan melebih-lebihkan.";

/** Rencana cadangan bila LLM gagal (agar alur tetap berjalan). */
function heuristicPlan(mode: "maintain" | "build", signalNotes: string[]): DevPlan {
  if (mode === "build") {
    return {
      summary: "Rencana awal implementasi otomasi (otomatis karena LLM tidak tersedia).",
      seo: [],
      deployPlatform: null,
      items: [
        {
          area: "Implementasi",
          priority: "high",
          action: "Rancang & bangun otomasi sesuai brief, lalu uji.",
          rationale: "Menindaklanjuti permintaan owner.",
          automated: true,
        },
      ],
    };
  }
  const items: DevPlan["items"] = [];
  for (const note of signalNotes) {
    items.push({
      area: "Audit",
      priority: "medium",
      action: note,
      rationale: "Temuan sinyal teknis.",
      automated: true,
    });
  }
  if (items.length === 0) {
    items.push({
      area: "Audit",
      priority: "medium",
      action: "Lakukan audit manual situs (SEO, performa, keamanan).",
      rationale: "Sinyal teknis belum tersedia.",
      automated: false,
    });
  }
  return {
    summary: "Rencana perbaikan awal (heuristik; LLM tidak tersedia).",
    seo: [],
    deployPlatform: null,
    items: items.slice(0, env.DEVELOPER_MAX_PLAN_ITEMS),
  };
}

/** Susun rencana developer (maintain/build) dari target + sinyal/brief. */
export async function buildDevPlan(params: {
  mode: "maintain" | "build";
  target: Pick<DevTargetRecord, "name" | "repoUrl" | "liveUrl" | "platform" | "kind">;
  signals?: DevSignals;
  brief?: string;
}): Promise<DevPlan> {
  const { mode, target, signals, brief } = params;

  const signalLines: string[] = [];
  if (signals) {
    signalLines.push(
      `Situs: ${signals.liveUrl ?? "(tidak ada)"} · HTTP ${signals.httpStatus ?? "?"}`,
      `Judul: ${signals.title ?? "(tidak ada)"}`,
      `Meta description: ${signals.metaDescription ?? "(tidak ada)"}`,
      `sitemap.xml: ${signals.hasSitemap === null ? "?" : signals.hasSitemap ? "ada" : "tidak ada"} · ` +
        `robots.txt: ${signals.hasRobots === null ? "?" : signals.hasRobots ? "ada" : "tidak ada"}`,
      signals.repo ? `Repo: ${JSON.stringify(signals.repo)}` : "Repo: (tidak ada)",
      `Platform aktif: ${signals.platforms.filter((p) => p.configured).map((p) => p.id).join(", ") || "(tidak ada)"}`,
      ...signals.notes.map((n) => `Catatan: ${n}`),
    );
  }

  const human =
    mode === "build"
      ? [
          `Target: ${target.name} (${target.kind})`,
          target.repoUrl ? `Repo: ${target.repoUrl}` : "",
          `Permintaan owner: ${brief ?? "(kosong)"}`,
          "Susun rencana implementasi.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : [
          `Target: ${target.name} (${target.kind})`,
          target.repoUrl ? `Repo: ${target.repoUrl}` : "",
          target.platform ? `Platform deploy: ${target.platform}` : "",
          signalLines.join("\n"),
          "Susun rencana perbaikan.",
        ]
          .filter(Boolean)
          .join("\n\n");

  try {
    const plan = await structuredInvoke({
      schema: DevPlanSchema,
      system: mode === "build" ? SYSTEM_BUILD : SYSTEM_MAINTAIN,
      human,
      name: "DeveloperPlan",
      temperature: 0.3,
      maxTokens: 2000,
    });
    return {
      ...plan,
      items: plan.items.slice(0, env.DEVELOPER_MAX_PLAN_ITEMS),
    };
  } catch (err) {
    log.warn({ err: (err as Error).message, mode }, "penyusunan rencana developer gagal, pakai heuristik");
    return heuristicPlan(mode, signals?.notes ?? []);
  }
}

/** Render rencana menjadi Markdown untuk dokumen proyek/workspace. */
export function renderDevPlanMarkdown(params: {
  mode: "maintain" | "build";
  target: Pick<DevTargetRecord, "name" | "repoUrl" | "liveUrl" | "platform">;
  plan: DevPlan;
  brief?: string;
}): string {
  const { mode, target, plan, brief } = params;
  const priority = (p: string) => (p === "high" ? "🔴" : p === "medium" ? "🟠" : "🟡");
  return [
    `# Rencana Developer — ${target.name}`,
    "",
    `Mode: **${mode}** · Tool: GitHub + platform developer · Engine: OpenCode`,
    target.repoUrl ? `Repo: ${target.repoUrl}` : "",
    target.liveUrl ? `Situs: ${target.liveUrl}` : "",
    target.platform ? `Platform: ${target.platform}` : "",
    "",
    "## Ringkasan",
    plan.summary,
    "",
    ...(brief ? ["## Permintaan", brief, ""] : []),
    "## Langkah",
    ...plan.items.map(
      (i) => `- ${priority(i.priority)} **${i.area}** — ${i.action}\n  - Alasan: ${i.rationale}${i.automated ? " _(otomatis)_" : " _(manual)_"}`,
    ),
    "",
    ...(plan.seo.length ? ["## Fokus SEO / Detectability", ...plan.seo.map((s) => `- ${s}`), ""] : []),
    plan.deployPlatform ? `## Deploy\nPlatform: ${plan.deployPlatform}\n` : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}
