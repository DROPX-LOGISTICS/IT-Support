"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { canChangeTicket } from "@/lib/access";
import { appUrl } from "@/lib/config";
import { isMailKind } from "@/lib/email-content";
import { calendarErrorMessage, calendarStatus, createMeetEvent, rescheduleEvent } from "@/lib/google-calendar";
import { istLocalToIso, parseMeetLink } from "@/lib/meet";
import { cancelMeetForTicket } from "@/lib/meet-server";
import { notify, retryEmail } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { serviceClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";
import { DONE, checkConfirmation, checkTransition } from "@/lib/status-flow";
import { STATUSES, type Status } from "@/lib/tickets";

export type ActionResult = { ok: boolean; message: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

const FRIENDLY: [string, string][] = [
  ["STALE", "This ticket changed while you were looking at it. Refresh and try again."],
  ["A developer update is required", "Write an update for the reporter first."],
  ["A reason is required when confirming", "A reason is required when confirming for the reporter."],
  ["A reason is required", "A reason is required."],
  ["That status change is not allowed", "That status change is not allowed."],
  ["Please tell us what still fails", "Please tell us what still fails."],
  ["Choose a developer", "Choose a developer."],
  ["Choose a priority", "Choose a priority."],
  ["Links must start with", "Links must start with http:// or https://."],
  ["This ticket is closed", "This ticket is closed."],
  ["Viability applies", "Viability applies to feature requests only."],
  ["Write a comment", "Write a comment of up to 5000 characters."],
  ["Enter a Google Meet link", "Enter a Google Meet link like https://meet.google.com/abc-defg-hij."],
  ["Not allowed", "You are not allowed to do that."],
];
function friendly(message: string | undefined): string {
  const hit = FRIENDLY.find(([k]) => message?.includes(k));
  return hit ? hit[1] : "Something went wrong. Please try again.";
}
function refresh(id: string) {
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/queue");
  revalidatePath("/board");
  revalidatePath("/my-tickets");
}

async function context() {
  const session = await requireUser();
  const supabase = userClient();
  if (session.state !== "ok" || !supabase) return null;
  return { user: session.user, supabase };
}
const isDev = (c: NonNullable<Awaited<ReturnType<typeof context>>>) => canChangeTicket({ id: c.user.id, role: c.user.role, isActive: true });

export async function changeStatus(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  const seen = str(fd.get("seen")) as Status;
  const to = str(fd.get("to")) as Status;
  if (!UUID.test(id) || !STATUSES.includes(seen) || !STATUSES.includes(to)) return { ok: false, message: "Choose a status." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to change tickets." };
  const reason = str(fd.get("reason"));
  const update = str(fd.get("update"));

  // Cheap pre-check for a clear message; the database function enforces the same rules.
  const { data: t } = await ctx.supabase.from("support_tickets").select("type,status,developer_update").eq("id", id).maybeSingle();
  if (!t) return { ok: false, message: "Ticket not found." };
  const pre = checkTransition({ type: t.type, current: t.status, seen, to, reason, developerUpdate: update, existingUpdate: t.developer_update });
  if (!pre.ok) return { ok: false, message: pre.message };

  const { error } = await ctx.supabase.rpc("support_change_status", { p_ticket: id, p_expected: seen, p_new: to, p_reason: reason, p_update: update });
  if (error) return { ok: false, message: friendly(error.message) };
  const actorEmail = ctx.user.email;
  if (to === DONE) await notify(id, "confirmation", { actorEmail });
  else if (to === "Not viable") await notify(id, "not_viable", { actorEmail });
  else await notify(id, "status", { actorEmail }); // a Blocked reason stays internal
  refresh(id);
  return { ok: true, message: `Moved to ${to}.` };
}

export async function saveDetails(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to change tickets." };

  const patch: Record<string, unknown> = {};
  const assignee = str(fd.get("assignee"));
  if (assignee && !UUID.test(assignee)) return { ok: false, message: "Choose a developer." };
  patch.assignee_id = assignee || null;
  patch.priority = str(fd.get("priority"));
  const date = str(fd.get("expectedDate"));
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Enter a valid date." };
  patch.expected_date = date || null;
  patch.developer_update = str(fd.get("developerUpdate")).slice(0, 2000);
  patch.links = str(fd.get("links")).split(/\s+/).filter(Boolean).slice(0, 20);
  if (fd.has("viable")) {
    patch.viable = str(fd.get("viable")) || null;
    patch.viable_reason = str(fd.get("viableReason"));
  }
  const { data: before } = await ctx.supabase.from("support_tickets").select("assignee_id,developer_update,expected_date").eq("id", id).maybeSingle();
  const { error } = await ctx.supabase.rpc("support_update_ticket", { p_ticket: id, p_patch: patch });
  if (error) return { ok: false, message: friendly(error.message) };

  const actorEmail = ctx.user.email;
  if (patch.assignee_id && patch.assignee_id !== before?.assignee_id) await notify(id, "assigned", { actorEmail });
  const newUpdate = (patch.developer_update as string) || null;
  if ((newUpdate && newUpdate !== (before?.developer_update ?? null)) || (patch.expected_date && patch.expected_date !== before?.expected_date)) {
    await notify(id, "update", { actorEmail });
  }
  refresh(id);
  return { ok: true, message: "Saved." };
}

export async function addComment(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  const body = str(fd.get("body"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!body) return { ok: false, message: "Write a comment first." };
  const internal = fd.get("internal") === "on" && ctx.user.role !== "reporter";
  const { error } = await ctx.supabase.rpc("support_add_comment", { p_ticket: id, p_body: body, p_internal: internal });
  if (error) return { ok: false, message: friendly(error.message) };
  if (!internal) {
    const { data: t } = await ctx.supabase.from("support_tickets").select("reporter_id").eq("id", id).maybeSingle();
    await notify(id, "comment", { actorEmail: ctx.user.email, commenterIsReporter: t?.reporter_id === ctx.user.id, extra: { commentAuthor: ctx.user.name || ctx.user.email, commentBody: body } });
  }
  refresh(id);
  return { ok: true, message: internal ? "Internal note added." : "Comment added." };
}

export async function confirmTicket(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  const works = str(fd.get("works")) === "yes";
  const reason = str(fd.get("reason"));
  const { data: t } = await ctx.supabase.from("support_tickets").select("status,reporter_id").eq("id", id).maybeSingle();
  if (!t) return { ok: false, message: "Ticket not found." };
  const pre = checkConfirmation({ status: t.status, works, reason, isReporter: t.reporter_id === ctx.user.id, isDeveloper: isDev(ctx) });
  if (!pre.ok) return { ok: false, message: pre.message };
  const { error } = await ctx.supabase.rpc("support_confirm_ticket", { p_ticket: id, p_works: works, p_reason: reason });
  if (error) return { ok: false, message: friendly(error.message) };
  if (works) {
    // Closing the ticket also cancels any Meet session still on the calendar.
    const db = serviceClient();
    if (db) await cancelMeetForTicket(db, id, ctx.user.name || ctx.user.email);
  } else {
    await notify(id, "reopened", { actorEmail: ctx.user.email, extra: { reason } });
  }
  refresh(id);
  return { ok: true, message: works ? "Thank you. This ticket is now closed." : "Thank you. We have reopened it." };
}

/* ---------- Meet: manual link, and Calendar API when it is configured ---------- */

export async function saveMeet(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to change tickets." };
  const rawLink = str(fd.get("link"));
  const link = rawLink ? parseMeetLink(rawLink) : null;
  if (rawLink && !link) return { ok: false, message: "Enter a Google Meet link like https://meet.google.com/abc-defg-hij." };
  const rawAt = str(fd.get("at"));
  const at = rawAt ? istLocalToIso(rawAt) : null;
  if (rawAt && !at) return { ok: false, message: "Enter a valid date and time." };
  const { error } = await ctx.supabase.rpc("support_save_meet", { p_ticket: id, p_link: link, p_at: at });
  if (error) return { ok: false, message: friendly(error.message) };
  if (link) await notify(id, "meet", { actorEmail: ctx.user.email });
  refresh(id);
  return { ok: true, message: link ? "Meet session saved." : "Meet session removed." };
}

const MINUTES = [15, 30, 45, 60, 90];
type MeetInput = { ok: true; at: string; minutes: number } | { ok: false; error: string };
function meetInput(fd: FormData): MeetInput {
  const at = istLocalToIso(str(fd.get("at")));
  const minutes = Number(str(fd.get("minutes")) || 30);
  if (!at) return { ok: false, error: "Enter a valid date and time." };
  if (new Date(at).getTime() < Date.now() - 60_000) return { ok: false, error: "Choose a time in the future." };
  if (!MINUTES.includes(minutes)) return { ok: false, error: "Choose a length." };
  return { ok: true, at, minutes };
}

/** Creates the Calendar event with a Meet link, invites the reporter and assignee, and saves it on the ticket. */
export async function createMeetSession(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to change tickets." };
  const cal = calendarStatus();
  if (!cal.configured) return { ok: false, message: "Automatic scheduling is not set up yet. Use the Calendar link below." };
  const input = meetInput(fd);
  if (!input.ok) return { ok: false, message: input.error };

  const { data: t } = await ctx.supabase.from("support_tickets").select("number,title,reporter_email,assignee_id,status,meet_event_id").eq("id", id).maybeSingle();
  if (!t) return { ok: false, message: "Ticket not found." };
  if (t.status === "Closed") return { ok: false, message: "This ticket is closed." };
  if (t.meet_event_id) return { ok: false, message: "A session already exists. Reschedule or cancel it." };
  const { data: asg } = t.assignee_id ? await ctx.supabase.from("support_users").select("email").eq("id", t.assignee_id).maybeSingle() : { data: null };
  try {
    const ev = await createMeetEvent(cal.organizer, {
      number: t.number, title: t.title, ticketUrl: `${appUrl()}/tickets/${id}`, startIso: input.at, minutes: input.minutes,
      guests: [...new Set([t.reporter_email, asg?.email].filter((e): e is string => Boolean(e)))],
    }, randomUUID());
    const { error } = await ctx.supabase.rpc("support_save_meet_event", { p_ticket: id, p_event_id: ev.eventId, p_link: ev.meetLink, p_at: input.at });
    if (error) return { ok: false, message: friendly(error.message) };
  } catch (e) {
    return { ok: false, message: calendarErrorMessage(e) };
  }
  await notify(id, "meet", { actorEmail: ctx.user.email });
  refresh(id);
  return { ok: true, message: "Meet session created and the guests are invited." };
}

export async function rescheduleMeetSession(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to change tickets." };
  const cal = calendarStatus();
  if (!cal.configured) return { ok: false, message: "Automatic scheduling is not set up yet." };
  const input = meetInput(fd);
  if (!input.ok) return { ok: false, message: input.error };
  const { data: t } = await ctx.supabase.from("support_tickets").select("meet_event_id,meet_link,status").eq("id", id).maybeSingle();
  if (!t?.meet_event_id || !t.meet_link) return { ok: false, message: "There is no session to move." };
  if (t.status === "Closed") return { ok: false, message: "This ticket is closed." };
  try {
    await rescheduleEvent(cal.organizer, t.meet_event_id, input.at, input.minutes);
    const { error } = await ctx.supabase.rpc("support_save_meet_event", { p_ticket: id, p_event_id: t.meet_event_id, p_link: t.meet_link, p_at: input.at });
    if (error) return { ok: false, message: friendly(error.message) };
  } catch (e) {
    return { ok: false, message: calendarErrorMessage(e) };
  }
  await notify(id, "meet", { actorEmail: ctx.user.email });
  refresh(id);
  return { ok: true, message: "Session moved. Google told the guests the new time." };
}

export async function cancelMeetSession(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to change tickets." };
  const db = serviceClient();
  if (!db) return { ok: false, message: "Not configured." };
  const r = await cancelMeetForTicket(db, id, ctx.user.name || ctx.user.email);
  refresh(id);
  if (r === "failed") return { ok: false, message: "Could not cancel the calendar event. Try again, or cancel it in Google Calendar." };
  return { ok: true, message: r === "none" ? "There was no session." : "Session cancelled and the guests were told." };
}

/** Developers: send a failed email again from the ticket history. */
export async function retryEmailAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  const kind = str(fd.get("kind"));
  if (!UUID.test(id) || !isMailKind(kind)) return { ok: false, message: "Nothing to retry." };
  if (!isDev(ctx)) return { ok: false, message: "You are not allowed to do that." };
  const { data: t } = await ctx.supabase.from("support_tickets").select("id").eq("id", id).maybeSingle();
  if (!t) return { ok: false, message: "Ticket not found." };
  const sent = await retryEmail(id, kind);
  refresh(id);
  return sent ? { ok: true, message: "Email sent." } : { ok: false, message: "It could not be sent. Check the email settings." };
}
