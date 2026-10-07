import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { emitEvent } from "../pipeline/events.js";
import { enqueueJob } from "../pipeline/repository.js";
import { createProject, ensureProjectWorkspace, getProject, updateProject, upsertClient } from "../pipeline/entities.js";
import {
  getConversationByLeadId,
  getLatestMeetingNote,
  getLeadById,
  getRecentConversation,
} from "../repository/index.js";
import type { ConversationRow } from "../repository/index.js";
import { scoperPrompt } from "./prompts.js";
import { recordImprovement } from "../improvement/repository.js";
import { renderMarkdownPdf } from "../integrations/pdf.js";
import type { Prd, ScoperEvaluation, ScoperResult } from "./types.js";

const log = loggerFor("scoper");

const PrdSchema = z.object({
  title: z.string(),
  summary: z.string(),
  overview: z.object({
    problem: z.string(),
    solution: z.string(),
    aiBuildSummary: z.string(),
  }),
  goals: z.object({
    primary: z.string(),
    successMetrics: z.array(z.string()).max(6),
    antiGoals: z.array(z.string()).max(6),
  }),
  scope: z.object({
    inScope: z.array(z.string()).max(20),
    outOfScope: z.array(z.string()).max(20),
    technicalConstraints: z.array(z.string()).max(12),
  }),
  jtbd: z
    .array(z.object({ priority: z.number(), statement: z.string() }))
    .max(6),
  userStories: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        action: z.string(),
        benefit: z.string(),
        jtbdRef: z.string(),
      }),
    )
    .max(15),
  experience: z.object({
    designDirection: z.string(),
    keyScreens: z.array(z.string()).max(15),
    interactionModel: z.array(z.string()).max(12),
    accessibility: z.array(z.string()).max(10),
  }),
  components: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
        linkedStories: z.array(z.string()).max(10),
      }),
    )
    .max(25),
  requirements: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        priority: z.enum(["must", "should", "could"]),
      }),
    )
    .max(25),
  flows: z
    .array(z.object({ name: z.string(), steps: z.array(z.string()).max(15) }))
    .max(10),
  integrations: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        direction: z.string(),
        purpose: z.string(),
      }),
    )
    .max(20),
  apiSurface: z
    .array(
      z.object({
        method: z.string(),
        path: z.string(),
        description: z.string(),
        auth: z.string(),
        response: z.string(),
      }),
    )
    .max(25),
  dataModel: z
    .array(
      z.object({
        table: z.string(),
        fields: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              note: z.string().optional(),
            }),
          )
          .max(30),
      }),
    )
    .max(20),
  stateManagement: z
    .array(
      z.object({
        state: z.string(),
        location: z.string(),
        persistence: z.string(),
        notes: z.string(),
      }),
    )
    .max(15),
  techStack: z
    .array(z.object({ layer: z.string(), choice: z.string(), rationale: z.string() }))
    .max(12),
  fileStructure: z.string(),
  acceptanceCriteria: z
    .array(z.object({ storyRef: z.string(), criteria: z.array(z.string()).max(12) }))
    .max(15),
  risks: z
    .array(z.object({ risk: z.string(), mitigation: z.string() }))
    .max(10),
  rollout: z.object({
    mvpIncludes: z.array(z.string()).max(10),
    mvpExcludes: z.array(z.string()).max(10),
    phase2: z.array(z.string()).max(10),
    nextSteps: z.array(z.string()).max(10),
  }),
  openQuestions: z.array(z.string()).max(15),
  assumptions: z.array(z.string()).max(12),
  checklist: z.array(z.string()).max(30),
});

/** Skema evaluasi kualitas PRD (reflection & evaluation). */
const EvaluationSchema = z.object({
  score: z.number().min(0).max(10),
  buildReadiness: z.number().min(0).max(10),
  groundedness: z.number().min(0).max(10),
  critique: z.string(),
  missing: z.array(z.string()).max(15),
});

