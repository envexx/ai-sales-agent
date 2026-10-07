/** Tipe agent Developer (D4) — pengelola situs + pembangun otomasi/AI agent. */

export type DeveloperMode = "maintain" | "build";

export interface DevPlanItem {
  area: string;
  priority: "high" | "medium" | "low";
  action: string;
  rationale: string;
  automated: boolean;
}

/** Rencana kerja developer (hasil LLM, dengan fallback heuristik). */
export interface DevPlan {
  summary: string;
  seo: string[];
  deployPlatform: string | null;
  items: DevPlanItem[];
}

/** Sinyal teknis hasil audit target (situs/repo) sebelum menyusun rencana. */
export interface DevSignals {
  liveUrl: string | null;
  httpStatus: number | null;
  title: string | null;
  metaDescription: string | null;
  hasSitemap: boolean | null;
  hasRobots: boolean | null;
  repo: Record<string, unknown> | null;
  platforms: { id: string; configured: boolean; detail: string }[];
  notes: string[];
}

export interface DevTargetRecord {
  id: string;
  projectId: string | null;
  clientId: string | null;
  kind: string;
  name: string;
  repoUrl: string | null;
  liveUrl: string | null;
  localPath: string | null;
  platform: string | null;
  status: string;
  meta: Record<string, unknown>;
  lastAuditAt: string | null;
  createdAt: string;
  updatedAt: string;
}
