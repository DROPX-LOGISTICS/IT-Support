import type { Status, TicketType } from "./tickets.ts";

export const DONE: Status = "Done – awaiting confirmation";
export const AUTO_CLOSE_DAYS = 7;

/** Moves a developer may make (spec section 5). Mirrors support_change_status in SQL. */
export function allowedNextStatuses(type: TicketType, from: Status): Status[] {
  switch (from) {
    case "New": return type === "feature" ? ["Viable check"] : ["In progress"];
    case "Viable check": return ["In progress", "Not viable"];
    case "In progress": return ["Blocked", DONE];
    case "Blocked": return ["In progress"];
    case "Reopened": return ["In progress", "Blocked"];
    default: return [];
  }
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: "stale" | "not_allowed" | "reason_required" | "update_required"; message: string };

export function checkTransition(i: {
  type: TicketType; current: Status; seen: Status; to: Status; reason?: string; developerUpdate?: string | null; existingUpdate?: string | null;
}): TransitionCheck {
  if (i.current !== i.seen) return { ok: false, code: "stale", message: "This ticket changed while you were looking at it. Refresh and try again." };
  if (!allowedNextStatuses(i.type, i.current).includes(i.to)) return { ok: false, code: "not_allowed", message: "That status change is not allowed." };
  const reason = (i.reason ?? "").trim();
  if ((i.to === "Blocked" || i.to === "Not viable") && !reason) return { ok: false, code: "reason_required", message: "A reason is required." };
  if (i.to === DONE && !(i.developerUpdate ?? "").trim() && !(i.existingUpdate ?? "").trim()) {
    return { ok: false, code: "update_required", message: "Write an update for the reporter first." };
  }
  return { ok: true };
}

export type ConfirmCheck =
  | { ok: true; next: "Closed" | "Reopened" }
  | { ok: false; code: "not_allowed" | "not_waiting" | "reason_required"; message: string };

/** Reporter confirms or reopens; a developer or admin may act only with a recorded reason. */
export function checkConfirmation(i: { status: Status; works: boolean; isReporter: boolean; isDeveloper: boolean; reason?: string }): ConfirmCheck {
  if (!i.isReporter && !i.isDeveloper) return { ok: false, code: "not_allowed", message: "Only the person who raised this ticket can confirm it." };
  if (i.status !== DONE) return { ok: false, code: "not_waiting", message: "This ticket is not waiting for confirmation." };
  const reason = (i.reason ?? "").trim();
  if (!i.isReporter && !reason) return { ok: false, code: "reason_required", message: "A reason is required when confirming for the reporter." };
  if (!i.works && !reason) return { ok: false, code: "reason_required", message: "Please tell us what still fails." };
  return { ok: true, next: i.works ? "Closed" : "Reopened" };
}

/** Closed by the system after 7 days without a reply (the scheduled job arrives in a later phase). */
export function shouldAutoClose(t: { status: Status; doneAt: string | null }, now: Date, days = AUTO_CLOSE_DAYS): boolean {
  if (t.status !== DONE || !t.doneAt) return false;
  return now.getTime() - new Date(t.doneAt).getTime() >= days * 86_400_000;
}
