import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Search } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { NotConfigured, OverdueBadge, PriorityPill, StatusBadge } from "@/components/ui";
import { SheetsExport } from "@/components/sheets-export";
import { sheetsStatus } from "@/lib/google-sheets";
import { loadSettings } from "@/lib/targets-server";
import { overdueInfo } from "@/lib/targets";
import { isStaff } from "@/lib/access";
import { fmtDate } from "@/lib/format";
import { parseQueueFilters } from "@/lib/queue-filters";
import { applyQueueFilters } from "@/lib/queue-query";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, TYPE_LABEL, TICKET_TYPES, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";
type Row = { id: string; number: string; type: TicketType; title: string; priority: Priority; status: Status; expected_date: string | null; created_at: string; assignee_id: string | null; reporter_name: string; portal: { name: string } | null; first_response_at: string | null; confirmed_at: string | null };

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

  const portalId = (portals ?? []).find((p) => p.code === f.portal)?.id;
  const base = supabase
    .from("support_tickets")
    .select("id,number,type,title,priority,status,expected_date,created_at,assignee_id,reporter_name,first_response_at,confirmed_at,portal:support_portals(name)");
  const q = applyQueueFilters(base, f, { portalId, userId: user.id });
  // Priority first (P0 before P3), then oldest first.
  const { data, error } = (await q.order("priority").order("created_at").limit(f.overdue ? 1000 : 150)) as { data: Row[] | null; error: { message: string } | null };
  const { targets } = await loadSettings(supabase);
  const now = new Date();
  const withDue = (data ?? []).map((t) => ({ ...t, due: overdueInfo(t, targets, now) }));
  // Overdue depends on each ticket's priority and the targets in Settings, so it is worked out here, not in the database.
  const rows = (f.overdue ? withDue.filter((t) => t.due.overdue) : withDue).slice(0, 150);
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
            <label className="hint" style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" name="overdue" value="1" defaultChecked={f.overdue === "1"} /> Overdue only</label>
            <select name="assignee" defaultValue={f.assignee} aria-label="Assignee"><option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>{(devs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </div>
          <div className="actions"><a className="btn ghost" href={`/api/export/tickets?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()}`}><Download size={16} aria-hidden /> Export CSV</a><Link className="btn ghost" href="/queue">Clear</Link><button className="btn" type="submit">Apply</button></div>
        </form>

        <SheetsExport kind="tickets" params={Object.fromEntries(Object.entries(f).filter(([, v]) => v))} status={sheetsStatus().configured ? "ready" : "off"} />
        {error && <div className="banner bad" role="alert" style={{ marginTop: 16 }}>We could not load the queue. Please refresh.</div>}
        <p className="muted" style={{ margin: "16px 2px 8px" }}>{rows.length === 150 ? "Showing the first 150 tickets" : `${rows.length} ticket${rows.length === 1 ? "" : "s"}`}</p>
        {rows.length === 0 && <div className="card empty"><h2>Nothing matches</h2><p className="muted" style={{ margin: 0 }}>Try clearing a filter.</p></div>}
        {rows.map((t) => (
          <Link key={t.id} href={`/tickets/${t.id}`} className="card ticket qrow">
            <div className="ticket-top"><PriorityPill priority={t.priority} /><span className="num">{t.number}</span><StatusBadge status={t.status} />{t.due.overdue && <OverdueBadge hours={t.due.hoursOver} />}</div>
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
