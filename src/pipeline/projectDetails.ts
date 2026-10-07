import { readdir, realpath, stat, readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname } from "node:path";
import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { getProject, getClient, listInvoicesByProject, type ProjectRecord } from "./entities.js";

const GROUPS = ["meetings", "legal", "docs", "qa", "handover", "content"];
const inside = (root: string, path: string) => { const rel = relative(root, path); return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel); };
export type ProjectDocument = { path: string; name: string; group: string; bytes: number; updatedAt: string };

// Each project owns one canonical directory. Never follow links into another project or the vault.
async function projectRoot(project: Pick<ProjectRecord, "id" | "workspace">) {
  if (!project.workspace || !/^[a-zA-Z0-9_-]+$/.test(project.id)) return null;
  const expected = resolve(env.PROJECTS_WORKSPACE_DIR, project.id);
  if (resolve(project.workspace) !== expected) return null;
  try { return await realpath(expected) === expected ? expected : null; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function listProjectDocuments(project: Pick<ProjectRecord, "id" | "workspace">): Promise<ProjectDocument[]> {
  const root = await projectRoot(project);
  if (!root) return [];
  const files: ProjectDocument[] = [];
  for (const group of ["", ...GROUPS]) {
    const dir = resolve(root, group);
    try {
      if (await realpath(dir) !== dir) continue;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isFile() || ![".md", ".json", ".txt"].includes(extname(entry.name).toLowerCase())) continue;
        if (!group && !["PRD.md", "PRD.json"].includes(entry.name)) continue;
        const path = resolve(dir, entry.name);
        if (!inside(root, path) || await realpath(path) !== path) continue;
        const info = await stat(path);
        files.push({ path: group ? `${group}/${entry.name}` : entry.name, name: entry.name, group: group || "prd", bytes: info.size, updatedAt: info.mtime.toISOString() });
        if (files.length >= 200) return files;
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readProjectDocument(project: Pick<ProjectRecord, "id" | "workspace">, path: string) {
  const document = (await listProjectDocuments(project)).find((file) => file.path === path);
  const root = await projectRoot(project);
  if (!document || !root) return null;
  const target = resolve(root, document.path);
  if (!inside(root, target) || await realpath(target) !== target) return null;
  if (document.bytes > 512 * 1024) return { ...document, content: null, tooLarge: true };
  return { ...document, content: await readFile(target, "utf8"), tooLarge: false };
}

export async function buildProjectDetail(id: string) {
  const project = await getProject(id);
  if (!project) return null;
  const [client, documents, invoices, jobs, events] = await Promise.all([
    project.clientId ? getClient(project.clientId) : null,
    listProjectDocuments(project), listInvoicesByProject(id),
    query<{ id: string; type: string; status: string; updated_at: Date }>(
      `SELECT id,type,status,updated_at FROM jobs WHERE payload->>'projectId'=$1 ORDER BY updated_at DESC LIMIT 100`, [id]),
    query<{ id: string; type: string; created_at: Date }>(
      `SELECT id::text,type,created_at FROM events WHERE entity_id=$1 OR payload->>'projectId'=$1
       OR payload->>'jobId' IN (SELECT id::text FROM jobs WHERE payload->>'projectId'=$1)
       ORDER BY created_at DESC LIMIT 100`, [id]),
  ]);
  const context: Record<string, string | string[]> = {};
  for (const key of ["summary", "objective", "scope", "openQuestions", "source"]) {
    const value = project.meta[key];
    if (typeof value === "string") context[key] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) context[key] = value;
  }
  return {
    project: { id: project.id, title: project.title, stage: project.stage, createdAt: project.createdAt, updatedAt: project.updatedAt },
    client: client ? { name: client.name, company: client.company, leadId: client.leadId } : null,
    context, documents,
    invoices: invoices.map(({ id, kind, amount, currency, status, dueAt, paidAt }) => ({ id, kind, amount, currency, status, dueAt, paidAt })),
    jobs: jobs.rows.map((job) => ({ id: job.id, type: job.type, status: job.status, updatedAt: job.updated_at.toISOString() })),
    events: events.rows.map((event) => ({ id: event.id, type: event.type, at: event.created_at.toISOString() })),
  };
}
