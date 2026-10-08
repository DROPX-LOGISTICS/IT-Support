import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { NotConfigured, PriorityPill, StatusBadge } from "@/components/ui";
import { isStaff } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { parseQueueFilters } from "@/lib/queue-filters";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, TYPE_LABEL, TICKET_TYPES, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";
type Row = { id: string; number: string; type: TicketType; title: string; priority: Priority; status: Status; expected_date: string | null; created_at: string; assignee_id: string | null; reporter_name: string; portal: { name: string } | null };

export default async function QueuePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  if (!isStaff(user.role)) redirect("/my-tickets");
  const f = parseQueueFilters(searchParams);
  const supabase = userClient()!;

  const [{ data: portals }, { data: devs }] = await Promise.all([
    supabase.from("support_portals").select("id,code,name").order("sort_order").returns<{ id: string; code: string; name: string }[]>(),
    supabase.from("support_users").select("id,name").in("role", ["developer", "admin"]).eq("is_active", true).order("name").returns<{ id: string; name: string }[]>(),
  ]);

  let q = supabase
    .from("support_tickets")
    .select("id,number,type,title,priority,status,expected_date,created_at,assignee_id,reporter_name,portal:support_portals(name)")
    .is("deleted_at", null);
  if (f.type) q = q.eq("type", f.type);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.status === "open") q = q.not("status", "in", '("Closed","Not viable")');
  else if (f.status !== "all") q = q.eq("status", f.status);
  const portalId = (portals ?? []).find((p) => p.code === f.portal)?.id;
  if (f.portal && portalId) q = q.eq("portal_id", portalId);
  if (f.assignee === "me") q = q.eq("assignee_id", user.id);
  else if (f.assignee === "none") q = q.is("assignee_id", null);
  else if (f.assignee) q = q.eq("assignee_id", f.assignee);
  if (f.q) q = q.or(`number.ilike.%${f.q}%,title.ilike.%${f.q}%,description.ilike.%${f.q}%,reporter_name.ilike.%${f.q}%`);
  // Priority first (P0 before P3), then oldest first.
  const { data, error } = await q.order("priority").order("created_at").limit(150).returns<Row[]>();
  const rows = data ?? [];
  const nameOf = (id: string | null) => (devs ?? []).find((d) => d.id === id)?.name;

  return (
    <>
      <AppHeader user={user} />
      <main className="container" style={{ maxWidth: 980 }}>
        <h1>Queue</h1>
        <p className="muted" style={{ margin: "0 0 16px" }}>All tickets, most urgent first, oldest first within a priority.</p>

        <form method="get" className="card filters">
          <div className="searchbox"><Search size={16} aria-hidden /><input type="text" name="q" defaultValue={f.q} placeholder="Search number, title, text or reporter" aria-label="Search" /></div>
          <div className="filter-grid">
            <select name="status" defaultValue={f.status} aria-label="Status">
              <option value="open">Open</option><option value="all">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select name="priority" defaultValue={f.priority} aria-label="Priority"><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p} · {PRIORITY_LABEL[p]}</option>)}</select>
            <select name="type" defaultValue={f.type} aria-label="Type"><option value="">Any type</option>{TICKET_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
            <select name="portal" defaultValue={f.portal} aria-label="Portal"><option value="">Any portal</option>{(portals ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
            <select name="assignee" defaultValue={f.assignee} aria-label="Assignee"><option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>{(devs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </div>
          <div className="actions"><Link className="btn ghost" href="/queue">Clear</Link><button className="btn" type="submit">Apply</button></div>
        </form>

        {error && <div className="banner bad" role="alert" style={{ marginTop: 16 }}>We could not load the queue. Please refresh.</div>}
        <p className="muted" style={{ margin: "16px 2px 8px" }}>{rows.length === 150 ? "Showing the first 150 tickets" : `${rows.length} ticket${rows.length === 1 ? "" : "s"}`}</p>
        {rows.length === 0 && <div className="card empty"><h2>Nothing matches</h2><p className="muted" style={{ margin: 0 }}>Try clearing a filter.</p></div>}
        {rows.map((t) => (
          <Link key={t.id} href={`/tickets/${t.id}`} className="card ticket qrow">
            <div className="ticket-top"><PriorityPill priority={t.priority} /><span className="num">{t.number}</span><StatusBadge status={t.status} /></div>
            <h2>{t.title}</h2>
            <div className="meta">
              <span>{TYPE_LABEL[t.type]}</span>{t.portal && <span>{t.portal.name}</span>}
              <span>By {t.reporter_name}</span><span>{nameOf(t.assignee_id) ? `Assigned to ${nameOf(t.assignee_id)}` : "Unassigned"}</span>
              <span>Raised {fmtDate(t.created_at)}</span>{t.expected_date && <span>Expected {fmtDate(t.expected_date)}</span>}
            </div>
          </Link>
        ))}
      </main>
    </>
  );
}
