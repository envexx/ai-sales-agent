import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool } from "./pool.js";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("db:schema");

const here = dirname(fileURLToPath(import.meta.url));

function loadSql(): string {
  // Works from both `src/` (tsx) and `dist/` (compiled) by walking up to the repo root.
  const candidates = [
    resolve(process.cwd(), "sql/init.sql"),
    resolve(here, "../../sql/init.sql"),
    resolve(here, "../sql/init.sql"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Could not locate sql/init.sql. Run the app from the project root directory.",
  );
}

/** Create extensions, tables and indexes if they do not exist yet. */
export async function ensureSchema(): Promise<void> {
  const sql = loadSql();
  await pool.query(sql);
  log.info("database schema is up to date");
}
