// Force the safe transport before any module reads env.
process.env.WA_TRANSPORT = process.env.WA_TRANSPORT ?? "console";
process.env.DRY_RUN = process.env.DRY_RUN ?? "true";

const { ensureSchema } = await import("../db/schema.js");
const { closePool } = await import("../db/pool.js");
const { getGraph } = await import("../graph/index.js");
const { getSupervisorGraph } = await import("../supervisor/index.js");
const { handleSupervisorTurn } = await import("../supervisor/run.js");
const { logger } = await import("../config/logger.js");

const WA_JID = "6281234567890@s.whatsapp.net";
const THREAD_ID = `wa:${WA_JID}`;

/** A scripted B2B conversation that exercises every branch of the graph. */
const SCRIPT: Array<{ name: string; text: string }> = [
  { name: "greeting", text: "Halo, selamat pagi. Saya Andi dari PT Maju Jaya Logistik." },
  {
    name: "pricing",
    text: "Kami punya masalah: proses input order dan follow-up ke customer masih manual pakai Excel dan WhatsApp pribadi. Bisa dibantu diotomatisasi? Kira-kira berapa biayanya dan berapa lama?",
  },
  {
    name: "objection",
    text: "Hmm, kalau biayanya di atas 10 juta agak berat untuk kami. Ada opsi yang lebih kecil?",
  },
  {
    name: "closing",
    text: "Oke, kami tertarik. Budget sekitar 15 juta dan butuh segera kuartal ini. Bisa jadwalkan konsultasi dengan tim?",
  },
  { name: "bot", text: "Pesan ini dikirim secara otomatis. Balas 1 untuk info, 2 untuk promo." },
];

async function main(): Promise<void> {
  logger.info("▶️  simulation started (supervisor → sales, transport=console, dryRun=true)");
  await ensureSchema();
  await getGraph();
  getSupervisorGraph();

  for (const step of SCRIPT) {
    logger.info({ step: step.name }, `— inbound: ${step.text}`);
    const result = await handleSupervisorTurn({
      threadId: THREAD_ID,
      leadId: null,
      waJid: WA_JID,
      contactName: "Andi",
      text: step.text,
      receivedAt: new Date().toISOString(),
    });

    const meta = (result.agentResult?.metadata ?? {}) as Record<string, unknown>;
    const evaluation = meta.evaluation as { overall?: number } | null;
    const booking = meta.booking as { status?: string } | null;

    // Surface a readable summary of what the supervisor + agent decided.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          step: step.name,
          agent: result.activeAgent,
          route: result.routeReason,
          isBot: meta.isBot,
          filtered: result.filtered,
          intent: meta.intent,
          leadScore: meta.leadScore,
          segment: meta.segment,
          rag: meta.rag,
          reply: result.reply,
          evaluation: evaluation?.overall ?? null,
          booking: booking?.status ?? null,
          errors: result.errors,
        },
        null,
        2,
      ),
    );
  }

  logger.info("✅ simulation complete");
}

main()
  .catch((err) => {
    logger.error({ err: (err as Error).stack ?? String(err) }, "simulation failed");
    process.exitCode = 1;
  })
  .finally(() => void closePool());
