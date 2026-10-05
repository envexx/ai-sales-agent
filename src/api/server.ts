import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { GRAPH_MERMAID } from "../graph/index.js";
import { handleInboundTurn } from "../graph/run.js";
import {
  getLeadDetail,
  getMetrics,
  getOutreachStats,
  getRecentConversation,
  listBookings,
  listEvaluations,
  listLeads,
  listOutreachLog,
  listProspects,
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
    });
  });

  app.get("/graph/mermaid", (_req, res) => {
    res.type("text/plain").send(GRAPH_MERMAID);
  });

  app.get("/leads", async (_req, res) => {
    res.json({ leads: await listLeads() });
  });

  app.get("/leads/:id", async (req, res) => {
    const detail = await getLeadDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "lead not found" });
      return;
    }
    res.json(detail);
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
      leadId: req.params.id,
      status: "pending",
      nextFollowUpAt: new Date().toISOString(),
    });
    res.json({ ok: true, id: req.params.id, outreachStatus: "pending" });
  });

  app.post("/leads/:id/opt-out", async (req, res) => {
    await setOptOut(req.params.id);
    res.json({ ok: true, id: req.params.id, outreachStatus: "opted_out" });
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
      const result = await handleInboundTurn({
        threadId: resolvedThread,
        leadId: null,
        waJid,
        contactName: name ?? null,
        text,
        receivedAt: new Date().toISOString(),
      });
      res.json({
        threadId: resolvedThread,
        waJid,
        isBot: result.isBot,
        filtered: result.filtered,
        intent: result.triage?.intent ?? null,
        leadScore: result.leadScore,
        segment: result.segment,
        reply: result.finalResponse,
        dispatched: result.dispatched,
        dryRun: env.DRY_RUN,
        evaluation: result.evaluation,
        booking: result.booking,
        errors: result.errors,
      });
    } catch (err) {
      log.error({ err: (err as Error).message }, "failed to process turn");
      res.status(500).json({ error: (err as Error).message });
    }
  };

  app.post("/webhook/whatsapp", requireApiKey, handleTurn);
  app.post("/simulate", handleTurn);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err: err.message }, "unhandled API error");
    res.status(500).json({ error: err.message });
  });

  return app;
}
