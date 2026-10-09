"use client";
import { useFormState, useFormStatus } from "react-dom";
import { ExternalLink, Loader2, Table2 } from "lucide-react";
import { exportToSheets, type SheetResult } from "@/app/export/actions";

const initial: SheetResult = { ok: false, message: "" };
function Go() {
  const { pending } = useFormStatus();
  return <button className="btn ghost" type="submit" disabled={pending}>{pending ? <Loader2 size={16} className="spin" aria-hidden /> : <Table2 size={16} aria-hidden />} Export to Google Sheets</button>;
}

/** Same rows as the CSV, written to a new Google Sheet shared with you. Shows "not set up" until Google access is configured. */
export function SheetsExport({ kind, params, status }: { kind: "tickets" | "daily"; params: Record<string, string>; status: "ready" | "off" }) {
  const [state, action] = useFormState(exportToSheets, initial);
  if (status === "off") return <p className="hint" style={{ margin: "10px 2px" }}>Google Sheets export is not set up yet. Use Export CSV, which opens in Sheets.</p>;
  return (
    <form action={action} style={{ margin: "12px 0" }}>
      <input type="hidden" name="kind" value={kind} />
      {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <Go />
        {state.message && <span className={state.ok ? "ok-text" : "err"} role="status">{state.message}{state.ok && state.url && <> <a href={state.url} target="_blank" rel="noopener noreferrer">Open the sheet <ExternalLink size={13} aria-hidden style={{ verticalAlign: "-2px" }} /></a></>}</span>}
      </div>
    </form>
  );
}
