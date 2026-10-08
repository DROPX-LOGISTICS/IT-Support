"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { changeStatus, saveDetails, type ActionResult } from "@/app/tickets/actions";
import { PRIORITIES, PRIORITY_LABEL, type Priority, type Status, type TicketType } from "@/lib/tickets";
import { DONE } from "@/lib/status-flow";

const initial: ActionResult = { ok: false, message: "" };
function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending && <Loader2 size={16} className="spin" aria-hidden />}{children}</button>;
}
const Msg = ({ s }: { s: ActionResult }) => (s.message ? <div className={s.ok ? "ok-text" : "err"} role="status">{s.message}</div> : null);

export function StatusForm(props: { ticketId: string; status: Status; options: Status[] }) {
  const [state, action] = useFormState(changeStatus, initial);
  const [to, setTo] = useState<string>(props.options[0] ?? "");
  if (!props.options.length) return <p className="muted" style={{ margin: 0 }}>No status changes are available from “{props.status}”.</p>;
  const needsReason = to === "Blocked" || to === "Not viable";
  return (
    <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
      <input type="hidden" name="ticketId" value={props.ticketId} />
      <input type="hidden" name="seen" value={props.status} />
      <div>
        <label className="field" htmlFor="to">Move to</label>
        <select id="to" name="to" value={to} onChange={(e) => setTo(e.target.value)}>
          {props.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {needsReason && (
        <div>
          <label className="field" htmlFor="reason">Reason <span className="hint">(required)</span></label>
          <textarea id="reason" name="reason" required style={{ minHeight: 70 }} />
        </div>
      )}
      {to === DONE && (
        <div>
          <label className="field" htmlFor="update">Update for the reporter <span className="hint">(plain words, no technical terms)</span></label>
          <textarea id="update" name="update" style={{ minHeight: 80 }} placeholder="What was fixed or delivered, and what they should check." />
        </div>
      )}
      <div className="actions" style={{ justifyContent: "space-between" }}><Msg s={state} /><Submit>Change status</Submit></div>
    </form>
  );
}

export function DetailsForm(props: {
  ticketId: string; type: TicketType; priority: Priority; assigneeId: string | null; expectedDate: string | null;
  developerUpdate: string | null; links: string[]; viable: string | null; viableReason: string | null;
  developers: { id: string; name: string }[];
}) {
  const [state, action] = useFormState(saveDetails, initial);
  return (
    <form action={action} className="stack" style={{ ["--gap" as string]: "14px" }}>
      <input type="hidden" name="ticketId" value={props.ticketId} />
      <div className="grid2">
        <div>
          <label className="field" htmlFor="assignee">Assignee</label>
          <select id="assignee" name="assignee" defaultValue={props.assigneeId ?? ""}>
            <option value="">Unassigned</option>
            {props.developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field" htmlFor="priority">Priority</label>
          <select id="priority" name="priority" defaultValue={props.priority}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p} · {PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="field" htmlFor="expectedDate">Expected date</label>
        <input id="expectedDate" name="expectedDate" type="date" defaultValue={props.expectedDate ?? ""} style={{ width: "100%", font: "inherit", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" }} />
      </div>
      {props.type === "feature" && (
        <div className="grid2">
          <div>
            <label className="field" htmlFor="viable">Is it viable?</label>
            <select id="viable" name="viable" defaultValue={props.viable ?? ""}>
              <option value="">Not assessed</option><option value="yes">Yes</option><option value="no">No</option><option value="needs_discussion">Needs discussion</option>
            </select>
          </div>
          <div>
            <label className="field" htmlFor="viableReason">Reason or alternative</label>
            <input id="viableReason" name="viableReason" type="text" defaultValue={props.viableReason ?? ""} maxLength={500} />
          </div>
        </div>
      )}
      <div>
        <label className="field" htmlFor="developerUpdate">Update for the reporter <span className="hint">(shown on their ticket)</span></label>
        <textarea id="developerUpdate" name="developerUpdate" defaultValue={props.developerUpdate ?? ""} maxLength={2000} style={{ minHeight: 80 }} />
      </div>
      <div>
        <label className="field" htmlFor="links">Links <span className="hint">(commit, pull request, page; one per line)</span></label>
        <textarea id="links" name="links" defaultValue={props.links.join("\n")} style={{ minHeight: 60 }} />
      </div>
      <div className="actions" style={{ justifyContent: "space-between" }}><Msg s={state} /><Submit>Save changes</Submit></div>
    </form>
  );
}
