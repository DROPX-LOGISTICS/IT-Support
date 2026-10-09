"use client";
import { useFormState, useFormStatus } from "react-dom";
import { CalendarClock, CalendarPlus, CalendarX, Loader2, Video } from "lucide-react";
import { cancelMeetSession, createMeetSession, rescheduleMeetSession, saveMeet, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };
const inputStyle = { width: "100%", font: "inherit", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" } as const;

function Btn({ children, ghost, danger, icon }: { children: React.ReactNode; ghost?: boolean; danger?: boolean; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className={`btn${ghost ? " ghost" : ""}${danger ? " bad" : ""}`} type="submit" disabled={pending}>{pending ? <Loader2 size={16} className="spin" aria-hidden /> : icon}{children}</button>;
}
const Msg = ({ s }: { s: ActionResult }) => (s.message ? <span className={s.ok ? "ok-text" : "err"} role="status">{s.message}</span> : <span />);

function WhenFields({ at }: { at: string }) {
  return (
    <div className="grid2">
      <div><label className="field">Date and time <span className="hint">(IST)</span></label><input name="at" type="datetime-local" defaultValue={at} required style={inputStyle} /></div>
      <div><label className="field">Length</label><select name="minutes" defaultValue="30">{[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></div>
    </div>
  );
}

function CreateForm({ ticketId }: { ticketId: string }) {
  const [s, action] = useFormState(createMeetSession, initial);
  return (
    <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <WhenFields at="" />
      <div className="actions" style={{ justifyContent: "space-between" }}><Msg s={s} /><Btn icon={<CalendarPlus size={18} aria-hidden />}>Create Meet session</Btn></div>
      <p className="hint" style={{ margin: 0 }}>Creates the Google Calendar event with a Meet link and invites the reporter and assignee.</p>
    </form>
  );
}

function RescheduleForm({ ticketId, at }: { ticketId: string; at: string }) {
  const [s, action] = useFormState(rescheduleMeetSession, initial);
  return (
    <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <WhenFields at={at} />
      <div className="actions" style={{ justifyContent: "space-between" }}><Msg s={s} /><Btn ghost icon={<CalendarClock size={16} aria-hidden />}>Move the session</Btn></div>
    </form>
  );
}

function CancelForm({ ticketId }: { ticketId: string }) {
  const [s, action] = useFormState(cancelMeetSession, initial);
  return (
    <form action={action} className="actions" style={{ justifyContent: "space-between" }}>
      <input type="hidden" name="ticketId" value={ticketId} /><Msg s={s} /><Btn ghost danger icon={<CalendarX size={16} aria-hidden />}>Cancel the session</Btn>
    </form>
  );
}

function ManualForm({ ticketId, calendarUrl, meetLink, at }: { ticketId: string; calendarUrl: string; meetLink: string | null; at: string }) {
  const [s, action] = useFormState(saveMeet, initial);
  return (
    <div className="stack" style={{ ["--gap" as string]: "14px" }}>
      <ol className="hint" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Open the event. The title and guests (reporter and assignee) are filled in.</li>
        <li>Pick the time, add Google Meet, and save it in Calendar.</li>
        <li>Paste the Meet link and time below so the ticket shows it.</li>
      </ol>
      <div><a className="btn" href={calendarUrl} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18} aria-hidden /> Schedule Meet</a></div>
      <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <div className="grid2">
          <div><label className="field" htmlFor="meetLink">Meet link</label><input id="meetLink" name="link" type="text" defaultValue={meetLink ?? ""} placeholder="https://meet.google.com/abc-defg-hij" style={inputStyle} /></div>
          <div><label className="field" htmlFor="meetAt">Date and time <span className="hint">(IST)</span></label><input id="meetAt" name="at" type="datetime-local" defaultValue={at} style={inputStyle} /></div>
        </div>
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <Msg s={s} />
          <span className="hint" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Video size={14} aria-hidden /> Clear the link and save to remove it</span>
          <Btn>Save Meet session</Btn>
        </div>
      </form>
    </div>
  );
}

/**
 * Staff. With Google Calendar access configured the site creates, moves and cancels the event itself;
 * otherwise (or if you prefer) open a pre-filled Calendar event and paste the Meet link back.
 */
export function MeetPanel(p: { ticketId: string; calendarUrl: string; meetLink: string | null; meetAtLocal: string; apiReady: boolean; hasEvent: boolean }) {
  if (p.apiReady && p.hasEvent) {
    return (
      <div className="stack" style={{ ["--gap" as string]: "14px" }}>
        {p.meetLink && <p style={{ margin: 0 }}><Video size={16} aria-hidden style={{ verticalAlign: "-3px" }} /> <a href={p.meetLink} target="_blank" rel="noopener noreferrer">{p.meetLink}</a></p>}
        <RescheduleForm ticketId={p.ticketId} at={p.meetAtLocal} />
        <CancelForm ticketId={p.ticketId} />
      </div>
    );
  }
  if (p.apiReady) {
    return (
      <div className="stack" style={{ ["--gap" as string]: "14px" }}>
        <CreateForm ticketId={p.ticketId} />
        <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Schedule by hand in Google Calendar instead</summary><div style={{ marginTop: 12 }}><ManualForm ticketId={p.ticketId} calendarUrl={p.calendarUrl} meetLink={p.meetLink} at={p.meetAtLocal} /></div></details>
      </div>
    );
  }
  return (
    <div className="stack" style={{ ["--gap" as string]: "12px" }}>
      <p className="hint" style={{ margin: 0 }}>Automatic scheduling is not set up on this site yet, so use the Calendar link.</p>
      <ManualForm ticketId={p.ticketId} calendarUrl={p.calendarUrl} meetLink={p.meetLink} at={p.meetAtLocal} />
    </div>
  );
}
