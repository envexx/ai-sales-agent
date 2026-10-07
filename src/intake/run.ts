import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { structuredInvoke } from "../llm/index.js";
import { notifyOwner } from "../notifications/index.js";
import { emitEvent } from "../pipeline/events.js";
import { clientLabel, loadProjectContext } from "../pipeline/projectContext.js";
import {
  createIntakeLink,
  listCredentials,
  saveCredential,
  updateProject,
} from "../pipeline/entities.js";
import { setProjectStage } from "../pipeline/lifecycle.js";

const log = loggerFor("intake");

const IntakeSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string(),
        category: z.string(),
        purpose: z.string(),
        required: z.boolean(),
      }),
    )
    .max(25),
});

export interface IntakeResult {
  projectId: string;
  token: string;
  url: string;
  expiresAt: string;
  items: z.infer<typeof IntakeSchema>["items"];
  formPath: string;
}

/**
 * Intake & Credential Collector (F2).
 *
 * Dipicu `invoice.dp_paid`. Menyusun daftar akses yang dibutuhkan (dari PRD),
 * membuat formulir intake, dan menyediakan penyimpanan kredensial terenkripsi.
 */
export async function runIntake(projectId: string): Promise<IntakeResult> {
  if (!env.INTAKE_ENABLED) throw new Error("Intake nonaktif (INTAKE_ENABLED=false)");
  const ctx = await loadProjectContext(projectId);

  const prd = ctx.prd;
  const human = [
    `Klien: ${clientLabel(ctx)}`,
    `Proyek: ${ctx.project.title}`,
    prd
      ? `Ruang lingkup: ${prd.scope.inScope.join("; ")}\nIntegrasi: ${prd.integrations
          .map((i) => `${i.name} (${i.type})`)
          .join("; ")}`
      : "PRD belum tersedia.",
    "Susun daftar akses/kredensial yang dibutuhkan untuk mulai mengerjakan proyek (mis. API key WhatsApp, akses Google Workspace, kredensial CRM, webhook secret, akses hosting).",
  ].join("\n\n");

  const plan = await structuredInvoke({
    schema: IntakeSchema,
    system:
      "Kamu menyusun checklist intake akses/kredensial yang dibutuhkan dari klien untuk memulai proyek integrasi/otomasi. " +
      "Konkret, tidak berlebihan, dan utamakan yang benar-benar diperlukan. category: mis. messaging|cloud|database|payment|crm|hosting|other.",
    human,
    name: "IntakePlan",
    temperature: 0.2,
  });

  const dir = resolve(ctx.dir, "intake");
  await mkdir(dir, { recursive: true });
  const formPath = resolve(dir, "INTAKE.md");

  // Link aman (token + expiry) untuk pengumpulan kredensial (F0.6).
  const link = await createIntakeLink({
    projectId,
    items: plan.items,
    ttlHours: env.INTAKE_LINK_TTL_HOURS,
  });
  const base = env.PUBLIC_BASE_URL || `http://localhost:${env.PORT}`;
  const url = `${base}/intake/${link.token}`;

  await writeFile(
    formPath,
    [
      `# Formulir Intake Akses — ${ctx.project.title}`,
      "",
      `Klien: ${clientLabel(ctx)}`,
      `Link aman: ${url}`,
      `Kedaluwarsa: ${link.expiresAt}`,
      "",
      "Mohon lengkapi akses berikut. Kredensial disimpan terenkripsi dan hanya dipakai untuk proyek ini.",
      "",
      ...plan.items.map(
        (i) => `- [${i.required ? "x" : " "}] **${i.name}** (${i.category}) — ${i.purpose}`,
      ),
      "",
      "> Nilai rahasia HANYA boleh diisi lewat link aman di atas (tidak disimpan di file ini).",
      "",
    ].join("\n"),
    "utf8",
  );

  await updateProject({
    id: projectId,
    meta: {
      intake: {
        token: link.token,
        url,
        formPath,
        items: plan.items.length,
        expiresAt: link.expiresAt,
        requestedAt: new Date().toISOString(),
      },
    },
  });
  await emitEvent("intake.requested", {
    entityType: "project",
    entityId: projectId,
    payload: { items: plan.items.length, token: link.token },
  });
  await notifyOwner({
    title: `Intake akses diminta: ${ctx.project.title}`,
    body: `${plan.items.length} item akses.\nLink aman (kedaluwarsa ${link.expiresAt}):\n${url}`,
  });

  log.info({ projectId, items: plan.items.length }, "intake dibuat");
  return {
    projectId,
    token: link.token,
    url,
    expiresAt: link.expiresAt,
    items: plan.items,
    formPath,
  };
}

/** Simpan satu kredensial (terenkripsi) ke vault. */
export async function collectCredential(params: {
  projectId: string;
  name: string;
  value: string;
  hint?: string;
}): Promise<string> {
  const ctx = await loadProjectContext(params.projectId);
  const id = await saveCredential({
    projectId: params.projectId,
    clientId: ctx.client?.id ?? null,
    name: params.name,
    value: params.value,
    hint: params.hint ?? null,
  });
  await emitEvent("credential.stored", {
    entityType: "project",
    entityId: params.projectId,
    payload: { name: params.name, credentialId: id },
  });
  // Gate flow: kredensial mulai terkumpul → proyek masuk status PREVIEW
  // (menunggu owner meninjau PRD + kredensial lalu membangun).
  await setProjectStage(params.projectId, "preview");
  log.info({ projectId: params.projectId, name: params.name }, "kredensial disimpan");
  return id;
}

export { listCredentials };
