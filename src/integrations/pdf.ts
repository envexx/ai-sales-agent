import { createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import PDFDocument from "pdfkit";
import { loggerFor } from "../config/logger.js";

const log = loggerFor("integration:pdf");

const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const FONT_MONO = "Courier";

/** Bersihkan penanda markdown inline sederhana (**, `) agar rapi di PDF. */
function cleanInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .trim();
}

/**
 * Render markdown sederhana (judul, heading, bullet, checklist, tabel, kode)
 * menjadi file PDF. Dipakai untuk PRD, SPK/NDA, invoice, BAST, dan SOP.
 */
export async function renderMarkdownPdf(
  markdown: string,
  outPath: string,
  opts: { title?: string; footer?: string } = {},
): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      bufferPages: true,
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      info: { Title: opts.title ?? "Dokumen" },
    });
    const stream = createWriteStream(outPath);
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.pipe(stream);

    const footer = opts.footer ?? opts.title ?? "";

    let inCode = false;
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");

    for (const raw of lines) {
      const line = raw.replace(/\t/g, "  ");

      if (/^```/.test(line.trim())) {
        inCode = !inCode;
        doc.moveDown(0.3);
        continue;
      }

      if (inCode) {
        doc.font(FONT_MONO).fontSize(8.5).fillColor("#334155").text(line || " ");
        continue;
      }

      if (!line.trim()) {
        doc.moveDown(0.4);
        continue;
      }

      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        const level = h[1]!.length;
        const size = level === 1 ? 20 : level === 2 ? 14 : level === 3 ? 11.5 : 10.5;
        doc.moveDown(level <= 2 ? 0.5 : 0.3);
        doc.font(FONT_BOLD).fontSize(size).fillColor("#0f172a").text(cleanInline(h[2]!));
        doc.moveDown(0.2);
        continue;
      }

      // Tabel: render sebagai baris teks; lewati baris pemisah (---).
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
        const cells = line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => cleanInline(c));
        doc.font(FONT).fontSize(9).fillColor("#1e293b").text(cells.join("   ·   "));
        continue;
      }

      const check = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
      if (check) {
        doc
          .font(FONT)
          .fontSize(9.5)
          .fillColor("#1e293b")
          .text(`${check[1]!.toLowerCase() === "x" ? "[x]" : "[ ]"} ${cleanInline(check[2]!)}`, {
            indent: 10,
          });
        continue;
      }

      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      if (bullet) {
        doc.font(FONT).fontSize(9.5).fillColor("#1e293b").text(`•  ${cleanInline(bullet[1]!)}`, {
          indent: 10,
        });
        continue;
      }

      const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (num) {
        doc
          .font(FONT)
          .fontSize(9.5)
          .fillColor("#1e293b")
          .text(`${num[1]}.  ${cleanInline(num[2]!)}`, { indent: 10 });
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        doc.font(FONT).fontSize(9).fillColor("#64748b").text(cleanInline(quote[1]!), { indent: 8 });
        continue;
      }

      doc.font(FONT).fontSize(9.5).fillColor("#1e293b").text(cleanInline(line));
    }

    // Footer tiap halaman (identifier + waktu).
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc
        .font(FONT)
        .fontSize(7.5)
        .fillColor("#94a3b8")
        .text(
          `${footer}  ·  ${i + 1}/${range.count}`,
          doc.page.margins.left,
          doc.page.height - 34,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "center" },
        );
    }

    doc.end();
    log.debug({ outPath, pages: range.count }, "pdf dibuat");
  });
}
