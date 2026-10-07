import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../config/env.js";
import { loggerFor } from "../config/logger.js";
import { developerPlatforms, vercelTriggerDeploy } from "../integrations/devplatforms.js";
import {
  ensureRepo,
  ghPrCreate,
  ghSetupGit,
  gitBranchBackup,
  gitChangedFiles,
  gitCheckout,
  gitCommitAll,
  gitCreateBranch,
  gitCurrentBranch,
  gitDiffStat,
  gitHasChanges,
  gitIsRepo,
  gitMerge,
  gitPush,
  gitResetHard,
  gitRevertAll,
} from "../integrations/github.js";
import { opencodeRun } from "../integrations/opencode.js";
import { notifyOwner } from "../notifications/index.js";
import { requestApproval } from "../pipeline/approvals.js";
import { updateProject } from "../pipeline/entities.js";
import { emitEvent } from "../pipeline/events.js";
import { enqueueJob } from "../pipeline/repository.js";
import { clientLabel, loadProjectContext, type ProjectContext } from "../pipeline/projectContext.js";
import { buildDevPlan, renderDevPlanMarkdown } from "./plan.js";
import { checkScope, describeScope } from "./guardrails.js";
import { restartPm2App, runTypecheck } from "./shell.js";
import {
  createDevTarget,
  findDevTargetByProject,
  getDevTarget,
  listDevTargets,
  updateDevTarget,
} from "./repository.js";
import type { DevPlan, DevSignals, DevTargetRecord } from "./types.js";

const log = loggerFor("developer");

/* ───────────────────────────── workspace ─────────────────────────── */

function targetWorkspace(targetId: string): string {
  return resolve(process.cwd(), env.DEVELOPER_WORKSPACE_DIR, targetId);
}

async function ensureTargetForProject(projectId: string): Promise<{
  target: DevTargetRecord;
  ctx: ProjectContext;
}> {
  const ctx = await loadProjectContext(projectId);
  const existing = await findDevTargetByProject(projectId);
  if (existing) return { target: existing, ctx };

  const meta = ctx.project.meta as Record<string, unknown>;
  const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const target = await createDevTarget({
    projectId,
    clientId: ctx.project.clientId,
    kind: "site",
    name: ctx.project.title,
    repoUrl: asString(meta.repoUrl),
    liveUrl: asString(meta.liveUrl) ?? asString(meta.url),
    platform: asString(meta.platform),
    meta: { createdFrom: "project" },
  });
  await emitEvent("developer.target_registered", {
    entityType: "project",
    entityId: projectId,
    payload: { targetId: target.id, name: target.name },
  });
  return { target, ctx };
}

/** Target internal (repo/sistem kita) untuk pekerjaan internal Developer. */
export async function ensureInternalTarget(): Promise<DevTargetRecord> {
  const targets = await listDevTargets();
  const existing = targets.find((t) => t.kind === "internal" && t.status !== "archived");
  if (existing) return existing;

  const target = await createDevTarget({
    kind: "internal",
    name: "Sistem Internal (AI Sales & Operations Agent)",
    repoUrl: env.DEVELOPER_INTERNAL_REPO || null,
    localPath: env.DEVELOPER_INTERNAL_LOCAL || process.cwd(),
    meta: { scope: "internal" },
  });
  await emitEvent("developer.target_registered", {
    entityType: "dev_target",
    entityId: target.id,
    payload: { targetId: target.id, kind: "internal" },
  });
  log.info({ targetId: target.id }, "target internal developer dibuat");
  return target;
}

const isInternalTarget = (t: DevTargetRecord): boolean => t.kind === "internal";

/* ─────────────────────────────── audit ──────────────────────────── */

