import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, GitCommit, Info } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { DailyRowForm } from "@/components/daily-row-form";
import { NotConfigured } from "@/components/ui";
import { SheetsExport } from "@/components/sheets-export";
import { sheetsStatus } from "@/lib/google-sheets";
import { isStaff } from "@/lib/access";
import { isDateString, previousIstDate } from "@/lib/commits";
import { fmtDate } from "@/lib/format";
import { githubConfigured } from "@/lib/github";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { discardDraft, draftFromCommitsAction, publishAll } from "./actions";

export const dynamic = "force-dynamic";
type Row = {
  id: string; developer_id: string; portal_id: string; work_done: string; hours: number | null; status: string; blocker: string | null;
  next_step: string | null; target_date: string | null; state: string; source: string; commit_shas: string[];
  portal: { name: string } | null; ticket: { id: string; number: string; title: string } | null; developer: { display_name: string } | null;
};
const n = (v: string | undefined) => Math.max(0, Math.min(999, Number(v) || 0));

export default async function DailyUpdatesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  if (!isStaff(user.role)) redirect("/my-tickets");
  const supabase = userClient()!;
  const date = searchParams.date && isDateString(searchParams.date) ? searchParams.date : previousIstDate(new Date());

  const [{ data: devs }, { data: portals }] = await Promise.all([
    supabase.from("support_developers").select("id,user_id,display_name").eq("is_active", true).order("display_name").returns<{ id: string; user_id: string | null; display_name: string }[]>(),
    supabase.from("support_portals").select("id,name").eq("is_active", true).order("sort_order").returns<{ id: string; name: string }[]>(),
  ]);
  const own = (devs ?? []).find((d) => d.user_id === user.id) ?? null;
  const picker = user.role !== "developer";
  const wanted = searchParams.dev === "all" ? null : (devs ?? []).find((d) => d.id === searchParams.dev)?.id;
  const viewDev = user.role === "developer" ? own?.id ?? null : searchParams.dev === "all" ? null : wanted ?? own?.id ?? null;

  let q = supabase
    .from("support_daily_updates")
    .select("id,developer_id,portal_id,work_done,hours,status,blocker,next_step,target_date,state,source,commit_shas,portal:support_portals(name),ticket:support_tickets(id,number,title),developer:support_developers(display_name)")
    .eq("update_date", date);
  if (viewDev) q = q.eq("developer_id", viewDev);
  else if (user.role === "developer") q = q.eq("developer_id", "00000000-0000-0000-0000-000000000000");
  const { data, error } = await q.order("created_at").returns<Row[]>();
  const rows = data ?? [];
  const configured = githubConfigured();
  const canEdit = (r: Row) => r.state === "draft" && (user.role === "admin" || r.developer_id === own?.id);
  const drafts = rows.filter(canEdit);
  const total = n(searchParams.created) + n(searchParams.updated);

  return (
    <>
      <AppHeader user={user} />
      <main className="container" style={{ maxWidth: 820 }}>
        <h1>Daily updates</h1>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          {user.role === "manager" ? "Published updates from the developers." : "Review what was drafted from your commits, add hours and blockers, then publish."}
        </p>

        {!configured && user.role !== "manager" && (
          <div className="banner info" role="status"><Info size={18} aria-hidden /> <div><strong>GitHub is not configured.</strong> Drafting from commits is off. You can still add rows by hand below.</div></div>
        )}
        {searchParams.notice === "nodev" && <div className="banner warn" role="alert"><AlertTriangle size={18} aria-hidden /> <div>You are not set up as a developer yet. Ask an admin to add you under Master, Developers.</div></div>}
        {searchParams.notice === "nogithub" && <div className="banner info" role="status"><Info size={18} aria-hidden /> <div>GitHub is not configured, so nothing was drafted.</div></div>}
        {searchParams.notice === "discarded" && <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /> <div>Draft row removed. Drafting again will bring its commits back.</div></div>}
        {searchParams.created !== undefined && (
          <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden />
            <div>{total ? `Drafted ${n(searchParams.created)} new and updated ${n(searchParams.updated)} existing row(s).` : "No new commits to add for this day."}
              {n(searchParams.unmatched) > 0 && ` ${n(searchParams.unmatched)} commit(s) match no developer; an admin can map them under Master.`}
              {n(searchParams.noportal) > 0 && ` ${n(searchParams.noportal)} commit(s) are in a repository that is not registered.`}
              {n(searchParams.errors) > 0 && ` ${n(searchParams.errors)} repository(ies) could not be read.`}</div>
          </div>
        )}
        {searchParams.published !== undefined && (
          <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /><div>Published {n(searchParams.published)} row(s).{n(searchParams.skipped) > 0 && ` ${n(searchParams.skipped)} could not be published: check that each has work done, and a blocker if blocked.`}</div></div>
        )}
        {error && <div className="banner bad" role="alert">We could not load the updates. Please refresh.</div>}

        <form method="get" className="card filters">
          <div className="grid2">
            <div><label className="field" htmlFor="date">Date</label><input id="date" type="date" name="date" defaultValue={date} style={{ width: "100%", font: "inherit", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" }} /></div>
            {picker && <div><label className="field" htmlFor="dev">Developer</label><select id="dev" name="dev" defaultValue={searchParams.dev === "all" ? "all" : viewDev ?? "all"}><option value="all">Everyone</option>{(devs ?? []).map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}</select></div>}
          </div>
          <div className="actions"><button className="btn" type="submit">Show</button></div>
        </form>

        {user.role !== "manager" && (
          <div className="actions" style={{ justifyContent: "flex-start", margin: "16px 0" }}>
            <form action={draftFromCommitsAction}><input type="hidden" name="date" value={date} /><button className="btn" type="submit" disabled={!configured || !own}><GitCommit size={18} aria-hidden /> Draft from commits</button></form>
            {drafts.length > 1 && own && <form action={publishAll}><input type="hidden" name="date" value={date} /><button className="btn ghost" type="submit">Publish all drafts ({drafts.length})</button></form>}
          </div>
        )}

        <details className="card" style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}><Download size={16} aria-hidden style={{ verticalAlign: "-3px" }} /> Export published updates (CSV)</summary>
          <form method="get" action="/api/export/daily-updates" className="grid2" style={{ marginTop: 12 }}>
            <div><label className="field" htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={date} style={{ width: "100%", font: "inherit", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" }} /></div>
            <div><label className="field" htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={date} style={{ width: "100%", font: "inherit", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" }} /></div>
            {viewDev && <input type="hidden" name="dev" value={viewDev} />}
            <div className="actions" style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Download CSV</button></div>
          </form>
          <SheetsExport kind="daily" params={{ from: date, to: date, ...(viewDev ? { dev: viewDev } : {}) }} status={sheetsStatus().configured ? "ready" : "off"} />
        </details>

        <p className="muted" style={{ margin: "8px 2px" }}>{fmtDate(date)} · {rows.length} row{rows.length === 1 ? "" : "s"}</p>
        {rows.length === 0 && <div className="card empty"><h2>No updates for this day</h2><p className="muted" style={{ margin: 0 }}>{user.role === "manager" ? "Nothing has been published yet." : "Press “Draft from commits” or add a row by hand."}</p></div>}

        {rows.map((r) => (
          <section key={r.id} className="card ticket">
            <div className="ticket-top">
              <strong>{r.portal?.name}</strong>
              {r.ticket && <Link href={`/tickets/${r.ticket.id}`} className="num">{r.ticket.number}</Link>}
              <span className={`badge ${r.state === "published" ? "b-Done" : "b-Viable-check"}`}>{r.state === "published" ? "Published" : "Draft"}</span>
              {r.source === "manual" && <span className="badge b-Closed">Added by hand</span>}
              {(picker || !own) && <span className="muted" style={{ fontSize: 13 }}>{r.developer?.display_name}</span>}
            </div>
            {canEdit(r) ? (
              <>
                <DailyRowForm mode="edit" date={date} portals={portals ?? []} row={{ id: r.id, portalId: r.portal_id, ticketNumber: r.ticket?.number ?? "", workDone: r.work_done, hours: r.hours, status: r.status, blocker: r.blocker ?? "", nextStep: r.next_step ?? "", targetDate: r.target_date ?? "" }} />
                <form action={discardDraft} style={{ marginTop: 8 }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="date" value={date} /><button className="linklike" type="submit">Discard this draft row</button></form>
              </>
            ) : (
              <>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.work_done}</p>
                <div className="meta">
                  <span>{r.status}</span>{r.hours !== null && <span>{r.hours} h</span>}
                  {r.blocker && <span>Blocker: {r.blocker}</span>}{r.next_step && <span>Next: {r.next_step}</span>}{r.target_date && <span>Target {fmtDate(r.target_date)}</span>}
                  {r.commit_shas.length > 0 && <span>{r.commit_shas.length} commit{r.commit_shas.length === 1 ? "" : "s"}</span>}
                </div>
              </>
            )}
          </section>
        ))}

        {user.role !== "manager" && own && (
          <section className="card" style={{ marginTop: 18 }}>
            <div className="section-title">Add a row by hand</div>
            <DailyRowForm mode="add" date={date} portals={portals ?? []} row={{ portalId: "", ticketNumber: "", workDone: "", hours: null, status: "In progress", blocker: "", nextStep: "", targetDate: "" }} />
          </section>
        )}
      </main>
    </>
  );
}
