# Supervisor Agent

Dokumen ini menjelaskan **Agent Supervisor** — orchestrator yang berada di atas
agent worker (saat ini hanya **Sales Agent / Nadia**).

## Kenapa ada supervisor?

Sebelumnya setiap pesan WhatsApp masuk langsung ke graph Sales. Sekarang semua
pesan masuk lewat supervisor terlebih dahulu, sehingga menambah kemampuan baru
(mis. Customer Support, FAQ, Billing) cukup dengan menambah **1 agent worker +
1 cabang routing** — tanpa menyentuh pipeline Sales.

```
WhatsApp / API Turn
        │
        ▼
  ┌───────────────┐
  │  Supervisor   │  pilih agent (heuristik → LLM → default)
  └───────┬───────┘
          │ agent: "sales"
          ▼
  ┌───────────────┐
  │ Sales Agent   │  graph 14 node (triage → … → long-term memory)
  └───────────────┘
```

## Struktur file

```
src/supervisor/
  agents.ts             # registry agent + tipe AgentName / AgentResult
  state.ts              # SupervisorState (Annotation.Root)
  prompts.ts            # prompt routing supervisor
  nodes/
    supervisor.ts       # keputusan routing (heuristik → LLM → default)
    sales.ts            # worker adapter → memanggil graph Sales
  index.ts              # build graph + conditional edges + SUPERVISOR_MERMAID
  run.ts                # handleSupervisorTurn() — entry point satu turn
  review.ts             # runSupervisorReview() — tinjauan V2 (saran/kritik + usulan)
  advisor.ts            # adviseSupervisor() — chat penasihat owner
  report.ts             # buildSupervisorReport() — laporan & anomali per agent
```

Refaktor pendukung di `src/graph/run.ts`:

| Fungsi | Peran |
| --- | --- |
| `prepareInboundTurn(turn)` | Langkah bersama: resolve lead, catat pesan, deteksi opt-out |
| `runSalesAgent(turn)` | Jalankan graph Sales untuk turn yang sudah disiapkan (worker) |
| `handleInboundTurn(turn)` | Entry point langsung tanpa supervisor (tetap dipertahankan) |

Dengan pemisahan ini, supervisor dan pemanggil langsung **berbagi langkah yang
sama** sehingga tidak ada pencatatan lead/pesan yang ganda.

## Cara supervisor memilih agent

`supervisorNode` memutuskan dengan urutan berikut (fail-open):

1. **Heuristik** — kata kunci yang jelas mengarah ke Sales (mis. "harga",
   "demo", "integrasi") langsung memilih agent Sales. Menghemat satu panggilan
   LLM.
2. **LLM** — jika ambigu dan ada lebih dari satu agent, LLM memilih agent dari
   daftar di `agents.ts` (structured output, `temperature: 0`).
3. **Default** — bila ragu atau LLM gagal, pesan jatuh ke `DEFAULT_AGENT`
   (Sales) agar prospek tidak pernah hilang.

> Selama baru ada satu agent, langkah LLM dilewati (tidak perlu memilih).
> Set `SUPERVISOR_FORCE_LLM=true` untuk memaksa LLM tetap dipanggil — berguna
> saat menguji jalur routing sebelum agent kedua dibuat.

## Menambah agent baru

Contoh menambahkan **Support Agent**:

1. **Daftarkan agent** di `src/supervisor/agents.ts`:

   ```ts
   export const AGENT_NAMES = ["sales", "support"] as const;

   export const AGENTS: readonly AgentDefinition[] = [
     /* …sales… */
     {
       name: "support",
       title: "Support Agent",
       description: "Menangani pertanyaan teknis purnajual dan keluhan.",
     },
   ];
   ```

2. **Buat node worker** di `src/supervisor/nodes/support.ts` (contoh: memanggil
   graph/fungsi agent Support milik Anda, lalu kembalikan `reply`,
   `agentResult`, `trace`, `errors`).

