import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClock, Flame, History, Lock, MessageSquare, Megaphone, PlusCircle, RefreshCcw, SlidersHorizontal, UserCheck, UserX } from "lucide-react";
import { TicketForm } from "@/app/new/ticket-form";
import { ShellFrame } from "@/components/app-shell";
import { Board, type BoardCard, type BoardColumn } from "@/components/board";
import { CommentForm } from "@/components/comment-form";
import { ConfirmBar } from "@/components/confirm-bar";
import { DetailsForm, StatusForm } from "@/components/staff-controls";
import { TicketRows, type TicketRowData } from "@/components/ticket-row";
import { Avatar, OverdueBadge, PriorityPill, StatusBadge, StatusSteps } from "@/components/ui";
import { allowedNextStatuses } from "@/lib/status-flow";
import type { Role } from "@/lib/access";
import type { Status } from "@/lib/tickets";

/**
 * Development only: the real components with made-up tickets, so the design can be checked in a browser
 * without a database. It reads and writes nothing, and it does not exist in a production build.
 */
export const dynamic = "force-dynamic";
const ID = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-10T09:30:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const TICKETS: TicketRowData[] = [
  { id: ID, number: "BUG-014", title: "Payout page shows a blank screen after choosing September", priority: "P0", status: "In progress", type: "bug", createdAt: ago(5), portal: "Dashboard", reporter: "Asha Rao", assignee: "Nisar Ahmed", overdueHours: 3 },
  { id: ID, number: "BUG-012", title: "Attendance regularisation is sent to the wrong manager for pickers", priority: "P1", status: "Reopened", type: "bug", createdAt: ago(30), portal: "People", reporter: "Station BLR-04", assignee: null, expectedDate: "2026-10-12" },
  { id: ID, number: "SUP-031", title: "Need access to the station audit tracker for the new area manager", priority: "P2", status: "New", type: "support", createdAt: ago(2), portal: "OpsPulse", reporter: "Kiran Shetty", assignee: null },
  { id: ID, number: "FR-008", title: "Export the fleet daily report straight to Google Sheets", priority: "P2", status: "Viable check", type: "feature", createdAt: ago(80), portal: "OpsPulse", reporter: "Meera Nair", assignee: "John A" },
  { id: ID, number: "BUG-009", title: "COD slip upload fails on slow connections", priority: "P1", status: "Done – awaiting confirmation", type: "bug", createdAt: ago(120), portal: "DropX One", reporter: "Ravi Kumar", assignee: "John A" },
  { id: ID, number: "FR-005", title: "Show the provider ID on the associate profile card", priority: "P3", status: "Blocked", type: "feature", createdAt: ago(300), portal: "Dashboard", reporter: "Asha Rao", assignee: "Sara Thomas" },
];
const COLUMNS: Status[] = ["New", "Viable check", "In progress", "Blocked", "Reopened", "Done – awaiting confirmation", "Closed", "Not viable"];

