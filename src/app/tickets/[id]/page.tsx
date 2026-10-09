import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Video, Clock, FileText, Lock, MessageSquare, Paperclip, Phone, User } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CommentForm } from "@/components/comment-form";
import { ConfirmBar } from "@/components/confirm-bar";
import { MeetPanel } from "@/components/meet-panel";
import { DetailsForm, StatusForm } from "@/components/staff-controls";
import { NotConfigured, PriorityPill, StatusBadge } from "@/components/ui";
import { canChangeTicket, isStaff } from "@/lib/access";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { buildCalendarUrl } from "@/lib/calendar-link";
import { appUrl } from "@/lib/config";
import { describeEvent } from "@/lib/history";
import { isoToIstLocal } from "@/lib/meet";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DONE, allowedNextStatuses } from "@/lib/status-flow";
import { TYPE_LABEL, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ticket = {
  id: string; number: string; type: TicketType; title: string; description: string; steps: string | null; page_url: string | null;
  priority: Priority; status: Status; reporter_id: string | null; reporter_name: string; reporter_email: string;
  raised_by_name: string; raised_by_phone: string | null; assignee_id: string | null; viable: string | null; viable_reason: string | null;
  expected_date: string | null; developer_update: string | null; links: string[]; reopen_count: number; created_at: string; meet_link: string | null; meet_at: string | null;
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

  return (
    <>
      <AppHeader user={user} />
      <main className="container stack">
        <Link href={staff ? "/queue" : "/my-tickets"} className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
          <ArrowLeft size={16} aria-hidden /> {staff ? "Back to the queue" : "Back to my tickets"}
        </Link>

        <div>
          <div className="ticket-top"><span className="num">{t.number}</span><StatusBadge status={t.status} /><PriorityPill priority={t.priority} /></div>
          <h1 style={{ overflowWrap: "anywhere" }}>{t.title}</h1>
          <div className="meta">
            <span>{TYPE_LABEL[t.type]}</span>{t.portal && <span>{t.portal.name}</span>}
            <span><Clock size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> Raised {fmtDateTime(t.created_at)}</span>
            {t.expected_date && <span><CalendarClock size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> Expected {fmtDate(t.expected_date)}</span>}
            {t.reopen_count > 0 && <span>Reopened {t.reopen_count}×</span>}
          </div>
        </div>

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
            <h2>Latest update</h2>
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.developer_update}</p>
          </section>
        )}
        {t.type === "feature" && t.viable && t.viable !== "yes" && (
          <section className="card"><h2>{t.viable === "no" ? "Not viable" : "Needs discussion"}</h2><p style={{ margin: "6px 0 0" }}>{t.viable_reason}</p></section>
        )}

        <section className="card">
          <h2>{t.type === "feature" ? "What is needed, and why" : "What went wrong"}</h2>
          <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.description}</p>
          {t.steps && (<><h2 style={{ marginTop: 16 }}>Steps or links</h2><p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.steps}</p></>)}
          {t.page_url && (<><h2 style={{ marginTop: 16 }}>Page</h2><p className="muted" style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}>{t.page_url}</p></>)}
          {staff && (
            <div className="meta" style={{ marginTop: 16 }}>
              <span><User size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> {t.raised_by_name}{t.raised_by_name !== t.reporter_name ? ` (signed in as ${t.reporter_name})` : ""}</span>
              <span>{t.reporter_email}</span>
              {t.raised_by_phone && <span><Phone size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> {t.raised_by_phone}</span>}
              {assignee && <span>Assigned to {assignee}</span>}
            </div>
          )}
          {(files.data ?? []).length > 0 && (
            <ul className="files" style={{ marginTop: 16 }}>
              {(files.data ?? []).map((f) => (
                <li key={f.id}><Paperclip size={15} aria-hidden /><a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{f.file_name}</a><span className="hint" style={{ flex: "none" }}>{(f.size_bytes / 1024 / 1024).toFixed(1)} MB</span></li>
              ))}
            </ul>
          )}
          {t.links.length > 0 && staff && (
            <ul className="files" style={{ marginTop: 12 }}>
              {t.links.map((l) => <li key={l}><FileText size={15} aria-hidden /><a href={l} target="_blank" rel="noopener noreferrer nofollow"><span>{l}</span></a></li>)}
            </ul>
          )}
        </section>

        {canChange && t.status !== "Closed" && t.status !== "Not viable" && (
          <>
            <section className="card"><div className="section-title">Change status</div><StatusForm ticketId={t.id} status={t.status} options={allowedNextStatuses(t.type, t.status)} /></section>
            <section className="card"><div className="section-title">Meet session</div><MeetPanel ticketId={t.id} calendarUrl={calendarUrl} meetLink={t.meet_link} meetAtLocal={t.meet_at ? isoToIstLocal(t.meet_at) : ""} /></section>
            <section className="card"><div className="section-title">Ticket details</div>
              <DetailsForm ticketId={t.id} type={t.type} priority={t.priority} assigneeId={t.assignee_id} expectedDate={t.expected_date}
                developerUpdate={t.developer_update} links={t.links} viable={t.viable} viableReason={t.viable_reason} developers={developers} />
            </section>
          </>
        )}

        <section className="card">
          <div className="section-title"><MessageSquare size={18} aria-hidden /> Comments</div>
          {(comments.data ?? []).length === 0 && <p className="muted" style={{ margin: 0 }}>No comments yet.</p>}
          {(comments.data ?? []).map((c) => (
            <div key={c.id} className={`comment${c.internal ? " internal" : ""}`}>
              <div className="comment-head"><strong>{c.author_name}</strong>{c.internal && <span className="badge b-Blocked"><Lock size={11} aria-hidden style={{ marginRight: 4 }} />Internal</span>}<span className="muted">{fmtDateTime(c.created_at)}</span></div>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.body}</div>
            </div>
          ))}
          {t.status === "Closed" ? <p className="muted" style={{ marginBottom: 0 }}>This ticket is closed.</p> : <CommentForm ticketId={t.id} staff={staff} />}
        </section>

        <section className="card">
          <div className="section-title">History</div>
          <ol className="timeline">
            {(events.data ?? []).map((e) => (
              <li key={e.id}>
                <div><strong>{e.actor_name}</strong> {describeEvent(e)}</div>
                {e.reason && <div className="muted" style={{ overflowWrap: "anywhere" }}>“{e.reason}”</div>}
                <div className="hint">{fmtDateTime(e.created_at)}</div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
