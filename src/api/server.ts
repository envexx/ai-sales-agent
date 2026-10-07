import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { GRAPH_MERMAID } from "../graph/index.js";
import { SUPERVISOR_MERMAID } from "../supervisor/index.js";
import { buildSupervisorReport } from "../supervisor/report.js";
import { buildAgentWorkflow } from "../pipeline/agentWorkflow.js";
import { buildBusinessBoard } from "../pipeline/businessBoard.js";
import { textInvoke } from "../llm/index.js";
import { getTelegramUpdates } from "../integrations/telegram.js";
import { buildProjectDetail, readProjectDocument } from "../pipeline/projectDetails.js";
import { handleSupervisorTurn } from "../supervisor/run.js";
import { antigravityAvailable } from "../llm/index.js";
import { opencodeAvailable } from "../integrations/opencode.js";
import { query } from "../db/pool.js";
import {
  AGENT_PERSONAS,
  AGENT_REGISTRY,
  ALL_APPROVAL_KINDS,
  ALL_EVENT_TYPES,
  ALL_JOB_TYPES,
  findAgent,
} from "../pipeline/agentRegistry.js";
import { readFile } from "node:fs/promises";
import { RESEARCH_MERMAID } from "../research/index.js";
import { ResearchBriefSchema, validateBrief } from "../research/brief.js";
import { runResearch } from "../research/run.js";
import { listEvidenceFiles } from "../research/workspace.js";
import { runProspectingLive, runTargetedLive, runDailyLive } from "../prospecting/live.js";
import { targetingCatalog } from "../prospecting/targeting.js";
import { runScoper } from "../scoper/run.js";
import { markProjectInvoicePaid, runLegal } from "../legal/run.js";
import { runIntake, collectCredential } from "../intake/run.js";
import { runQa } from "../qa/run.js";
import { runScribe } from "../scribe/run.js";
import { runHandover } from "../handover/run.js";
import { runSupport } from "../support/run.js";
import { runMonitor } from "../monitor/run.js";
import { runDeveloperApply, runDeveloperBuild, runDeveloperMaintain } from "../developer/run.js";
import { createDevTarget, listDevTargets } from "../developer/repository.js";
import {
  cloudflareListR2Buckets,
  cloudflareListZones,
  developerPlatforms,
  vercelListProjects,
  vercelTriggerDeploy,
} from "../integrations/devplatforms.js";
import {
  r2DeleteObject,
  r2GetObject,
  r2ListObjects,
  r2PutObject,
} from "../integrations/cloudflareR2.js";
import { runCaseStudy } from "../content/run.js";
import { countKnowledgeBySource, getKnowledgeById, ingestKnowledge, listKnowledge } from "../memory/knowledge.js";
import {
  buildGrowth,
  decideImprovement,
  getImprovement,
  listImprovements,
} from "../improvement/repository.js";
import { runAgentOptimize } from "../improvement/optimize.js";
import { getOwnerProfile, setOwnerProfile } from "../supervisor/profile.js";
import { adviseSupervisor, getChatHistory } from "../supervisor/advisor.js";
import {
  getIntakeLinkByToken,
  getProject,
  linkChannel,
  listChannels,
  listCredentials,
  listInvoices,
  listProjects,
  listTickets,
  markIntakeSubmitted,
  saveCredential,
} from "../pipeline/entities.js";
import { notifyOwner } from "../notifications/index.js";
import { decideByPrefix, requestApproval } from "../pipeline/approvals.js";
import { buildBriefingSnapshot, scheduleNextBriefing } from "../pipeline/handlers/index.js";
import { processDueJobs } from "../pipeline/jobs.js";
import { markSystemBuilt } from "../pipeline/flow.js";
import { markLeadInSales, setProjectStage } from "../pipeline/lifecycle.js";
import { emitEvent } from "../pipeline/events.js";
import {
  renderIntakeForm,
  renderIntakeMessage,
  type IntakeFormItem,
} from "./intakePage.js";
import { registeredJobTypes } from "../pipeline/registry.js";
import { runTrackedJob } from "../pipeline/liveJob.js";
import {
  enqueueJob,
  getApproval,
  listApprovals,
  listEvents,
  listJobs,
} from "../pipeline/repository.js";
import type { ApprovalStatus } from "../pipeline/types.js";
import {
  getLeadDetail,
  getMetrics,
  getOutreachStats,
  getRecentConversation,
  getResearchReport,
  listBookings,
  listEvaluations,
  listLeads,
  listOutreachLog,
  listProspects,
  listResearchReports,
  saveMeetingNote,
  setOptOut,
  setOutreachStatus,
  upsertProspect,
} from "../repository/index.js";
import { normalizeJid, whatsapp } from "../whatsapp/index.js";
import { runOutreachTick, workingHoursLabel } from "../outreach/index.js";
import {
  LEAD_FIELD_SPEC,
  extractLeadItems,
  validateLeadItem,
  type LeadItem,
  type LeadItemError,
} from "./lead-intake.js";

const log = loggerFor("api");

const WebhookSchema = z.object({
  from: z.string().min(3).describe("nomor telepon atau JID pengirim"),
  name: z.string().optional().nullable(),
  text: z.string().min(1),
  threadId: z.string().optional(),
});

