import { CheckCircle2, Eye, Inbox, ShieldCheck, Ticket } from "lucide-react";
import Link from "next/link";
import { ShellFrame } from "@/components/app-shell";
import { NotConfigured, PriorityPill, StatusBadge } from "@/components/ui";
import { canManageMaster, isStaff, type Role } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import type { Priority, Status, TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";

type Person = { id: string; name: string; email: string; role: Role; is_active: boolean };
type Row = { id: string; number: string; title: string; type: TicketType; priority: Priority; status: Status; created_at: string; assignee_id: string | null; reporter_id: string | null; portal: { name: string } | null };

const select = "id,number,title,type,priority,status,created_at,assignee_id,reporter_id,portal:support_portals(name)";

function PreviewBanner({ person }: { person: Person }) {
  return <div className="view-as-preview-banner"><Eye size={17} aria-hidden /><div><strong>Viewing as {person.name || person.email}</strong><span>Same role-based workspace · read-only preview</span></div><span className="system-status live"><ShieldCheck size={14} aria-hidden /> Safe mode</span><Link className="back" href="/">Exit preview</Link></div>;
}

function TicketList({ rows, staff }: { rows: Row[]; staff: boolean }) {
  return rows.length > 0 ? <div className="view-as-work-list">{rows.slice(0, 12).map((ticket) => <article className="card view-as-work-ticket" key={ticket.id}><div><strong>{ticket.number}</strong><h3>{ticket.title}</h3><small>{ticket.portal?.name ?? "No portal"} · {ticket.type}{staff && ticket.reporter_id ? " · reporter ticket" : ""}</small></div><div><PriorityPill priority={ticket.priority} /><StatusBadge status={ticket.status} /></div></article>)}</div> : <div className="card empty"><CheckCircle2 size={24} aria-hidden /><h2>{staff ? "No open team tickets" : "No tickets yet"}</h2><p className="muted">This is the empty state shown to the selected user.</p></div>;
}

export default async function ViewAsPage({ searchParams }: { searchParams: { user?: string } }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  if (!canManageMaster({ id: session.user.id, role: session.user.role, isActive: true })) return <main className="center-page"><div className="card"><h1>Admins only</h1><p className="muted">User previews are restricted to administrators.</p></div></main>;

  const db = userClient()!;
  const { data: person } = searchParams.user ? await db.from("support_users").select("id,name,email,role,is_active").eq("id", searchParams.user).maybeSingle<Person>() : { data: null };
  if (!person) return <main className="center-page"><div className="card"><h1>Choose a user</h1><p className="muted">Open View as user from the admin sidebar and search for a profile.</p></div></main>;

  const staff = isStaff(person.role);
  const [mine, team, confirm, unassigned] = await Promise.all([
    db.from("support_tickets").select(select).eq("reporter_id", person.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200).returns<Row[]>(),
    staff ? db.from("support_tickets").select(select).is("deleted_at", null).not("status", "in", '("Closed","Not viable")').order("created_at", { ascending: false }).limit(200).returns<Row[]>() : Promise.resolve({ data: [] as Row[] }),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("reporter_id", person.id).eq("status", "Done").is("deleted_at", null),
    staff ? db.from("support_tickets").select("id", { count: "exact", head: true }).is("assignee_id", null).is("deleted_at", null).not("status", "in", '("Closed","Not viable")') : Promise.resolve({ count: 0 }),
  ]);
  const myRows = mine.data ?? [];
  const teamRows = team.data ?? [];
  const visibleRows = staff ? teamRows : myRows;

  const previewUser = { id: person.id, name: person.name, email: person.email, role: person.role };
  return <ShellFrame user={previewUser} counts={{ confirm: confirm.count ?? 0, unassigned: unassigned.count ?? 0 }} width="mid" preview>
    <div className="stack view-as-workspace">
      <PreviewBanner person={person} />
      <section className="hero view-as-workspace-hero"><div><p className="eyebrow">{person.role} workspace</p><h1>{person.name || person.email}</h1><p>{staff ? "This is the team workspace visible to this role." : "This is the personal support workspace visible to this user."}</p></div><span className="view-as-role-pill"><span className="avatar">{(person.name || person.email).slice(0, 1).toUpperCase()}</span>{person.is_active ? "Active account" : "Inactive account"}</span></section>
      <div className="kpis"><div className="kpi"><div className="ic"><Ticket size={17} aria-hidden /></div><div className="v">{myRows.length}</div><div className="l">My tickets</div></div>{staff && <><div className="kpi"><div className="ic"><Inbox size={17} aria-hidden /></div><div className="v">{teamRows.length}</div><div className="l">Open team tickets</div></div><div className="kpi"><div className="ic"><ShieldCheck size={17} aria-hidden /></div><div className="v">{unassigned.count ?? 0}</div><div className="l">Unassigned</div></div></>}<div className="kpi"><div className="ic"><CheckCircle2 size={17} aria-hidden /></div><div className="v">{confirm.count ?? 0}</div><div className="l">Waiting for answer</div></div></div>
      <section><div className="page-head"><div><h2>{staff ? "Team queue" : "My tickets"}</h2><p className="muted">Read-only data shown using the selected user’s role and access scope.</p></div><span className="status-pill"><ShieldCheck size={15} aria-hidden /> Preview only</span></div><TicketList rows={visibleRows} staff={staff} /></section>
    </div>
  </ShellFrame>;
}
