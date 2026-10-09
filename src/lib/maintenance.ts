import { shouldAutoClose, DONE } from "./status-flow.ts";
import type { Status } from "./tickets.ts";

export type WaitingTicket = { id: string; status: Status; done_at: string | null; reminded_at: string | null };
const DAY = 86_400_000;

/** Tickets awaiting confirmation for at least `days` that have not had their reminder yet. */
export function selectReminders(rows: WaitingTicket[], now: Date, days: number): string[] {
  return rows
    .filter((t) => t.status === DONE && t.done_at && !t.reminded_at && now.getTime() - new Date(t.done_at).getTime() >= days * DAY)
    .map((t) => t.id);
}

/** Tickets to close by the system after `days` without an answer. */
export function selectAutoClose(rows: WaitingTicket[], now: Date, days: number): string[] {
  return rows.filter((t) => shouldAutoClose({ status: t.status, doneAt: t.done_at }, now, days)).map((t) => t.id);
}