export default function PreviewPage({ searchParams }: { searchParams: { view?: string; role?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  const role = (["reporter", "developer", "manager", "admin"].includes(searchParams.role ?? "") ? searchParams.role : "admin") as Role;
  const view = searchParams.view ?? "home";
  const user = { id: "u1", name: "John Abraham", email: "tech@dropxlogistics.com", role };
  const cards: BoardCard[] = TICKETS.map((t, i) => ({ id: `${ID}-${i}`, number: t.number, title: t.title, priority: t.priority, status: t.status, portal: t.portal ?? "", assignee: t.assignee ?? "", overdueHours: t.overdueHours ?? null, next: allowedNextStatuses(t.type, t.status) }));
  const columns: BoardColumn[] = COLUMNS.map((s) => ({ status: s, label: s.startsWith("Done") ? "Awaiting confirmation" : s, cards: cards.filter((c) => c.status === s) }));
  const t = TICKETS[0];

  return (
    <ShellFrame user={user} counts={{ confirm: 1, unassigned: 2 }} width={view === "board" ? "wide" : view === "form" ? "narrow" : "mid"}>
      <nav className="chips" aria-label="Preview">
        {["home", "queue", "board", "ticket", "confirm", "form"].map((v) => <Link key={v} className="chip" href={`/dev/preview?view=${v}&role=${role}`} aria-current={view === v}>{v}</Link>)}
      </nav>

      {view === "home" && (
        <div className="stack">
          <section className="hero">
            <div><h1>Good afternoon, John</h1><p>Here is what needs the team today.</p></div>
            <Link className="btn lg" href="#"><PlusCircle size={19} aria-hidden /> Raise a ticket</Link>
          </section>
          <div className="kpis">
            <div className="kpi brand"><div className="ic"><UserCheck size={17} aria-hidden /></div><div className="v">3</div><div className="l">Assigned to you</div></div>
            <div className="kpi warn"><div className="ic"><UserX size={17} aria-hidden /></div><div className="v">2</div><div className="l">Unassigned</div></div>
            <div className="kpi bad"><div className="ic"><AlarmClock size={17} aria-hidden /></div><div className="v">1</div><div className="l">Overdue</div></div>
            <div className="kpi bad"><div className="ic"><Flame size={17} aria-hidden /></div><div className="v">3</div><div className="l">Critical and high, open</div></div>
          </div>
          <section><h2 style={{ marginBottom: 10 }}>Your work</h2><TicketRows tickets={TICKETS.slice(0, 4)} team now={NOW} /></section>
        </div>
      )}

      {view === "queue" && (<><div className="page-head"><div><p className="eyebrow">Team</p><h1>Queue</h1><p className="muted">Most urgent first, oldest first within a priority.</p></div></div><TicketRows tickets={TICKETS} team now={NOW} /></>)}

      {view === "board" && (<><div className="page-head"><div><p className="eyebrow">Team</p><h1>Board</h1></div></div><Board columns={columns} canMove={role === "developer" || role === "admin"} /></>)}

      {view === "form" && (<><div className="page-head"><div><p className="eyebrow">New ticket</p><h1>Raise a ticket</h1><p className="muted">Tell us what is wrong or what you need.</p></div></div>
        <TicketForm portals={[{ code: "people", name: "People" }, { code: "opspulse", name: "OpsPulse" }, { code: "dashboard", name: "Dashboard" }]} defaultPortal="" defaultPage="" defaultName={user.name} /></>)}

      {(view === "ticket" || view === "confirm") && (() => {
        const status: Status = view === "confirm" ? "Done – awaiting confirmation" : t.status;
        return (
          <div className="stack">
            <header className="t-head">
              <div className="ticket-top" style={{ marginBottom: 2 }}><span className="num">{t.number}</span><StatusBadge status={status} /><PriorityPill priority={t.priority} />{view === "ticket" && <OverdueBadge hours={3} />}</div>
              <h1>{t.title}</h1>
              <div className="meta" style={{ marginTop: 4 }}><span>Bug</span><span>Dashboard</span><span>Raised 10 Oct, 10:00 am</span></div>
            </header>
            <section className="card" style={{ padding: "18px 12px 14px" }}><StatusSteps status={status} /></section>
            <div className="t-layout">
              <div className="stack" style={{ minWidth: 0 }}>
                {view === "confirm" && <section className="card confirm-card"><ConfirmBar ticketId={ID} /></section>}
                <section className="card"><div className="section-title" style={{ marginBottom: 2 }}><Megaphone size={18} aria-hidden /> Latest update from the team</div><p className="prose">We found the cause: the September period has no payout rows for two stations. A fix is being tested.</p></section>
                <section className="card"><p className="label">What went wrong</p><p className="prose" style={{ marginTop: 0 }}>I open Payments, choose September 2026 and the page goes blank. August works. I need this for today&apos;s bank file.</p><hr className="divider" /><p className="label">Steps or links</p><p className="prose" style={{ marginTop: 0 }}>1. Open Payments{"\n"}2. Choose September 2026{"\n"}3. Blank page</p></section>
                <section className="card">
                  <div className="section-title"><MessageSquare size={18} aria-hidden /> Comments <span className="hint">(2)</span></div>
                  <div className="comment"><Avatar name="Asha Rao" /><div><div className="comment-head"><strong>Asha Rao</strong><span className="muted">10 Oct, 10:20 am</span></div><div className="comment-body">It also happens on my phone.</div></div></div>
                  <div className="comment internal"><Avatar name="Nisar Ahmed" /><div><div className="comment-head"><strong>Nisar Ahmed</strong><span className="badge b-Blocked"><Lock size={11} aria-hidden />Internal</span><span className="muted">10 Oct, 11:05 am</span></div><div className="comment-body">Null payout rows for BLR-04 and BLR-11. Guarding the reducer.</div></div></div>
                  <CommentForm ticketId={ID} staff={role !== "reporter"} />
                </section>
                <section className="card"><details className="fold" open><summary><span className="section-title" style={{ margin: 0 }}><History size={18} aria-hidden /> History <span className="hint">(3)</span></span></summary>
                  <ol className="timeline"><li><div><strong>Asha Rao</strong> raised this ticket</div><div className="hint">10 Oct, 10:00 am</div></li><li><div><strong>John Abraham</strong> assigned it to Nisar Ahmed</div><div className="hint">10 Oct, 10:12 am</div></li><li><div><strong>Nisar Ahmed</strong> moved it from New to In progress</div><div className="hint">10 Oct, 10:15 am</div></li></ol>
                </details></section>
              </div>
              <aside className="t-rail">
                {role !== "reporter" && view === "ticket" && <section className="card"><div className="section-title"><RefreshCcw size={17} aria-hidden /> Change status</div><StatusForm ticketId={ID} status={status} options={allowedNextStatuses("bug", status)} /></section>}
                <section className="card"><div className="section-title">Details</div>
                  <dl className="facts">
                    <div><dt>Raised by</dt><dd><span className="person"><Avatar name="Asha Rao" small /><span>Asha Rao</span></span></dd></div>
                    <div><dt>Assigned to</dt><dd><span className="person"><Avatar name="Nisar Ahmed" small /><span>Nisar Ahmed</span></span></dd></div>
                    <div><dt>Priority</dt><dd>P0 · Critical</dd></div><div><dt>Portal</dt><dd>Dashboard</dd></div><div><dt>Expected</dt><dd><span className="muted">No date yet</span></dd></div>
                  </dl>
                </section>
                {role !== "reporter" && view === "ticket" && <section className="card"><details className="fold" open><summary><span className="section-title" style={{ margin: 0 }}><SlidersHorizontal size={17} aria-hidden /> Edit ticket</span></summary>
                  <DetailsForm ticketId={ID} type="bug" priority="P0" assigneeId={null} expectedDate={null} developerUpdate="" links={[]} viable={null} viableReason={null} developers={[{ id: "d1", name: "Nisar Ahmed" }]} /></details></section>}
              </aside>
            </div>
          </div>
        );
      })()}
    </ShellFrame>
  );
}
