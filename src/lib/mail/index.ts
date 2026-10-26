import "server-only";
import { buildRawMessage, renderEmail, type EmailContent } from "./message.ts";
import { googleOAuthAccessToken, readIntegration } from "../integrations.ts";

export type MailThread = { threadId?: string; messageId?: string };
export type MailResult = { ok: true; threadId: string; messageId: string } | { ok: false; reason: "not_configured" | "failed"; detail?: string };

function mailConfig() {
  const names = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "MAIL_FROM"];
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length) return { configured: false as const, missing };
  return {
    configured: true as const,
    clientId: process.env.GMAIL_CLIENT_ID!.trim(),
    clientSecret: process.env.GMAIL_CLIENT_SECRET!.trim(),
    refreshToken: process.env.GMAIL_REFRESH_TOKEN!.trim(),
    from: process.env.MAIL_FROM!.trim(),
  };
}

export function mailStatus(): { configured: boolean; missing: string[] } {
  const c = mailConfig();
  return c.configured ? { configured: true, missing: [] } : { configured: false, missing: c.missing };
}

/**
 * The single email interface. It never throws: callers record `email_failed` on a failed
 * result and carry on, so a mail problem can never block a ticket action.
 */
export async function sendMail(to: string[], subject: string, content: EmailContent, thread: MailThread = {}): Promise<MailResult> {
  try {
    const stored = await readIntegration("google");
    const from = process.env.MAIL_FROM?.trim() || stored?.account?.trim();
    const accessToken = await googleOAuthAccessToken();
    if (!from || !accessToken) return { ok: false, reason: "not_configured", detail: "Connect Google Workspace in Master → Integrations" };
    const { text, html } = renderEmail(content);
    const fromAddress = from.match(/<([^<>]+)>$/)?.[1] ?? from;
    const domain = fromAddress.split("@")[1] || "dropxlogistics.com";
    const messageId = `<dropx-${Date.now()}-${crypto.randomUUID()}@${domain}>`;
    const raw = buildRawMessage({ from, to, subject, text, html, messageId, inReplyTo: thread.messageId, references: thread.messageId });
    const body: { raw: string; threadId?: string } = { raw };
    if (thread.threadId) body.threadId = thread.threadId;
    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!sendRes.ok) return { ok: false, reason: "failed", detail: `send ${sendRes.status}` };
    const sent = await sendRes.json().catch(() => ({})) as { threadId?: string };
    if (!sent.threadId) return { ok: false, reason: "failed", detail: "Gmail did not return a thread id" };
    return { ok: true, threadId: sent.threadId, messageId };
  } catch (e) {
    return { ok: false, reason: "failed", detail: e instanceof Error ? e.name : "error" };
  }
}
