import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { selectAutoClose, selectReminders, type WaitingTicket } from "@/lib/maintenance";
import { cancelMeetForTicket } from "@/lib/meet-server";
import { notify } from "@/lib/notifications";
import { serviceClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTO_CLOSE_DAYS, DEFAULT_REMINDER_DAYS } from "@/lib/targets";
import { DONE } from "@/lib/status-flow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily: close tickets nobody confirmed (default after 7 days, recorded as closed by the system) and
// remind reporters once (default after 3 days). Service role use: the scheduler is the caller, protected by CRON_SECRET.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ ok: false, reason: "CRON_SECRET is not configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, reason: "Supabase service role is not configured" }, { status: 503 });

  const { data: s } = await db.from("support_settings").select("reminder_days,auto_close_days").limit(1).maybeSingle();
  const reminderDays = s?.reminder_days ?? DEFAULT_REMINDER_DAYS;
  const autoCloseDays = s?.auto_close_days ?? DEFAULT_AUTO_CLOSE_DAYS;
  const now = new Date();
  const { data } = await db.from("support_tickets").select("id,status,done_at,reminded_at").eq("status", DONE).is("deleted_at", null).limit(2000);
  const waiting = (data ?? []) as WaitingTicket[];

  let closed = 0, reminded = 0, failedReminders = 0;
  const toClose = new Set(selectAutoClose(waiting, now, autoCloseDays));
  for (const id of toClose) {
    // Guarded update: only a ticket still awaiting confirmation is closed, so a reporter's answer is never overwritten.
    const { data: done } = await db.from("support_tickets").update({ status: "Closed", closed_at: now.toISOString() }).eq("id", id).eq("status", DONE).select("id");
    if (!done?.length) continue;
    await db.from("support_events").insert({ ticket_id: id, actor_name: "System", event_type: "auto_closed", old_value: DONE, new_value: "Closed", reason: `No answer after ${autoCloseDays} days` });
    await cancelMeetForTicket(db, id, "System");
    closed++;
  }
  for (const id of selectReminders(waiting.filter((t) => !toClose.has(t.id)), now, reminderDays)) {
    if (await notify(id, "reminder")) {
      await db.from("support_tickets").update({ reminded_at: now.toISOString() }).eq("id", id);
      await db.from("support_events").insert({ ticket_id: id, actor_name: "System", event_type: "reminder_sent", new_value: "reminder to reporter" });
      reminded++;
    } else failedReminders++; // tried again tomorrow
  }
  return NextResponse.json({ ok: true, waiting: waiting.length, closed, reminded, failedReminders });
}
