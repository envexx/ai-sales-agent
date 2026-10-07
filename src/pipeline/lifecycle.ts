import { loggerFor } from "../config/logger.js";
import { setLeadReadiness, setOutreachStatus } from "../repository/index.js";
import { updateProject } from "./entities.js";
import { emitEvent } from "./events.js";

const log = loggerFor("pipeline:lifecycle");

/** Status kesiapan lead (gate Sales/outreach) — lihat docs/FLOW.md. */
export const LEAD_READINESS = [
  "discovered",
  "scouted_ready",
  "in_sales",
  "won",
  "lost",
  "nurture",
] as const;
export type LeadReadiness = (typeof LEAD_READINESS)[number];

/** Tahap proyek (gate owner/QA) — lihat docs/FLOW.md. */
export const PROJECT_STAGES = [
  "scoping",
  "preview",
  "done_review",
  "done",
  "delivered",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/**
 * Scout selesai → lead siap dikerjakan Sales/outreach.
 * Gate: outreach hanya mengambil lead `scouted_ready`.
 */
export async function markLeadScoutedReady(leadId: string): Promise<void> {
  await setLeadReadiness(leadId, "scouted_ready");
  await setOutreachStatus({
    leadId,
    status: "pending",
    nextFollowUpAt: new Date().toISOString(),
  });
  await emitEvent("lead.scouted_ready", { entityType: "lead", entityId: leadId });
  log.info({ leadId }, "lead siap (scouted_ready)");
}

/** Ubah tahap proyek mengikuti lifecycle F0.1. */
export async function setProjectStage(
  projectId: string,
  stage: ProjectStage,
): Promise<void> {
  await updateProject({ id: projectId, stage });
  await emitEvent("project.stage", {
    entityType: "project",
    entityId: projectId,
    payload: { stage },
  });
  log.info({ projectId, stage }, "tahap proyek berubah");
}

/** Set lead masuk tahap Sales (setelah mulai dikerjakan). */
export async function markLeadInSales(leadId: string): Promise<void> {
  await setLeadReadiness(leadId, "in_sales");
  await emitEvent("lead.in_sales", { entityType: "lead", entityId: leadId });
}
