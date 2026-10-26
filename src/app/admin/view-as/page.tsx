import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, ShieldCheck, Ticket } from "lucide-react";
import { NotConfigured, Logo, StatusBadge, PriorityPill } from "@/components/ui";
import { canManageMaster } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import type { Priority, Status, TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";
type Person = { id: string; name: string; email: string; role: "reporter" | "developer" | "manager" | "admin"; is_active: boolean };
type Row = { id: string; number: string; title: string; type: TicketType; priority: Priority; status: Status; created_at: string; portal: { name: string } | null };

export default async function ViewAsPage({ searchParams }: { searchParams: { user?: string } }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  if (!canManageMaster({ id: session.user.id, role: session.user.role, isActive: true })) return <main className="center-page"><div className="card"><h1>Admins only</h1><p className="muted">User previews are restricted to administrators.</p></div></main>;
  const db = userClient()!;
  const { data: person } = searchParams.user ? await db.from("support_users").select("id,name,email,role,is_active").eq("id", searchParams.user).maybeSingle<Person>() : { data: null };
  if (!person) return <main className="center-page"><div className="card"><Logo /><h1>Choose a user</h1><p className="muted">Open View as user from the header and search for a profile.</p><Link className="btn sm" href="/">Back to support</Link></div></main>;
  const { data: tickets } = await db.from("support_tickets").select("id,number,title,type,priority,status,created_at,portal:support_portals(name)").eq("reporter_id", person.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(12).returns<Row[]>();
  return <main className="view-as-page"><header className="view-as-page-head"><Link href="/" className="view-as-brand"><Logo /><span>IT Support</span></Link><Link href="/" className="back"><ArrowLeft size={15} aria-hidden /> Exit preview</Link></header><div className="view-as-page-wrap"><div className="view-as-readonly"><Eye size={17} aria-hidden /><div><strong>Viewing as {person.name || person.email}</strong><span>Read-only preview · actions are disabled</span></div><span className="system-status live"><ShieldCheck size={14} aria-hidden /> Safe mode</span></div><section className="view-as-welcome"><div><p className="eyebrow">{person.role}</p><h1>{person.name || person.email}</h1><p>{person.email} · {person.is_active ? "Active account" : "Inactive account"}</p></div><div className="view-as-user-badge"><span className="avatar">{(person.name || person.email).slice(0, 1).toUpperCase()}</span><span>Profile preview</span></div></section><section className="view-as-section"><div className="page-head"><div><h2>My tickets</h2><p className="muted">This is what the selected user can see in their personal ticket list.</p></div><span className="status-pill"><Ticket size={15} aria-hidden /> {tickets?.length ?? 0} shown</span></div>{tickets && tickets.length > 0 ? <div className="view-as-ticket-list">{tickets.map((ticket) => <div className="view-as-ticket" key={ticket.id}><div><strong>{ticket.number}</strong><span>{ticket.title}</span><small>{ticket.portal?.name ?? "No portal"} · {ticket.type}</small></div><div><PriorityPill priority={ticket.priority} /><StatusBadge status={ticket.status} /></div></div>)}</div> : <div className="card empty"><CheckCircle2 size={22} aria-hidden /><h2>No tickets raised</h2><p className="muted">This profile has no visible tickets yet.</p></div>}</section></div></main>;
}
