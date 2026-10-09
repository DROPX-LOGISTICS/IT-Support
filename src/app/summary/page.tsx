import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { NotConfigured } from "@/components/ui";
import { fmtHours } from "@/lib/hours";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { buildSummary, type SummaryTicket } from "@/lib/summary";
import { loadSettings } from "@/lib/targets-server";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/tickets";
import { fmtDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";
const PCOLOR: Record<Priority, string> = { P0: "var(--bad)", P1: "var(--warn)", P2: "var(--info)", P3: "var(--muted)" };
type Row = Omit<SummaryTicket, "portal"> & { portal: { name: string } | null };

export default async function SummaryPage() {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  if (user.role !== "manager" && user.role !== "admin") redirect("/my-tickets");
  const supabase = userClient()!;
  const [{ data, error }, settings] = await Promise.all([
    supabase.from("support_tickets")
      .select("number,title,priority,status,created_at,first_response_at,done_at,closed_at,confirmed_at,reopen_count,portal:support_portals(name)")
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(5000).returns<Row[]>(),
    loadSettings(supabase),
  ]);
  const s = buildSummary((data ?? []).map((t) => ({ ...t, portal: t.portal?.name ?? "Unknown" })), settings.targets, new Date());
  const maxWeek = Math.max(1, ...s.weekly.map((w) => Math.max(w.raised, w.closed)));
  const maxPrio = Math.max(1, ...PRIORITIES.map((p) => s.openByPriority[p]));

  return (
    <>
      <AppHeader user={user} />
      <main className="container stack" style={{ maxWidth: 980 }}>
        <div>
          <h1>Summary</h1>
          <p className="muted" style={{ margin: 0 }}>How the team is doing. Averages cover tickets raised in the last 90 days.</p>
        </div>
        {error && <div className="banner bad" role="alert">We could not load the numbers. Please refresh.</div>}

        <div className="kpis">
          <div className="kpi"><div className="v">{s.openTotal}</div><div className="l">Open tickets</div></div>
          <div className={`kpi${s.overdue.count ? " bad" : ""}`}><div className="v">{s.overdue.count}</div><div className="l">Overdue</div></div>
          <div className="kpi"><div className="v">{fmtHours(s.avgFirstResponseHours)}</div><div className="l">Average first response</div></div>
          <div className="kpi"><div className="v">{fmtHours(s.avgFixHours)}</div><div className="l">Average time to fix{s.medianFixHours !== null ? ` (median ${fmtHours(s.medianFixHours)})` : ""}</div></div>
          <div className="kpi"><div className="v">{s.reopens.rate === null ? "No data" : `${s.reopens.rate}%`}</div><div className="l">Reopened ({s.reopens.total} time{s.reopens.total === 1 ? "" : "s"})</div></div>
          <div className={`kpi${s.awaiting.length ? " warn" : ""}`}><div className="v">{s.awaiting.length}</div><div className="l">Waiting over 3 days for the reporter</div></div>
        </div>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Open by priority</h2>
          <div className="bars">
            {PRIORITIES.map((p) => (
              <div key={p} className="bar-row"><span>{p} · {PRIORITY_LABEL[p]}</span>
                <div className="bar" aria-hidden><span style={{ width: `${(s.openByPriority[p] / maxPrio) * 100}%`, background: PCOLOR[p] }} /></div>
                <strong style={{ textAlign: "right" }}>{s.openByPriority[p]}</strong></div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Open by portal</h2>
          {s.byPortal.length === 0 ? <p className="muted" style={{ margin: 0 }}>No open tickets.</p> : (
            <div className="table-wrap"><table className="plain">
              <thead><tr><th>Portal</th>{PRIORITIES.map((p) => <th key={p} className="n">{p}</th>)}<th className="n">Total</th></tr></thead>
              <tbody>{s.byPortal.map((r) => <tr key={r.portal}><td>{r.portal}</td>{PRIORITIES.map((p) => <td key={p} className="n">{r[p] || "·"}</td>)}<td className="n"><strong>{r.total}</strong></td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Raised and closed per week</h2>
          <div className="bars">
            {s.weekly.map((w) => (
              <div key={w.weekStart} className="bar-row" style={{ gridTemplateColumns: "84px 1fr 72px" }}>
                <span>{fmtDate(w.weekStart)}</span>
                <div style={{ display: "grid", gap: 3 }} aria-hidden>
                  <div className="bar"><span style={{ width: `${(w.raised / maxWeek) * 100}%`, background: "var(--brand)" }} /></div>
                  <div className="bar"><span style={{ width: `${(w.closed / maxWeek) * 100}%`, background: "var(--ok)" }} /></div>
                </div>
                <span style={{ textAlign: "right" }}>{w.raised} / {w.closed}</span>
              </div>
            ))}
          </div>
          <div className="legend"><span><i className="dot" style={{ background: "var(--brand)" }} />Raised</span><span><i className="dot" style={{ background: "var(--ok)" }} />Closed</span><span>Weeks start on Monday (IST)</span></div>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Overdue</h2>
          {s.overdue.items.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing is past its target.</p> : (
            <div className="table-wrap"><table className="plain">
              <thead><tr><th>Ticket</th><th>Priority</th><th>Portal</th><th className="n">Over by</th></tr></thead>
              <tbody>{s.overdue.items.map((i) => <tr key={i.number}><td><strong>{i.number}</strong> {i.title}</td><td>{i.priority}</td><td>{i.portal}</td><td className="n">{fmtHours(i.hoursOver)}</td></tr>)}</tbody>
            </table></div>
          )}
          {s.overdue.count > s.overdue.items.length && <p className="hint" style={{ marginBottom: 0 }}>Showing the {s.overdue.items.length} most urgent of {s.overdue.count}. <Link href="/queue?overdue=1">See all in the queue</Link></p>}
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Waiting for the reporter for more than 3 days</h2>
          {s.awaiting.length === 0 ? <p className="muted" style={{ margin: 0 }}>None.</p> : (
            <div className="table-wrap"><table className="plain">
              <thead><tr><th>Ticket</th><th>Portal</th><th className="n">Days</th></tr></thead>
              <tbody>{s.awaiting.map((a) => <tr key={a.number}><td><strong>{a.number}</strong> {a.title}</td><td>{a.portal}</td><td className="n">{a.days}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      </main>
    </>
  );
}
