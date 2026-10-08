import Link from "next/link";
import { CheckCircle2, Inbox, PlusCircle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { NotConfigured, PriorityPill, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { OPEN_STATUSES, TYPE_LABEL, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";

type Row = {
  id: string; number: string; type: TicketType; title: string; priority: Priority; status: Status;
  expected_date: string | null; developer_update: string | null; created_at: string;
  portal: { name: string } | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function MyTicketsPage({ searchParams }: { searchParams: { show?: string; raised?: string; files?: string } }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  const show = searchParams.show === "all" ? "all" : "open";

  const supabase = userClient()!;
  // Always the person's own tickets here; developers use the queue for everything else.
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id,number,type,title,priority,status,expected_date,developer_update,created_at,portal:support_portals(name)")
    .eq("reporter_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Row[]>();
  const rows = (data ?? []).filter((r) => show === "all" || (OPEN_STATUSES as readonly string[]).includes(r.status));
  const raised = /^(BUG|FR|SUP)-\d{3,}$/.test(searchParams.raised ?? "") ? searchParams.raised : null;

  return (
    <>
      <AppHeader user={user} />
      <main className="container">
        <div className="page-head">
          <div>
            <h1>My tickets</h1>
            <p className="muted" style={{ margin: 0 }}>Everything you have reported, and where it stands.</p>
          </div>
          <Link className="btn" href="/new"><PlusCircle size={18} aria-hidden /> Raise a ticket</Link>
        </div>

        {raised && (
          <div className="banner ok" role="status" style={{ marginTop: 18 }}>
            <CheckCircle2 size={18} aria-hidden />
            <div>
              <strong>{raised}</strong> is raised. We will update this page as the team works on it.
              {searchParams.files === "failed" && " Some screenshots could not be uploaded, so please send them again later."}
            </div>
          </div>
        )}
        {error && <div className="banner bad" role="alert" style={{ marginTop: 18 }}>We could not load your tickets. Please refresh.</div>}

        <div className="tabs" role="tablist">
          <Link href="/my-tickets" aria-current={show === "open"}>Open</Link>
          <Link href="/my-tickets?show=all" aria-current={show === "all"}>All</Link>
        </div>

        {rows.length === 0 ? (
          <div className="card empty">
            <div className="icon"><Inbox size={26} aria-hidden /></div>
            <h2>{show === "open" ? "Nothing open right now" : "No tickets yet"}</h2>
            <p className="muted" style={{ margin: "4px 0 16px" }}>Something not working, or an idea that would help? Tell us.</p>
            <Link className="btn" href="/new">Raise a ticket</Link>
          </div>
        ) : (
          rows.map((t) => (
            <article key={t.id} className="card ticket">
              <div className="ticket-top">
                <span className="num">{t.number}</span>
                <StatusBadge status={t.status} />
                <PriorityPill priority={t.priority} />
              </div>
              <h2>{t.title}</h2>
              <div className="meta">
                <span>{TYPE_LABEL[t.type]}</span>
                {t.portal && <span>{t.portal.name}</span>}
                <span>Raised {fmt(t.created_at)}</span>
                {t.expected_date && <span>Expected {fmt(t.expected_date)}</span>}
              </div>
              {t.developer_update && <div className="update"><strong>Latest update: </strong>{t.developer_update}</div>}
            </article>
          ))
        )}
      </main>
    </>
  );
}
