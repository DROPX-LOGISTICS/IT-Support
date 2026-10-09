"use server";
import { isStaff } from "@/lib/access";
import { isDateString, previousIstDate } from "@/lib/commits";
import { dailyCells, DAILY_HEADER, ticketCells, TICKET_HEADER } from "@/lib/export-columns";
import { exportRange, loadDailyExport, loadTicketExport } from "@/lib/export-data";
import { calendarErrorMessage } from "@/lib/google-calendar";
import { createSheetExport, sheetsStatus } from "@/lib/google-sheets";
import { parseQueueFilters } from "@/lib/queue-filters";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export type SheetResult = { ok: boolean; message: string; url?: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Export to Google Sheets: a new sheet owned by the organiser mailbox, shared with the person who asked. Same rows as the CSV. */
export async function exportToSheets(_p: SheetResult, fd: FormData): Promise<SheetResult> {
  const s = await requireUser();
  const supabase = userClient();
  if (s.state !== "ok" || !supabase) return { ok: false, message: "Not configured." };
  if (!isStaff(s.user.role)) return { ok: false, message: "You are not allowed to export." };
  const status = sheetsStatus();
  if (!status.configured) return { ok: false, message: "Google Sheets export is not set up yet. Download the CSV instead." };
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (str(fd, "kind") === "daily") {
      const range = exportRange(isDateString, previousIstDate(new Date()), str(fd, "from") || null, str(fd, "to") || null);
      if ("error" in range) return { ok: false, message: range.error };
      const rows = await loadDailyExport(supabase, range.from, range.to, str(fd, "dev"));
      if (!rows) return { ok: false, message: "Could not read the updates." };
      const r = await createSheetExport(status.owner, { title: `Daily updates ${range.from} to ${range.to}`, tab: "Daily updates", header: DAILY_HEADER, rows: dailyCells(rows), shareWith: s.user.email });
      return { ok: true, message: `Exported ${rows.length} row(s).`, url: r.url };
    }
    const filters = parseQueueFilters(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
    const rows = await loadTicketExport(supabase, filters, s.user.id);
    if (!rows) return { ok: false, message: "Could not read the tickets." };
    const r = await createSheetExport(status.owner, { title: `IT Support tickets ${today}`, tab: "Tickets", header: TICKET_HEADER, rows: ticketCells(rows), shareWith: s.user.email });
    return { ok: true, message: `Exported ${rows.length} ticket(s).`, url: r.url };
  } catch (e) {
    return { ok: false, message: calendarErrorMessage(e).replace("Calendar", "Google") };
  }
}
