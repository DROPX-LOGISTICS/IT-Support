"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/access";
import { isDateString, previousIstDate } from "@/lib/commits";
import { draftFromCommits } from "@/lib/daily-draft";
import { validateDailyRow, type DailyRowErrors } from "@/lib/daily-row";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export type RowResult = { ok: boolean; message: string; errors?: DailyRowErrors };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const dateOf = (fd: FormData) => (isDateString(str(fd, "date")) ? str(fd, "date") : previousIstDate(new Date()));

async function ctx() {
  const s = await requireUser();
  const supabase = userClient();
  if (s.state !== "ok" || !supabase || !isStaff(s.user.role) || s.user.role === "manager") redirect("/my-tickets");
  const { data: own } = await supabase.from("support_developers").select("id").eq("user_id", s.user.id).eq("is_active", true).maybeSingle();
  return { supabase, user: s.user, ownDeveloperId: (own?.id as string | undefined) ?? null };
}
const back = (date: string, q: string): never => {
  revalidatePath("/daily-updates");
  redirect(`/daily-updates?date=${date}${q ? `&${q}` : ""}`);
};
const FRIENDLY: [string, string][] = [
  ["Write what was done first", "Write what was done before publishing."],
  ["Add the blocker first", "Say what is blocking you before publishing."],
  ["Already published", "This row is already published."],
  ["Not allowed", "You are not allowed to do that."],
];
const friendly = (m?: string) => FRIENDLY.find(([k]) => m?.includes(k))?.[1] ?? "Something went wrong. Please try again.";

// "Draft from commits" for any date, for the signed-in developer's own rows only (row-level security applies).
export async function draftFromCommitsAction(fd: FormData) {
  const { supabase, ownDeveloperId } = await ctx();
  const date = dateOf(fd);
  if (!ownDeveloperId) back(date, "notice=nodev");
  const run = await draftFromCommits({ db: supabase, date, onlyDeveloperId: ownDeveloperId!, recordUnmatched: false });
  if (!run.configured) back(date, "notice=nogithub");
  if (run.configured) back(date, `created=${run.created}&updated=${run.updated}&unmatched=${run.unmatched}&noportal=${run.noPortal}&errors=${run.errors.length}`);
}

async function ticketIdFor(supabase: NonNullable<ReturnType<typeof userClient>>, number: string): Promise<string | null | "missing"> {
  if (!number) return null;
  const m = /^(BUG|FR|SUP)-0*(\d+)$/.exec(number)!;
  const canonical = `${m[1]}-${m[2].padStart(3, "0")}`;
  const { data } = await supabase.from("support_tickets").select("id").eq("number", canonical).maybeSingle();
  return data?.id ?? "missing";
}

function fields(fd: FormData) {
  return { portalId: fd.get("portalId"), ticketNumber: fd.get("ticketNumber"), workDone: fd.get("workDone"), hours: fd.get("hours"), status: fd.get("status"), blocker: fd.get("blocker"), nextStep: fd.get("nextStep"), targetDate: fd.get("targetDate") };
}

export async function saveDailyRow(_p: RowResult, fd: FormData): Promise<RowResult> {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!UUID.test(id)) return { ok: false, message: "Row not found." };
  const publishing = str(fd, "intent") === "publish";
  const v = validateDailyRow(fields(fd), publishing);
  if (!v.ok) return { ok: false, message: "Please check the highlighted fields.", errors: v.errors };
  const ticketId = await ticketIdFor(supabase, v.value.ticketNumber);
  if (ticketId === "missing") return { ok: false, message: "That ticket number was not found.", errors: { ticketNumber: "Not found." } };

  const { data, error } = await supabase.from("support_daily_updates").update({
    portal_id: v.value.portalId, ticket_id: ticketId, work_done: v.value.workDone, hours: v.value.hours, status: v.value.status,
    blocker: v.value.blocker || null, next_step: v.value.nextStep || null, target_date: v.value.targetDate,
  }).eq("id", id).eq("state", "draft").select("id");
  if (error?.code === "23505") return { ok: false, message: "Another draft already exists for that portal and ticket today. Edit that one instead." };
  if (error || !data?.length) return { ok: false, message: "Could not save. The row may already be published." };
  if (publishing) {
    const pub = await supabase.rpc("support_publish_daily_update", { p_id: id });
    if (pub.error) return { ok: false, message: friendly(pub.error.message) };
    revalidatePath("/daily-updates");
    return { ok: true, message: "Published." };
  }
  revalidatePath("/daily-updates");
  return { ok: true, message: "Saved." };
}

export async function addManualRow(_p: RowResult, fd: FormData): Promise<RowResult> {
  const { supabase, ownDeveloperId } = await ctx();
  if (!ownDeveloperId) return { ok: false, message: "You are not set up as a developer yet. Ask an admin to add you under Master, Developers." };
  const date = dateOf(fd);
  const v = validateDailyRow(fields(fd), false);
  if (!v.ok) return { ok: false, message: "Please check the highlighted fields.", errors: v.errors };
  if (!v.value.workDone) return { ok: false, message: "Write what was done.", errors: { workDone: "Write what was done." } };
  const ticketId = await ticketIdFor(supabase, v.value.ticketNumber);
  if (ticketId === "missing") return { ok: false, message: "That ticket number was not found.", errors: { ticketNumber: "Not found." } };
  const { error } = await supabase.from("support_daily_updates").insert({
    update_date: date, developer_id: ownDeveloperId, portal_id: v.value.portalId, ticket_id: ticketId, work_done: v.value.workDone,
    hours: v.value.hours, status: v.value.status, blocker: v.value.blocker || null, next_step: v.value.nextStep || null,
    target_date: v.value.targetDate, state: "draft", source: "manual", commit_shas: [],
  });
  if (error) return { ok: false, message: "Could not add the row." };
  revalidatePath("/daily-updates");
  return { ok: true, message: "Row added." };
}

export async function discardDraft(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  const date = dateOf(fd);
  if (UUID.test(id)) await supabase.from("support_daily_updates").delete().eq("id", id).eq("state", "draft");
  back(date, "notice=discarded");
}

export async function publishAll(fd: FormData) {
  const { supabase, ownDeveloperId } = await ctx();
  const date = dateOf(fd);
  if (!ownDeveloperId) back(date, "notice=nodev");
  const { data } = await supabase.from("support_daily_updates").select("id").eq("update_date", date).eq("developer_id", ownDeveloperId!).eq("state", "draft");
  let published = 0, skipped = 0;
  for (const r of data ?? []) {
    const res = await supabase.rpc("support_publish_daily_update", { p_id: r.id });
    if (res.error) skipped++; else published++;
  }
  back(date, `published=${published}&skipped=${skipped}`);
}