3. **Daftarkan node + cabang routing** di `src/supervisor/index.ts`:

   ```ts
   .addNode("support", supportAgentNode)
   .addConditionalEdges("supervisor", routeToAgent, {
     sales: "sales",
     support: "support",
   })
   .addEdge("support", END)
   ```

Setelah itu supervisor otomatis mempertimbangkan agent baru (heuristik + LLM).

## State supervisor

`SupervisorState` bersifat **stateless** (tanpa checkpointer). Supervisor hanya
memilih agent untuk turn saat ini; memori percakapan tetap dimiliki masing-masing
agent (graph Sales sudah menyimpannya per `thread_id`).

| Field | Isi |
| --- | --- |
| `threadId`, `leadId`, `waJid`, `contactName`, `inboundMessage`, `receivedAt`, `messageId` | Identitas turn |
| `activeAgent`, `routeReason`, `routeConfidence` | Keputusan routing |
| `agentResult` | `{ agent, reply, metadata }` hasil worker |
| `reply`, `filtered` | Permukaan balasan |
| `trace`, `errors` | Observability |

## Endpoint

| Method | Path | Fungsi |
| --- | --- | --- |
| `GET` | `/agents` | Daftar agent yang terdaftar |
| `GET` | `/supervisor/mermaid` | Diagram arsitektur supervisor |

Respons `POST /simulate` dan `POST /webhook/whatsapp` kini menyertakan field
`agent` (agent terpilih) dan `routeReason` (alasan routing).

---

## Supervisor V2 (diterapkan)

Fokus V2: Supervisor bukan hanya pelapor, tetapi **penanggung jawab alur kerja**
seluruh agent — memantau, menilai, mengusulkan, dan menjaga koordinasi.

### Tugas
1. **Memantau** semua alur kerja agent sesuai keinginan owner & bisnis.
2. **Memberikan saran & kritik** kepada setiap agent untuk perbaikan.
3. **Mengusulkan** perbaikan/pembaruan/penambahan (fitur atau teknologi) kepada
   owner dengan **Tujuan** & **Dampak** yang jelas.
4. **Memastikan** alur kerja & jalur koordinasi antar-agent tetap terstruktur.
5. **Melaporkan** secara jelas, tidak ambigu, bahasa mudah, sedikit istilah teknis.

### Implementasi
- **Prompt penasihat** (`src/supervisor/advisor.ts`) memuat tugas V2 — berlaku untuk
  chat owner via dashboard (`/supervisor`) maupun WhatsApp.
- **Job `supervisor.review`** (harian 08:00, bersama briefing) → `runSupervisorReview()`
  (`src/supervisor/review.ts`):
  1. Membangun konteks: aktivitas agent 24 jam, tren 14 hari, kendala/anomali,
     jalur handoff (`AGENT_HANDOFFS`), dan profil/tujuan owner.
  2. LLM (structured) menghasilkan: `ringkasan` awam, `perAgent` (penilaian + saran +
     kritik tiap agent), `usulan` (kategori: `perbaikan`/`fitur`/`teknologi`/`koordinasi`,
     dengan **Tujuan** & **Dampak**), dan `koordinasi`.
  3. Saran per-agent (yang perlu perhatian) & usulan disimpan ke `agent_improvements`
     (`kind='suggestion'`, `status='proposed'`) **dengan dedup** → tampil & bisa
     disetujui di halaman **Pertumbuhan / Approvals**.
  4. Ringkasan dikirim ke owner via `notifyOwner()` (WhatsApp/Telegram).
- **Event**: `supervisor.review`.

### Alur singkat
```
harian 08:00 → briefing
             └─ supervisor.review → runSupervisorReview()
                  ├─ saran/kritik per agent → agent_improvements (proposed)
                  ├─ usulan perbaikan/fitur/teknologi (Tujuan+Dampak) → owner
                  └─ catatan koordinasi alur kerja → laporan owner
```