function transcriptText(rows: ConversationRow[]): string {
  if (rows.length === 0) return "(tidak ada transkrip)";
  return rows
    .map((r) => `${r.direction === "inbound" ? "Klien" : "Agen"}: ${r.content}`)
    .join("\n");
}

/** Rakit PRD menjadi markdown siap-pakai (manusia + AI coding tools). */
function renderPrd(prd: Prd, meta: { clientName: string; generatedAt: string }): string {
  const bullets = (items: string[]) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : "_—_";
  const checks = (items: string[]) =>
    items.length ? items.map((i) => `- [ ] ${i}`).join("\n") : "_—_";

  const lines: string[] = [
    `# PRD — ${prd.title}`,
    "",
    `> Klien: ${meta.clientName} · Dibuat: ${meta.generatedAt}`,
    "",
    "## Ringkasan",
    "",
    prd.summary,
    "",
    "## 1. Overview",
    "",
    `**Masalah:** ${prd.overview.problem}`,
    "",
    `**Solusi:** ${prd.overview.solution}`,
    "",
    `**AI Build Summary:** ${prd.overview.aiBuildSummary}`,
    "",
    "## 2. Goals & Metrik",
    "",
    `**Tujuan utama:** ${prd.goals.primary}`,
    "",
    "**Metrik sukses**",
    "",
    bullets(prd.goals.successMetrics),
    "",
    "**Anti-goals**",
    "",
    bullets(prd.goals.antiGoals),
    "",
    "## 3. Scope & Batasan",
    "",
    "**In scope**",
    "",
    bullets(prd.scope.inScope),
    "",
    "**Out of scope**",
    "",
    bullets(prd.scope.outOfScope),
    "",
    "**Batasan teknis**",
    "",
    bullets(prd.scope.technicalConstraints),
    "",
    "## 4. Jobs to Be Done (JTBD)",
    "",
    ...prd.jtbd.map((j) => `${j.priority}. ${j.statement}`),
    "",
    "## 5. User Stories",
    "",
    "| ID | Role | Aksi | Manfaat | JTBD |",
    "| --- | --- | --- | --- | --- |",
    ...prd.userStories.map(
      (u) => `| ${u.id} | ${u.role} | ${u.action} | ${u.benefit} | ${u.jtbdRef} |`,
    ),
    "",
    "## 6. Pengalaman (Experience)",
    "",
    prd.experience.designDirection,
    "",
    "**Layar / State**",
    "",
    bullets(prd.experience.keyScreens),
    "",
    "**Model interaksi**",
    "",
    bullets(prd.experience.interactionModel),
    "",
    "**Aksesibilitas**",
    "",
    bullets(prd.experience.accessibility),
    "",
    "## 7. Komponen UI",
    "",
    "| Komponen | Tipe | Deskripsi | Stories |",
    "| --- | --- | --- | --- |",
    ...prd.components.map(
      (c) => `| ${c.name} | ${c.type} | ${c.description} | ${c.linkedStories.join(", ")} |`,
    ),
    "",
    "## 8. Kebutuhan Fungsional",
    "",
    ...prd.requirements.map(
      (r) => `- **[${r.priority.toUpperCase()}] ${r.title}** — ${r.description}`,
    ),
    "",
    "## 9. Alur Logika",
    "",
    ...prd.flows.flatMap((f) => [
      `### ${f.name}`,
      "",
      ...f.steps.map((s, i) => `${i + 1}. ${s}`),
      "",
    ]),
    "## 10. Integrasi (Webhook / API)",
    "",
    ...prd.integrations.map(
      (i) => `- **${i.name}** (${i.type} · ${i.direction}) — ${i.purpose}`,
    ),
    "",
    "## 11. API Surface",
    "",
    "| Method | Path | Deskripsi | Auth | Response |",
    "| --- | --- | --- | --- | --- |",
    ...prd.apiSurface.map(
      (a) => `| ${a.method} | ${a.path} | ${a.description} | ${a.auth} | ${a.response} |`,
    ),
    "",
    "## 12. Struktur Data",
    "",
    ...prd.dataModel.flatMap((t) => [
      `### ${t.table}`,
      "",
      ...t.fields.map(
        (f) => `- \`${f.name}\` — ${f.type}${f.note ? ` (${f.note})` : ""}`,
      ),
      "",
    ]),
    "## 13. State Management",
    "",
    "| State | Lokasi | Persistensi | Catatan |",
    "| --- | --- | --- | --- |",
    ...prd.stateManagement.map(
      (s) => `| ${s.state} | ${s.location} | ${s.persistence} | ${s.notes} |`,
    ),
    "",
    "## 14. Rekomendasi Tech Stack",
    "",
    "| Layer | Pilihan | Alasan |",
    "| --- | --- | --- |",
    ...prd.techStack.map((t) => `| ${t.layer} | ${t.choice} | ${t.rationale} |`),
    "",
    "## 15. Struktur File (usulan)",
    "",
    "```",
    prd.fileStructure.trim(),
    "```",
    "",
    "## 16. Acceptance Criteria",
    "",
    ...prd.acceptanceCriteria.flatMap((a) => [`**${a.storyRef}**`, "", checks(a.criteria), ""]),
    "## 17. Asumsi",
    "",
    bullets(prd.assumptions),
    "",
    "## 18. Pertanyaan Terbuka",
    "",
    bullets(prd.openQuestions),
    "",
    "## 19. Risiko",
    "",
    ...prd.risks.map((r) => `- **${r.risk}** — *Mitigasi:* ${r.mitigation}`),
    "",
    "## 20. Rollout & Next Steps",
    "",
    "**MVP termasuk**",
    "",
    bullets(prd.rollout.mvpIncludes),
    "",
    "**MVP tidak termasuk**",
    "",
    bullets(prd.rollout.mvpExcludes),
    "",
    "**Phase 2+**",
    "",
    bullets(prd.rollout.phase2),
    "",
    "**Next steps**",
    "",
    bullets(prd.rollout.nextSteps),
    "",
    "## Checklist Teknis (Builder)",
    "",
    ...prd.checklist.map((c) => `- [ ] ${c}`),
    "",
  ];
  return lines.join("\n");
}

