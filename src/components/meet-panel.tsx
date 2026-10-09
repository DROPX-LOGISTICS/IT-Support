"use client";
import { useFormState, useFormStatus } from "react-dom";
import { CalendarPlus, Loader2, Video } from "lucide-react";
import { saveMeet, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };
function Save() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending && <Loader2 size={16} className="spin" aria-hidden />}Save Meet session</button>;
}

/** Staff: open a pre-filled Google Calendar event, then paste the Meet link back here. */
export function MeetPanel({ ticketId, calendarUrl, meetLink, meetAtLocal }: { ticketId: string; calendarUrl: string; meetLink: string | null; meetAtLocal: string }) {
  const [state, action] = useFormState(saveMeet, initial);
  const inputStyle = { width: "100%", font: "inherit", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" } as const;
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
          <div><label className="field" htmlFor="meetAt">Date and time <span className="hint">(IST)</span></label><input id="meetAt" name="at" type="datetime-local" defaultValue={meetAtLocal} style={inputStyle} /></div>
        </div>
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <span className={state.ok ? "ok-text" : "err"} role="status">{state.message}</span>
          <span className="hint" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Video size={14} aria-hidden /> Clear the link and save to remove it</span>
          <Save />
        </div>
      </form>
    </div>
  );
}