async function fetchText(
  url: string,
  timeoutMs = 10_000,
): Promise<{ status: number; text: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "CoreSolution-Developer/1.0" },
    });
    const text = await res.text();
    return { status: res.status, text: text.slice(0, 200_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
}

function pickMetaDescription(html: string): string | null {
  const tag = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim() || null;
}

/** Kumpulkan sinyal teknis target (situs + platform) untuk bahan rencana. */
export async function auditTarget(target: DevTargetRecord): Promise<DevSignals> {
  const platforms = (await developerPlatforms()).map((p) => ({
    id: p.id,
    configured: p.configured,
    detail: p.detail,
  }));

  const signals: DevSignals = {
    liveUrl: target.liveUrl,
    httpStatus: null,
    title: null,
    metaDescription: null,
    hasSitemap: null,
    hasRobots: null,
    repo: target.repoUrl ? { url: target.repoUrl } : null,
    platforms,
    notes: [],
  };

  if (target.liveUrl) {
    const page = await fetchText(target.liveUrl);
    if (page) {
      signals.httpStatus = page.status;
      signals.title = pickTitle(page.text);
      signals.metaDescription = pickMetaDescription(page.text);
      if (page.status >= 400) signals.notes.push(`Halaman utama mengembalikan HTTP ${page.status}.`);
      if (!signals.title) signals.notes.push("Judul halaman (title) tidak ditemukan/invalid.");
      if (!signals.metaDescription) signals.notes.push("Meta description tidak ditemukan.");
      if (!target.liveUrl.startsWith("https://")) signals.notes.push("Situs belum memakai HTTPS.");

      const base = new URL(target.liveUrl);
      const sitemap = await fetchText(new URL("/sitemap.xml", base).toString(), 8000);
      signals.hasSitemap = sitemap ? sitemap.status < 400 : null;
      if (signals.hasSitemap === false) signals.notes.push("sitemap.xml tidak ditemukan (detectability mesin pencari).");

      const robots = await fetchText(new URL("/robots.txt", base).toString(), 8000);
      signals.hasRobots = robots ? robots.status < 400 : null;
      if (signals.hasRobots === false) signals.notes.push("robots.txt tidak ditemukan.");
    } else {
      signals.notes.push("Situs tidak dapat diakses saat audit.");
    }
  } else {
    signals.notes.push("URL situs belum diisi pada target.");
  }

  if (!target.repoUrl) signals.notes.push("Repo GitHub belum terhubung ke target.");
  return signals;
}

/* ─────────────────────────── maintain / build ───────────────────── */

export interface DeveloperMaintainResult {
  projectId: string;
  targetId: string;
  planPath: string;
  plan: DevPlan;
  approvalId: string;
}

/**
 * **Maintain** — audit situs/repo terpasang, susun rencana perbaikan
 * (SEO/detectability, performa, keamanan), lalu minta persetujuan owner sebelum
 * eksekusi lewat OpenCode. Menggantikan peran *Retainer* lama.
 */
export async function runDeveloperMaintain(
  projectId: string,
  opts: { mode?: "maintain" } = {},
): Promise<DeveloperMaintainResult> {
  if (!env.DEVELOPER_ENABLED) throw new Error("Developer nonaktif (DEVELOPER_ENABLED=false)");
  const { target, ctx } = await ensureTargetForProject(projectId);

  const signals = await auditTarget(target);
  const plan = await buildDevPlan({ mode: "maintain", target, signals });

  const dir = resolve(ctx.dir, "developer");
  await mkdir(dir, { recursive: true });
  const planPath = resolve(dir, "PLAN.md");
  await writeFile(
    planPath,
    renderDevPlanMarkdown({ mode: "maintain", target, plan }),
    "utf8",
  );

  await updateDevTarget({
    id: target.id,
    lastAuditAt: new Date().toISOString(),
    meta: { lastPlanPath: planPath },
  });
  await updateProject({
    id: projectId,
    meta: { developer: { targetId: target.id, planPath, at: new Date().toISOString() } },
  });
  await emitEvent("developer.plan_ready", {
    entityType: "project",
    entityId: projectId,
    payload: { targetId: target.id, planPath, mode: "maintain", items: plan.items.length },
  });

  const approval = await requestApproval({
    kind: "developer.apply",
    title: `Jalankan perbaikan developer: ${target.name}`,
    summary: `${plan.summary}\nItem: ${plan.items.length} · ${plan.items.map((i) => i.area).join(", ")}`,
    payload: { targetId: target.id, projectId, planPath, mode: opts.mode ?? "maintain" },
    requestedBy: "developer",
  });

  await notifyOwner({
    title: `Rencana developer siap: ${ctx.project.title}`,
    body: [
      `${plan.items.length} langkah · klien ${clientLabel(ctx)}`,
      `File: ${planPath}`,
      `Persetujuan: ${approval.id.slice(0, 8).toUpperCase()}`,
    ].join("\n"),
  });

  log.info({ projectId, targetId: target.id, items: plan.items.length }, "rencana maintain siap");
  return { projectId, targetId: target.id, planPath, plan, approvalId: approval.id };
}

export interface DeveloperBuildResult {
  targetId: string;
  planPath: string;
  plan: DevPlan;
  approvalId: string | null;
  enqueuedApply: boolean;
}

/**
 * **Build** — menyusun rencana lalu mengeksekusi.
 *
 * - **Internal** (default sekarang): full-auto — rencana disusun lalu eksekusi
 *   langsung dijadwalkan (persetujuan manusia sudah terjadi di kanal Pertumbuhan/
 *   Supervisor). Guardrail tetap ditegakkan saat eksekusi.
 * - **Client**: rencana disusun, lalu menunggu persetujuan owner.
 */
export async function runDeveloperBuild(params: {
  title: string;
  brief: string;
  projectId?: string;
  targetId?: string;
  repoUrl?: string;
  scope?: "internal" | "client";
}): Promise<DeveloperBuildResult> {
  if (!env.DEVELOPER_ENABLED) throw new Error("Developer nonaktif (DEVELOPER_ENABLED=false)");

  let target: DevTargetRecord;
  let ctx: ProjectContext | null = null;
  if (params.targetId) {
    const found = await getDevTarget(params.targetId);
    if (!found) throw new Error(`target developer ${params.targetId} tidak ditemukan`);
    target = found;
  } else if (params.projectId) {
    const ensured = await ensureTargetForProject(params.projectId);
    target = ensured.target;
    ctx = ensured.ctx;
  } else if (params.scope === "client") {
    target = await createDevTarget({
      kind: "automation",
      name: params.title,
      repoUrl: params.repoUrl ?? null,
      localPath: targetWorkspace("pending"),
      meta: { createdFrom: "owner-task" },
    });
  } else {
    // Default: internal (fokus saat ini).
    target = await ensureInternalTarget();
  }

  const internal = isInternalTarget(target);
  const signals = await auditTarget(target);
  const plan = await buildDevPlan({ mode: "build", target, signals, brief: params.brief });

  const baseDir = internal ? targetWorkspace(target.id) : ctx ? resolve(ctx.dir, "developer") : targetWorkspace(target.id);
  await mkdir(baseDir, { recursive: true });
  const planPath = resolve(baseDir, "PLAN.md");
  await writeFile(planPath, renderDevPlanMarkdown({ mode: "build", target, plan, brief: params.brief }), "utf8");

  await updateDevTarget({
    id: target.id,
    localPath: target.localPath ?? baseDir,
    meta: { lastPlanPath: planPath, brief: params.brief },
  });
  if (ctx) {
    await updateProject({
      id: ctx.project.id,
      meta: { developer: { targetId: target.id, planPath, mode: "build", at: new Date().toISOString() } },
    });
  }

  await emitEvent("developer.plan_ready", {
    entityType: ctx ? "project" : "dev_target",
    entityId: ctx ? ctx.project.id : target.id,
    payload: { targetId: target.id, planPath, mode: "build", items: plan.items.length, scope: internal ? "internal" : "client" },
  });

  if (internal) {
    // Full-auto: eksekusi langsung dijadwalkan.
    await enqueueJob({
      type: "developer.apply",
      payload: { targetId: target.id, planPath, mode: "build", internal: true },
    });
    await notifyOwner({
      title: `Developer internal mulai bekerja: ${target.name}`,
      body: `Rencana: ${planPath}\nEksekusi otomatis dijadwalkan (full-auto; guardrail ditegakkan).`,
    });
    log.info({ targetId: target.id, items: plan.items.length }, "rencana build internal siap → apply dijadwalkan");
    return { targetId: target.id, planPath, plan, approvalId: null, enqueuedApply: true };
  }

  const approval = await requestApproval({
    kind: "developer.apply",
    title: `Bangun otomasi/AI agent: ${target.name}`,
    summary: plan.summary,
    payload: { targetId: target.id, projectId: ctx?.project.id ?? null, planPath, mode: "build" },
    requestedBy: "developer",
  });

  await notifyOwner({
    title: `Rencana build siap: ${target.name}`,
    body: `File: ${planPath}\nPersetujuan: ${approval.id.slice(0, 8).toUpperCase()}`,
  });

  log.info({ targetId: target.id, items: plan.items.length }, "rencana build siap");
  return { targetId: target.id, planPath, plan, approvalId: approval.id, enqueuedApply: false };
}

/* ─────────────────────────── apply (OpenCode) ───────────────────── */

export interface DeveloperApplyResult {
  targetId: string;
  branch: string | null;
  prUrl: string | null;
  deployApprovalId: string | null;
  outputPreview: string;
}

function applyPrompt(params: {
  target: DevTargetRecord;
  mode: string;
  planText: string;
}): string {
  const { target, mode, planText } = params;
  return [
    `Kamu engineer untuk "${target.name}"${target.repoUrl ? ` (repo: ${target.repoUrl})` : ""}.`,
    `Mode: ${mode}. Kerjakan rencana berikut dengan mengubah kode di direktori kerja ini.`,
    "",
    "ATURAN:",
    "- Fokus pada perubahan kecil yang berdampak dan dapat diuji.",
    "- JANGAN menjalankan git commit/push/PR — tim kami yang melakukannya.",
    "- Bila ragu, tambahkan komentar/TODO singkat alih-alih mengubah banyak hal.",
    "",
    "RENCANA:",
    (planText || "(rencana tidak tersedia — lakukan audit singkat lalu perbaiki hal paling berdampak.)").slice(
      0,
      6000,
    ),
  ].join("\n");
}

async function readPlanText(target: DevTargetRecord, planPath?: string): Promise<string> {
  if (planPath) return readFile(planPath, "utf8").catch(() => "");
  if (typeof target.meta.lastPlanPath === "string") {
    return readFile(target.meta.lastPlanPath, "utf8").catch(() => "");
  }
  return "";
}

function internalApplyPrompt(target: DevTargetRecord, planText: string): string {
  return [
    `Kamu engineer INTERNAL untuk sistem "AI Sales & Operations Agent" (repo internal). Ubah KODE di direktori kerja ini sesuai rencana.`,
    "",
    "LARANGAN KERAS — JANGAN diubah:",
    "- src/developer/ (agent Developer sendiri)",
    "- src/supervisor/ dan src/monitor/ (hanya owner yang boleh)",
    "- .env (boleh DIBACA, jangan diubah), baileys_auth/, logs/, node_modules/, dist/, .git/",
    "Aturan lain:",
    "- Jangan mengubah tata letak folder.",
    "- Jangan menghapus data/database.",
    "- Perubahan kecil & teruji. Jangan jalankan git commit/push/PR (sistem yang melakukannya).",
    "",
    "RENCANA:",
    (planText || "(audit singkat lalu perbaiki hal paling berdampak)").slice(0, 6000),
  ].join("\n");
}

async function writeInternalDocs(
  dir: string,
  p: {
    target: DevTargetRecord;
    planText: string;
    files: string[];
    branch: string;
    baseBranch: string;
    backupBranch: string;
    sha: string;
  },
): Promise<void> {
  const { target, planText, files, branch, baseBranch, backupBranch, sha } = p;
  await writeFile(resolve(dir, "requirement.md"), `# Requirement — ${target.name}\n\n${planText || "(brief/rencana)"}\n`, "utf8");
  await writeFile(resolve(dir, "design.md"), `# Design — ${target.name}\n\n${planText || "(rencana)"}\n`, "utf8");
  await writeFile(
    resolve(dir, "task.md"),
    [
      `# Task — ${target.name}`,
      "",
      `- Status: selesai`,
      `- Branch: ${branch}`,
      `- Commit: ${sha}`,
      `- Merge ke: ${baseBranch}`,
      `- Backup (rollback): \`git reset --hard ${backupBranch}\``,
      "",
      "## File berubah",
      ...files.map((f) => `- [x] ${f}`),
      "",
    ].join("\n"),
    "utf8",
  );
}

/**
 * Apply **internal**: kerjakan di repo kita sendiri dengan guardrail (developer/
 * supervisor/monitor terlarang; Sales butuh approval), typecheck wajib lulus,
 * backup untuk rollback, lalu commit + merge (full-auto).
 */
async function runInternalApply(
  target: DevTargetRecord,
  payload: { planPath?: string; mode?: string; allowSalesApproved?: boolean },
): Promise<DeveloperApplyResult> {
  const repoDir = target.localPath || process.cwd();
  if (!(await gitIsRepo(repoDir))) throw new Error(`bukan git repo: ${repoDir}`);
  const workspace = targetWorkspace(target.id);
  await mkdir(workspace, { recursive: true });

  const baseBranch = await gitCurrentBranch(repoDir).catch(() => "main");
  const backupBranch = `backup/developer-${Date.now().toString(36)}`;
  await gitBranchBackup(repoDir, backupBranch).catch(() => {});

  const planText = await readPlanText(target, payload.planPath);
  const run = await opencodeRun({ prompt: internalApplyPrompt(target, planText), cwd: repoDir, auto: true });
  await writeFile(
    resolve(workspace, "APPLY-RESULT.md"),
    [`# Hasil eksekusi Developer Internal — ${target.name}`, "", `Sesi OpenCode: ${run.sessionId ?? "-"}`, "", run.text || "(tanpa output)"].join("\n"),
    "utf8",
  );

  const changed = await gitChangedFiles(repoDir);
  if (!changed.length) {
    await notifyOwner({ title: "Developer internal: tidak ada perubahan", body: `${target.name}\nOpenCode tidak mengubah file.` });
    return { targetId: target.id, branch: null, prUrl: null, deployApprovalId: null, outputPreview: "tanpa perubahan" };
  }

  const check = checkScope(changed);
  if (check.blocked.length) {
    await gitRevertAll(repoDir);
    await emitEvent("developer.blocked", {
      entityType: "dev_target",
      entityId: target.id,
      payload: { reason: "protected", files: check.blocked },
    });
    await notifyOwner({
      title: "Developer internal DIBATALKAN (area terlarang)",
      body: `Menyentuh area yang dilarang: ${check.blocked.join(", ")}\nPerubahan dibatalkan (hanya owner yang boleh).`,
    });
    return { targetId: target.id, branch: null, prUrl: null, deployApprovalId: null, outputPreview: `dibatalkan: ${describeScope(check)}` };
  }

  if (check.needsApproval.length && !payload.allowSalesApproved) {
    await gitRevertAll(repoDir);
    const approval = await requestApproval({
      kind: "developer.apply",
      title: `Perubahan Sales butuh persetujuan: ${target.name}`,
      summary: `File terkait Sales: ${check.needsApproval.join(", ")}`,
      payload: { targetId: target.id, internal: true, allowSalesApproved: true, planPath: payload.planPath ?? null, mode: payload.mode ?? "build" },
      requestedBy: "developer",
    });
    await notifyOwner({
      title: "Developer internal menunggu approval (Sales)",
      body: `File: ${check.needsApproval.join(", ")}\nID: ${approval.id.slice(0, 8).toUpperCase()}`,
    });
    return { targetId: target.id, branch: null, prUrl: null, deployApprovalId: null, outputPreview: `butuh approval: ${check.needsApproval.join(", ")}` };
  }

  const tc = await runTypecheck(repoDir);
  if (!tc.ok) {
    await gitRevertAll(repoDir);
    await emitEvent("developer.failed", { entityType: "dev_target", entityId: target.id, payload: { reason: "typecheck" } });
    await notifyOwner({ title: "Developer internal GAGAL typecheck — di-rollback", body: tc.output.slice(-800) });
    return { targetId: target.id, branch: null, prUrl: null, deployApprovalId: null, outputPreview: "typecheck gagal → rollback" };
  }

  const branch = `agent/developer-${target.id.slice(0, 8)}-${Date.now().toString(36)}`;
  await gitCreateBranch(repoDir, branch);
  const diff = await gitDiffStat(repoDir).catch(() => "");
  const sha = await gitCommitAll(repoDir, `feat(developer-internal): ${target.name}`);
  await gitPush(repoDir, branch).catch((err) => log.warn({ err: (err as Error).message }, "push branch internal gagal"));

  let merged = false;
  try {
    await gitCheckout(repoDir, baseBranch);
    await gitMerge(repoDir, branch, `merge(developer-internal): ${target.name}`);
    await gitPush(repoDir, baseBranch).catch(() => {});
    merged = true;
  } catch (err) {
    await gitResetHard(repoDir, backupBranch).catch(() => {});
    await gitCheckout(repoDir, baseBranch).catch(() => {});
    await notifyOwner({ title: "Developer internal: merge gagal, di-rollback", body: (err as Error).message });
    return { targetId: target.id, branch, prUrl: null, deployApprovalId: null, outputPreview: "merge gagal → rollback" };
  }

  await writeInternalDocs(workspace, { target, planText, files: changed, branch, baseBranch, backupBranch, sha });
  await updateDevTarget({
    id: target.id,
    meta: { lastApplyAt: new Date().toISOString(), branch, merged, backupBranch },
  });
  await emitEvent("developer.applied", {
    entityType: "dev_target",
    entityId: target.id,
    payload: { targetId: target.id, branch, merged, files: changed.length, diff },
  });

  let restarted = false;
  if (env.DEVELOPER_INTERNAL_AUTORESTART) {
    restartPm2App("nadia-api-dev", process.cwd());
    restarted = true;
  }

  await notifyOwner({
    title: `Developer internal selesai: ${target.name}`,
    body: [
      `Branch: ${branch}`,
      `Commit: ${sha}`,
      `File berubah: ${changed.length}`,
      `Merge ke ${baseBranch}: ${merged ? "ya" : "tidak"}`,
      `Backup (rollback): ${backupBranch}`,
      restarted ? "Restart PM2 dijadwalkan." : "Perlu restart PM2 untuk mengaktifkan perubahan backend.",
    ].join("\n"),
  });

  log.info({ targetId: target.id, branch, merged, files: changed.length }, "apply internal selesai");
  return { targetId: target.id, branch, prUrl: null, deployApprovalId: null, outputPreview: run.text.slice(0, 500) };
}

/**
 * **Apply** — setelah owner menyetujui rencana, jalankan OpenCode di repo/workspace,
 * lalu commit ke branch, push, dan buka Pull Request. Deploy tetap butuh persetujuan
 * terpisah (`developer.deploy`).
 */
export async function runDeveloperApply(payload: {
  targetId?: string;
  projectId?: string | null;
  planPath?: string;
  mode?: string;
  internal?: boolean;
  allowSalesApproved?: boolean;
}): Promise<DeveloperApplyResult> {
  if (!env.DEVELOPER_ENABLED) throw new Error("Developer nonaktif (DEVELOPER_ENABLED=false)");
  const targetId = payload.targetId;
  if (!targetId) throw new Error("targetId wajib untuk developer.apply");
  const target = await getDevTarget(targetId);
  if (!target) throw new Error(`target developer ${targetId} tidak ditemukan`);

  if (isInternalTarget(target)) return runInternalApply(target, payload);

  const workspace = targetWorkspace(target.id);
  await mkdir(workspace, { recursive: true });

  let repoDir: string | null = null;
  if (target.repoUrl) {
    repoDir = resolve(workspace, "repo");
    await mkdir(repoDir, { recursive: true });
    await ghSetupGit();
    await ensureRepo({ repoUrl: target.repoUrl, dir: repoDir });
  }

  let planText = "";
  if (payload.planPath) {
    planText = await readFile(payload.planPath, "utf8").catch(() => "");
  } else if (typeof target.meta.lastPlanPath === "string") {
    planText = await readFile(target.meta.lastPlanPath, "utf8").catch(() => "");
  }

  const cwd = repoDir ?? workspace;
  const run = await opencodeRun({
    prompt: applyPrompt({ target, mode: payload.mode ?? "maintain", planText }),
    cwd,
    auto: true,
  });

  await writeFile(
    resolve(workspace, "APPLY-RESULT.md"),
    [`# Hasil eksekusi Developer — ${target.name}`, "", `Sesi OpenCode: ${run.sessionId ?? "-"}`, "", run.text || "(tanpa output)"].join("\n"),
    "utf8",
  );

  let branch: string | null = null;
  let prUrl: string | null = null;
  if (repoDir && (await gitHasChanges(repoDir))) {
    branch = `agent/developer-${target.id.slice(0, 8)}-${Date.now().toString(36)}`;
    await gitCreateBranch(repoDir, branch);
    const diff = await gitDiffStat(repoDir).catch(() => "");
    const sha = await gitCommitAll(repoDir, `feat(developer): ${target.name}`);
    await gitPush(repoDir, branch);
    prUrl = await ghPrCreate({
      repoDir,
      title: `Developer: ${target.name}`,
      body: [
        "Dibuat otomatis oleh agent **Developer** (D4) via OpenCode.",
        "",
        payload.planPath ? `Rencana: \`${payload.planPath}\`` : "",
        `Commit: \`${sha}\``,
        "",
        "### Perubahan",
        "```",
        diff || "(diff tidak tersedia)",
        "```",
        "",
        run.text ? `### Catatan OpenCode\n${run.text.slice(0, 2000)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch((err) => {
      log.warn({ err: (err as Error).message }, "gagal membuat PR");
      return null;
    });
    await emitEvent("developer.pr_opened", {
      entityType: "dev_target",
      entityId: target.id,
      payload: { targetId: target.id, branch, prUrl, projectId: payload.projectId ?? null },
    });
  }

  await updateDevTarget({
    id: target.id,
    meta: { lastApplyAt: new Date().toISOString(), branch, prUrl },
  });
  await emitEvent("developer.applied", {
    entityType: payload.projectId ? "project" : "dev_target",
    entityId: payload.projectId ?? target.id,
    payload: { targetId: target.id, branch, prUrl, changes: Boolean(branch) },
  });

  // Deploy: butuh persetujuan terpisah.
  let deployApprovalId: string | null = null;
  const deployHook = typeof target.meta.deployHookUrl === "string" ? target.meta.deployHookUrl : undefined;
  if (target.platform || deployHook || env.VERCEL_DEPLOY_HOOK_URL) {
    const approval = await requestApproval({
      kind: "developer.deploy",
      title: `Deploy ke platform: ${target.name}`,
      summary: `Platform: ${target.platform ?? "vercel"}. PR: ${prUrl ?? "(tanpa PR)"}`,
      payload: { targetId: target.id, projectId: payload.projectId ?? null, platform: target.platform ?? "vercel" },
      requestedBy: "developer",
    });
    deployApprovalId = approval.id;
  }

  await notifyOwner({
    title: `Developer selesai menerapkan perubahan: ${target.name}`,
    body: [
      branch ? `Branch: ${branch}` : "Tidak ada perubahan file.",
      prUrl ? `PR: ${prUrl}` : "",
      deployApprovalId ? `Persetujuan deploy: ${deployApprovalId.slice(0, 8).toUpperCase()}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  log.info({ targetId: target.id, branch, prUrl }, "developer apply selesai");
  return { targetId: target.id, branch, prUrl, deployApprovalId, outputPreview: run.text.slice(0, 500) };
}

/* ─────────────────────────────── deploy ─────────────────────────── */

export interface DeveloperDeployResult {
  targetId: string;
  triggered: boolean;
  platform: string;
  note: string;
}

/** Deploy target setelah persetujuan (`developer.deploy`). */
export async function runDeveloperDeploy(payload: {
  targetId?: string;
  platform?: string;
}): Promise<DeveloperDeployResult> {
  if (!env.DEVELOPER_ENABLED) throw new Error("Developer nonaktif (DEVELOPER_ENABLED=false)");
  const targetId = payload.targetId;
  if (!targetId) throw new Error("targetId wajib untuk developer.deploy");
  const target = await getDevTarget(targetId);
  if (!target) throw new Error(`target developer ${targetId} tidak ditemukan`);

  const platform = payload.platform ?? target.platform ?? "vercel";
  let triggered = false;
  let note = "";

  if (platform === "vercel") {
    const hook = typeof target.meta.deployHookUrl === "string" ? target.meta.deployHookUrl : undefined;
    const result = await vercelTriggerDeploy(hook);
    triggered = result.triggered;
    note = result.triggered ? `Deploy hook terpicu (${result.hook}).` : "Deploy hook Vercel belum diisi — deploy manual.";
  } else {
    note = `Deploy platform "${platform}" belum diotomasi — jalankan manual.`;
  }

  await updateDevTarget({ id: target.id, meta: { lastDeployAt: new Date().toISOString(), platform } });
  await emitEvent("developer.deployed", {
    entityType: "dev_target",
    entityId: target.id,
    payload: { targetId: target.id, platform, triggered },
  });
  await notifyOwner({
    title: `Deploy developer: ${target.name}`,
    body: note,
  });

  log.info({ targetId: target.id, platform, triggered }, "deploy developer diproses");
  return { targetId: target.id, triggered, platform, note };
}

/* ─────────────────────────────── sweep ──────────────────────────── */

/** Audit berkala semua target aktif (menjadwalkan maintain per proyek). */
export async function runDeveloperSweep(): Promise<{ targets: number; scheduled: number }> {
  if (!env.DEVELOPER_ENABLED) return { targets: 0, scheduled: 0 };
  const targets = await listDevTargets("active");
  const dateKey = new Date().toISOString().slice(0, 10);
  let scheduled = 0;
  for (const target of targets) {
    if (!target.projectId) continue;
    const id = await enqueueJob({
      type: "developer.maintain",
      payload: { projectId: target.projectId, dedupeKey: `developer-maintain-${target.projectId}-${dateKey}` },
    });
    if (id) scheduled += 1;
  }
  await emitEvent("developer.sweep", { payload: { targets: targets.length, scheduled } });
  log.info({ targets: targets.length, scheduled }, "sweep developer selesai");
  return { targets: targets.length, scheduled };
}