/** Evaluasi kualitas PRD (reviewer kritis) — dasar refleksi. */
async function evaluatePrd(
  prd: Prd,
  source: string,
): Promise<Omit<ScoperEvaluation, "revisions">> {
  return structuredInvoke({
    schema: EvaluationSchema,
    system:
      "Kamu reviewer PRD senior. Nilai PRD berikut secara kritis, jujur, dan spesifik dalam skala 0-10: " +
      "score (kualitas keseluruhan), buildReadiness (kesiapan dibangun AI/engineer), groundedness (kesetiaan pada sumber; tidak mengarang). " +
      "Beri kritik konkret dan daftar 'missing' (hal yang kurang/ambigu). Bila ragu, catat sebagai missing — jangan mengarang.",
    human: `Sumber (percakapan/Scout):\n"""${source}"""\n\nPRD:\n${JSON.stringify(prd)}`,
    name: "ScoperEvaluate",
    temperature: 0,
  });
}

export interface ScoperInput {
  leadId?: string | null;
  threadId?: string | null;
  /** Bila diisi, perbarui PRD proyek yang sudah ada (loop pertanyaan terbuka). */
  projectId?: string | null;
  /** Override judul proyek; default dari PRD/klien. */
  title?: string;
  /** Jalur Sales (F0.5): `demo` (dari chat) atau `meeting` (butuh transkrip). */
  path?: "demo" | "meeting" | null;
}

/**
 * Scoper & PRD Builder (F2).
 *
 * Mengumpulkan transkrip percakapan klien (dan sinyal Scout bila ada), lalu
 * menghasilkan PRD terstruktur + checklist teknis. Metadata disimpan di
 * `clients`/`projects`; dokumen ditulis ke `PROJECTS_WORKSPACE_DIR/<projectId>/`.
 */
