"use client";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Save, Send } from "lucide-react";
import { addManualRow, saveDailyRow, type RowResult } from "@/app/daily-updates/actions";

const initial: RowResult = { ok: false, message: "" };
export type RowData = {
  id?: string; portalId: string; ticketNumber: string; workDone: string; hours: number | null; status: string;
  blocker: string; nextStep: string; targetDate: string;
};

function Btn({ intent, children, primary }: { intent: string; children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`btn sm${primary ? "" : " ghost"}`} type="submit" name="intent" value={intent} disabled={pending}>{pending && <Loader2 size={15} className="spin" aria-hidden />}{children}</button>;
}
const E = ({ m }: { m?: string }) => (m ? <div className="err">{m}</div> : null);

export function DailyRowForm({ row, portals, date, mode }: { row: RowData; portals: { id: string; name: string }[]; date: string; mode: "edit" | "add" }) {
  const [state, action] = useFormState(mode === "add" ? addManualRow : saveDailyRow, initial);
  const e = state.errors ?? {};
  const planningOpen = Boolean(row.blocker || row.nextStep || row.targetDate || e.blocker || e.nextStep || e.targetDate);
  return (
    <form action={action} className="daily-form">
      {row.id && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="date" value={date} />
      <div className="daily-core-grid">
        <div><label className="field">Portal</label><select name="portalId" defaultValue={row.portalId} required aria-invalid={Boolean(e.portalId)}><option value="" disabled>Choose…</option>{portals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><E m={e.portalId} /></div>
        <div><label className="field">Ticket <span className="hint">(optional)</span></label><input type="text" name="ticketNumber" defaultValue={row.ticketNumber} placeholder="BUG-12" aria-invalid={Boolean(e.ticketNumber)} /><E m={e.ticketNumber} /></div>
        <div><label className="field">Hours</label><input type="number" name="hours" min="0" max="24" step="0.1" inputMode="decimal" defaultValue={row.hours ?? ""} placeholder="3.5" aria-invalid={Boolean(e.hours)} /><E m={e.hours} /></div>
        <div><label className="field">Status</label><select name="status" defaultValue={row.status} aria-invalid={Boolean(e.status)}><option>In progress</option><option>Done</option><option>Blocked</option></select><E m={e.status} /></div>
      </div>
      <div className="daily-work-field">
        <label className="field">Work done <span className="hint">One clear point per line</span></label>
        <textarea name="workDone" defaultValue={row.workDone} maxLength={5000} placeholder={'• Completed the change and verified it.\n• Fixed the related edge case.'} aria-invalid={Boolean(e.workDone)} />
        <E m={e.workDone} />
      </div>
      <details className="daily-planning" open={planningOpen}>
        <summary>Planning &amp; blockers <span>{planningOpen ? "Review details" : "Optional"}</span></summary>
        <div className="daily-planning-grid">
          <div><label className="field">Blocker <span className="hint">(if any)</span></label><input type="text" name="blocker" defaultValue={row.blocker} maxLength={2000} aria-invalid={Boolean(e.blocker)} /><E m={e.blocker} /></div>
          <div><label className="field">Next step</label><input type="text" name="nextStep" defaultValue={row.nextStep} maxLength={2000} aria-invalid={Boolean(e.nextStep)} /><E m={e.nextStep} /></div>
          <div><label className="field">Target date <span className="hint">(optional)</span></label><input type="date" name="targetDate" defaultValue={row.targetDate} aria-invalid={Boolean(e.targetDate)} /><E m={e.targetDate} /></div>
        </div>
      </details>
      <div className="daily-form-footer">
        <span className={state.ok ? "ok-text" : "err"} role="status">{state.message}</span>
        <span className="actions">
          {mode === "edit" ? (<><Btn intent="save"><Save size={15} aria-hidden /> Save</Btn><Btn intent="publish" primary><Send size={15} aria-hidden /> Publish</Btn></>) : (<Btn intent="add" primary>Add row</Btn>)}
        </span>
      </div>
    </form>
  );
}
