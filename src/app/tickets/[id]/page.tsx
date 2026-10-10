import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Clock, FileText, History, Lock, MessageSquare, Megaphone, Paperclip, RefreshCcw, SlidersHorizontal, Video } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CommentForm } from "@/components/comment-form";
import { ConfirmBar } from "@/components/confirm-bar";
import { MeetPanel } from "@/components/meet-panel";
import { RetryEmail } from "@/components/retry-email";
import { calendarStatus } from "@/lib/google-calendar";
import { isMailKind } from "@/lib/email-content";
import { loadSettings } from "@/lib/targets-server";
import { overdueInfo } from "@/lib/targets";
import { DetailsForm, StatusForm } from "@/components/staff-controls";
import { Avatar, NotConfigured, OverdueBadge, PriorityPill, StatusBadge, StatusSteps } from "@/components/ui";
import { canChangeTicket, isStaff } from "@/lib/access";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildCalendarUrl } from "@/lib/calendar-link";
import { appUrl } from "@/lib/config";
import { describeEvent } from "@/lib/history";
import { isoToIstLocal } from "@/lib/meet";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DONE, allowedNextStatuses } from "@/lib/status-flow";
import { PRIORITY_LABEL, TYPE_LABEL, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ticket = {
  id: string; number: string; type: TicketType; title: string; description: string; steps: string | null; page_url: string | null;
  priority: Priority; status: Status; reporter_id: string | null; reporter_name: string; reporter_email: string;
  raised_by_name: string; raised_by_phone: string | null; assignee_id: string | null; viable: string | null; viable_reason: string | null;
  expected_date: string | null; developer_update: string | null; links: string[]; reopen_count: number; created_at: string; meet_link: string | null; meet_at: string | null; meet_event_id: string | null; first_response_at: string | null; confirmed_at: string | null;
  portal: { name: string } | null;
};

export default async function TicketPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  const supabase = userClient()!;

  // Row-level security returns nothing for a reporter looking at someone else's ticket.
  const { data: t } = await supabase
    .from("support_tickets")
    .select("*, portal:support_portals(name)")
    .eq("id", params.id)
    .maybeSingle<Ticket>();
  if (!t) notFound();

  const staff = isStaff(user.role);
  const canChange = canChangeTicket({ id: user.id, role: user.role, isActive: true });
  const [comments, events, files, devs] = await Promise.all([
    supabase.from("support_comments").select("id,author_name,body,internal,created_at").eq("ticket_id", t.id).order("created_at").returns<{ id: string; author_name: string; body: string; internal: boolean; created_at: string }[]>(),
    supabase.from("support_events").select("id,event_type,actor_name,old_value,new_value,reason,created_at").eq("ticket_id", t.id).order("created_at").returns<{ id: string; event_type: string; actor_name: string; old_value: string | null; new_value: string | null; reason: string | null; created_at: string }[]>(),
    supabase.from("support_attachments").select("id,file_name,mime_type,size_bytes").eq("ticket_id", t.id).order("created_at").returns<{ id: string; file_name: string; mime_type: string; size_bytes: number }[]>(),
    staff
      ? supabase.from("support_users").select("id,name,email").in("role", ["developer", "admin"]).eq("is_active", true).order("name").returns<{ id: string; name: string; email: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
  ]);
  const developers = devs.data ?? [];
  const assigneeRow = developers.find((d) => d.id === t.assignee_id);
  const assignee = assigneeRow?.name;
  const calendarUrl = buildCalendarUrl({ number: t.number, title: t.title, ticketUrl: `${appUrl()}/tickets/${t.id}`, guests: [t.reporter_email, assigneeRow?.email] });
  const isReporter = t.reporter_id === user.id;
  const awaiting = t.status === DONE;
  const due = staff ? overdueInfo(t, (await loadSettings(supabase)).targets, new Date()) : null;
  const apiReady = calendarStatus().configured;
  const editable = canChange && t.status !== "Closed" && t.status !== "Not viable";
  const commentList = comments.data ?? [];
  const eventList = events.data ?? [];
  const fileList = files.data ?? [];

  return (
    <AppShell user={user} width="mid">
      <div className="stack">
        <Link href={staff ? "/queue" : "/my-tickets"} className="back"><ArrowLeft size={16} aria-hidden /> {staff ? "Back to the queue" : "Back to my tickets"}</Link>

        <header className="t-head">
          <div className="ticket-top" style={{ marginBottom: 2 }}><span className="num">{t.number}</span><StatusBadge status={t.status} /><PriorityPill priority={t.priority} />{due?.overdue && <OverdueBadge hours={due.hoursOver} />}</div>
          <h1>{t.title}</h1>
          <div className="meta" style={{ marginTop: 4 }}>
            <span>{TYPE_LABEL[t.type]}</span>{t.portal && <span>{t.portal.name}</span>}
            <span><Clock size={13} aria-hidden /> Raised {fmtDateTime(t.created_at)}</span>
            {t.expected_date && <span><CalendarClock size={13} aria-hidden /> Expected {fmtDate(t.expected_date)}</span>}
            {t.reopen_count > 0 && <span><RefreshCcw size={13} aria-hidden /> Reopened {t.reopen_count}×</span>}
          </div>
        </header>

        <section className="card" style={{ padding: "18px 12px 14px" }}><StatusSteps status={t.status} /></section>

        <div className="t-layout">
          <div className="stack" style={{ minWidth: 0 }}>
            {awaiting && isReporter && <section className="card confirm-card"><ConfirmBar ticketId={t.id} /></section>}
            {awaiting && !isReporter && canChange && <section className="card confirm-card"><ConfirmBar ticketId={t.id} onBehalf /></section>}

            {t.meet_link && t.status !== "Closed" && (
              <section className="card">
                <div className="section-title" style={{ marginBottom: 6 }}><Video size={18} aria-hidden /> Meet session</div>
                <p style={{ margin: 0 }}>{t.meet_at ? `${new Date(t.meet_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST · ` : ""}<a href={t.meet_link} target="_blank" rel="noopener noreferrer">Join the Meet</a></p>
              </section>
            )}

            {t.developer_update && (
              <section className="card">
                <div className="section-title" style={{ marginBottom: 2 }}><Megaphone size={18} aria-hidden /> Latest update from the team</div>
                <p className="prose">{t.developer_update}</p>
              </section>
            )}
            {t.type === "feature" && t.viable && t.viable !== "yes" && (
              <section className="card"><h2>{t.viable === "no" ? "Not viable" : "Needs discussion"}</h2><p className="prose">{t.viable_reason}</p></section>
            )}

            <section className="card">
              <p className="label">{t.type === "feature" ? "What is needed, and why" : t.type === "support" ? "What help is needed" : "What went wrong"}</p>
              <p className="prose" style={{ marginTop: 0 }}>{t.description}</p>
              {t.steps && (<><hr className="divider" /><p className="label">Steps or links</p><p className="prose" style={{ marginTop: 0 }}>{t.steps}</p></>)}
              {t.page_url && (<><hr className="divider" /><p className="label">Page</p><p className="muted" style={{ margin: 0, overflowWrap: "anywhere" }}>{t.page_url}</p></>)}
              {fileList.length > 0 && (
                <>
                  <hr className="divider" /><p className="label">Attachments</p>
                  <ul className="files" style={{ marginTop: 6 }}>
                    {fileList.map((f) => (
                      <li key={f.id}><Paperclip size={15} aria-hidden /><a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener noreferrer">{f.file_name}</a><span className="hint" style={{ flex: "none" }}>{(f.size_bytes / 1024 / 1024).toFixed(1)} MB</span></li>
                    ))}
                  </ul>
                </>
              )}
              {t.links.length > 0 && staff && (
                <>
                  <hr className="divider" /><p className="label">Links</p>
                  <ul className="files" style={{ marginTop: 6 }}>
                    {t.links.map((l) => <li key={l}><FileText size={15} aria-hidden /><a href={l} target="_blank" rel="noopener noreferrer nofollow">{l}</a></li>)}
                  </ul>
                </>
              )}
            </section>

            <section className="card">
              <div className="section-title"><MessageSquare size={18} aria-hidden /> Comments {commentList.length > 0 && <span className="hint">({commentList.length})</span>}</div>
              {commentList.length === 0 && <p className="muted" style={{ margin: 0 }}>No comments yet. Ask a question or add a detail below.</p>}
              {commentList.map((c) => (
                <div key={c.id} className={`comment${c.internal ? " internal" : ""}`}>
                  <Avatar name={c.author_name} />
                  <div style={{ minWidth: 0 }}>
                    <div className="comment-head"><strong>{c.author_name}</strong>{c.internal && <span className="badge b-Blocked"><Lock size={11} aria-hidden />Internal</span>}<span className="muted">{fmtDateTime(c.created_at)}</span></div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                </div>
              ))}
              {t.status === "Closed" ? <p className="muted" style={{ marginBottom: 0 }}>This ticket is closed, so comments are off.</p> : <CommentForm ticketId={t.id} staff={staff} />}
            </section>

            <section className="card">
              <details className="fold" open={staff}>
                <summary><span className="section-title" style={{ margin: 0 }}><History size={18} aria-hidden /> History <span className="hint">({eventList.length})</span></span></summary>
                <ol className="timeline">
                  {eventList.map((e) => (
                    <li key={e.id}>
                      <div><strong>{e.actor_name}</strong> {describeEvent(e)}</div>
                      {e.reason && <div className="muted" style={{ overflowWrap: "anywhere" }}>“{e.reason}”</div>}
                      {canChange && e.event_type === "email_failed" && e.new_value && isMailKind(e.new_value) && <RetryEmail ticketId={t.id} kind={e.new_value} />}
                      <div className="hint">{fmtDateTime(e.created_at)}</div>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          </div>

          <aside className="t-rail">
            {editable && (
              <section className="card">
                <div className="section-title"><RefreshCcw size={17} aria-hidden /> Change status</div>
                {/* Keyed on the status so the choices and the reason field always match the ticket as it is now. */}
                <StatusForm key={t.status} ticketId={t.id} status={t.status} options={allowedNextStatuses(t.type, t.status)} />
              </section>
            )}

            <section className="card">
              <div className="section-title">Details</div>
              <dl className="facts">
                <div><dt>Raised by</dt><dd><span className="person"><Avatar name={t.raised_by_name || t.reporter_name} small /><span>{t.raised_by_name || t.reporter_name}</span></span></dd></div>
                {staff && t.raised_by_name !== t.reporter_name && <div><dt>Signed in as</dt><dd>{t.reporter_name}</dd></div>}
                {staff && <div><dt>Email</dt><dd><a href={`mailto:${t.reporter_email}`}>{t.reporter_email}</a></dd></div>}
                {staff && t.raised_by_phone && <div><dt>Phone</dt><dd><a href={`tel:${t.raised_by_phone}`}>{t.raised_by_phone}</a></dd></div>}
                <div><dt>Assigned to</dt><dd>{assignee ? <span className="person"><Avatar name={assignee} small /><span>{assignee}</span></span> : t.assignee_id ? "The tech team" : <span className="muted">Not assigned yet</span>}</dd></div>
                <div><dt>Priority</dt><dd>{t.priority} · {PRIORITY_LABEL[t.priority]}</dd></div>
                <div><dt>Type</dt><dd>{TYPE_LABEL[t.type]}</dd></div>
                {t.portal && <div><dt>Portal</dt><dd>{t.portal.name}</dd></div>}
                <div><dt>Raised</dt><dd>{fmtDateTime(t.created_at)}</dd></div>
                <div><dt>Expected</dt><dd>{t.expected_date ? fmtDate(t.expected_date) : <span className="muted">No date yet</span>}</dd></div>
              </dl>
            </section>

            {editable && (
              <>
                <section className="card">
                  <details className="fold" open>
                    <summary><span className="section-title" style={{ margin: 0 }}><SlidersHorizontal size={17} aria-hidden /> Edit ticket</span></summary>
                    <DetailsForm ticketId={t.id} type={t.type} priority={t.priority} assigneeId={t.assignee_id} expectedDate={t.expected_date}
                      developerUpdate={t.developer_update} links={t.links} viable={t.viable} viableReason={t.viable_reason} developers={developers} />
                  </details>
                </section>
                <section className="card">
                  <details className="fold" open={Boolean(t.meet_link)}>
                    <summary><span className="section-title" style={{ margin: 0 }}><Video size={17} aria-hidden /> Meet session</span></summary>
                    <MeetPanel ticketId={t.id} calendarUrl={calendarUrl} meetLink={t.meet_link} meetAtLocal={t.meet_at ? isoToIstLocal(t.meet_at) : ""} apiReady={apiReady} hasEvent={Boolean(t.meet_event_id)} />
                  </details>
                </section>
              </>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
