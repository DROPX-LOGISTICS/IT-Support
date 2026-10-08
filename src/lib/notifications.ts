import "server-only";
import { appUrl } from "./config.ts";
import { sendMail, type MailResult } from "./mail/index.ts";
import { serviceClient } from "./supabase/admin.ts";

type TicketRow = {
  id: string; number: string; title: string; type: string; priority: string; developer_update: string | null;
  reporter_name: string; reporter_email: string; portal: { name: string } | null;
};

const TYPE_WORD: Record<string, string> = { bug: "bug", feature: "feature request", support: "support request" };

async function load(ticketId: string) {
  const admin = serviceClient();
  if (!admin) return null;
  const { data } = await admin
    .from("support_tickets")
    .select("id,number,title,type,priority,developer_update,reporter_name,reporter_email,portal:support_portals(name)")
    .eq("id", ticketId)
    .maybeSingle<TicketRow>();
  return data ? { admin, ticket: data } : null;
}

async function record(admin: NonNullable<ReturnType<typeof serviceClient>>, ticketId: string, kind: string, result: MailResult) {
  // A failed or skipped email is recorded so it can be retried; it never blocks the action.
  await admin.from("support_events").insert({
    ticket_id: ticketId,
    actor_name: "System",
    event_type: result.ok ? "email_sent" : "email_failed",
    new_value: kind,
    reason: result.ok ? null : result.reason === "not_configured" ? "email is not configured" : "send failed",
  });
}

async function staffEmails(admin: NonNullable<ReturnType<typeof serviceClient>>, roles: string[]) {
  const { data } = await admin.from("support_users").select("email").in("role", roles).eq("is_active", true);
  return (data ?? []).map((r: { email: string }) => r.email);
}

/** Acknowledge the reporter, tell all developers, and add managers when it is a P0. */
export async function notifyRaised(ticketId: string): Promise<void> {
  try {
    const ctx = await load(ticketId);
    if (!ctx) return;
    const { admin, ticket: t } = ctx;
    const link = { label: "Open your ticket", url: `${appUrl()}/tickets/${t.id}` };
    const portal = t.portal?.name ?? "a portal";

    const ack = await sendMail([t.reporter_email], `[${t.number}] We received your ticket`, {
      heading: `We received your ticket ${t.number}`,
      paragraphs: [`Hi ${t.reporter_name},`, `Thank you for telling us. We will look into "${t.title}" and keep you updated on the ticket page.`],
      link,
    });
    await record(admin, t.id, "acknowledgement to reporter", ack);

    const roles = t.priority === "P0" ? ["developer", "admin", "manager"] : ["developer", "admin"];
    const team = [...new Set(await staffEmails(admin, roles))].filter((e) => e.toLowerCase() !== t.reporter_email.toLowerCase());
    if (team.length) {
      const tell = await sendMail(team, `[${t.number}] New ${t.priority} ${TYPE_WORD[t.type] ?? "ticket"} in ${portal}: ${t.title}`, {
        heading: `${t.number} raised by ${t.reporter_name}`,
        paragraphs: [`${t.priority} ${TYPE_WORD[t.type] ?? "ticket"} in ${portal}.`, t.title],
        link: { label: "Open the ticket", url: link.url },
      });
      await record(admin, t.id, t.priority === "P0" ? "P0 alert to team" : "new ticket to team", tell);
    }
  } catch {
    // Never let a notification problem reach the person's action.
  }
}

/** Ask the reporter to check the fix, with a link to confirm. */
export async function notifyConfirmationRequest(ticketId: string): Promise<void> {
  try {
    const ctx = await load(ticketId);
    if (!ctx) return;
    const { admin, ticket: t } = ctx;
    const r = await sendMail([t.reporter_email], `[${t.number}] Please check if it works now`, {
      heading: `Does ${t.number} work now?`,
      paragraphs: [
        `Hi ${t.reporter_name},`,
        `We have finished work on "${t.title}".`,
        ...(t.developer_update ? [`Our update: ${t.developer_update}`] : []),
        "Please open the ticket and tell us if it works. If it does not, tell us what you still see and we will pick it up again.",
      ],
      link: { label: "Check and confirm", url: `${appUrl()}/tickets/${t.id}` },
    });
    await record(admin, t.id, "confirmation request to reporter", r);
  } catch {
    // Ignored on purpose.
  }
}
