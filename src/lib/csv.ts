export type Cell = string | number | null | undefined;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starts with = + - @ tab or CR) is
 * prefixed with an apostrophe so exports are safe to open in Google Sheets or Excel.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(v) : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with a byte-order mark (so Excel reads names correctly) and CRLF line endings. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return `\ufeff${[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** RFC 4180 reader: quoted cells, doubled quotes, CRLF or LF, new lines inside quotes, optional BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Rows as objects keyed by the header row. */
export function csvToObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [head, ...body] = parseCsv(text);
  const headers = (head ?? []).map((h) => h.trim());
  return { headers, rows: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}
