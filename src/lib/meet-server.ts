import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarStatus, cancelEvent } from "./google-calendar.ts";

/**
 * Cancels the Calendar event of a ticket (guests are told by Google) and clears the Meet fields.
 * Used when a ticket closes and when a developer cancels. Service role use: the caller has already
 * checked who the person is (reporter confirming, developer cancelling, or the signed scheduled job).
 */
export async function cancelMeetForTicket(db: SupabaseClient, ticketId: string, actorName: string): Promise<"none" | "cancelled" | "failed"> {
  const { data: t } = await db.from("support_tickets").select("meet_event_id").eq("id", ticketId).maybeSingle();
  if (!t?.meet_event_id) return "none";
  const cal = calendarStatus();
  if (!cal.configured) return "failed";
  try {
    await cancelEvent(cal.organizer, t.meet_event_id);
  } catch {
    return "failed";
  }
  await db.from("support_tickets").update({ meet_event_id: null, meet_link: null, meet_at: null }).eq("id", ticketId);
  await db.from("support_events").insert({ ticket_id: ticketId, actor_name: actorName, event_type: "meet_cancelled", new_value: "session cancelled" });
  return "cancelled";
}
