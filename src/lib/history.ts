export type HistoryEvent = {
  event_type: string; actor_name: string; old_value: string | null; new_value: string | null; reason: string | null;
};

/** One plain sentence per history row (after the actor's name). */
export function describeEvent(e: HistoryEvent): string {
  const to = e.new_value ?? "";
  const from = e.old_value ?? "";
  switch (e.event_type) {
    case "created": return "raised this ticket";
    case "status_changed": return `moved it from ${from} to ${to}`;
    case "assigned": return to ? (from ? `reassigned it from ${from} to ${to}` : `assigned it to ${to}`) : "removed the assignee";
    case "priority_changed": return `changed the priority from ${from} to ${to}`;
    case "expected_date_changed": return to ? `set the expected date to ${to}` : "cleared the expected date";
    case "viability_set": return to ? `marked viability as ${to.replace("_", " ")}` : "cleared viability";
    case "commented": return to === "internal note" ? "added an internal note" : "added a comment";
    case "attachment_added": return `attached ${to}`;
    case "confirmed": return to.startsWith("yes") ? `confirmed it works${to.includes("behalf") ? " (on behalf of the reporter)" : ""}` : "confirmed";
    case "reopened": return `said it is still not working${to.includes("behalf") ? " (recorded by a developer)" : ""}`;
    case "update_posted": return "posted an update";
    case "meet_scheduled": return "scheduled a Meet session";
    case "email_sent": return `sent an email (${to})`;
    case "email_failed": return `could not send an email (${to})`;
    default: return e.event_type.replace(/_/g, " ");
  }
}
