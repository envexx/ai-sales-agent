import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { env } from "../config/env.js";
import type { Prd } from "../scoper/types.js";
import { getClient, getProject, type ClientRecord, type ProjectRecord } from "./entities.js";

/** Konteks lengkap satu proyek, dipakai banyak agen (F2–F5). */
export interface ProjectContext {
  project: ProjectRecord;
  client: ClientRecord | null;
  prd: Prd | null;
  /** Folder dokumen proyek. */
  dir: string;
}

export async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`project ${projectId} tidak ditemukan`);
  const client = project.clientId ? await getClient(project.clientId) : null;

  let prd: Prd | null = null;
  if (project.prdPath) {
    try {
      const raw = await readFile(resolve(dirname(project.prdPath), "PRD.json"), "utf8");
      prd = (JSON.parse(raw).prd ?? null) as Prd | null;
    } catch {
      prd = null;
    }
  }

  const dir =
    project.workspace ?? resolve(process.cwd(), env.PROJECTS_WORKSPACE_DIR, project.id);
  return { project, client, prd, dir };
}

/** Nama tampilan klien untuk dokumen. */
export function clientLabel(ctx: ProjectContext): string {
  return ctx.client?.company ?? ctx.client?.name ?? ctx.project.title;
}