export function createServer() {
  const app = express();
  app.use(
    cors({
      origin:
        env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Optional API-key gate for the webhook endpoints.
  const requireApiKey = (req: Request, res: Response, next: NextFunction) => {
    if (!env.API_KEY) return next();
    if (req.header("x-api-key") === env.API_KEY) return next();
    res.status(401).json({ error: "unauthorized" });
  };

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      transport: env.WA_TRANSPORT,
      dryRun: env.DRY_RUN,
      embedding: env.EMBEDDING_PROVIDER,
      model: env.DEEPSEEK_MODEL,
      llm: {
        provider: env.LLM_PROVIDER,
        overrides: env.LLM_PROVIDER_OVERRIDES || null,
        fallbackToDeepSeek: env.LLM_FALLBACK_TO_DEEPSEEK,
        fallbackProviders: env.LLM_FALLBACK_PROVIDERS || null,
        openrouter: Boolean(env.OPENROUTER_API_KEY),
      },
    });
  });

  /** Status provider LLM + ketersediaan Antigravity CLI (spawn sekali, di-cache). */
  app.get("/llm/status", async (_req, res) => {
    res.json({
      default: env.LLM_PROVIDER,
      overrides: env.LLM_PROVIDER_OVERRIDES || null,
      fallbackToDeepSeek: env.LLM_FALLBACK_TO_DEEPSEEK,
      fallbackProviders: env.LLM_FALLBACK_PROVIDERS
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean),
      deepseek: {
        model: env.DEEPSEEK_MODEL,
        configured: Boolean(env.DEEPSEEK_API_KEY),
      },
      antigravity: {
        enabled: env.ANTIGRAVITY_ENABLED,
        bin: env.ANTIGRAVITY_BIN,
        model: env.ANTIGRAVITY_MODEL || "(default)",
        effort: env.ANTIGRAVITY_EFFORT,
        available: await antigravityAvailable(),
      },
      openrouter: {
        enabled: env.OPENROUTER_ENABLED,
        model: env.OPENROUTER_MODEL,
        configured: Boolean(env.OPENROUTER_API_KEY),
      },
      developer: {
        enabled: env.DEVELOPER_ENABLED,
        engine: env.DEVELOPER_OPENCODE_BIN,
        model: env.DEVELOPER_OPENCODE_MODEL || "(default)",
        agent: env.DEVELOPER_OPENCODE_AGENT || "(default)",
        opencodeAvailable: await opencodeAvailable(),
      },
    });
  });

  app.get("/graph/mermaid", (_req, res) => {
    res.type("text/plain").send(GRAPH_MERMAID);
  });

  /** Daftar semua agent (registry) + diagramnya. */
  app.get("/agents", (_req, res) => {
    res.json({
      agents: AGENT_REGISTRY.map((a) => ({
        slug: a.slug,
        name: a.name,
        persona: AGENT_PERSONAS[a.slug] ?? a.name,
        divisionCode: a.divisionCode,
        division: a.division,
        role: a.role,
        trigger: a.trigger,
        dataLinks: a.dataLinks,
        enabled: a.enabledKey
          ? Boolean((env as unknown as Record<string, unknown>)[a.enabledKey])
          : true,
      })),
    });
  });

  /** Status live per-agent dari job queue + event log + approval. */
  app.get("/agents/status", async (_req, res) => {
    const [jobRows, eventRows, approvalRows] = await Promise.all([
      query<{ type: string; status: string; count: number; due: number; last: Date | null }>(
        `SELECT type, status, count(*)::int AS count,
                count(*) FILTER (WHERE status='queued' AND run_at <= now())::int AS due,
                max(updated_at) AS last
         FROM jobs WHERE type = ANY($1) GROUP BY type, status`,
        [ALL_JOB_TYPES],
      ),
      query<{ type: string; last: Date }>(
        `SELECT type, max(created_at) AS last
         FROM events WHERE type = ANY($1) GROUP BY type`,
        [ALL_EVENT_TYPES],
      ),
      ALL_APPROVAL_KINDS.length
        ? query<{ kind: string; count: number }>(
            `SELECT kind, count(*)::int AS count FROM approvals
             WHERE status='pending' AND kind = ANY($1) GROUP BY kind`,
            [ALL_APPROVAL_KINDS],
          )
        : Promise.resolve({ rows: [] as { kind: string; count: number }[] }),
    ]);

    const empty = () => ({ queued: 0, running: 0, done: 0, failed: 0 });
    const jobAgg = new Map<
      string,
      { queued: number; running: number; done: number; failed: number; due: number; lastJobAt: string | null }
    >();
    for (const row of jobRows.rows) {
      const entry = jobAgg.get(row.type) ?? { ...empty(), due: 0, lastJobAt: null };
      if (row.status === "queued" || row.status === "running" || row.status === "done" || row.status === "failed") {
        entry[row.status] += row.count;
      }
      entry.due += row.due ?? 0;
      const last = row.last ? row.last.toISOString() : null;
      if (last && (!entry.lastJobAt || last > entry.lastJobAt)) entry.lastJobAt = last;
      jobAgg.set(row.type, entry);
    }

    const eventAgg = new Map<string, string>();
    for (const row of eventRows.rows) eventAgg.set(row.type, row.last.toISOString());
    const approvalAgg = new Map<string, number>();
    for (const row of approvalRows.rows) approvalAgg.set(row.kind, row.count);

    const agents = AGENT_REGISTRY.map((a) => {
      const jobs = empty();
      let lastJobAt: string | null = null;
      let due = 0;
      for (const type of a.jobTypes) {
        const j = jobAgg.get(type);
        if (!j) continue;
        jobs.queued += j.queued;
        jobs.running += j.running;
        jobs.done += j.done;
        jobs.failed += j.failed;
        due += j.due;
        if (j.lastJobAt && (!lastJobAt || j.lastJobAt > lastJobAt)) lastJobAt = j.lastJobAt;
      }

      let lastEventAt: string | null = null;
      let lastEventType: string | null = null;
      for (const type of a.eventTypes) {
        const at = eventAgg.get(type);
        if (at && (!lastEventAt || at > lastEventAt)) {
          lastEventAt = at;
          lastEventType = type;
        }
      }

      const approvalsPending = (a.approvalKinds ?? []).reduce(
        (n, kind) => n + (approvalAgg.get(kind) ?? 0),
        0,
      );
      const enabled = a.enabledKey
        ? Boolean((env as unknown as Record<string, unknown>)[a.enabledKey])
        : true;
      // Sales "bekerja" hanya saat menangani chat (baru/lanjutan) atau baru
      // menerima serah terima lead dari Scout — bukan karena outreach terjadwal,
      // agar ia beristirahat saat tidak ada percakapan.
      const salesActive =
        a.slug === "sales" &&
        lastEventAt !== null &&
        Date.now() - new Date(lastEventAt).getTime() < 2 * 60 * 1000 &&
        ["sales.started", "lead.inbound_new", "lead.inbound_reply", "lead.scouted_ready"].includes(
          lastEventType ?? "",
        );
      const status = !enabled
        ? "disabled"
        : jobs.running > 0 || salesActive
          ? "working"
          : due > 0
            ? "queued"
            : jobs.failed > 0
              ? "error"
              : "idle";

      return {
        ...a,
        persona: AGENT_PERSONAS[a.slug] ?? a.name,
        enabled,
        status,
        // `queued` = total antrean; `due` = jatuh tempo sekarang; `scheduled` = menunggu jadwal.
        jobs: { ...jobs, due, scheduled: jobs.queued - due },
        lastJobAt,
        lastEventAt,
        lastEventType,
        approvalsPending,
      };
    });

    res.json({ agents, generatedAt: new Date().toISOString() });
  });

  /** KPI & tren pertumbuhan per agent + pelajaran/usulan. */
  app.get("/agents/growth", async (req, res) => {
    const days = Number(req.query.days ?? 14);
    res.json(await buildGrowth(Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 14));
  });

  /** Jalankan loop perbaikan (usulan) sekarang. */
  app.post("/agents/optimize", requireApiKey, async (_req, res) => {
    try {
      res.json(await runAgentOptimize());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /** Daftar pelajaran & usulan perbaikan. */
  app.get("/improvements", async (req, res) => {
    const agent = typeof req.query.agent === "string" ? req.query.agent : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
    res.json({
      improvements: await listImprovements({
        agent,
        status: status as never,
        kind: kind as never,
        limit: 200,
      }),
    });
  });

  /** Setujui usulan → jadikan dokumen pengetahuan (agent belajar via RAG). */
  app.post("/improvements/:id/approve", requireApiKey, async (req, res) => {
    const rec = await getImprovement(String(req.params.id ?? ""));
    if (!rec) {
      res.status(404).json({ error: "usulan tidak ditemukan" });
      return;
    }
    const by = (req.body as { by?: string } | undefined)?.by ?? "owner";
    const updated = await decideImprovement(rec.id, "approved", by);
    if (rec.kind === "suggestion") {
      await ingestKnowledge([
        {
          title: `Perbaikan — ${rec.agent}: ${rec.title}`,
          content: rec.detail,
          metadata: {
            category: "playbook",
            agentId: rec.agent,
            origin: "improvement",
            improvementId: rec.id,
          },
        },
      ]).catch(() => {});
    }
    // Kanal Pertumbuhan → Developer Internal: usulan engineering dijadwalkan
    // agar dikerjakan otomatis (full-auto) oleh agent Developer.
    if (
      rec.kind === "suggestion" &&
      (rec.evidence as { kind?: string } | undefined)?.kind === "proposal"
    ) {
      await enqueueJob({
        type: "developer.build",
        payload: {
          title: rec.title,
          brief: `${rec.detail}\n\n(Disetujui dari kanal Pertumbuhan · agent: ${rec.agent})`,
          scope: "internal",
          dedupeKey: `dev-internal-${rec.id}`,
        },
      }).catch(() => {});
    }
    res.json(updated);
  });

  app.post("/improvements/:id/reject", requireApiKey, async (req, res) => {
    const by = (req.body as { by?: string } | undefined)?.by ?? "owner";
    const updated = await decideImprovement(String(req.params.id ?? ""), "rejected", by);
    if (!updated) {
      res.status(404).json({ error: "usulan tidak ditemukan" });
      return;
    }
    res.json(updated);
  });

  /** Bantu setup: tampilkan chat Telegram terbaru (untuk mengambil Chat ID owner). */
  app.get("/telegram/chats", async (_req, res) => {
    if (!env.TELEGRAM_BOT_TOKEN) {
      res.status(400).json({ error: "TELEGRAM_BOT_TOKEN belum diisi" });
      return;
    }
    const updates = await getTelegramUpdates(0, 0);
    const chats = new Map<
      string,
      { id: string; type: string; title: string | null; name: string | null }
    >();
    for (const update of updates) {
      const message = update.message;
      if (!message) continue;
      chats.set(String(message.chat.id), {
        id: String(message.chat.id),
        type: message.chat.type,
        title: message.chat.title ?? null,
        name: message.from?.first_name ?? null,
      });
    }
    res.json({
      hint: "Kirim pesan ke bot sekali, lalu ambil 'id' di sini dan isi TELEGRAM_OWNER_CHAT_ID.",
      chats: [...chats.values()],
    });
  });

  app.get("/supervisor/mermaid", (_req, res) => {
    res.type("text/plain").send(SUPERVISOR_MERMAID);
  });

  app.get("/agents/:slug/workflow", async (req, res) => {
    const workflow = await buildAgentWorkflow(String(req.params.slug));
    if (!workflow) { res.status(404).json({ error: "Agent tidak ditemukan" }); return; }
    res.json(workflow);
  });

  app.get("/business/board", async (_req, res) => {
    res.json(await buildBusinessBoard());
  });

  /** Laporan harian per-agent + anomali (Supervisor sebagai peninjau). */
  app.get("/supervisor/report", async (_req, res) => {
    res.json(await buildSupervisorReport());
  });

  /* ── Supervisor sebagai penasihat: profil owner + obrolan ── */
  app.get("/supervisor/profile", async (_req, res) => {
    res.json({ profile: await getOwnerProfile() });
  });

  app.put("/supervisor/profile", requireApiKey, async (req, res) => {
    const body = req.body as { profile?: string };
    if (typeof body?.profile !== "string") {
      res.status(400).json({ error: "profile (teks) wajib" });
      return;
    }
    await setOwnerProfile(body.profile);
    res.json({ ok: true });
  });

  app.get("/supervisor/chat", async (_req, res) => {
    res.json({ messages: await getChatHistory(50) });
  });

  app.post("/supervisor/chat", async (req, res) => {
    const body = req.body as { message?: string };
    const message = String(body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ error: "message wajib" });
      return;
    }
    try {
      const reply = await adviseSupervisor(message);
      res.json({ reply });
    } catch (err) {
      log.error({ err: (err as Error).message }, "supervisor chat gagal");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ─────────────────────────── research ─────────────────────── */

  const researchSchema = (() => {
    try {
      return z.toJSONSchema(ResearchBriefSchema);
    } catch {
      return {};
    }
  })();

  /** Spesifikasi body `POST /research` untuk integrasi. */
  app.get("/research/schema", (_req, res) => {
    res.json({
      endpoint: "POST /research",
      auth: env.API_KEY ? "header: x-api-key" : "tidak perlu (API_KEY kosong)",
      bodySchema: researchSchema,
      example: {
        title: "Riset pasar AI agent untuk UKM Indonesia",
        objective:
          "Analisis adopsi AI agent di UKM Indonesia, pemain utama, harga, dan peluang 2026.",
        questions: ["Siapa pemain utama?", "Berapa kisaran harga?", "Apa kendala adopsi?"],
        depth: 3,
        format: "markdown",
        language: "id",
      },
      outputShapes: {
        metadata: "GET /research/:id",
        report: "GET /research/:id/report",
        evidence: "GET /research/:id/evidence",
      },
    });
  });

  app.get("/research/mermaid", (_req, res) => {
    res.type("text/plain").send(RESEARCH_MERMAID);
  });

  app.get("/research", async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    res.json({ reports: await listResearchReports(Number.isFinite(limit) ? limit : 50) });
  });

  app.get("/research/:id", async (req, res) => {
    const report = await getResearchReport(String(req.params.id ?? ""));
    if (!report) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    res.json(report);
  });

  app.get("/research/:id/report", async (req, res) => {
    const report = await getResearchReport(String(req.params.id ?? ""));
    if (!report?.reportPath) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    try {
      const content = await readFile(report.reportPath, "utf8");
      res.type(report.format === "json" ? "application/json" : "text/markdown").send(content);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });

  app.get("/research/:id/evidence", async (req, res) => {
    const report = await getResearchReport(String(req.params.id ?? ""));
    if (!report) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    res.json({
      id: report.id,
      workspace: report.workspace,
      files: await listEvidenceFiles(report.id),
    });
  });

  app.post("/research", requireApiKey, async (req, res) => {
    const parsed = validateBrief(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: "invalid brief", details: parsed.errors });
      return;
    }
    try {
      const report = await runResearch(parsed.brief);
      res.json({
        id: report.id,
        status: report.status,
        title: report.brief.title,
        summary: report.summary,
        quality: report.quality,
        iterations: report.iterations,
        sourceCount: report.sources.length,
        factCount: report.facts.length,
        sources: report.sources,
        usage: report.usage,
        workspace: report.workspace,
        reportPath: report.reportPath,
        report: report.report,
        errors: report.errors,
      });
    } catch (err) {
      log.error({ err: (err as Error).message }, "research failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ───────────────── research prospecting (D1) ───────────────── */

  app.post("/prospecting", requireApiKey, async (req, res) => {
    const body = req.body as {
      niche?: string;
      location?: string;
      limit?: number;
      enrich?: boolean;
      queue?: boolean;
      excludeTech?: boolean;
    };
    if (!body?.niche || !body?.location) {
      res.status(400).json({ error: "niche & location wajib diisi" });
      return;
    }
    try {
      const result = await runProspectingLive({
        niche: body.niche,
        location: body.location,
        limit: body.limit,
        enrich: body.enrich,
        queue: body.queue,
        excludeTech: body.excludeTech,
      });
      res.json(result);
    } catch (err) {
      log.error({ err: (err as Error).message }, "prospecting failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Katalog niche target (bisnis butuh otomasi) + daftar vertikal teknologi.
  app.get("/prospecting/niches", (_req, res) => {
    res.json(targetingCatalog());
  });

  // Satu putaran prospecting tepat sasaran: pilih niche dari katalog, jalankan,
  // dan kecualikan bisnis teknologi.
  app.post("/prospecting/targeted", requireApiKey, async (req, res) => {
    const body = req.body as {
      location?: string;
      count?: number;
      only?: string[];
      limit?: number;
      queue?: boolean;
    };
    if (!body?.location) {
      res.status(400).json({ error: "location wajib diisi" });
      return;
    }
    try {
      const result = await runTargetedLive({
        location: body.location,
        count: body.count,
        only: body.only,
        limit: body.limit,
        queue: body.queue,
      });
      res.json(result);
    } catch (err) {
      log.error({ err: (err as Error).message }, "targeted prospecting failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Kejar target lead harian (loop niche sampai target tercapai).
  app.post("/prospecting/daily", requireApiKey, async (req, res) => {
    const body = req.body as {
      location?: string;
      target?: number;
      nichesPerRound?: number;
      perNicheLimit?: number;
      maxRounds?: number;
      queue?: boolean;
    };
    try {
      const result = await runDailyLive({
        location: body.location ?? env.PROSPECTING_LOCATION ?? "Batam",
        target: body.target ?? env.PROSPECTING_DAILY_TARGET,
        nichesPerRound: body.nichesPerRound,
        perNicheLimit: body.perNicheLimit,
        maxRounds: body.maxRounds,
        queue: body.queue ?? false,
      });
      res.json(result);
    } catch (err) {
      log.error({ err: (err as Error).message }, "daily prospecting failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ─────────────────── scoper & PRD (F2) ─────────────────────── */

  app.post("/scoper", requireApiKey, async (req, res) => {
    const body = req.body as { leadId?: string; threadId?: string; title?: string };
    if (!body?.leadId && !body?.threadId) {
      res.status(400).json({ error: "leadId atau threadId wajib diisi" });
      return;
    }
    try {
      const result = await runTrackedJob(
        { type: "scoper.prd", payload: { leadId: body.leadId ?? null } },
        () =>
          runScoper({
            leadId: body.leadId,
            threadId: body.threadId,
            title: body.title,
          }),
      );
      res.json({
        projectId: result.projectId,
        clientId: result.clientId,
        leadId: result.leadId,
        title: result.title,
        summary: result.summary,
        prdPath: result.prdPath,
        prdPdfPath: result.prdPdfPath,
        workspace: result.workspace,
        openQuestions: result.openQuestions,
        prd: result.prd,
        evaluation: result.evaluation,
        markdown: result.markdown,
      });
    } catch (err) {
      log.error({ err: (err as Error).message }, "scoper failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/projects", async (_req, res) => {
    res.json({ projects: await listProjects(200) });
  });

  app.get("/projects/:id", async (req, res) => {
    const detail = await buildProjectDetail(String(req.params.id));
    if (!detail) { res.status(404).json({ error: "Proyek tidak ditemukan" }); return; }
    res.json(detail);
  });

  app.get("/projects/:id/documents", async (req, res) => {
    const project = await getProject(String(req.params.id));
    const document = project && typeof req.query.path === "string" ? await readProjectDocument(project, req.query.path) : null;
    if (!document) { res.status(404).json({ error: "Dokumen tidak ditemukan dalam proyek ini" }); return; }
    res.json(document);
  });

  /* ─────────────────── legal & finance (F2) ──────────────────── */

  app.post("/legal", requireApiKey, async (req, res) => {
    const body = req.body as { projectId?: string; amount?: number; includeNda?: boolean };
    if (!body?.projectId) {
      res.status(400).json({ error: "projectId wajib diisi" });
      return;
    }
    try {
      const result = await runTrackedJob(
        { type: "legal.draft", payload: { projectId: body.projectId } },
        () =>
          runLegal({
            projectId: body.projectId,
            amount: body.amount,
            includeNda: body.includeNda,
          }),
      );
      res.json({
        projectId: result.projectId,
        clientId: result.clientId,
        invoiceId: result.invoiceId,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        contractPath: result.contractPath,
        ndaPath: result.ndaPath,
        invoicePath: result.invoicePath,
        workspace: result.workspace,
      });
    } catch (err) {
      log.error({ err: (err as Error).message }, "legal failed");
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/invoices", async (_req, res) => {
    res.json({ invoices: await listInvoices(200) });
  });

  app.post("/projects/:id/dp-paid", async (req, res) => {
    const invoice = await markProjectInvoicePaid(String(req.params.id ?? ""));
    if (!invoice) {
      res.status(404).json({ error: "tidak ada invoice DP yang menunggu" });
      return;
    }
    res.json(invoice);
  });

  /** Tandai sistem selesai dibangun → jadwalkan QA (rantai F3–F4). */
  app.post("/projects/:id/built", requireApiKey, async (req, res) => {
    const body = req.body as { webhookUrl?: string; expectedJson?: string };
    try {
      const jobId = await markSystemBuilt({
        projectId: String(req.params.id ?? ""),
        webhookUrl: body?.webhookUrl,
        expectedJson: body?.expectedJson,
      });
      res.json({ ok: true, jobId, deduped: jobId === null });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /* ─────────────── F2–F5 agent endpoints ─────────────────────── */

  app.post("/intake/:projectId", requireApiKey, async (req, res) => {
    try {
      const projectId = String(req.params.projectId ?? "");
      res.json(
        await runTrackedJob({ type: "intake.collect", payload: { projectId } }, () =>
          runIntake(projectId),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/projects/:id/credentials", async (req, res) => {
    res.json({ credentials: await listCredentials(String(req.params.id ?? "")) });
  });

  app.post("/projects/:id/credentials", requireApiKey, async (req, res) => {
    const body = req.body as { name?: string; value?: string; hint?: string };
    if (!body?.name || !body?.value) {
      res.status(400).json({ error: "name & value wajib" });
      return;
    }
    try {
      const id = await collectCredential({
        projectId: String(req.params.id ?? ""),
        name: body.name,
        value: body.value,
        hint: body.hint,
      });
      res.json({ ok: true, id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/qa/:projectId", requireApiKey, async (req, res) => {
    const body = req.body as { webhookUrl?: string; expectedJson?: string };
    try {
      const projectId = String(req.params.projectId ?? "");
      res.json(
        await runTrackedJob({ type: "qa.run", payload: { projectId } }, () =>
          runQa({ projectId, ...body }),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/scribe/:projectId", requireApiKey, async (req, res) => {
    try {
      const projectId = String(req.params.projectId ?? "");
      res.json(
        await runTrackedJob({ type: "scribe.docs", payload: { projectId } }, () =>
          runScribe(projectId),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/handover/:projectId", requireApiKey, async (req, res) => {
    const body = req.body as { totalAmount?: number };
    try {
      const projectId = String(req.params.projectId ?? "");
      res.json(
        await runTrackedJob({ type: "handover.finalize", payload: { projectId } }, () =>
          runHandover({ projectId, totalAmount: body?.totalAmount }),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/support", async (req, res) => {
    const body = req.body as { message?: string; clientId?: string; projectId?: string };
    if (!body?.message) {
      res.status(400).json({ error: "message wajib" });
      return;
    }
    try {
      res.json(
        await runTrackedJob(
          { type: "support.triage", payload: { projectId: body.projectId ?? null } },
          () =>
            runSupport({
              message: String(body.message),
              clientId: body.clientId,
              projectId: body.projectId,
            }),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/tickets", async (_req, res) => {
    res.json({ tickets: await listTickets(200) });
  });

  /* ───────────── client channels (L1 Support) ────────────────── */

  app.get("/channels", async (_req, res) => {
    res.json({ channels: await listChannels(200) });
  });

  app.post("/channels", requireApiKey, async (req, res) => {
    const body = req.body as {
      channel?: string;
      externalId?: string;
      projectId?: string;
      clientId?: string;
      label?: string;
    };
    if (!body?.externalId || !body?.projectId) {
      res.status(400).json({ error: "externalId & projectId wajib" });
      return;
    }
    const id = await linkChannel({
      channel: body.channel ?? "telegram",
      externalId: body.externalId,
      projectId: body.projectId,
      clientId: body.clientId,
      label: body.label,
    });
    res.json({ ok: true, id });
  });

  /* ───────────────── knowledge base (flywheel) ───────────────── */

  app.get("/knowledge", async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const [docs, bySource] = await Promise.all([
      listKnowledge(Number.isFinite(limit) ? limit : 100, source),
      countKnowledgeBySource(),
    ]);
    res.json({ total: bySource, docs });
  });

  app.get("/knowledge/:id", async (req, res) => {
    const doc = await getKnowledgeById(String(req.params.id ?? ""));
    if (!doc) {
      res.status(404).json({ error: "Dokumen tidak ditemukan" });
      return;
    }
    res.json(doc);
  });

  app.post("/monitor/check", async (_req, res) => {
    res.json(await runMonitor());
  });

  /* ───────────────── D4 · Developer (OpenCode + GitHub) ───────── */

  app.get("/developer/platforms", async (_req, res) => {
    res.json({ platforms: await developerPlatforms() });
  });

  /* ── Cloudflare: zona/DNS + Cloudflare R2 (S3-compatible) ────── */

  app.get("/developer/cloudflare/zones", async (_req, res) => {
    try {
      res.json({ zones: await cloudflareListZones() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/developer/cloudflare/r2/buckets", async (_req, res) => {
    try {
      res.json({ buckets: await cloudflareListR2Buckets() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /* ── Vercel: proyek + deploy hook ────────────────────────────── */

  app.get("/developer/vercel/projects", async (_req, res) => {
    try {
      res.json({ projects: await vercelListProjects() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/developer/vercel/deploy", requireApiKey, async (req, res) => {
    const body = req.body as { hookUrl?: string };
    try {
      res.json(await vercelTriggerDeploy(body?.hookUrl));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/developer/cloudflare/r2/objects", async (req, res) => {
    try {
      const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
      const max = Number(req.query.max ?? 100);
      res.json({
        objects: await r2ListObjects({ prefix, max: Number.isFinite(max) ? max : 100 }),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/developer/cloudflare/r2/object", async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key) {
      res.status(400).json({ error: "key wajib" });
      return;
    }
    try {
      res.json(await r2GetObject(key));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/developer/cloudflare/r2/object", requireApiKey, async (req, res) => {
    const body = req.body as { key?: string; content?: string; contentType?: string };
    if (!body?.key || typeof body.content !== "string") {
      res.status(400).json({ error: "key & content wajib" });
      return;
    }
    try {
      res.json(await r2PutObject(body.key, body.content, body.contentType));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/developer/cloudflare/r2/object", requireApiKey, async (req, res) => {
    const key = typeof req.query.key === "string" ? req.query.key : "";
    if (!key) {
      res.status(400).json({ error: "key wajib" });
      return;
    }
    try {
      await r2DeleteObject(key);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get("/developer/targets", async (_req, res) => {
    res.json({ targets: await listDevTargets() });
  });

  app.post("/developer/targets", requireApiKey, async (req, res) => {
    const body = req.body as {
      name?: string;
      projectId?: string;
      clientId?: string;
      kind?: string;
      repoUrl?: string;
      liveUrl?: string;
      platform?: string;
    };
    if (!body?.name) {
      res.status(400).json({ error: "name wajib" });
      return;
    }
    const target = await createDevTarget({
      name: body.name,
      projectId: body.projectId ?? null,
      clientId: body.clientId ?? null,
      kind: body.kind,
      repoUrl: body.repoUrl ?? null,
      liveUrl: body.liveUrl ?? null,
      platform: body.platform ?? null,
    });
    res.json(target);
  });

  // Harus didaftarkan sebelum `/developer/:projectId` agar tidak tertangkap.
  app.post("/developer/build", requireApiKey, async (req, res) => {
    const body = req.body as {
      title?: string;
      brief?: string;
      projectId?: string;
      targetId?: string;
      repoUrl?: string;
    };
    if (!body?.title || !body?.brief) {
      res.status(400).json({ error: "title & brief wajib" });
      return;
    }
    try {
      res.json(
        await runTrackedJob({ type: "developer.build", payload: { ...body } }, () =>
          runDeveloperBuild({
            title: body.title!,
            brief: body.brief!,
            projectId: body.projectId,
            targetId: body.targetId,
            repoUrl: body.repoUrl,
          }),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/developer/apply", requireApiKey, async (req, res) => {
    const body = req.body as { targetId?: string; projectId?: string; planPath?: string; mode?: string };
    if (!body?.targetId) {
      res.status(400).json({ error: "targetId wajib" });
      return;
    }
    try {
      res.json(
        await runTrackedJob({ type: "developer.apply", payload: { ...body } }, () =>
          runDeveloperApply(body),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/developer/:projectId", requireApiKey, async (req, res) => {
    try {
      const projectId = String(req.params.projectId ?? "");
      res.json(
        await runTrackedJob({ type: "developer.maintain", payload: { projectId } }, () =>
          runDeveloperMaintain(projectId),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/content/:projectId", requireApiKey, async (req, res) => {
    const body = req.body as { results?: string[] };
    try {
      const projectId = String(req.params.projectId ?? "");
      res.json(
        await runTrackedJob({ type: "content.case_study", payload: { projectId } }, () =>
          runCaseStudy({ projectId, results: body?.results }),
        ),
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  /* ───────────────── pipeline & approvals (F0) ───────────────── */

  app.get("/pipeline/snapshot", async (_req, res) => {
    res.json(await buildBriefingSnapshot());
  });

  app.get("/pipeline/jobs", async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const agent = typeof req.query.agent === "string" ? findAgent(req.query.agent) : undefined;
    if (req.query.agent !== undefined && !agent) {
      res.status(400).json({ error: "Agent tidak ditemukan" });
      return;
    }
    res.json({ jobs: await listJobs(Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50, agent?.jobTypes) });
  });

  app.get("/pipeline/job-types", (_req, res) => {
    res.json({ types: registeredJobTypes() });
  });

  app.get("/pipeline/events", async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    const agent = typeof req.query.agent === "string" ? findAgent(req.query.agent) : undefined;
    if (req.query.agent !== undefined && !agent) {
      res.status(400).json({ error: "Agent tidak ditemukan" });
      return;
    }
    res.json({ events: await listEvents(Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 100, agent?.eventTypes) });
  });

  app.post("/pipeline/jobs", requireApiKey, async (req, res) => {
    const body = req.body as {
      type?: string;
      payload?: Record<string, unknown>;
      runAt?: string;
      priority?: number;
    };
    if (!body?.type) {
      res.status(400).json({ error: "type wajib diisi" });
      return;
    }
    const id = await enqueueJob({
      type: body.type,
      payload: body.payload,
      runAt: body.runAt,
      priority: body.priority,
    });
    res.json({ ok: true, id, deduped: id === null });
  });

  app.post("/pipeline/tick", async (_req, res) => {
    res.json(await processDueJobs());
  });

  app.post("/briefing/run", async (_req, res) => {
    const snapshot = await buildBriefingSnapshot();
    const jobId = await enqueueJob({
      type: "briefing",
      payload: { dedupeKey: `briefing:manual:${Date.now()}` },
    });
    await scheduleNextBriefing();
    res.json({ ok: true, jobId, snapshot });
  });

  app.get("/approvals", async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const status = req.query.status as ApprovalStatus | undefined;
    res.json({ approvals: await listApprovals(Number.isFinite(limit) ? limit : 50, status) });
  });

  app.get("/approvals/:id", async (req, res) => {
    const approval = await getApproval(String(req.params.id ?? ""));
    if (!approval) {
      res.status(404).json({ error: "approval not found" });
      return;
    }
    res.json(approval);
  });

  app.post("/approvals", requireApiKey, async (req, res) => {
    const body = req.body as {
      kind?: string;
      title?: string;
      summary?: string;
      payload?: Record<string, unknown>;
      ttlHours?: number;
    };
    if (!body?.kind || !body?.title) {
      res.status(400).json({ error: "kind & title wajib diisi" });
      return;
    }
    const approval = await requestApproval({
      kind: body.kind,
      title: body.title,
      summary: body.summary,
      payload: body.payload,
      ttlHours: body.ttlHours,
    });
    res.json(approval);
  });

  const decide = (decision: "approved" | "rejected") => async (req: Request, res: Response) => {
    const note = (req.body as { note?: string } | undefined)?.note;
    const approval = await decideByPrefix(String(String(req.params.id ?? "") ?? ""), decision, "api", note);
    if (!approval) {
      res.status(404).json({ error: "approval pending tidak ditemukan" });
      return;
    }
    res.json(approval);
  };
  app.post("/approvals/:id/approve", decide("approved"));
  app.post("/approvals/:id/reject", decide("rejected"));

  app.get("/leads", async (_req, res) => {
    res.json({ leads: await listLeads() });
  });

  app.get("/leads/:id", async (req, res) => {
    const detail = await getLeadDetail(String(req.params.id ?? ""));
    if (!detail) {
      res.status(404).json({ error: "lead not found" });
      return;
    }
    res.json(detail);
  });

  /* F0.4/F0.5: jalur Sales (demo/meeting) & transkrip meeting. */

  app.post("/leads/:id/qualify", requireApiKey, async (req, res) => {
    const body = req.body as { path?: "demo" | "meeting" };
    const leadId = String(req.params.id ?? "");
    await markLeadInSales(leadId);
    const jobId = await enqueueJob({
      type: "scoper.prd",
      payload: { leadId, path: body?.path },
    });
    res.json({ ok: true, jobId });
  });

  app.post("/leads/:id/meeting", requireApiKey, async (req, res) => {
    const body = req.body as { text?: string };
    if (!body?.text) {
      res.status(400).json({ error: "text (transkrip/notes) wajib" });
      return;
    }
    const id = await saveMeetingNote({
      leadId: String(req.params.id ?? ""),
      content: body.text,
    });
    res.json({ ok: true, id });
  });

  /* F0.6: halaman intake aman (token + expiry) — di-serve backend, bukan dashboard. */

  app.get("/intake/:token", async (req, res) => {
    const token = String(req.params.token ?? "");
    const link = await getIntakeLinkByToken(token);
    if (!link) {
      res.status(404).type("html").send(
        renderIntakeMessage({
          title: "Link tidak ditemukan",
          message: "Link intake ini tidak valid.",
          tone: "error",
        }),
      );
      return;
    }
    if (link.status === "submitted") {
      res.type("html").send(
        renderIntakeMessage({
          title: "Sudah dikirim",
          message: "Terima kasih, data akses sudah kami terima.",
          tone: "ok",
        }),
      );
      return;
    }
    if (link.status === "expired" || Date.parse(link.expiresAt) < Date.now()) {
      res.type("html").send(
        renderIntakeMessage({
          title: "Link kedaluwarsa",
          message: "Link intake ini sudah kedaluwarsa. Minta tautan baru ke tim kami.",
          tone: "warn",
        }),
      );
      return;
    }
    const project = await getProject(link.projectId);
    res.type("html").send(
      renderIntakeForm({
        projectTitle: project?.title ?? "Proyek",
        items: link.items as IntakeFormItem[],
        expiresAt: link.expiresAt,
      }),
    );
  });

  app.post("/intake/:token", async (req, res) => {
    const token = String(req.params.token ?? "");
    const link = await getIntakeLinkByToken(token);
    if (!link) {
      res.status(404).type("html").send(
        renderIntakeMessage({ title: "Link tidak ditemukan", message: "Link tidak valid.", tone: "error" }),
      );
      return;
    }
    if (link.status !== "pending" || Date.parse(link.expiresAt) < Date.now()) {
      res.type("html").send(
        renderIntakeMessage({
          title: "Link tidak aktif",
          message: "Link sudah dikirim atau kedaluwarsa.",
          tone: "warn",
        }),
      );
      return;
    }
    if (!env.APP_SECRET) {
      res.status(500).type("html").send(
        renderIntakeMessage({
          title: "Vault belum aktif",
          message: "APP_SECRET belum diisi di server. Hubungi admin.",
          tone: "error",
        }),
      );
      return;
    }

    const project = await getProject(link.projectId);
    const items = link.items as IntakeFormItem[];
    const body = (req.body ?? {}) as Record<string, string>;
    let stored = 0;
    for (let i = 0; i < items.length; i++) {
      const name = body[`name_${i}`] ?? items[i]?.name;
      const value = body[`value_${i}`];
      if (name && value && value.trim()) {
        await saveCredential({
          projectId: link.projectId,
          clientId: project?.clientId ?? null,
          name,
          value: value.trim(),
        });
        stored++;
      }
    }

    await markIntakeSubmitted(token);
    await setProjectStage(link.projectId, "preview");
    await emitEvent("intake.submitted", {
      entityType: "project",
      entityId: link.projectId,
      payload: { stored },
    });
    await notifyOwner({
      title: "Kredensial intake diterima",
      body: `${stored} item tersimpan. Proyek ${link.projectId.slice(0, 8)} masuk status PREVIEW.`,
    });

    res.type("html").send(
      renderIntakeMessage({
        title: "Terima kasih",
        message: `${stored} data akses tersimpan. Proyek akan ditinjau oleh tim kami.`,
        tone: "ok",
      }),
    );
  });

  app.get("/metrics", async (_req, res) => {
    res.json(await getMetrics());
  });

  app.get("/evaluations", async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    res.json({ evaluations: await listEvaluations(Number.isFinite(limit) ? limit : 50) });
  });

  app.get("/bookings", async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    res.json({ bookings: await listBookings(Number.isFinite(limit) ? limit : 50) });
  });

  /* ───────────────────── WhatsApp connection ──────────────────── */

  app.get("/whatsapp/status", (_req, res) => {
    res.json({ transport: env.WA_TRANSPORT, ...whatsapp.status() });
  });

  /** Server-Sent Events stream of connection status + pairing QR. */
  app.get("/whatsapp/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const send = (status: unknown) => {
      res.write(`data: ${JSON.stringify({ transport: env.WA_TRANSPORT, ...(status as object) })}\n\n`);
    };
    send(whatsapp.status());

    const onStatus = (status: unknown) => send(status);
    whatsapp.on("status", onStatus);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);

    req.on("close", () => {
      whatsapp.off("status", onStatus);
      clearInterval(ping);
      res.end();
    });
  });

  app.post("/whatsapp/connect", async (_req, res) => {
    try {
      const status = await whatsapp.connect();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/whatsapp/disconnect", async (_req, res) => {
    res.json(await whatsapp.disconnect());
  });

  app.post("/whatsapp/logout", async (_req, res) => {
    res.json(await whatsapp.logout());
  });

  /* ───────────────────────── lead intake ──────────────────────── */

  /** Machine-readable field spec so integrations know exactly what to send. */
  app.get("/webhook/leads/schema", (_req, res) => {
    res.json({
      endpoint: "POST /webhook/leads",
      auth: env.API_KEY ? "header: x-api-key" : "tidak perlu (API_KEY kosong)",
      acceptedShapes: ["objek tunggal", "array of objek", "{ leads: [...] }"],
      maxPerRequest: 500,
      queryParams: { dryRun: "true = validasi tanpa menyimpan" },
      fields: LEAD_FIELD_SPEC,
      example: {
        leads: [
          {
            name: "Budi Santoso",
            phone: "081298765432",
            company: "CV Sinar Abadi",
            source: "instagram",
            notes: "Order masih manual via Excel",
            tags: ["prioritas-tinggi"],
            queue: true,
          },
        ],
      },
      responseShape: {
        dryRun: false,
        received: 1,
        created: 1,
        invalid: 0,
        leads: [
          {
            id: "uuid",
            waJid: "6281298765432@s.whatsapp.net",
            name: "Budi Santoso",
            company: "CV Sinar Abadi",
            outreachStatus: "pending",
          },
        ],
        errors: [
          {
            index: 0,
            phone: "0812…",
            errors: [{ field: "phone", message: "nomor wajib diisi, minimal 5 karakter" }],
          },
        ],
      },
    });
  });

  app.post("/webhook/leads", requireApiKey, async (req, res) => {
    const dryRun = req.query.dryRun === "true";
    const items = extractLeadItems(req.body);

    if (!items) {
      res.status(400).json({
        error: "Body tidak dikenali.",
        acceptedShapes: ["objek tunggal", "array of objek", "{ leads: [...] }"],
      });
      return;
    }
    if (items.length === 0) {
      res.status(400).json({ error: "Tidak ada lead untuk diproses." });
      return;
    }
    if (items.length > 500) {
      res
        .status(413)
        .json({ error: "Maksimal 500 lead per request.", received: items.length });
      return;
    }

    // Validate every item first, collecting precise per-field errors.
    const valid: Array<{ index: number; lead: LeadItem }> = [];
    const errors: LeadItemError[] = [];

    items.forEach((raw, index) => {
      const result = validateLeadItem(raw, index);
      if (result.ok) valid.push({ index, lead: result.lead });
      else errors.push(result.error);
    });

    if (dryRun) {
      res.json({
        dryRun: true,
        received: items.length,
        valid: valid.length,
        invalid: errors.length,
        leads: valid.map((v) => v.lead),
        errors,
      });
      return;
    }

    const created: Array<{
      index: number;
      id: string;
      waJid: string;
      name: string | null;
      company: string | null;
      outreachStatus: string;
    }> = [];

    for (const { index, lead } of valid) {
      try {
        const waJid = normalizeJid(lead.phone, lead.countryCode ?? undefined);
        const saved = await upsertProspect({
          waJid,
          name: lead.name ?? null,
          company: lead.company ?? null,
          source: lead.source ?? null,
          notes: lead.notes ?? null,
          tags: lead.tags,
          queue: lead.queue,
        });
        created.push({
          index,
          id: saved.id,
          waJid: saved.waJid,
          name: saved.name,
          company: saved.company,
          outreachStatus: saved.outreachStatus,
        });
      } catch (err) {
        errors.push({
          index,
          phone: lead.phone,
          errors: [{ field: "(server)", message: (err as Error).message }],
        });
      }
    }

    log.info(
      { received: items.length, created: created.length, invalid: errors.length },
      "lead import",
    );

    res.status(created.length === 0 && errors.length > 0 ? 422 : 200).json({
      dryRun: false,
      received: items.length,
      created: created.length,
      invalid: errors.length,
      leads: created
        .sort((a, b) => a.index - b.index)
        .map(({ index, ...rest }) => rest),
      errors,
    });
  });

  /* ────────────────────────── outreach ────────────────────────── */

  app.get("/prospects", async (_req, res) => {
    res.json({ prospects: await listProspects(200) });
  });

  app.get("/outreach", async (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const [stats, logRows] = await Promise.all([
      getOutreachStats(),
      listOutreachLog(Number.isFinite(limit) ? limit : 50),
    ]);
    res.json({ stats, log: logRows, workingHours: workingHoursLabel() });
  });

  app.post("/outreach/tick", async (req, res) => {
    const force = req.query.force === "true" || (req.body as { force?: boolean })?.force === true;
    res.json(await runOutreachTick({ force }));
  });

  app.post("/leads/:id/queue", async (req, res) => {
    await setOutreachStatus({
      leadId: String(req.params.id ?? ""),
      status: "pending",
      nextFollowUpAt: new Date().toISOString(),
    });
    res.json({ ok: true, id: String(req.params.id ?? ""), outreachStatus: "pending" });
  });

  app.post("/leads/:id/opt-out", async (req, res) => {
    await setOptOut(String(req.params.id ?? ""));
    res.json({ ok: true, id: String(req.params.id ?? ""), outreachStatus: "opted_out" });
  });

  app.get("/conversations/:threadId", async (req, res) => {
    const threadId = req.params.threadId;
    res.json({ threadId, messages: await getRecentConversation(threadId, 50) });
  });

  const handleTurn = async (req: Request, res: Response) => {
    const parsed = WebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid body", details: parsed.error.issues });
      return;
    }
    const { from, name, text, threadId } = parsed.data;
    const waJid = normalizeJid(from);
    const resolvedThread = threadId ?? `wa:${waJid}`;

    try {
      const result = await handleSupervisorTurn({
        threadId: resolvedThread,
        leadId: null,
        waJid,
        contactName: name ?? null,
        text,
        receivedAt: new Date().toISOString(),
      });

      // Detail spesifik agent (skor, segment, evaluasi, booking) ada di
      // `agentResult.metadata`; permukaan respons tetap seperti sebelumnya.
      const meta = (result.agentResult?.metadata ?? {}) as Record<string, unknown>;

      res.json({
        threadId: resolvedThread,
        waJid,
        agent: result.activeAgent,
        routeReason: result.routeReason,
        isBot: (meta.isBot as boolean | undefined) ?? false,
        filtered: result.filtered,
        intent: meta.intent ?? null,
        leadScore: (meta.leadScore as number | undefined) ?? 0,
        segment: meta.segment ?? null,
        reply: result.reply,
        dispatched: (meta.dispatched as boolean | undefined) ?? false,
        dryRun: env.DRY_RUN,
        evaluation: meta.evaluation ?? null,
        booking: meta.booking ?? null,
        errors: result.errors,
      });
    } catch (err) {
      log.error({ err: (err as Error).message }, "failed to process turn");
      res.status(500).json({ error: (err as Error).message });
    }
  };

  /**
   * Chat ringan untuk office (Claw3D). Menjawab sebagai agent terpilih dengan
   * konteks roster + papan proses bisnis + aktivitas terkini. Tanpa efek samping
   * (tidak membuat lead / mengirim WhatsApp), sehingga responsif untuk ngobrol.
   */
  app.post("/office/chat", async (req, res) => {
    const body = req.body as { agentId?: string; message?: string };
    const message = String(body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ error: "message wajib" });
      return;
    }
    const agent = findAgent(String(body?.agentId ?? "supervisor")) ?? findAgent("supervisor");
    try {
      const [board, events] = await Promise.all([buildBusinessBoard(), listEvents(12)]);
      const roster = AGENT_REGISTRY.map(
        (a) => `- ${a.slug} (${a.name}, ${a.division}): ${a.role}`,
      ).join("\n");
      const active = board.records
        .slice(0, 12)
        .map(
          (r) =>
            `- [${r.column}] ${r.title} · status ${r.status}${r.currentAgent ? ` · ${r.currentAgent}` : ""}`,
        )
        .join("\n");
      const recent = events
        .map((e) => `- ${e.type}${e.entityId ? ` (${e.entityId.slice(0, 8)})` : ""}`)
        .join("\n");
      const system = [
        `Kamu "${agent?.name ?? "Supervisor"}" (${agent?.role ?? "orchestrator"}) pada sistem otomasi sales & delivery berbasis banyak agent.`,
        "Jawab SINGKAT, jelas, dalam Bahasa Indonesia, sesuai peranmu. Jangan mengarang data di luar konteks yang diberikan.",
        "",
        "Roster agent:",
        roster,
        "",
        "Papan proses bisnis (Business Kanban) terkini:",
        active || "(kosong)",
        "",
        "Aktivitas terbaru:",
        recent || "(kosong)",
      ].join("\n");
      const reply = await textInvoke({
        system,
        human: message,
        name: "OfficeChat",
        provider: "openrouter",
        temperature: 0.3,
        maxTokens: 500,
      });
      res.json({ agentId: agent?.slug ?? "supervisor", reply });
    } catch (err) {
      log.error({ err: (err as Error).message }, "office chat failed");
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/webhook/whatsapp", requireApiKey, handleTurn);
  app.post("/simulate", handleTurn);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err: err.message }, "unhandled API error");
    res.status(500).json({ error: err.message });
  });

  return app;
}
