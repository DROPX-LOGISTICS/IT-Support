import { NextResponse, type NextRequest } from "next/server";
import { isStaff } from "@/lib/access";
import { appUrl } from "@/lib/config";
import { ticketsCsv, type TicketExportRow } from "@/lib/export-columns";
import { applyQueueFilters } from "@/lib/queue-query";
import { parseQueueFilters } from "@/lib/queue-filters";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const LIMIT = 5000;

type Row = {
  id: string; number: string; type: string; title: string; description: string; steps: string | null; reporter_name: string;
  raised_by_name: string; raised_by_phone: string | null; priority: string; status: string; expected_date: string | null;
  developer_update: string | null; confirmed_working: string | null; viable: string | null; viable_reason: string | null;
  assignee_id: string | null; created_at: string; updated_at: string; closed_at: string | null; portal: { name: string } | null;
};

// Staff only, and it runs as the person, so row-level security applies as well. Same filters as the queue screen.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session.state !== "ok") return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isStaff(session.user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const supabase = userClient()!;
  const f = parseQueueFilters(Object.fromEntries(request.nextUrl.searchParams));

  const [{ data: portals }, { data: devs }] = await Promise.all([
    supabase.from("support_portals").select("id,code"),
    supabase.from("support_users").select("id,name").in("role", ["developer", "admin"]),
  ]);
  const portalId = (portals ?? []).find((p: { code: string }) => p.code === f.portal)?.id;
  const base = supabase
    .from("support_tickets")
    .select("id,number,type,title,description,steps,reporter_name,raised_by_name,raised_by_phone,priority,status,expected_date,developer_update,confirmed_working,viable,viable_reason,assignee_id,created_at,updated_at,closed_at,portal:support_portals(name)");
  const { data, error } = await applyQueueFilters(base, f, { portalId, userId: session.user.id })
    .order("priority").order("created_at").range(0, LIMIT - 1);
  if (error) return NextResponse.json({ error: "Could not export" }, { status: 500 });
  const tickets = (data ?? []) as Row[];

  const links = new Map<string, string[]>();
  for (let i = 0; i < tickets.length; i += 200) {
    const ids = tickets.slice(i, i + 200).map((t) => t.id);
    const { data: att } = await supabase.from("support_attachments").select("id,ticket_id").in("ticket_id", ids);
    for (const a of att ?? []) links.set(a.ticket_id, [...(links.get(a.ticket_id) ?? []), `${appUrl()}/api/attachments/${a.id}`]);
  }
  const nameOf = (id: string | null) => (devs ?? []).find((d: { id: string }) => d.id === id)?.name ?? "";
  const rows: TicketExportRow[] = tickets.map((t) => ({
    number: t.number, type: t.type, portal: t.portal?.name ?? "", title: t.title, description: t.description, steps: t.steps,
    reporter_name: t.reporter_name, raised_by_name: t.raised_by_name, raised_by_phone: t.raised_by_phone, priority: t.priority,
    attachmentLinks: links.get(t.id) ?? [], status: t.status, expected_date: t.expected_date, developer_update: t.developer_update,
    confirmed_working: t.confirmed_working, viable: t.viable, viable_reason: t.viable_reason, assignee: nameOf(t.assignee_id),
    created_at: t.created_at, updated_at: t.updated_at, closed_at: t.closed_at,
  }));
  return new NextResponse(ticketsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
