import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "./config.ts";
import type { DailyExportRow, TicketExportRow } from "./export-columns.ts";
import { applyQueueFilters } from "./queue-query.ts";
import type { QueueFilters } from "./queue-filters.ts";
import { loadSettings } from "./targets-server.ts";
import { overdueInfo } from "./targets.ts";

export const TICKET_EXPORT_LIMIT = 5000;
export const DAILY_EXPORT_LIMIT = 10000;

type TRow = {
  id: string; number: string; type: string; title: string; description: string; steps: string | null; reporter_name: string;
  raised_by_name: string; raised_by_phone: string | null; priority: string; status: string; expected_date: string | null;
  developer_update: string | null; confirmed_working: string | null; viable: string | null; viable_reason: string | null;
  assignee_id: string | null; created_at: string; updated_at: string; closed_at: string | null; portal: { name: string } | null;
  first_response_at: string | null; confirmed_at: string | null;
};

/** The tickets on screen, as export rows. Runs as the signed-in person, so row-level security applies. Internal notes are never read. */
export async function loadTicketExport(db: SupabaseClient, f: QueueFilters, userId: string): Promise<TicketExportRow[] | null> {
  const [{ data: portals }, { data: devs }] = await Promise.all([
    db.from("support_portals").select("id,code"),
    db.from("support_users").select("id,name").in("role", ["developer", "admin"]),
  ]);
  const portalId = (portals ?? []).find((p: { code: string }) => p.code === f.portal)?.id;
  const base = db.from("support_tickets").select("id,number,type,title,description,steps,reporter_name,raised_by_name,raised_by_phone,priority,status,expected_date,developer_update,confirmed_working,viable,viable_reason,assignee_id,created_at,updated_at,closed_at,first_response_at,confirmed_at,portal:support_portals(name)");
  const { data, error } = await applyQueueFilters(base, f, { portalId, userId }).order("priority").order("created_at").range(0, TICKET_EXPORT_LIMIT - 1);
  if (error) return null;
  let tickets = (data ?? []) as TRow[];
  if (f.overdue) {
    const { targets } = await loadSettings(db);
    const now = new Date();
    tickets = tickets.filter((t) => overdueInfo({ priority: t.priority as never, status: t.status as never, created_at: t.created_at, first_response_at: t.first_response_at, confirmed_at: t.confirmed_at }, targets, now).overdue);
  }
  const links = new Map<string, string[]>();
  for (let i = 0; i < tickets.length; i += 200) {
    const { data: att } = await db.from("support_attachments").select("id,ticket_id").in("ticket_id", tickets.slice(i, i + 200).map((t) => t.id));
    for (const a of att ?? []) links.set(a.ticket_id, [...(links.get(a.ticket_id) ?? []), `${appUrl()}/api/attachments/${a.id}`]);
  }
  const nameOf = (id: string | null) => (devs ?? []).find((d: { id: string }) => d.id === id)?.name ?? "";
  return tickets.map((t) => ({
    number: t.number, type: t.type, portal: t.portal?.name ?? "", title: t.title, description: t.description, steps: t.steps, reporter_name: t.reporter_name,
    raised_by_name: t.raised_by_name, raised_by_phone: t.raised_by_phone, priority: t.priority, attachmentLinks: links.get(t.id) ?? [], status: t.status,
    expected_date: t.expected_date, developer_update: t.developer_update, confirmed_working: t.confirmed_working, viable: t.viable, viable_reason: t.viable_reason,
    assignee: nameOf(t.assignee_id), created_at: t.created_at, updated_at: t.updated_at, closed_at: t.closed_at,
  }));
}

type DRow = { update_date: string; work_done: string; hours: number | null; status: string; blocker: string | null; next_step: string | null; target_date: string | null; portal: { name: string } | null; ticket: { number: string } | null; developer: { display_name: string } | null };

/** Published daily updates between two dates (inclusive), optionally for one developer. */
export async function loadDailyExport(db: SupabaseClient, from: string, to: string, developerId: string): Promise<DailyExportRow[] | null> {
  let q = db.from("support_daily_updates")
    .select("update_date,work_done,hours,status,blocker,next_step,target_date,portal:support_portals(name),ticket:support_tickets(number),developer:support_developers(display_name)")
    .eq("state", "published").gte("update_date", from).lte("update_date", to);
  if (/^[0-9a-f-]{36}$/i.test(developerId)) q = q.eq("developer_id", developerId);
  const { data, error } = await q.order("update_date").order("created_at").range(0, DAILY_EXPORT_LIMIT - 1);
  if (error) return null;
  return ((data ?? []) as unknown as DRow[]).map((r) => ({
    update_date: r.update_date, developer: r.developer?.display_name ?? "", portal: r.portal?.name ?? "", ticket: r.ticket?.number ?? null,
    work_done: r.work_done, hours: r.hours, status: r.status, blocker: r.blocker, next_step: r.next_step, target_date: r.target_date,
  }));
}

/** Date range rules shared by the CSV route and the Sheets export: default last 30 days, at most a year. */
export function exportRange(isDate: (s: string) => boolean, prevDay: string, fromRaw: string | null, toRaw: string | null): { from: string; to: string } | { error: string } {
  const DAY = 86_400_000;
  const to = toRaw && isDate(toRaw) ? toRaw : prevDay;
  let from = fromRaw && isDate(fromRaw) ? fromRaw : new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * DAY).toISOString().slice(0, 10);
  if (from > to) from = to;
  if (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 366 * DAY) return { error: "Choose a range of at most one year" };
  return { from, to };
}
