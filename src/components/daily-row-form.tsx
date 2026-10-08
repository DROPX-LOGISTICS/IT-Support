"use client";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Send, Save } from "lucide-react";
import { addManualRow, saveDailyRow, type RowResult } from "@/app/daily-updates/actions";

const initial: RowResult = { ok: false, message: "" };
export type RowData = {
  id?: string; portalId: string; ticketNumber: string; workDone: string; hours: number | null; status: string;
  blocker: string; nextStep: string; targetDate: string;
};

function Btn({ intent, children, primary }: { intent: string; children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={`btn${primary ? "" : " ghost"}`} type="submit" name="intent" value={intent} disabled={pending}>{pending && <Loader2 size={16} className="spin" aria-hidden />}{children}</button>;
}
const E = ({ m }: { m?: string }) => (m ? <div className="err">{m}</div> : null);

export function DailyRowForm({ row, portals, date, mode }: { row: RowData; portals: { id: string; name: string }[]; date: string; mode: "edit" | "add" }) {
  const [state, action] = useFormState(mode === "add" ? addManualRow : saveDailyRow, initial);
  const e = state.errors ?? {};
  return (
    <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
      {row.id && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="date" value={date} />
      <div className="grid2">
        <div><label className="field">Portal</label><select name="portalId" defaultValue={row.portalId} required><option value="" disabled>Choose…</option>{portals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><E m={e.portalId} /></div>
        <div><label className="field">Ticket <span className="hint">(optional)</span></label><input type="text" name="ticketNumber" defaultValue={row.ticketNumber} placeholder="BUG-12" /><E m={e.ticketNumber} /></div>
      </div>
      <div><label className="field">Work done</label><textarea name="workDone" defaultValue={row.workDone} maxLength={5000} style={{ minHeight: 90 }} /><E m={e.workDone} /></div>
      <div className="grid2">
        <div><label className="field">Hours</label><input type="text" name="hours" inputMode="decimal" defaultValue={row.hours ?? ""} placeholder="e.g. 3.5" /><E m={e.hours} /></div>
        <div><label className="field">Status</label><select name="status" defaultValue={row.status}><option>In progress</option><option>Done</option><option>Blocked</option></select><E m={e.status} /></div>
      </div>
      <div className="grid2">
        <div><label className="field">Blocker <span className="hint">(if any)</span></label><input type="text" name="blocker" defaultValue={row.blocker} maxLength={2000} /><E m={e.blocker} /></div>
        <div><label className="field">Next step</label><input type="text" name="nextStep" defaultValue={row.nextStep} maxLength={2000} /><E m={e.nextStep} /></div>
      </div>
      <div style={{ maxWidth: 240 }}><label className="field">Target date <span className="hint">(optional)</span></label><input type="text" name="targetDate" defaultValue={row.targetDate} placeholder="YYYY-MM-DD" /><E m={e.targetDate} /></div>
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <span className={state.ok ? "ok-text" : "err"} role="status">{state.message}</span>
        <span className="actions">
          {mode === "edit" ? (<><Btn intent="save"><Save size={16} aria-hidden /> Save</Btn><Btn intent="publish" primary><Send size={16} aria-hidden /> Publish</Btn></>) : (<Btn intent="add" primary>Add row</Btn>)}
        </span>
      </div>
    </form>
  );
}
