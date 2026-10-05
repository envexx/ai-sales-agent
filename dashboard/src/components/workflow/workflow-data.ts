export type NodeCategory =
  | "trigger"
  | "triage"
  | "filter"
  | "rag"
  | "scoring"
  | "strategy"
  | "response"
  | "dispatch"
  | "booking"
  | "evaluation"
  | "reflection"
  | "memory"
  | "terminal";

export interface WorkflowNodeMetadata {
  id: string;
  name: string;
  langGraphId: string;
  category: NodeCategory;
  badge: string;
  iconName: string;
  color: "slate" | "indigo" | "rose" | "cyan" | "amber" | "sky" | "emerald" | "violet" | "fuchsia" | "purple";
  summary: string;
  description: string;
  file: string;
  inputs: string[];
  outputs: string[];
  businessLogic: string[];
  codeSnippet: string;
  promptExcerpt?: string;
  segment?: "nurture" | "objection" | "closing";
  [key: string]: unknown;
}

export const WORKFLOW_NODES: Record<string, WorkflowNodeMetadata> = {
  START: {
    id: "START",
    name: "WhatsApp Inbound Trigger",
    langGraphId: "START",
    category: "trigger",
    badge: "Webhook / HTTP",
    iconName: "MessageSquare",
    color: "indigo",
    summary: "Menerima pesan WhatsApp masuk melalui Baileys Webhook atau endpoint /simulate.",
    description:
      "Titik awal eksekusi graph LangGraph. Menerima payload pesan masuk (pengirim JID, nomor telepon, nama kontak, dan teks). State awal dibuat dan turn dimasukkan ke dalam antrean eksekusi state machine.",
    file: "src/api/server.ts & src/whatsapp/baileys.ts",
    inputs: ["from (nomor / JID)", "text (isi pesan)", "name (opsional)", "threadId (opsional)"],
    outputs: ["threadId", "waJid", "inboundMessage", "receivedAt", "messages[]"],
    businessLogic: [
      "Normalisasi format WhatsApp JID (misal: 62812... @s.whatsapp.net)",
      "Thread ID diformat sebagai wa:<JID> untuk isolasi sesi",
      "Pesan dikonversi ke LangChain HumanMessage dan disinkronkan ke checkpointer Postgres",
    ],
    codeSnippet: `const result = await handleInboundTurn({
  threadId: resolvedThread,
  leadId: null,
  waJid,
  contactName: name ?? null,
  text,
  receivedAt: new Date().toISOString(),
});`,
  },

  triageMessage: {
    id: "triageMessage",
    name: "AI Triage & Bot Detection",
    langGraphId: "triageMessage",
    category: "triage",
    badge: "Regex + LLM Fail-Open",
    iconName: "Bot",
    color: "purple",
    summary: "Mendeteksi apakah pesan dari bot otomatis/OTP/broadcast atau manusia, serta ekstraksi intent awal.",
    description:
      "Menjalankan filter deterministik berbiaya rendah terlebih dahulu (11 pola regex). Jika lolos heuristik, DeepSeek Chat dipanggil untuk mengklasifikasikan intent dan memastikan keaslian pengirim. Menganut prinsip fail-open: jika ragu, pesan dianggap dari manusia agar prospek asli tidak pernah hilang.",
    file: "src/graph/nodes/triage.ts",
    inputs: ["state.inboundMessage"],
    outputs: ["isBot (boolean)", "triage.intent", "triage.urgency", "triage.sentiment"],
    businessLogic: [
      "11 Heuristic Regex: /otp/, /pesan otomatis/, /broadcast/, /kode verifikasi/, /balas dengan angka/",
      "LLM Structured Invoke fallback: menentukan intent (greeting, pricing, objection, booking, ready_to_buy)",
      "Fail-open: jika LLM error atau tidak yakin, isBot = false (tetap dilayani)",
    ],
    codeSnippet: `export async function triageNode(state: SalesStateType): Promise<SalesUpdateType> {
  const text = state.inboundMessage;
  const heuristic = heuristicBotCheck(text);
  if (heuristic.isBot) {
    return { isBot: true, triage: { isBot: true, botReason: heuristic.reason, ... } };
  }
  // LLM classification...
}`,
    promptExcerpt: `Klasifikasikan pesan masuk WhatsApp apakah dari manusia atau bot.
Tentukan intent (greeting, question, pricing, objection, interested, ready_to_buy, booking).
Jika ragu, prioritaskan manusia (fail-open).`,
  },

  filter: {
    id: "filter",
    name: "Bot Filter (Terminal)",
    langGraphId: "filter",
    category: "filter",
    badge: "Terminal / Discard",
    iconName: "ShieldAlert",
    color: "rose",
    summary: "Menghentikan alur untuk pesan bot otomatis atau spam broadcast tanpa membalas.",
    description:
      "Cabang terminasi ketika routeAfterTriage mendeteksi isBot === true. Pesan dicatat ke trace log sistem namun tidak dilanjutkan ke RAG atau Response Generation sehingga menghemat kuota LLM dan menghindari loop pesan otomatis.",
    file: "src/graph/nodes/filter.ts",
    inputs: ["state.triage", "state.isBot"],
    outputs: ["filtered = true", "trace entry 'filter'"],
    businessLogic: [
      "Terminal branch: langsung mengalir ke END",
      "Tidak ada pesan keluar yang dikirim ke nomor pengirim",
      "Menghemat 100% biaya inferensi LLM dan token konteks",
    ],
    codeSnippet: `export async function filterNode(state: SalesStateType): Promise<SalesUpdateType> {
  return {
    filtered: true,
    trace: [traceEntry("filter", { reason: state.triage?.botReason ?? "bot" })],
  };
}`,
  },

  rag: {
    id: "rag",
    name: "RAG Context Retrieval",
    langGraphId: "rag",
    category: "rag",
    badge: "pgvector Cosine Sim",
    iconName: "Database",
    color: "cyan",
    summary: "Mengambil konteks dokumen pengetahuan produk dan catatan memori jangka panjang terdahulu.",
    description:
      "Melakukan semantic search secara paralel ke dua tabel Postgres dengan ekstensi pgvector: 1) knowledge_docs (produk, fitur, harga, FAQ, playbook sales) sebanyak top-K (default 5); dan 2) long_term_memory (catatan refleksi interaksi sebelumnya untuk lead ini atau catatan umum) sebanyak top-K (default 3).",
    file: "src/graph/nodes/rag.ts",
    inputs: ["state.inboundMessage", "state.leadId", "vector embedding"],
    outputs: ["retrievedContext: RetrievedDoc[]"],
    businessLogic: [
      "Parallel fetch: knowledge_docs + long_term_memory",
      "Embedding provider fleksibel: hash deterministik (offline), local transformers, atau OpenAI",
      "Feedback edge: memori dari turn sebelumnya otomatis menjadi bahan rujukan turn saat ini",
    ],
    codeSnippet: `const [docs, memories] = await Promise.all([
  searchKnowledge(query, env.RAG_TOP_K),
  searchMemories({ leadId: state.leadId, query, limit: env.LTM_TOP_K }),
]);
return { retrievedContext: [...docs, ...memories] };`,
  },

  leadScoring: {
    id: "leadScoring",
    name: "Lead Qualification & Scoring",
    langGraphId: "leadScoring",
    category: "scoring",
    badge: "40% Heuristik + 60% LLM",
    iconName: "Gauge",
    color: "amber",
    summary: "Menghitung skor kualifikasi lead (0-100) dan menentukan segmen strategi percakapan.",
    description:
      "Mengkombinasikan sinyal kata kunci deterministik (urgensi, anggaran, wewenang jabatan, pertanyaan harga, sinyal beli) dengan analisis semantik mendalam oleh LLM. Nilai akhir mengarahkan percakapan ke salah satu dari 3 segmen: nurture (<40), objection (40-74), atau closing (>=75).",
    file: "src/graph/nodes/leadScoring.ts",
    inputs: ["state.inboundMessage", "state.messages", "state.retrievedContext"],
    outputs: ["leadScore (0-100)", "scoreBreakdown", "segment ('nurture' | 'objection' | 'closing')"],
    businessLogic: [
      "Heuristik: +15 kata harga, +25 sinyal beli, +20 minta demo, +15 urgensi, +10 decision maker, -10 keberatan",
      "Bobot: Skor Akhir = (0.4 * Skor Heuristik) + (0.6 * Skor LLM)",
      "Thresholds: < 40 = Nurture (Cold), 40-74 = Objection (Warm), >= 75 = Closing (Hot)",
    ],
    codeSnippet: `const heuristic = heuristicScore(state.inboundMessage);
const llm = await structuredInvoke({ schema: ScoreSchema, ... });
const blended = clamp(Math.round(heuristic.score * 0.4 + llm.score * 0.6), 0, 100);
const segment = toSegment(blended);
return { leadScore: blended, segment, scoreBreakdown: ... };`,
  },

  nurture: {
    id: "nurture",
    name: "Strategi Nurture (< 40)",
    langGraphId: "nurture",
    category: "strategy",
    segment: "nurture",
    badge: "Skor < 40 · Soft Sell",
    iconName: "Sparkles",
    color: "sky",
    summary: "Fokus edukasi, membangun hubungan, dan menjawab rasa ingin tahu tanpa hard-selling.",
    description:
      "Dijalankan ketika skor prospek masih di bawah 40 (tahap eksplorasi awal). LLM menyiapkan kerangka taktis: pendekatan yang ramah dan suportif, mengidentifikasi rasa sakit (pain point), memberikan informasi nilai dasar, serta CTA lembut berupa pertanyaan balik terbuka.",
    file: "src/graph/nodes/strategies.ts",
    inputs: ["state.leadScore", "state.retrievedContext", "state.messages"],
    outputs: ["strategy: StrategyResult (approach, tone, keyPoints, cta, playbook)"],
    businessLogic: [
      "Pendekatan: Edukatif, empatik, membangun kepercayaan (trust building)",
      "Pantangan: Tidak melakukan hard-sell atau mendesak transaksi",
      "CTA: Pertanyaan terbuka untuk menggali kebutuhan spesifik prospek",
    ],
    codeSnippet: `export const nurtureNode = (state: SalesStateType) => buildStrategy(state, "nurture");`,
    promptExcerpt: `Fokus Nurture: Prospek masih dingin atau baru tahap eksplorasi.
Bangun rasa percaya, jelaskan nilai dasar tanpa tekanan penjualan.
Gunakan nada bersahabat dan tawarkan bantuan eksploratif.`,
  },

  objection: {
    id: "objection",
    name: "Strategi Objection (40–74)",
    langGraphId: "objection",
    category: "strategy",
    segment: "objection",
    badge: "Skor 40–74 · Nilai & ROI",
    iconName: "HelpCircle",
    color: "amber",
    summary: "Mengatasi keraguan (harga, fitur, waktu, kerumitan) dengan validasi dan komparasi nilai.",
    description:
      "Dijalankan ketika skor prospek berada di rentang 40-74. Menyiapkan kerangka taktis untuk menangani keberatan secara elegan: mengakui kekhawatiran prospek, menyajikan data/studi kasus/ROI, membandingkan solusi, dan mendorong langkah berikutnya (misal konsultasi atau uji coba).",
    file: "src/graph/nodes/strategies.ts",
    inputs: ["state.leadScore", "state.scoreBreakdown", "state.retrievedContext"],
    outputs: ["strategy: StrategyResult (approach, tone, objectionType, cta, playbook)"],
    businessLogic: [
      "Pendekatan: Validasi keraguan → Reframe ke nilai/keuntungan jangka panjang → Bukti ROI",
      "Klasifikasi Keberatan: Harga mahal, butuh waktu pikir, fitur kurang cocok, takut rumit",
      "CTA: Menawarkan konsultasi singkat atau peragaan fitur relevan",
    ],
    codeSnippet: `export const objectionNode = (state: SalesStateType) => buildStrategy(state, "objection");`,
    promptExcerpt: `Fokus Objection: Prospek tertarik tapi memiliki keraguan atau keberatan.
Tangani keberatan dengan empati, sajikan nilai riil dan perbandingan ROI.
Ajak ke langkah pembuktian berikutnya.`,
  },

  closing: {
    id: "closing",
    name: "Strategi Closing (≥ 75)",
    langGraphId: "closing",
    category: "strategy",
    segment: "closing",
    badge: "Skor ≥ 75 · Direct CTA",
    iconName: "CheckCircle2",
    color: "emerald",
    summary: "Mengunci deal, menawarkan tautan jadwal demo, atau memfasilitasi transaksi langsung.",
    description:
      "Dijalankan ketika prospek menunjukkan sinyal beli yang kuat (skor >= 75). LLM memfokuskan pesan pada Call to Action langsung: konfirmasi demo, pemilihan paket, tautan booking kalender, atau panduan registrasi/pembayaran.",
    file: "src/graph/nodes/strategies.ts",
    inputs: ["state.leadScore", "state.scoreBreakdown", "state.retrievedContext"],
    outputs: ["strategy: StrategyResult (approach, tone, keyPoints, cta, playbook)"],
    businessLogic: [
      "Pendekatan: Lugas, antusias, solutif, mempermudah langkah transaksi",
      "Penyuntikan link: Menyertakan BOOKING_LINK bila prospek ingin demo/meeting",
      "CTA: Konfirmasi waktu jadwal, nomor rekening/invoice, atau aktivasi akun",
    ],
    codeSnippet: `export const closingNode = (state: SalesStateType) => buildStrategy(state, "closing");`,
    promptExcerpt: `Fokus Closing: Prospek menunjukkan sinyal beli kuat dan urgensi tinggi.
Berikan Call to Action (CTA) yang jelas, amankan komitmen, tawarkan tautan booking demo.`,
  },

  responseGeneration: {
    id: "responseGeneration",
    name: "Response Generation (LLM)",
    langGraphId: "responseGeneration",
    category: "response",
    badge: "DeepSeek Chat",
    iconName: "Cpu",
    color: "violet",
    summary: "Menulis balasan WhatsApp natural memadukan persona, konteks RAG, dan taktik strategi.",
    description:
      "Menggabungkan seluruh konteks: persona bisnis perusahaan, nama sales rep, dokumen RAG, transkrip 10 pesan terakhir, serta arahan strategi yang baru dihasilkan. Model DeepSeek menghasilkan draf balasan WhatsApp yang persuasif, ringkas, dan mengalir.",
    file: "src/graph/nodes/responseGeneration.ts",
    inputs: ["state.strategy", "state.retrievedContext", "state.messages", "state.inboundMessage"],
    outputs: ["draftResponse: string", "finalResponse: string"],
    businessLogic: [
      "Persona Inject: Menyisipkan BUSINESS_NAME, BUSINESS_DESCRIPTION, dan SALES_REP_NAME",
      "Format WhatsApp: 1-3 paragraf ringkas, spasi rapi, emoji sewajarnya, tidak kaku",
      "Konsistensi RAG: Mengutamakan fakta harga dan fitur dari dokumen resmi RAG",
    ],
    codeSnippet: `const res = await callLlm({
  system: responsePrompt(businessContext),
  human: formatPromptContext(state),
  temperature: 0.7,
});
return { draftResponse: res, finalResponse: res };`,
  },

  dispatch: {
    id: "dispatch",
    name: "WhatsApp Dispatcher",
    langGraphId: "dispatch",
    category: "dispatch",
    badge: "Baileys / Console Guard",
    iconName: "Send",
    color: "emerald",
    summary: "Mengirimkan pesan balasan ke pengguna WhatsApp dengan pengaman DRY_RUN.",
    description:
      "Mengeksekusi pengiriman pesan melalui abstraksi WhatsApp Transport. Jika DRY_RUN=true, pesan hanya dicatat di terminal/console untuk keselamatan pengujian tanpa mengirim ke nomor telepon fisik.",
    file: "src/graph/nodes/dispatch.ts",
    inputs: ["state.finalResponse", "state.waJid", "state.dispatched"],
    outputs: ["dispatched = true", "dispatchMessageId: string"],
    businessLogic: [
      "Idempotensi: Tidak akan mengirim ulang jika state.dispatched sudah true (misal saat loop perbaikan)",
      "Pengaman DRY_RUN: Aman untuk simulasi lokal tanpa biaya SMS/WhatsApp API",
      "Pencatatan ID Pesan keluar untuk pelacakan percakapan di database",
    ],
    codeSnippet: `if (!state.dispatched && state.finalResponse) {
  const msgId = await transport.sendText(state.waJid, state.finalResponse);
  return { dispatched: true, dispatchMessageId: msgId };
}`,
  },

  bookingFlow: {
    id: "bookingFlow",
    name: "Booking & Follow-up Flow",
    langGraphId: "bookingFlow",
    category: "booking",
    badge: "Intent & Jadwal Demo",
    iconName: "CalendarCheck",
    color: "indigo",
    summary: "Mendeteksi apakah percakapan mengarah ke booking jadwal demo atau permintaan follow-up.",
    description:
      "Menganalisis apakah prospek setuju mengadakan meeting atau menentukan waktu konsultasi. Menyimpan rekaman booking baru ke tabel bookings dengan status proposed atau confirmed.",
    file: "src/graph/nodes/booking.ts",
    inputs: ["state.inboundMessage", "state.finalResponse", "state.messages"],
    outputs: ["booking: BookingInfo (intent, status, scheduledAt, reason)"],
    businessLogic: [
      "Deteksi entitas waktu: mengekstrak tanggal dan jam yang disepakati prospek",
      "Status booking: 'proposed' (tawaran jadwal diajukan) atau 'confirmed' (disetujui kedua pihak)",
      "Penyimpanan otomatis ke database relasional bookings untuk integrasi kalender",
    ],
    codeSnippet: `const booking = await detectBookingIntent(state);
if (booking.intent) {
  await saveBooking({ leadId: state.leadId, status: booking.status, ... });
}
return { booking };`,
  },

  critique: {
    id: "critique",
    name: "Self-Critique & Evaluation",
    langGraphId: "critique",
    category: "evaluation",
    badge: "5 Dimensi Skor (0-10)",
    iconName: "SearchCheck",
    color: "fuchsia",
    summary: "AI Critic otonom yang mengevaluasi kualitas balasan sebelum dijadikan pelajaran memori.",
    description:
      "Bertindak sebagai auditor independen. Menganalisis pesan prospek vs balasan agen secara ketat pada 5 dimensi kualitas (Relevance, Groundedness, Tone, Conversion Likelihood, Overall 0-10). Hasil penilaian disimpan ke tabel evaluations.",
    file: "src/graph/nodes/evaluation.ts",
    inputs: ["state.inboundMessage", "state.finalResponse", "state.retrievedContext", "state.strategy"],
    outputs: ["evaluation: Evaluation (scores, strengths, improvements, critique)"],
    businessLogic: [
      "5 Kriteria: Relevance, Groundedness (bebas halusinasi), Tone, ConversionLikelihood, Overall",
      "Menggunakan DeepSeek Reasoner jika USE_REASONING_MODEL=true untuk evaluasi kritis",
      "Persistence: Hasil penilaian disimpan untuk analisis radar kualitas di dashboard",
    ],
    codeSnippet: `const evaluation = await structuredInvoke({
  schema: EvalSchema,
  system: evaluationPrompt.system,
  human: [ ... ],
  temperature: 0,
  reasoning: true,
});
await saveEvaluation({ threadId, leadId, evaluation });
return { evaluation };`,
  },

  reflect: {
    id: "reflect",
    name: "Reflection Engine",
    langGraphId: "reflect",
    category: "reflection",
    badge: "Penyulingan Insight",
    iconName: "Brain",
    color: "purple",
    summary: "Menyaring hasil evaluasi menjadi pelajaran taktis terstruktur yang dapat dipakai ulang.",
    description:
      "Mengubah data kritik menjadi wawasan yang bermakna: apa yang bekerja dengan baik, bagian apa yang perlu ditingkatkan, serta panduan praktis (guidance) untuk situasi serupa di kemudian hari.",
    file: "src/graph/nodes/reflection.ts",
    inputs: ["state.evaluation", "state.finalResponse", "state.messages"],
    outputs: ["reflection: Reflection (lesson, whatWorked, whatToImprove, guidance, importance)"],
    businessLogic: [
      "Meringkas kesalahan atau keberhasilan dalam 1 kalimat 'lesson'",
      "Memberi skor importance (0-1) untuk prioritas retrieval di masa depan",
      "Mengisolasi panduan agar dapat diaplikasikan lintas percakapan",
    ],
    codeSnippet: `const reflection = await structuredInvoke({
  schema: ReflectionSchema,
  system: reflectionPrompt.system,
  human: formatReflectionInput(state),
  temperature: 0.2,
  reasoning: true,
});
return { reflection };`,
  },

  longTermMemory: {
    id: "longTermMemory",
    name: "Long-Term Memory & Lead Sync",
    langGraphId: "longTermMemory",
    category: "memory",
    badge: "Vector Sync & Loop Guard",
    iconName: "HardDrive",
    color: "cyan",
    summary: "Menyimpan refleksi ke Postgres pgvector dan memutuskan apakah perlu perbaikan mandiri.",
    description:
      "Menyimpan pelajaran ke tabel long_term_memory dengan embedding vektor sehingga turn berikutnya dapat mengambil konteks ini (menutup loop LTM -> RAG). Juga memperbarui status lead di CRM dan mengecek apakah draf berperingkat rendah (<5) perlu direvisi ulang segera.",
    file: "src/graph/nodes/longTermMemory.ts",
    inputs: ["state.reflection", "state.leadId", "state.evaluation", "state.reflectionLoops"],
    outputs: ["memoryWritten: boolean", "memoryId: string", "reenterForImprovement: boolean"],
    businessLogic: [
      "Memori tersimpan dipelajari oleh RAG di turn masa depan (lintas lead maupun lead spesifik)",
      "Sinkronisasi CRM: memperbarui status stage lead ('nurturing', 'objection-handling', 'ready-to-close', 'booked')",
      "Loop Perbaikan Segera: Jika overall < 5 dan reflectionLoops < MAX_REFLECTION_LOOPS, loop balik ke RAG!",
    ],
    codeSnippet: `await writeMemory({
  leadId: state.leadId,
  kind: "reflection",
  content: formatMemoryContent(r),
  importance: r.importance,
});
// Cek loop perbaikan mandiri
const poorQuality = (state.evaluation?.overall ?? 10) < 5;
const canLoop = state.reflectionLoops < env.MAX_REFLECTION_LOOPS;
update.reenterForImprovement = poorQuality && canLoop;
return { ...update };`,
  },

  scheduling: {
    id: "scheduling",
    name: "Scheduling (Cal.com MCP)",
    langGraphId: "scheduling",
    category: "booking",
    badge: "MCP · Cal.com",
    iconName: "CalendarCheck",
    color: "emerald",
    summary:
      "Cek ketersediaan slot dan buat booking langsung ke Cal.com melalui MCP server.",
    description:
      "Node penjadwalan yang terhubung ke Cal.com via MCP (@calcom/cal-mcp). Hanya berjalan pada konteks booking (segmen closing atau intent booking). Memanggil getAvailableSlots untuk menawarkan slot nyata, atau createBooking ketika prospek sudah memilih waktu dan emailnya diketahui. Hasilnya dipakai Response Generation untuk menawarkan slot atau mengonfirmasi link Google Meet.",
    file: "src/graph/nodes/scheduling.ts",
    inputs: ["state.inboundMessage", "state.messages", "state.contactName", "state.segment"],
    outputs: ["availableSlots[]", "calBooking", "schedulingNote"],
    businessLogic: [
      "Nonaktif otomatis bila CAL_API_KEY kosong (fallback ke BOOKING_LINK)",
      "Hanya 8 tool booking yang diekspos dari 149 tool Cal.com MCP",
      "createBooking memerlukan email attendee; bila kosong, agen memintanya lebih dulu",
      "start booking dikirim dalam UTC sesuai kontrak API Cal.com",
    ],
    codeSnippet: `const { text } = await runToolLoop({
  system: schedulingPrompt.system,
  human,
  tools: await getCalTools(),
  maxIterations: 6,
});`,
    promptExcerpt:
      "Ambil ketersediaan dengan getAvailableSlots lalu pilih 2–3 slot terbaik. Buat booking hanya jika waktu dan email sudah diketahui.",
  },

  END: {
    id: "END",
    name: "Turn Completed",
    langGraphId: "END",
    category: "terminal",
    badge: "Checkpointer Persisted",
    iconName: "Flag",
    color: "slate",
    summary: "Siklus turn selesai, seluruh state disimpan aman ke checkpointer Postgres.",
    description:
      "Node akhir LangGraph. Seluruh state percakapan (riwayat pesan, skor lead, evaluasi, memori, trace) disimpan ke PostgresSaver (checkpoints) sehingga sesi percakapan multi-turn tetap utuh saat pesan baru tiba.",
    file: "src/graph/checkpointer.ts",
    inputs: ["Seluruh channel SalesState"],
    outputs: ["Saved state di Postgres checkpoint_blobs"],
    businessLogic: [
      "LangGraph checkpoint atomik di Postgres",
      "Sesi percakapan dapat dilanjutkan kapan saja tanpa kehilangan memori lokal",
      "Kesiapan menerima webhook turn berikutnya",
    ],
    codeSnippet: `// Checkpointer Postgres LangGraph menyimpan snapshot state otomatis di node END
const checkpointer = await getCheckpointer();
return builder.compile({ checkpointer });`,
  },
};

