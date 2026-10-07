export interface IntakeFormItem {
  name: string;
  category?: string;
  purpose?: string;
  required?: boolean;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHELL = (title: string, body: string) => `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; margin: 0;
         background: Canvas; color: CanvasText; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: GrayText; margin: 0 0 24px; font-size: 14px; }
  fieldset { border: 1px solid GrayText; border-radius: 10px; margin: 0 0 14px; padding: 12px 14px; }
  legend { font-weight: 600; font-size: 14px; padding: 0 6px; }
  label { display: block; font-size: 13px; margin-bottom: 6px; }
  input[type=text], input[type=password] { width: 100%; box-sizing: border-box; padding: 9px 10px;
    border: 1px solid GrayText; border-radius: 8px; font: inherit; background: Canvas; color: CanvasText; }
  button { margin-top: 10px; padding: 10px 18px; border-radius: 8px; border: 1px solid transparent;
    background: CanvasText; color: Canvas; font: inherit; font-weight: 600; cursor: pointer; }
  .note { font-size: 12px; color: GrayText; margin-top: 18px; }
  .badge { display: inline-block; font-size: 11px; border: 1px solid GrayText; border-radius: 6px;
    padding: 1px 6px; color: GrayText; margin-left: 6px; }
  .ok { color: #16a34a; } .warn { color: #d97706; } .error { color: #dc2626; }
</style></head><body><main>${body}</main></body></html>`;

export function renderIntakeForm(params: {
  projectTitle: string;
  items: IntakeFormItem[];
  expiresAt: string;
}): string {
  const rows = params.items
    .map(
      (item, i) => `<fieldset>
      <legend>${esc(item.name)}${item.required ? ' <span class="badge">wajib</span>' : ""}${
        item.category ? ` <span class="badge">${esc(item.category)}</span>` : ""
      }</legend>
      ${item.purpose ? `<label>${esc(item.purpose)}</label>` : ""}
      <input type="hidden" name="name_${i}" value="${esc(item.name)}">
      <input type="text" name="value_${i}" autocomplete="off" spellcheck="false"
        placeholder="Tempel nilai rahasia di sini">
    </fieldset>`,
    )
    .join("");

  return SHELL(
    "Formulir Intake Akses",
    `<h1>Formulir Intake Akses</h1>
     <p class="sub">${esc(params.projectTitle)} · Link berlaku sampai ${esc(
       params.expiresAt.slice(0, 16).replace("T", " "),
     )} UTC</p>
     <form method="post">
       ${rows || "<p>Tidak ada item.</p>"}
       <button type="submit">Kirim kredensial</button>
     </form>
     <p class="note">Data dikirim lewat koneksi ini dan disimpan terenkripsi. Jangan bagikan link ini ke pihak lain.
     Biarkan kolom yang belum tersedia tetap kosong.</p>`,
  );
}

export function renderIntakeMessage(params: {
  title: string;
  message: string;
  tone?: "ok" | "warn" | "error";
}): string {
  const cls = params.tone ?? "ok";
  return SHELL(
    params.title,
    `<h1 class="${cls}">${esc(params.title)}</h1><p class="sub">${esc(params.message)}</p>`,
  );
}
