import "server-only";
import { buildRawMessage, renderEmail, type EmailContent } from "./message.ts";

export type MailResult = { ok: true } | { ok: false; reason: "not_configured" | "failed"; detail?: string };

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
export async function sendMail(to: string[], subject: string, content: EmailContent): Promise<MailResult> {
  const cfg = mailConfig();
  if (!cfg.configured) return { ok: false, reason: "not_configured", detail: cfg.missing.join(", ") };
  try {
    const { text, html } = renderEmail(content);
    const raw = buildRawMessage({ from: cfg.from, to, subject, text, html });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: cfg.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) return { ok: false, reason: "failed", detail: `token ${tokenRes.status}` };
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return { ok: false, reason: "failed", detail: "no access token" };
    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(10_000),
    });
    return sendRes.ok ? { ok: true } : { ok: false, reason: "failed", detail: `send ${sendRes.status}` };
  } catch (e) {
    return { ok: false, reason: "failed", detail: e instanceof Error ? e.name : "error" };
  }
}
