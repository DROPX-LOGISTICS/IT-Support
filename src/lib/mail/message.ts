const DEFAULT_NAME = "DropX IT Support";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const noBreaks = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export function isValidAddress(v: string): boolean {
  return ADDRESS.test(v);
}

/** MAIL_FROM may be "tech@x.com" or '"Name" <tech@x.com>'; the default display name is added when missing. */
export function formatFrom(value: string): { header: string; address: string } | null {
  const raw = noBreaks(value);
  const m = /^(?:"?([^"<]*?)"?\s*)?<([^<>]+)>$/.exec(raw);
  const address = (m ? m[2] : raw).trim();
  if (!isValidAddress(address)) return null;
  const name = (m?.[1] ?? "").trim() || DEFAULT_NAME;
  return { header: `${encodeWord(name)} <${address}>`, address };
}

function encodeWord(text: string): string {
  const t = noBreaks(text);
  if (/^[\x20-\x7e]*$/.test(t) && !/["\\]/.test(t)) return t;
  return `=?UTF-8?B?${Buffer.from(t, "utf8").toString("base64")}?=`;
}

const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");

export type MailInput = { from: string; to: string[]; subject: string; text: string; html: string };

/** Multipart text + HTML message, returned base64url-encoded for the Gmail API. */
export function buildRawMessage(input: MailInput, boundary = `b_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`): string {
  const from = formatFrom(input.from);
  if (!from) throw new Error("MAIL_FROM is not a valid address");
  const to = input.to.map(noBreaks).filter(isValidAddress);
  if (!to.length) throw new Error("No valid recipient");
  const lines = [
    `From: ${from.header}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeWord(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(input.text, "utf8").toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(input.html, "utf8").toString("base64")),
    `--${boundary}--`,
    "",
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export type EmailContent = { heading: string; paragraphs: string[]; link?: { label: string; url: string } };

/** Plain, escaped email body in text and HTML. User-supplied text is always escaped in the HTML part. */
export function renderEmail(c: EmailContent): { text: string; html: string } {
  const safeUrl = c.link && /^https?:\/\//i.test(c.link.url) ? c.link : undefined;
  const text = [c.heading, "", ...c.paragraphs, ...(safeUrl ? ["", `${safeUrl.label}: ${safeUrl.url}`] : []), "", "DropX IT Support"].join("\n");
  const paras = c.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = safeUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(safeUrl.url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(safeUrl.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5fb;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2430"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px"><h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(c.heading)}</h1>${paras}${button}<p style="margin:24px 0 0;color:#6b7280;font-size:13px">DropX IT Support</p></div></body></html>`;
  return { text, html };
}
