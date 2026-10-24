import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, GitCommit, Info, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DailyRowForm } from "@/components/daily-row-form";
import { SheetsExport } from "@/components/sheets-export";
import { NotConfigured } from "@/components/ui";
import { isStaff } from "@/lib/access";
import { isDateString, previousIstDate } from "@/lib/commits";
import { fmtDate } from "@/lib/format";
import { geminiFailureMessage, isGeminiFailureCode } from "@/lib/gemini-errors";
import { githubRuntimeConfigured } from "@/lib/github";
import { sheetsRuntimeStatus } from "@/lib/google-sheets";
import { geminiRuntimeConfigured } from "@/lib/integrations";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import {
  discardDraft, draftFromCommitsAction, publishAll, refineAllDraftsAction, refineDraftAction,
} from "./actions";

export const dynamic = "force-dynamic";
type Row = {
  id: string; developer_id: string; portal_id: string; work_done: string; hours: number | null; status: string; blocker: string | null;
  next_step: string | null; target_date: string | null; state: string; source: string; commit_shas: string[];
  portal: { name: string } | null; ticket: { id: string; number: string; title: string } | null; developer: { display_name: string } | null;
};
const n = (value: string | undefined) => Math.max(0, Math.min(999, Number(value) || 0));
const preview = (value: string) => {
  const lines = value.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const first = (lines[0] ?? "No work details yet").replace(/^[-*•]\s*/, "");
  return { text: first.length > 145 ? `${first.slice(0, 142)}…` : first, more: Math.max(0, lines.length - 1) };
};

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
  const own = (devs ?? []).find((developer) => developer.user_id === user.id) ?? null;
  const picker = user.role !== "developer";
  const wanted = searchParams.dev === "all" ? null : (devs ?? []).find((developer) => developer.id === searchParams.dev)?.id;
  const viewDev = user.role === "developer" ? own?.id ?? null : searchParams.dev === "all" ? null : wanted ?? own?.id ?? null;

  let query = supabase
    .from("support_daily_updates")
    .select("id,developer_id,portal_id,work_done,hours,status,blocker,next_step,target_date,state,source,commit_shas,portal:support_portals(name),ticket:support_tickets(id,number,title),developer:support_developers(display_name)")
    .eq("update_date", date);
  if (viewDev) query = query.eq("developer_id", viewDev);
  else if (user.role === "developer") query = query.eq("developer_id", "00000000-0000-0000-0000-000000000000");
  const { data, error } = await query.order("created_at").returns<Row[]>();
  const rows = data ?? [];
  const [githubReady, sheetsReady, geminiReady] = await Promise.all([githubRuntimeConfigured(), sheetsRuntimeStatus(), geminiRuntimeConfigured()]);
  const canEdit = (row: Row) => row.state === "draft" && (user.role === "admin" || row.developer_id === own?.id);
  const drafts = rows.filter(canEdit);
  const total = n(searchParams.created) + n(searchParams.updated);
  const aiRefined = n(searchParams.aiRefined), aiSkipped = n(searchParams.aiSkipped), aiErrors = n(searchParams.aiErrors);
  const aiReason = isGeminiFailureCode(searchParams.aiReason) ? searchParams.aiReason : "unknown";

  return (
    <AppShell user={user} width="mid">
      <div className="page-head daily-page-head">
        <div><p className="eyebrow">Team</p><h1>Daily updates</h1><p className="muted">{user.role === "manager" ? "Published updates from the developers." : "Review, polish and publish work drafted from your commits."}</p></div>
      </div>

      {!githubReady && user.role !== "manager" && <div className="banner info" role="status"><Info size={18} aria-hidden /><div><strong>GitHub is not configured.</strong> Drafting from commits is off; manual rows still work.</div></div>}
      {searchParams.notice === "nodev" && <div className="banner warn" role="alert"><AlertTriangle size={18} aria-hidden /><div>You are not set up as a developer yet. Ask an admin to link you under Master → Developers.</div></div>}
      {searchParams.notice === "nogithub" && <div className="banner info" role="status"><Info size={18} aria-hidden /><div>GitHub is not configured, so nothing was drafted.</div></div>}
      {searchParams.notice === "nogemini" && <div className="banner info" role="status"><Info size={18} aria-hidden /><div>Gemini AI is not configured. An admin can add its API key under Master → Integrations.</div></div>}
      {searchParams.notice === "discarded" && <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /><div>Draft row removed. Drafting again will bring its commits back.</div></div>}
      {searchParams.created !== undefined && <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /><div>{total ? `Drafted ${n(searchParams.created)} new and updated ${n(searchParams.updated)} existing row(s).` : "No new commits to add for this day."}{n(searchParams.unmatched) > 0 && ` ${n(searchParams.unmatched)} commit(s) match no developer.`}{n(searchParams.noportal) > 0 && ` ${n(searchParams.noportal)} commit(s) have no registered repository.`}{n(searchParams.errors) > 0 && ` ${n(searchParams.errors)} repository read(s) failed.`}</div></div>}
      {searchParams.published !== undefined && <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /><div>Published {n(searchParams.published)} row(s).{n(searchParams.skipped) > 0 && ` ${n(searchParams.skipped)} need work details or a blocker before publishing.`}</div></div>}
      {(searchParams.aiRefined !== undefined || searchParams.aiSkipped !== undefined || searchParams.aiErrors !== undefined) && (
        <div className={`banner ${aiErrors && !aiRefined ? "bad" : aiErrors ? "warn" : "ok"}`} role="status">
          {aiErrors ? <AlertTriangle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
          <div>
            Gemini polished {aiRefined} draft{aiRefined === 1 ? "" : "s"}.{aiSkipped > 0 && ` ${aiSkipped} unchanged or skipped.`}
            {aiErrors > 0 && (
              <> {aiErrors} request{aiErrors === 1 ? "" : "s"} failed. {geminiFailureMessage(aiReason)} The original text was kept.
                {user.role === "admin" && <> <Link href="/master?tab=integrations">Check integration</Link>.</>}
              </>
            )}
          </div>
        </div>
      )}
      {error && <div className="banner bad" role="alert">We could not load the updates. Please refresh.</div>}

      <form method="get" className="card daily-filters">
        <div><label className="field" htmlFor="date">Date</label><input id="date" type="date" name="date" defaultValue={date} /></div>
        {picker && <div><label className="field" htmlFor="dev">Developer</label><select id="dev" name="dev" defaultValue={searchParams.dev === "all" ? "all" : viewDev ?? "all"}><option value="all">Everyone</option>{(devs ?? []).map((developer) => <option key={developer.id} value={developer.id}>{developer.display_name}</option>)}</select></div>}
        <button className="btn sm" type="submit">Show</button>
      </form>

      {user.role !== "manager" && (
        <div className="daily-command-bar" aria-label="Daily update actions">
          <form action={draftFromCommitsAction}><input type="hidden" name="date" value={date} /><button className="btn sm" type="submit" disabled={!githubReady || !own}><GitCommit size={15} aria-hidden /> Draft commits</button></form>
          {drafts.length > 0 && geminiReady && <form action={refineAllDraftsAction}>{drafts.map((row) => <input key={row.id} type="hidden" name="id" value={row.id} />)}<input type="hidden" name="date" value={date} /><button className="btn ghost sm ai-button" type="submit"><Sparkles size={15} aria-hidden /> Polish {drafts.length > 8 ? "next 8" : `draft${drafts.length === 1 ? "" : "s"}`}</button></form>}
          {!geminiReady && user.role === "admin" && <Link className="btn ghost sm" href="/master?tab=integrations"><Sparkles size={15} aria-hidden /> Set up AI</Link>}
          {!geminiReady && user.role !== "admin" && <span className="hint">Ask an admin to enable Gemini AI.</span>}
          {drafts.length > 1 && own && <form action={publishAll}><input type="hidden" name="date" value={date} /><button className="btn ghost sm" type="submit">Publish all ({drafts.length})</button></form>}
        </div>
      )}

      <details className="card daily-export">
        <summary><Download size={15} aria-hidden /> Export published updates</summary>
        <div className="daily-export-body">
          <form method="get" action="/api/export/daily-updates" className="daily-export-form">
            <div><label className="field" htmlFor="from">From</label><input id="from" type="date" name="from" defaultValue={date} /></div>
            <div><label className="field" htmlFor="to">To</label><input id="to" type="date" name="to" defaultValue={date} /></div>
            {viewDev && <input type="hidden" name="dev" value={viewDev} />}
            <button className="btn sm" type="submit">Download CSV</button>
          </form>
          <SheetsExport kind="daily" params={{ from: date, to: date, ...(viewDev ? { dev: viewDev } : {}) }} status={sheetsReady.configured ? "ready" : "off"} />
        </div>
      </details>

      <div className="daily-list-head"><strong>{fmtDate(date)}</strong><span>{rows.length} row{rows.length === 1 ? "" : "s"}</span></div>
      {rows.length === 0 && <div className="card empty daily-empty"><h2>No updates for this day</h2><p className="muted">{user.role === "manager" ? "Nothing has been published yet." : "Draft from commits or add a row by hand."}</p></div>}

      <div className="daily-records">
        {rows.map((row) => {
          const itemPreview = preview(row.work_done);
          const editable = canEdit(row);
          return (
            <details key={row.id} className={`card daily-record ${editable ? "is-draft" : "is-readonly"}`}>
              <summary className="daily-record-summary">
                <span className="daily-portal">{row.portal?.name || "Unknown portal"}</span>
                {row.ticket && <span className="num daily-ticket-number">{row.ticket.number}</span>}
                <span className={`badge ${row.state === "published" ? "b-Done" : "b-Viable-check"}`}>{row.state === "published" ? "Published" : "Draft"}</span>
                {row.source === "manual" && <span className="badge b-Closed">Manual</span>}
                {(picker || !own) && <span className="daily-developer">{row.developer?.display_name}</span>}
                <span className="daily-preview">{itemPreview.text}{itemPreview.more > 0 && <small> +{itemPreview.more} more</small>}</span>
                <span className="daily-row-facts">{row.hours !== null ? `${row.hours}h` : "No hours"} · {row.status}{row.commit_shas.length ? ` · ${row.commit_shas.length} commit${row.commit_shas.length === 1 ? "" : "s"}` : ""}</span>
                <span className="daily-open-label">Open</span>
              </summary>
              <div className="daily-record-body">
                {editable ? (
                  <>
                    <div className="daily-edit-tools">
                      <span className="hint">Edit the points, add time, then publish.</span>
                      {row.ticket && <Link href={`/tickets/${row.ticket.id}`} className="num">Open {row.ticket.number}</Link>}
                      {geminiReady && <form action={refineDraftAction}><input type="hidden" name="id" value={row.id} /><input type="hidden" name="date" value={date} /><button className="btn ghost sm ai-button" type="submit"><Sparkles size={14} aria-hidden /> Polish with AI</button></form>}
                    </div>
                    <DailyRowForm mode="edit" date={date} portals={portals ?? []} row={{ id: row.id, portalId: row.portal_id, ticketNumber: row.ticket?.number ?? "", workDone: row.work_done, hours: row.hours, status: row.status, blocker: row.blocker ?? "", nextStep: row.next_step ?? "", targetDate: row.target_date ?? "" }} />
                    <form action={discardDraft} className="daily-discard"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="date" value={date} /><ConfirmSubmitButton className="linklike danger-link" confirmMessage="Discard this draft row? Its commits can be drafted again later.">Discard draft</ConfirmSubmitButton></form>
                  </>
                ) : (
                  <>
                    {row.ticket && <Link href={`/tickets/${row.ticket.id}`} className="num">{row.ticket.number} · {row.ticket.title}</Link>}
                    <p className="daily-work-readonly">{row.work_done}</p>
                    <div className="meta"><span>{row.status}</span>{row.hours !== null && <span>{row.hours} h</span>}{row.blocker && <span>Blocker: {row.blocker}</span>}{row.next_step && <span>Next: {row.next_step}</span>}{row.target_date && <span>Target {fmtDate(row.target_date)}</span>}{row.commit_shas.length > 0 && <span>{row.commit_shas.length} commit{row.commit_shas.length === 1 ? "" : "s"}</span>}</div>
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {user.role !== "manager" && own && (
        <details className="card master-create daily-add">
          <summary><span>Add a row by hand</span><small>For work that is not in GitHub</small></summary>
          <DailyRowForm mode="add" date={date} portals={portals ?? []} row={{ portalId: "", ticketNumber: "", workDone: "", hours: null, status: "In progress", blocker: "", nextStep: "", targetDate: "" }} />
        </details>
      )}
    </AppShell>
  );
}
