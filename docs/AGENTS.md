# Daftar Agent (Roster)

Semua agent sistem, divisi, pemicu, dan statusnya. **1 Supervisor + 11 worker** (12 agent).
Modul mengikuti pola: `src/<kode>/` + entri `registerJobHandler` di
`src/pipeline/handlers/index.ts` + endpoint API.
Beberapa agent menggabungkan dua peran: **Research & Scout** (cari + audit) dan
**QA & Documentation** (uji + SOP). Desain divisi Developer (Internal/External): `docs/DEVELOPER.md`.

## D0 · Command Center

| Agent | Modul | Pemicu | Status |
| --- | --- | --- | --- |
| Supervisor | `src/supervisor/` | turn + job | ✅ routing, briefing, penasihat, perintah owner, approval, **tinjauan V2** |

## D1 · Growth & Acquisition

| Agent | Modul | Pemicu | Status |
| --- | --- | --- | --- |
| Research & Scout | `src/prospecting/`, `src/scout/`, `src/integrations/maps.ts` | job `prospecting.scan` → `scout.audit` (event `prospect.discovered`) | ✅ |
| Sales / Outreach | `src/graph/`, `src/outreach/` | turn + scheduler | ✅ |

## D2 · Deal Desk

| Agent | Modul | Pemicu | Status |
| --- | --- | --- | --- |
| Scoper & PRD Builder | `src/scoper/` | job `scoper.prd` (booking confirmed) | ✅ |
| Legal & Finance | `src/legal/` | job `legal.draft` | ✅ |
| Intake & Credential | `src/intake/`, `src/util/crypto.ts` | job `intake.collect` (event `invoice.dp_paid`) | ✅ |

## D3 · Delivery & Quality

| Agent | Modul | Pemicu | Status |
| --- | --- | --- | --- |
| QA & Documentation | `src/qa/`, `src/scribe/` | job `qa.run` → (lulus) `scribe.docs` | ✅ |

## D4 · Client Success & Developer

| Agent | Modul | Pemicu | Status |
| --- | --- | --- | --- |
| Handover & Final Invoice | `src/handover/` | job `handover.finalize` (event `docs.ready`) | ✅ |
| L1 Support & Triage | `src/support/` | API `/support` / job `support.triage` | ✅ |
| Infra & Cost Monitor | `src/monitor/` | job `monitor.check` (harian) | ✅ |
| Developer & Automation | `src/developer/`, `src/integrations/opencode|github|devplatforms.ts` | job `developer.maintain` (event `invoice.final_paid`) / `developer.build` / `developer.sweep` | ✅ |

## D5 · Brand & Flywheel

| Agent | Modul | Pemicu | Status |
| --- | --- | --- | --- |
| Case Study & Content | `src/content/` | job `content.case_study` (event `invoice.final_paid`) | ✅ |

## Rantai otomatis (end-to-end)

```
chat/API ──► prospecting.scan ──► scout.audit
                                   │
deal won ─► scoper.prd ─► legal.draft ─► (dp paid) intake.collect
█ Anda membangun dari PRD + kredensial █
built ─► qa.run ─► (lulus) scribe.docs ─► handover.finalize
(final paid) ─► content.case_study + developer.maintain
content.case_study ─► knowledge base ─► dipakai Sales (RAG) & Scout  (flywheel)
harian ─► briefing + monitor.check + developer.sweep
```

> Pemicu "built" (titik kerja Anda): perintah owner `BUILT <projectId> [webhookUrl]`
> atau `POST /projects/:id/built`. Setelah itu QA berjalan otomatis; bila **lulus**,
> Scribe → Handover berantai sendiri.

## Layanan bersama

| Layanan | Modul |
| --- | --- |
| Job queue + scheduler + events + approvals | `src/pipeline/` |
| Notifikasi owner (WhatsApp) | `src/notifications/` |
| Konteks proyek bersama | `src/pipeline/projectContext.ts` |
| Vault kredensial (AES-256-GCM) | `src/util/crypto.ts` |

## Endpoint ringkas

| Agent | Endpoint |
| --- | --- |
| Prospecting | `POST /prospecting` |
| Scoper | `POST /scoper`, `GET /projects` |
| Legal | `POST /legal`, `GET /invoices`, `POST /projects/:id/dp-paid` |
| Intake | `POST /intake/:projectId`, `GET|POST /projects/:id/credentials` |
| QA | `POST /qa/:projectId` |
| Scribe | `POST /scribe/:projectId` |
| Handover | `POST /handover/:projectId` |
| Support | `POST /support`, `GET /tickets` |
| Monitor | `POST /monitor/check` |
| Developer | `POST /developer/:projectId` (maintain) · `POST /developer/build` · `POST /developer/apply` · `GET /developer/targets` · `GET /developer/platforms` |
| Content | `POST /content/:projectId` |
| Knowledge | `GET /knowledge` (`?source=case_study`) |
| Pipeline | `GET /pipeline/jobs`, `POST /pipeline/tick`, `GET /pipeline/events` |

> Catatan: tiap agent dibuat sebagai modul mandiri dengan handler + event. Kita
> akan menyusun/menyempurnakan integrasinya satu per satu (mis. trigger
> "system built" untuk QA, pengambilan ulasan untuk Scout, PDF untuk dokumen).