export async function runScoper(input: ScoperInput): Promise<ScoperResult> {
  if (!env.SCOPER_ENABLED) throw new Error("Scoper nonaktif (SCOPER_ENABLED=false)");

  let lead = input.leadId ? await getLeadById(input.leadId) : null;
  const threadId = input.threadId ?? (lead ? `wa:${lead.waJid}` : null);

  const transcript = lead
    ? await getConversationByLeadId(lead.id, 200)
    : threadId
      ? await getRecentConversation(threadId, 200)
      : [];
  if (!lead && threadId && transcript.length === 0) {
    throw new Error("Tidak ada transkrip untuk threadId tersebut");
  }

  const clientName = lead?.company ?? lead?.name ?? input.title ?? "Klien";
  const scout = (lead?.meta as { scout?: Record<string, unknown> } | undefined)?.scout;

  // Jalur meeting: PRD bersumber dari transkrip/notes meeting (F0.5).
  let meetingNote: string | null = null;
  if (input.path === "meeting") {
    if (!lead) throw new Error("Jalur meeting butuh leadId (untuk membaca transkrip meeting)");
    meetingNote = await getLatestMeetingNote(lead.id);
    if (!meetingNote) {
      throw new Error("Jalur meeting: transkrip/notes meeting belum di-upload");
    }
  }

  // Guard: jangan menyusun PRD tanpa sumber (cegah dokumen kosong/"blocked").
  if (input.leadId && !lead) {
    throw new Error(`Lead tidak ditemukan: ${input.leadId}`);
  }
  const hasSource = transcript.length > 0 || Boolean(scout) || Boolean(meetingNote);
  if (!hasSource) {
    throw new Error(
      "Tidak ada sumber (transkrip percakapan / hasil Scout / notes meeting) untuk menyusun PRD.",
    );
  }

  const human = [
    `Nama klien/bisnis: ${clientName}`,
    input.path ? `Jalur Sales: ${input.path}` : "",
    lead?.notes ? `Catatan lead: ${lead.notes}` : "",
    scout ? `Hasil Scout (pain point):\n${JSON.stringify(scout, null, 2)}` : "",
    meetingNote ? `Transkrip/notes meeting:\n"""${meetingNote}"""` : "",
    `Transkrip percakapan:\n"""${transcriptText(transcript)}"""`,
    "Susun PRD lengkap sesuai skema.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let prd = (await structuredInvoke({
    schema: PrdSchema,
    system: scoperPrompt.system,
    human,
    name: "ScoperPrd",
    temperature: 0.2,
    maxTokens: 8000,
  })) as Prd;

  // Rapikan judul agar tidak berulang ("PRD — PRD — …").
  prd.title = prd.title.replace(/^prd\s*[—:\-–]\s*/i, "").trim() || prd.title;

  // ── Refleksi & Evaluasi: nilai PRD; revisi otomatis bila di bawah ambang ──
  let evaluation: ScoperEvaluation = {
    score: 0,
    buildReadiness: 0,
    groundedness: 0,
    critique: "",
    missing: [],
    revisions: 0,
  };
  if (env.SCOPER_EVAL_ENABLED) {
    let attempts = 0;
    for (;;) {
      const ev = await evaluatePrd(prd, human).catch(() => null);
      if (!ev) break;
      evaluation = { ...ev, revisions: attempts };
      if (ev.score >= env.SCOPER_EVAL_MIN || attempts >= env.SCOPER_MAX_REVISIONS) break;
      attempts += 1;
      const revised = (await structuredInvoke({
        schema: PrdSchema,
        system:
          `${scoperPrompt.system}\n\nPERBAIKI PRD berdasarkan kritik reviewer di bawah. Tetap jangan mengarang: ` +
          "tambahkan yang memang ada di sumber; jika tidak, masukkan ke openQuestions.",
        human: `${human}\n\nKritik reviewer (skor ${ev.score}/10):\n${ev.critique}\n\nHal yang kurang:\n- ${ev.missing.join("\n- ")}\n\nSusun PRD versi perbaikan.`,
        name: "ScoperPrd",
        temperature: 0.2,
        maxTokens: 8000,
      }).catch(() => null)) as Prd | null;
      if (!revised) break;
      revised.title = revised.title.replace(/^prd\s*[—:\-–]\s*/i, "").trim() || revised.title;
      prd = revised;
    }
  }

  const title = input.title ?? prd.title ?? `Proyek ${clientName}`;
  const isNew = !input.projectId;
  const projectId = input.projectId ?? randomUUID();
  let clientId: string;
  let workspace: string;
  if (isNew) {
    const client = await upsertClient({
      leadId: lead?.id ?? null,
      waJid: lead?.waJid ?? null,
      name: lead?.name ?? clientName,
      company: lead?.company ?? null,
    });
    clientId = client.id;
    workspace = resolve(process.cwd(), env.PROJECTS_WORKSPACE_DIR, projectId);
  } else {
    const existing = await getProject(projectId);
    if (!existing) throw new Error("Proyek tidak ditemukan untuk memperbarui PRD");
    clientId = existing.clientId ?? "";
    workspace = existing.workspace ?? resolve(process.cwd(), env.PROJECTS_WORKSPACE_DIR, projectId);
  }
  await ensureProjectWorkspace(workspace);

  const generatedAt = new Date().toISOString();
  const markdown = renderPrd(prd, { clientName, generatedAt });
  const prdPath = resolve(workspace, "PRD.md");
  await writeFile(prdPath, markdown, "utf8");
  const prdPdfPath = resolve(workspace, "PRD.pdf");
  await renderMarkdownPdf(markdown, prdPdfPath, {
    title: `PRD — ${title}`,
    footer: `${clientName} · ${generatedAt.slice(0, 10)}`,
  }).catch((err) => log.warn({ err: (err as Error).message }, "gagal membuat PRD.pdf"));
  await writeFile(
    resolve(workspace, "PRD.json"),
    `${JSON.stringify({ projectId, clientId, generatedAt, evaluation, prd }, null, 2)}\n`,
    "utf8",
  );

  if (isNew) {
    await createProject({
      id: projectId,
      clientId,
      title,
      stage: "scoping",
      prdPath,
      workspace,
      meta: { leadId: lead?.id ?? null, threadId, source: "scoper" },
    });
  }
  await updateProject({ id: projectId, stage: "scoping", prdPath, workspace });

  // Refleksi: catat pelajaran PRD (skor, kritik, revisi) untuk loop perbaikan.
  if (env.SCOPER_EVAL_ENABLED) {
    await recordImprovement({
      agent: "scoper",
      kind: "lesson",
      title: `PRD ${evaluation.score}/10${evaluation.revisions ? ` (revisi ${evaluation.revisions})` : ""} — ${title}`,
      detail: [
        evaluation.critique || "(tanpa kritik)",
        evaluation.missing.length ? `Kurang: ${evaluation.missing.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      evidence: {
        projectId,
        score: evaluation.score,
        buildReadiness: evaluation.buildReadiness,
        groundedness: evaluation.groundedness,
        revisions: evaluation.revisions,
      },
    }).catch(() => {});
  }

  await emitEvent("prd.ready", {
    entityType: "project",
    entityId: projectId,
    payload: {
      clientId,
      title,
      openQuestions: prd.openQuestions.length,
      score: evaluation.score,
    },
  });

  // Loop pertanyaan terbuka: kembalikan ke Sales agar ditanyakan ke klien
  // (bahasa sales/customer-support). Balasan klien akan memperbarui PRD ini.
  if (lead && prd.openQuestions.length > 0) {
    await enqueueJob({
      type: "sales.clarify",
      payload: { projectId, leadId: lead.id, questions: prd.openQuestions },
    }).catch(() => {});
  }

  log.info(
    { projectId, title, requirements: prd.requirements.length, score: evaluation.score, revisions: evaluation.revisions },
    "PRD dibuat",
  );

  return {
    projectId,
    clientId,
    leadId: lead?.id ?? null,
    threadId,
    title,
    summary: prd.summary,
    prdPath,
    prdPdfPath,
    workspace,
    markdown,
    prd,
    openQuestions: prd.openQuestions,
    evaluation,
  };
}
