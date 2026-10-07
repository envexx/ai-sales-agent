import { z } from "zod";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { notifyOwner } from "../notifications/index.js";
import { buildGrowth, listImprovements, recordImprovement } from "./repository.js";

const log = loggerFor("improvement:optimize");

/**
 * Loop "Optimize": untuk tiap agent yang punya aktivitas/pelajaran terbaru,
 * susun usulan perbaikan konkret (LLM) dari data kinerja + pelajaran, simpan
 * sebagai `suggestion` (status proposed), lalu beri tahu owner.
 */
export async function runAgentOptimize(): Promise<{ generated: number; agents: string[] }> {
  const growth = await buildGrowth(14);
  const active = growth.agents.filter(
    (a) => a.done + a.failed > 0 || a.lessons7d > 0,
  );

  const generated: string[] = [];
  const names: string[] = [];

  for (const agent of active) {
    const lessons = await listImprovements({ agent: agent.slug, kind: "lesson", limit: 10 });
    try {
      const out = await structuredInvoke({
        schema: z.object({
          suggestions: z
            .array(z.object({ title: z.string(), detail: z.string() }))
            .max(3),
        }),
        system:
          "Kamu mentor operasional untuk sistem banyak agent. Berdasarkan data kinerja dan pelajaran seorang agent, " +
          "usulkan 1-3 perbaikan yang KONKRET dan bisa diterapkan (prompt, playbook, ambang, atau prosedur), dalam Bahasa Indonesia. " +
          "Fokus perbaikan yang menaikkan kualitas/keberhasilan. Jangan mengarang angka atau data di luar yang diberikan.",
        human: [
          `Agent: ${agent.name} (${agent.slug})`,
          `Kinerja ${growth.days} hari: selesai ${agent.done}, gagal ${agent.failed}, sedang jalan ${agent.running}, menunggu ${agent.queued}, tren ${agent.trend}`,
          agent.successRate !== null ? `Rasio sukses: ${agent.successRate}%` : "Rasio sukses: belum ada data",
          "Pelajaran terbaru:",
          ...(lessons.length
            ? lessons.map((l) => `- ${l.title}: ${l.detail}`)
            : ["- (belum ada pelajaran tercatat)"]),
        ].join("\n"),
        name: "AgentOptimize",
        temperature: 0.3,
      });

      for (const s of out.suggestions) {
        const title = s.title.trim();
        const detail = s.detail.trim();
        if (!title || !detail) continue;
        await recordImprovement({
          agent: agent.slug,
          kind: "suggestion",
          status: "proposed",
          title,
          detail,
          evidence: { source: "agent.optimize", done: agent.done, failed: agent.failed },
        });
      }
      generated.push(agent.slug);
      names.push(agent.name);
    } catch (err) {
      log.warn({ agent: agent.slug, err: (err as Error).message }, "optimize gagal untuk agent");
    }
  }

  if (generated.length) {
    await notifyOwner({
      title: `Usulan perbaikan agent (${generated.length})`,
      body:
        `Supervisor menyusun usulan perbaikan untuk: ${names.join(", ")}.\n` +
        `Buka dashboard → Pertumbuhan untuk menyetujui/menolak.`,
    }).catch(() => {});
  }

  log.info({ generated: generated.length }, "agent.optimize selesai");
  return { generated: generated.length, agents: generated };
}
