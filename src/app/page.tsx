import Link from "next/link";
import { AlarmClock, ArrowRight, Bug, CheckCircle2, CircleDot, Flame, Inbox, Lightbulb, LifeBuoy, MessageCircleQuestion, PlusCircle, UserCheck, UserX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TicketRows, type TicketRowData } from "@/components/ticket-row";
import { NotConfigured } from "@/components/ui";
import { isStaff } from "@/lib/access";
import { greeting } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DONE } from "@/lib/status-flow";
import { loadSettings } from "@/lib/targets-server";
import { overdueInfo } from "@/lib/targets";
import { OPEN_STATUSES, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";

type Row = {
  id: string; number: string; type: TicketType; title: string; priority: Priority; status: Status; created_at: string;
  expected_date: string | null; assignee_id: string | null; reporter_id: string | null; reporter_name: string;
  first_response_at: string | null; confirmed_at: string | null; portal: { name: string } | null;
};
const SELECT = "id,number,type,title,priority,status,created_at,expected_date,assignee_id,reporter_id,reporter_name,first_response_at,confirmed_at,portal:support_portals(name)";
const isOpen = (s: Status) => (OPEN_STATUSES as readonly string[]).includes(s);

export default async function HomePage() {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  const staff = isStaff(user.role);
  const supabase = userClient()!;
  const now = new Date();

  const [mine, team, devs, settings] = await Promise.all([
    supabase.from("support_tickets").select(SELECT).eq("reporter_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200).returns<Row[]>(),
    staff
      ? supabase.from("support_tickets").select(SELECT).is("deleted_at", null).in("status", [...OPEN_STATUSES]).order("priority").order("created_at").limit(600).returns<Row[]>()
      : Promise.resolve({ data: [] as Row[], error: null }),
    staff
      ? supabase.from("support_users").select("id,name").in("role", ["developer", "admin"]).eq("is_active", true).returns<{ id: string; name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    staff ? loadSettings(supabase) : Promise.resolve(null),
  ]);
  const myRows = mine.data ?? [];
  const teamRows = team.data ?? [];
  const nameOf = (id: string | null) => (devs.data ?? []).find((d) => d.id === id)?.name ?? null;
  const toRow = (t: Row): TicketRowData => {
    const due = settings ? overdueInfo(t, settings.targets, now) : null;
    return {
      id: t.id, number: t.number, title: t.title, priority: t.priority, status: t.status, type: t.type, createdAt: t.created_at,
      portal: t.portal?.name, reporter: t.reporter_name, assignee: nameOf(t.assignee_id), expectedDate: t.expected_date,
      overdueHours: due?.overdue ? due.hoursOver : null,
    };
  };

  const waiting = myRows.filter((t) => t.status === DONE);
  const myOpen = myRows.filter((t) => isOpen(t.status));
  const myClosed = myRows.filter((t) => t.status === "Closed").length;

  const teamView = teamRows.map(toRow);
  const assigned = teamView.filter((t, i) => teamRows[i].assignee_id === user.id && t.status !== DONE);
  const unassigned = teamRows.filter((t) => !t.assignee_id && t.status !== DONE).length;
  const overdue = teamView.filter((t) => t.overdueHours !== null).length;
  const urgent = teamRows.filter((t) => (t.priority === "P0" || t.priority === "P1") && t.status !== DONE).length;
  const firstName = (user.name || user.email).split(/[\s@]/)[0];

  return (
    <AppShell user={user} width="mid">
      <div className="stack">
        <section className="hero">
          <div>
            <h1>{greeting(now)}, {firstName}</h1>
            <p>{staff ? "Here is what needs the team today." : "Something not working, or an idea that would help? Tell the tech team here."}</p>
          </div>
          <Link className="btn lg" href="/new"><PlusCircle size={19} aria-hidden /> Raise a ticket</Link>
        </section>
        {(mine.error || team.error) && <div className="banner bad" role="alert">We could not load everything. Please refresh.</div>}

        {waiting.length > 0 && (
          <section className="card confirm-card">
            <div className="section-title"><MessageCircleQuestion size={18} aria-hidden /> {waiting.length === 1 ? "One ticket is waiting for your answer" : `${waiting.length} tickets are waiting for your answer`}</div>
            <p className="muted" style={{ margin: "-6px 0 12px" }}>We marked these done. Please check and tell us whether it works now.</p>
            <TicketRows tickets={waiting.map(toRow)} now={now} />
          </section>
        )}

        {staff && (
          <>
            <div className="kpis">
              <Link className="kpi brand" href="/queue?assignee=me"><div className="ic"><UserCheck size={17} aria-hidden /></div><div className="v">{assigned.length}</div><div className="l">Assigned to you</div></Link>
              <Link className={`kpi${unassigned ? " warn" : ""}`} href="/queue?assignee=none"><div className="ic"><UserX size={17} aria-hidden /></div><div className="v">{unassigned}</div><div className="l">Unassigned</div></Link>
              <Link className={`kpi${overdue ? " bad" : ""}`} href="/queue?overdue=1"><div className="ic"><AlarmClock size={17} aria-hidden /></div><div className="v">{overdue}</div><div className="l">Overdue</div></Link>
              <Link className={`kpi${urgent ? " bad" : ""}`} href="/queue"><div className="ic"><Flame size={17} aria-hidden /></div><div className="v">{urgent}</div><div className="l">Critical and high, open</div></Link>
            </div>
            <section>
              <div className="page-head" style={{ marginBottom: 10 }}>
                <h2>Your work</h2>
                <Link href="/queue" className="back">Open the queue <ArrowRight size={15} aria-hidden /></Link>
              </div>
              {assigned.length === 0 ? (
                <div className="card empty" style={{ padding: "30px 20px" }}>
                  <div className="icon"><Inbox size={24} aria-hidden /></div>
                  <h2>Nothing is assigned to you</h2>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{unassigned ? `${unassigned} open ticket${unassigned === 1 ? " has" : "s have"} no owner yet.` : "The queue has no unowned tickets either."}</p>
                </div>
              ) : <TicketRows tickets={assigned.slice(0, 8)} team now={now} />}
            </section>
          </>
        )}

        <section>
          <h2 style={{ marginBottom: 10 }}>Raise something new</h2>
          <div className="quick">
            <Link href="/new?type=bug"><span className="ic bug"><Bug size={19} aria-hidden /></span><span><strong>Report a bug</strong><small>Something is broken</small></span></Link>
            <Link href="/new?type=feature"><span className="ic feat"><Lightbulb size={19} aria-hidden /></span><span><strong>Ask for a feature</strong><small>Something new would help</small></span></Link>
            <Link href="/new?type=support"><span className="ic sup"><LifeBuoy size={19} aria-hidden /></span><span><strong>Get support</strong><small>Help or access</small></span></Link>
          </div>
        </section>

        <section>
          <div className="page-head" style={{ marginBottom: 10 }}>
            <h2>Your tickets</h2>
            <Link href="/my-tickets" className="back">See all <ArrowRight size={15} aria-hidden /></Link>
          </div>
          <div className="kpis" style={{ marginBottom: 12 }}>
            <Link className="kpi" href="/my-tickets"><div className="ic"><CircleDot size={17} aria-hidden /></div><div className="v">{myOpen.length}</div><div className="l">Open</div></Link>
            <Link className={`kpi${waiting.length ? " brand" : ""}`} href="/my-tickets"><div className="ic"><MessageCircleQuestion size={17} aria-hidden /></div><div className="v">{waiting.length}</div><div className="l">Waiting for your answer</div></Link>
            <Link className="kpi good" href="/my-tickets?show=all"><div className="ic"><CheckCircle2 size={17} aria-hidden /></div><div className="v">{myClosed}</div><div className="l">Closed</div></Link>
          </div>
          {myOpen.length === 0 ? (
            <div className="card empty" style={{ padding: "30px 20px" }}>
              <div className="icon"><CheckCircle2 size={24} aria-hidden /></div>
              <h2>You have nothing open</h2>
              <p className="muted" style={{ margin: "4px 0 0" }}>When you raise a ticket it appears here with its progress.</p>
            </div>
          ) : <TicketRows tickets={myOpen.slice(0, 5).map(toRow)} now={now} />}
        </section>
      </div>
    </AppShell>
  );
}
