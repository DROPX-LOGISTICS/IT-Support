"use server";
import { revalidatePath } from "next/cache";
import { canChangeTicket } from "@/lib/access";
import { notifyConfirmationRequest } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
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
  ["Not allowed", "You are not allowed to do that."],
];
function friendly(message: string | undefined): string {
  const hit = FRIENDLY.find(([k]) => message?.includes(k));
  return hit ? hit[1] : "Something went wrong. Please try again.";
}
function refresh(id: string) {
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/queue");
  revalidatePath("/my-tickets");
}

async function context() {
  const session = await requireUser();
  const supabase = userClient();
  if (session.state !== "ok" || !supabase) return null;
  return { user: session.user, supabase };
}

export async function changeStatus(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  const seen = str(fd.get("seen")) as Status;
  const to = str(fd.get("to")) as Status;
  if (!UUID.test(id) || !STATUSES.includes(seen) || !STATUSES.includes(to)) return { ok: false, message: "Choose a status." };
  if (!canChangeTicket({ id: ctx.user.id, role: ctx.user.role, isActive: true })) return { ok: false, message: "You are not allowed to change tickets." };
  const reason = str(fd.get("reason"));
  const update = str(fd.get("update"));

  // Cheap pre-check for a clear message; the database function enforces the same rules.
  const { data: t } = await ctx.supabase.from("support_tickets").select("type,status,developer_update").eq("id", id).maybeSingle();
  if (!t) return { ok: false, message: "Ticket not found." };
  const pre = checkTransition({ type: t.type, current: t.status, seen, to, reason, developerUpdate: update, existingUpdate: t.developer_update });
  if (!pre.ok) return { ok: false, message: pre.message };

  const { error } = await ctx.supabase.rpc("support_change_status", { p_ticket: id, p_expected: seen, p_new: to, p_reason: reason, p_update: update });
  if (error) return { ok: false, message: friendly(error.message) };
  if (to === DONE) await notifyConfirmationRequest(id);
  refresh(id);
  return { ok: true, message: `Moved to ${to}.` };
}

export async function saveDetails(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Not configured." };
  const id = str(fd.get("ticketId"));
  if (!UUID.test(id)) return { ok: false, message: "Ticket not found." };
  if (!canChangeTicket({ id: ctx.user.id, role: ctx.user.role, isActive: true })) return { ok: false, message: "You are not allowed to change tickets." };

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
  const { error } = await ctx.supabase.rpc("support_update_ticket", { p_ticket: id, p_patch: patch });
  if (error) return { ok: false, message: friendly(error.message) };
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
  const pre = checkConfirmation({
    status: t.status, works, reason, isReporter: t.reporter_id === ctx.user.id,
    isDeveloper: canChangeTicket({ id: ctx.user.id, role: ctx.user.role, isActive: true }),
  });
  if (!pre.ok) return { ok: false, message: pre.message };
  const { error } = await ctx.supabase.rpc("support_confirm_ticket", { p_ticket: id, p_works: works, p_reason: reason });
  if (error) return { ok: false, message: friendly(error.message) };
  refresh(id);
  return { ok: true, message: works ? "Thank you. This ticket is now closed." : "Thank you. We have reopened it." };
}
