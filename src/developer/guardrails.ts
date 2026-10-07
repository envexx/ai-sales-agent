/**
 * Guardrail Developer (Internal) — sesuai docs/DEVELOPER.md §1.2, §1.7, §1.8.
 *
 * Aturan:
 * - DILARANG mengubah agent Developer itu sendiri, Supervisor, dan Monitor
 *   (hanya owner).
 * - Perubahan menyangkut Sales butuh persetujuan owner.
 * - Tidak boleh menyentuh `.env` (boleh dibaca), WA/`baileys_auth`, `logs`,
 *   `node_modules`, `.git`, `dist`.
 */

const HARD_BLOCK = [".env", ".git/", "baileys_auth", "logs/", "node_modules/", "dist/"];
/** Path yang sama sekali tidak boleh diubah (hanya owner). */
const FORBIDDEN_PREFIXES = ["src/developer/", "src/supervisor/", "src/monitor/"];
/** Path yang butuh persetujuan owner (Sales). */
const APPROVAL_PREFIXES = ["src/graph/", "src/outreach/", "src/supervisor/nodes/sales"];

export interface ScopeCheck {
  /** File yang DILARANG diubah (developer/supervisor/monitor/secret). */
  blocked: string[];
  /** File yang butuh persetujuan owner (Sales). */
  needsApproval: string[];
  /** File yang boleh diproses otomatis. */
  allowed: string[];
}

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "");

export function checkScope(files: string[]): ScopeCheck {
  const blocked: string[] = [];
  const needsApproval: string[] = [];
  const allowed: string[] = [];
  for (const raw of files) {
    const f = norm(raw);
    if (!f) continue;
    if (HARD_BLOCK.some((p) => f === p || f.startsWith(p))) {
      blocked.push(f);
      continue;
    }
    if (FORBIDDEN_PREFIXES.some((p) => f.startsWith(p))) {
      blocked.push(f);
      continue;
    }
    if (APPROVAL_PREFIXES.some((p) => f.startsWith(p))) {
      needsApproval.push(f);
      continue;
    }
    allowed.push(f);
  }
  return { blocked, needsApproval, allowed };
}

/** Ringkas hasil cek scope untuk pesan/laporan. */
export function describeScope(check: ScopeCheck): string {
  const parts: string[] = [];
  if (check.blocked.length) parts.push(`terlarang: ${check.blocked.join(", ")}`);
  if (check.needsApproval.length) parts.push(`butuh approval: ${check.needsApproval.join(", ")}`);
  return parts.length ? parts.join(" · ") : "aman untuk otomatis";
}
