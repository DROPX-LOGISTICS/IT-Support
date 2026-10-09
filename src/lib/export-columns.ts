import { toCsv, type Cell } from "./csv.ts";

const IST_MS = 330 * 60_000;
/** "2026-10-08 14:05" in IST. */
export const istStamp = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 16).replace("T", " ") : "");
export const istDay = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10) : "");

export const TICKET_HEADER = [
  "ID", "Type", "Portal", "Title", "What went wrong / what is needed", "Steps or links", "Reporter", "Raised by", "Phone",
  "Priority", "Screenshot links", "Status", "Expected date", "Developer update", "Does it work now?", "Is it viable?",
  "Viability reason", "Assignee", "Raised on", "Last updated", "Closed on",
];

export type TicketExportRow = {
  number: string; type: string; portal: string; title: string; description: string; steps: string | null; reporter_name: string;
  raised_by_name: string; raised_by_phone: string | null; priority: string; attachmentLinks: string[]; status: string;
  expected_date: string | null; developer_update: string | null; confirmed_working: string | null; viable: string | null;
  viable_reason: string | null; assignee: string; created_at: string; updated_at: string; closed_at: string | null;
};

const TYPE_LABEL: Record<string, string> = { bug: "Bug", feature: "Feature request", support: "Support issue" };

/** Internal comments and notes are never part of an export. */
export function ticketCells(rows: TicketExportRow[]): Cell[][] {
  return rows.map((t): Cell[] => [
    t.number, TYPE_LABEL[t.type] ?? t.type, t.portal, t.title, t.description, t.steps, t.reporter_name, t.raised_by_name, t.raised_by_phone,
    t.priority, t.attachmentLinks.join("; "), t.status, t.expected_date, t.developer_update,
    t.confirmed_working === "yes" ? "Yes" : t.confirmed_working === "no" ? "No" : "",
    t.viable === "yes" ? "Yes" : t.viable === "no" ? "No" : t.viable === "needs_discussion" ? "Needs discussion" : "",
    t.viable_reason, t.assignee, istStamp(t.created_at), istStamp(t.updated_at), istStamp(t.closed_at),
  ]);
}
export const ticketsCsv = (rows: TicketExportRow[]): string => toCsv(TICKET_HEADER, ticketCells(rows));

export const DAILY_HEADER = ["Date", "Developer", "Portal", "Related ID", "Work done", "Hours", "Status", "Blocker", "Next step", "Target date"];
export type DailyExportRow = {
  update_date: string; developer: string; portal: string; ticket: string | null; work_done: string; hours: number | null;
  status: string; blocker: string | null; next_step: string | null; target_date: string | null;
};
export const dailyCells = (rows: DailyExportRow[]): Cell[][] =>
  rows.map((r): Cell[] => [r.update_date, r.developer, r.portal, r.ticket, r.work_done, r.hours, r.status, r.blocker, r.next_step, r.target_date]);
export const dailyCsv = (rows: DailyExportRow[]): string => toCsv(DAILY_HEADER, dailyCells(rows));
