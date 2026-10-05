// Force the safe transport before any module reads env.
process.env.WA_TRANSPORT = process.env.WA_TRANSPORT ?? "console";
process.env.DRY_RUN = process.env.DRY_RUN ?? "true";

const { ensureSchema } = await import("../db/schema.js");
const { closePool } = await import("../db/pool.js");
const { getGraph } = await import("../graph/index.js");
const { handleInboundTurn } = await import("../graph/run.js");
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
  logger.info("▶️  simulation started (transport=console, dryRun=true)");
  await ensureSchema();
  await getGraph();

  for (const step of SCRIPT) {
    logger.info({ step: step.name }, `— inbound: ${step.text}`);
    const result = await handleInboundTurn({
      threadId: THREAD_ID,
      leadId: null,
      waJid: WA_JID,
      contactName: "Andi",
      text: step.text,
      receivedAt: new Date().toISOString(),
    });

    // Surface a readable summary of what the graph decided.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          step: step.name,
          isBot: result.isBot,
          filtered: result.filtered,
          intent: result.triage?.intent ?? null,
          leadScore: result.leadScore,
          segment: result.segment,
          rag: {
            knowledge: result.retrievedContext.filter((d) => d.source === "knowledge")
              .length,
            memory: result.retrievedContext.filter((d) => d.source === "memory")
              .length,
          },
          reply: result.finalResponse,
          evaluation: result.evaluation?.overall ?? null,
          booking: result.booking?.status ?? null,
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
