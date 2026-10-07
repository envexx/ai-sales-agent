import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loggerFor } from "../config/logger.js";

const execFileAsync = promisify(execFile);
const log = loggerFor("integrations:github");

/**
 * Akses GitHub & repo lewat **`gh` CLI + git** (tanpa menyimpan token).
 *
 * `gh` (v2.x) yang sudah login menangani autentikasi push/PR. Untuk operasi
 * murni repo, kami memakai `git -C <dir>` (tidak bergantung cwd proses).
 */

const GIT_TIMEOUT_MS = 180_000;

function binary(bin: string): string {
  if (process.platform === "win32" && !/\.(exe|cmd|bat)$/i.test(bin)) return `${bin}.exe`;
  return bin;
}

async function git(args: string[], cwd?: string, timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await execFileAsync(binary("git"), args, {
    cwd,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

async function gh(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync(binary("gh"), args, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

export interface GhAuthStatus {
  ok: boolean;
  login?: string;
  error?: string;
}

/** Status login `gh` (untuk tampilan kesiapan platform). */
export async function ghAuthStatus(): Promise<GhAuthStatus> {
  try {
    const out = await gh(["auth", "status"]);
    const login = out.match(/account\s+(\S+)/i)?.[1];
    return { ok: true, login };
  } catch (err) {
    const message = (err as { stderr?: string; message?: string }).stderr ?? (err as Error).message;
    return { ok: false, error: message.trim().slice(0, 300) };
  }
}

export async function ghAvailable(): Promise<boolean> {
  try {
    await gh(["--version"]);
    return true;
  } catch {
    return false;
  }
}

/** Pastikan git memakai kredensial `gh` (idempoten; aman dipanggil sebelum push). */
export async function ghSetupGit(): Promise<void> {
  try {
    await gh(["auth", "setup-git"]);
  } catch (err) {
    log.warn({ err: (err as Error).message }, "gh auth setup-git gagal (lanjut)");
  }
}

/** Clone repo (atau `fetch` bila folder sudah ada). Mengembalikan path repo. */
export async function ensureRepo(params: {
  repoUrl: string;
  dir: string;
  depth?: number;
}): Promise<string> {
  const { repoUrl, dir, depth = 1 } = params;
  try {
    await git(["-C", dir, "rev-parse", "--is-inside-work-tree"]);
    await git(["-C", dir, "fetch", "--all", "--prune"]);
    return dir;
  } catch {
    await git([
      "clone",
      ...(depth > 0 ? ["--depth", String(depth)] : []),
      repoUrl,
      dir,
    ]);
    return dir;
  }
}

export async function gitDefaultBranch(repoDir: string): Promise<string> {
  try {
    const remoteHead = await git([
      "-C",
      repoDir,
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
      "--short",
    ]);
    return remoteHead.replace(/^origin\//, "");
  } catch {
    return "main";
  }
}

export async function gitCreateBranch(repoDir: string, branch: string): Promise<void> {
  await git(["-C", repoDir, "checkout", "-B", branch]);
}

export async function gitHasChanges(repoDir: string): Promise<boolean> {
  const out = await git(["-C", repoDir, "status", "--porcelain"]);
  return out.length > 0;
}

export async function gitDiffStat(repoDir: string): Promise<string> {
  return git(["-C", repoDir, "diff", "--stat"]);
}

export async function gitCommitAll(repoDir: string, message: string): Promise<string> {
  await git(["-C", repoDir, "add", "-A"]);
  await git(["-C", repoDir, "commit", "-m", message, "--no-verify"]);
  return git(["-C", repoDir, "rev-parse", "--short", "HEAD"]);
}

export async function gitPush(repoDir: string, branch: string, timeoutMs?: number): Promise<void> {
  await git(["-C", repoDir, "push", "-u", "origin", branch], undefined, timeoutMs);
}

/** Buat Pull Request; mengembalikan URL PR. */
export async function ghPrCreate(params: {
  repoDir: string;
  title: string;
  body: string;
  base?: string;
}): Promise<string> {
  const args = ["pr", "create", "--title", params.title, "--body", params.body];
  if (params.base) args.push("--base", params.base);
  return gh(args, params.repoDir);
}

export async function ghPrList(repoDir: string, limit = 10): Promise<string> {
  return gh(
    [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      String(limit),
      "--json",
      "number,title,url,headRefName",
    ],
    repoDir,
  );
}

/** Info ringkas repo (untuk audit/kesiapan), atau null bila tidak dapat diakses. */
export async function ghRepoView(repoDir: string): Promise<Record<string, unknown> | null> {
  try {
    const out = await gh(
      ["repo", "view", "--json", "nameWithOwner,url,defaultBranchRef,isPrivate,description"],
      repoDir,
    );
    return JSON.parse(out) as Record<string, unknown>;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "gh repo view gagal");
    return null;
  }
}

/* ─────────────── operasi repo lokal (internal) ─────────────── */

export async function gitIsRepo(dir: string): Promise<boolean> {
  try {
    await git(["-C", dir, "rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export async function gitCurrentBranch(repoDir: string): Promise<string> {
  return git(["-C", repoDir, "rev-parse", "--abbrev-ref", "HEAD"]);
}

/** Daftar file yang berubah (termasuk untracked), path relatif. Submodule diabaikan. */
export async function gitChangedFiles(repoDir: string): Promise<string[]> {
  const out = await git(["-C", repoDir, "status", "--porcelain", "--ignore-submodules=all"]);
  const files = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const rest = line.slice(3).trim();
      const arrow = rest.indexOf(" -> ");
      return arrow >= 0 ? rest.slice(arrow + 4).replace(/^"|"$/g, "") : rest.replace(/^"|"$/g, "");
    });
  return [...new Set(files)];
}

/** Buat branch backup pada HEAD (titik rollback). */
export async function gitBranchBackup(repoDir: string, name: string): Promise<void> {
  await git(["-C", repoDir, "branch", name]);
}

export async function gitCheckout(repoDir: string, ref: string): Promise<void> {
  await git(["-C", repoDir, "checkout", ref]);
}

export async function gitMerge(repoDir: string, ref: string, message: string): Promise<void> {
  await git(["-C", repoDir, "merge", "--no-ff", ref, "-m", message]);
}

/** Batalkan semua perubahan lokal (tracked + untracked) — untuk rollback guardrail. */
export async function gitRevertAll(repoDir: string): Promise<void> {
  await git(["-C", repoDir, "checkout", "--", "."]).catch(() => {});
  await git(["-C", repoDir, "clean", "-fd"]).catch(() => {});
}

export async function gitResetHard(repoDir: string, ref: string): Promise<void> {
  await git(["-C", repoDir, "reset", "--hard", ref]);
}