export interface ScenarioStep {
  nodeId: string;
  title: string;
  detail: string;
  badge?: string;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  inboundMessage: string;
  fromName: string;
  score: number;
  segment: "nurture" | "objection" | "closing" | "filter";
  steps: ScenarioStep[];
}

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "closing-demo",
    name: "Lead Hot: Minta Demo (Skor 85)",
    description: "Prospek level direktur membutuhkan solusi segera dan minta demo sistem.",
    inboundMessage: "Halo, saya Gunawan CEO PT Sejahtera. Butuh sistem sales WA seperti ini untuk 10 tim kami. Bisa demo besok jam 2 siang?",
    fromName: "Pak Gunawan",
    score: 85,
    segment: "closing",
    steps: [
      { nodeId: "START", title: "Pesan Masuk", detail: "Pesan dari Pak Gunawan diterima oleh WhatsApp Webhook." },
      { nodeId: "triageMessage", title: "AI Triage", detail: "Lolos heuristik bot. Terdeteksi manusia, intent: ready_to_buy / booking, urgensi: high." },
      { nodeId: "rag", title: "RAG Retrieval", detail: "Mengambil 5 dokumen paket Enterprise dan panduan jadwal demo dari pgvector." },
      { nodeId: "leadScoring", title: "Lead Scoring", detail: "Skor 85 (CEO + urgensi tinggi + minta demo). Masuk segmen Closing (>=75)." },
      { nodeId: "closing", title: "Strategi Closing", detail: "Pendekatan direct CTA: amankan waktu demo besok jam 14:00 dan kirim link kalender." },
      { nodeId: "responseGeneration", title: "Generasi Balasan", detail: "DeepSeek menulis balasan sopan, mengonfirmasi demo besok jam 14:00, dan memberikan link kalender." },
      { nodeId: "dispatch", title: "WhatsApp Dispatch", detail: "Pesan balasan dikirimkan ke nomor WhatsApp Pak Gunawan." },
      { nodeId: "bookingFlow", title: "Booking Flow", detail: "Intent booking terdeteksi true, status: proposed, waktu: besok 14:00 WIB." },
      { nodeId: "critique", title: "Evaluasi AI", detail: "Skor Overall: 9.3/10 (Relevan, grounded, nada profesional, likelihood konversi tinggi)." },
      { nodeId: "reflect", title: "Reflection Engine", detail: "Pelajaran: Cepat mengonfirmasi slot waktu spesifik sangat efektif untuk prospek level C-Level." },
      { nodeId: "longTermMemory", title: "LTM & Sync", detail: "Refleksi disimpan ke vector store. Lead diupdate ke tahap 'ready-to-close'." },
      { nodeId: "END", title: "Turn Selesai", detail: "State disimpan ke checkpoint Postgres. Siap untuk balasan berikutnya." },
    ],
  },
  {
    id: "objection-price",
    name: "Lead Warm: Keberatan Harga (Skor 58)",
    description: "Prospek tertarik namun merasa harga paket Pro agak tinggi dibanding solusi lain.",
    inboundMessage: "Fiturnya menarik kak, tapi harga paket Pro 1.5jt per bulan agak berat ya buat UKM saya. Ada diskon?",
    fromName: "Ibu Maya",
    score: 58,
    segment: "objection",
    steps: [
      { nodeId: "START", title: "Pesan Masuk", detail: "Pesan dari Ibu Maya diterima melalui webhook." },
      { nodeId: "triageMessage", title: "AI Triage", detail: "Terdeteksi manusia, intent: objection (pricing), sentiment: neutral." },
      { nodeId: "rag", title: "RAG Retrieval", detail: "Mengambil dokumen FAQ perbandingan harga, perhitungan ROI efisiensi CS, dan opsi termin." },
      { nodeId: "leadScoring", title: "Lead Scoring", detail: "Skor 58 (ada minat tapi ada sinyal keberatan harga). Masuk segmen Objection (40-74)." },
      { nodeId: "objection", title: "Strategi Objection", detail: "Validasi anggaran UKM, reframe ke ROI (menggantikan 2 admin CS manual), tawarkan paket Starter." },
      { nodeId: "responseGeneration", title: "Generasi Balasan", detail: "DeepSeek merangkai balasan empati: menunjukkan simulasi hemat biaya dan opsi cicilan tahunan." },
      { nodeId: "dispatch", title: "WhatsApp Dispatch", detail: "Balasan dikirimkan via WhatsApp transport." },
      { nodeId: "bookingFlow", title: "Booking Flow", detail: "Belum ada booking langsung, flow follow-up diaktifkan." },
      { nodeId: "critique", title: "Evaluasi AI", detail: "Skor Overall: 8.6/10 (Penanganan keberatan terstruktur dan tidak defensif)." },
      { nodeId: "reflect", title: "Reflection Engine", detail: "Pelajaran: Membandingkan biaya paket dengan gaji staf riil mempercepat penerimaan harga." },
      { nodeId: "longTermMemory", title: "LTM & Sync", detail: "Memori disimpan. Lead dicatat di tahap 'objection-handling'." },
      { nodeId: "END", title: "Turn Selesai", detail: "State disimpan ke database checkpoint." },
    ],
  },
  {
    id: "nurture-greeting",
    name: "Lead Cold: Sapaan Awal (Skor 25)",
    description: "Prospek baru pertama kali menghubungi dan hanya menyapa singkat.",
    inboundMessage: "Halo selamat siang",
    fromName: "Budi",
    score: 25,
    segment: "nurture",
    steps: [
      { nodeId: "START", title: "Pesan Masuk", detail: "Pesan masuk sapaan sederhana dari Mas Budi." },
      { nodeId: "triageMessage", title: "AI Triage", detail: "Manusia, intent: greeting, urgency: low." },
      { nodeId: "rag", title: "RAG Retrieval", detail: "Mengambil ringkasan value proposition layanan dan katalog produk umum." },
      { nodeId: "leadScoring", title: "Lead Scoring", detail: "Skor 25 (hanya sapaan, belum ada kebutuhan spesifik). Masuk segmen Nurture (<40)." },
      { nodeId: "nurture", title: "Strategi Nurture", detail: "Fokus ramah: sambut hangat, perkenalkan diri, tanyakan kebutuhan bisnisnya tanpa jualan langsung." },
      { nodeId: "responseGeneration", title: "Generasi Balasan", detail: "DeepSeek menyapa hangat dan menanyakan sektor bisnis Mas Budi." },
      { nodeId: "dispatch", title: "WhatsApp Dispatch", detail: "Pesan terkirim ke WhatsApp." },
      { nodeId: "bookingFlow", title: "Booking Flow", detail: "Tidak ada indikasi booking." },
      { nodeId: "critique", title: "Evaluasi AI", detail: "Skor Overall: 8.1/10 (Sopan, natural, ramah untuk interaksi awal)." },
      { nodeId: "reflect", title: "Reflection Engine", detail: "Pelajaran: Pada sapaan awal, 1 pertanyaan terbuka cukup agar prospek tidak merasa diinterogasi." },
      { nodeId: "longTermMemory", title: "LTM & Sync", detail: "Status lead disimpan dengan stage 'nurturing'." },
      { nodeId: "END", title: "Turn Selesai", detail: "State disimpan ke checkpoint." },
    ],
  },
  {
    id: "bot-filter",
    name: "Bot Spam / OTP: Filter Terminal",
    inboundMessage: "Pemberitahuan: Pesan ini dikirim secara otomatis. Jangan balas pesan ini. Kode OTP Anda: 772918.",
    fromName: "Sistem Otomatis",
    score: 0,
    segment: "filter",
    description: "Pesan otomatis atau OTP yang terdeteksi dan dihentikan di awal.",
    steps: [
      { nodeId: "START", title: "Pesan Masuk", detail: "Pesan broadcast/notifikasi masuk ke webhook." },
      { nodeId: "triageMessage", title: "AI Triage", detail: "Regex match: /pesan otomatis/, /jangan balas/, /otp/. Status isBot = true." },
      { nodeId: "filter", title: "Bot Filter", detail: "Pesan langsung dialihkan ke node filter. Pesan dibuang tanpa balasan." },
      { nodeId: "END", title: "Terminal Langsung", detail: "Alur berakhir. Nol token LLM digunakan. Kuota aman." },
    ],
  },
  {
    id: "self-improvement-loop",
    name: "Self-Improvement: Draf Kurang Baik (< 5)",
    description: "Evaluasi mendeteksi draf pertama kurang relevan, memicu loop re-enter RAG untuk merevisi draf.",
    inboundMessage: "Saya mau integrasikan webhook sales ini ke SAP internal kami via gRPC, bisa?",
    fromName: "Pak Rian (IT)",
    score: 65,
    segment: "objection",
    steps: [
      { nodeId: "START", title: "Pesan Masuk", detail: "Pertanyaan teknis rumit mengenai integrasi gRPC SAP." },
      { nodeId: "triageMessage", title: "AI Triage", detail: "Manusia, intent: question (technical)." },
      { nodeId: "rag", title: "RAG Retrieval (Pass 1)", detail: "Retrieval awal hanya menemukan info REST API umum." },
      { nodeId: "leadScoring", title: "Lead Scoring", detail: "Skor 65 (Objection stage)." },
      { nodeId: "objection", title: "Strategi", detail: "Tangani aspek teknis integrasi." },
      { nodeId: "responseGeneration", title: "Generasi Balasan", detail: "Draf dibuat namun kurang akurat mengenai dukungan gRPC." },
      { nodeId: "dispatch", title: "WhatsApp Dispatch", detail: "Pesan ditahan / DRY_RUN." },
      { nodeId: "bookingFlow", title: "Booking Flow", detail: "Tawaran konsultasi teknis." },
      { nodeId: "critique", title: "Evaluasi AI (Ketat)", detail: "Skor Overall: 4.2/10 (Groundedness rendah: gRPC tidak didukung secara native tanpa adapter)." },
      { nodeId: "reflect", title: "Reflection Engine", detail: "Mencatat kelemahan draf dan panduan penegasan arsitektur REST/Webhook." },
      { nodeId: "longTermMemory", title: "Loop Triggered!", detail: "Skor < 5 memicu reenterForImprovement = true. State diarahkan kembali ke node RAG!" },
      { nodeId: "rag", title: "RAG (Pass 2 - Revisi)", detail: "Membaca memori refleksi turn sebelumnya, menghasilkan draf revisi yang akurat!" },
      { nodeId: "END", title: "Turn Selesai", detail: "Draf berhasil diperbaiki secara otonom sebelum siklus ditutup." },
    ],
  },
];
