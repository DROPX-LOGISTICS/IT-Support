import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "./config.ts";
import { buildEmail, recipientsFor, type MailExtra, type MailKind, type MailTicket } from "./email-content.ts";
import { sendMail } from "./mail/index.ts";
import { serviceClient } from "./supabase/admin.ts";

type Db = SupabaseClient;
type Row = {
  id: string; number: string; title: string; type: string; priority: string; status: string; developer_update: string | null;
  viable_reason: string | null; expected_date: string | null; meet_link: string | null; meet_at: string | null;
  reporter_id: string | null; reporter_name: string; reporter_email: string; assignee_id: string | null; portal: { name: string } | null;
};

// Which switch in Master, Settings turns each email on or off.
const FLAG: Record<MailKind, "raised" | "assigned" | "status" | "comment" | "confirmation"> = {
  raised: "raised", team_new: "raised", assigned: "assigned", update: "status", status: "status", not_viable: "status",
  reopened: "status", meet: "status", comment: "comment", confirmation: "confirmation", reminder: "confirmation",
};

export type NotifyOpts = { actorEmail?: string | null; extra?: MailExtra; commenterIsReporter?: boolean; ignoreSwitches?: boolean };

async function staffEmails(db: Db, roles: string[]) {
  const { data } = await db.from("support_users").select("email").in("role", roles).eq("is_active", true);
  return (data ?? []).map((r: { email: string }) => r.email);
}

async function record(db: Db, ticketId: string, kind: MailKind, ok: boolean, why?: string) {
  // Failed or skipped sends are recorded so they can be retried from the ticket history; they never block the action.
  await db.from("support_events").insert({
    ticket_id: ticketId, actor_name: "System", event_type: ok ? "email_sent" : "email_failed", new_value: kind, reason: ok ? null : why ?? "send failed",
  });
}

/** Sends one kind of email for a ticket. Never throws. Returns true when a message went out. */
export async function notify(ticketId: string, kind: MailKind, opts: NotifyOpts = {}): Promise<boolean> {
  try {
    const db = serviceClient();
    if (!db) return false;
    const { data: t } = await db.from("support_tickets")
      .select("id,number,title,type,priority,status,developer_update,viable_reason,expected_date,meet_link,meet_at,reporter_id,reporter_name,reporter_email,assignee_id,portal:support_portals(name)")
      .eq("id", ticketId).maybeSingle<Row>();
    if (!t) return false;
    if (!opts.ignoreSwitches) {
      const { data: s } = await db.from("support_settings").select("notify").limit(1).maybeSingle();
      if (s?.notify && s.notify[FLAG[kind]] === false) return false;
    }
    const assignee = t.assignee_id ? (await db.from("support_users").select("email,name").eq("id", t.assignee_id).maybeSingle()).data : null;
    const needsTeam = kind === "team_new" || kind === "comment" || kind === "reopened";
    const [developers, managers] = needsTeam ? await Promise.all([staffEmails(db, ["developer", "admin"]), kind === "team_new" && t.priority === "P0" ? staffEmails(db, ["manager"]) : Promise.resolve([])]) : [[], []];
    const to = recipientsFor(kind, {
      reporterEmail: t.reporter_email, assigneeEmail: assignee?.email ?? null, developers, managers, priority: t.priority,
      actorEmail: opts.actorEmail, commenterIsReporter: opts.commenterIsReporter,
    });
    if (!to.length) return false;
    const mt: MailTicket = {
      id: t.id, number: t.number, title: t.title, type: t.type, priority: t.priority, portal: t.portal?.name ?? "a portal", reporterName: t.reporter_name,
      developerUpdate: t.developer_update, viableReason: t.viable_reason, expectedDate: t.expected_date, meetLink: t.meet_link, meetAt: t.meet_at, status: t.status,
    };
    const { subject, content } = buildEmail(kind, mt, `${appUrl()}/tickets/${t.id}`, opts.extra);
    const res = await sendMail(to, subject, content);
    await record(db, t.id, kind, res.ok, res.ok ? undefined : res.reason === "not_configured" ? "email is not configured" : "send failed");
    return res.ok;
  } catch {
    return false;
  }
}

/** Acknowledge the reporter, tell the developers, and add managers for a P0. */
export async function notifyRaised(ticketId: string): Promise<void> {
  await notify(ticketId, "raised", { ignoreSwitches: false });
  await notify(ticketId, "team_new");
}

/** Resends the latest email of this kind from the ticket's current state (used by "Retry" in the history). */
export async function retryEmail(ticketId: string, kind: MailKind): Promise<boolean> {
  const db = serviceClient();
  let extra: MailExtra | undefined;
  let commenterIsReporter = false;
  if (kind === "comment" && db) {
    const { data: c } = await db.from("support_comments").select("author_id,author_name,body").eq("ticket_id", ticketId).eq("internal", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: t } = await db.from("support_tickets").select("reporter_id").eq("id", ticketId).maybeSingle();
    if (!c) return false;
    extra = { commentAuthor: c.author_name, commentBody: c.body };
    commenterIsReporter = c.author_id === t?.reporter_id;
  }
  return notify(ticketId, kind === "raised" ? "raised" : kind, { extra, commenterIsReporter, ignoreSwitches: true });
}
