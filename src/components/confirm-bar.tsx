"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { confirmTicket, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };

function Buttons({ onBehalf, asking, setAsking }: { onBehalf: boolean; asking: boolean; setAsking: (v: boolean) => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
      {pending && <Loader2 size={18} className="spin" aria-hidden />}
      {!asking && (
        <>
          <button className="btn good" type="submit" name="works" value="yes" disabled={pending}>
            <CheckCircle2 size={18} aria-hidden /> {onBehalf ? "Record: it works" : "Yes, it works"}
          </button>
          <button className="btn ghost" type="button" onClick={() => setAsking(true)} disabled={pending}>
            <XCircle size={18} aria-hidden /> Still not working
          </button>
        </>
      )}
      {asking && (
        <>
          <button className="btn bad" type="submit" name="works" value="no" disabled={pending}>Send, reopen it</button>
          <button className="btn ghost" type="button" onClick={() => setAsking(false)} disabled={pending}>Back</button>
        </>
      )}
    </div>
  );
}

/** Reporter confirmation. A developer may use it on the reporter's behalf, with a reason. */
export function ConfirmBar({ ticketId, onBehalf = false }: { ticketId: string; onBehalf?: boolean }) {
  const [state, action] = useFormState(confirmTicket, initial);
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} className="confirm">
      <input type="hidden" name="ticketId" value={ticketId} />
      <strong>{onBehalf ? "Waiting for the reporter to confirm" : "Does it work now?"}</strong>
      <div className="muted" style={{ fontSize: 14 }}>
        {onBehalf ? "Only record a result for the reporter if they told you directly, and say how." : "Your answer closes the ticket, or sends it back to us."}
      </div>
      {(asking || onBehalf) && (
        <textarea name="reason" required={asking || onBehalf} style={{ marginTop: 10, minHeight: 70 }}
          placeholder={onBehalf ? "How did the reporter tell you? (required)" : "What do you still see? (required)"} aria-label="Reason" />
      )}
      {state.message && <div className={state.ok ? "ok-text" : "err"} role="status" style={{ marginTop: 8 }}>{state.message}</div>}
      <Buttons onBehalf={onBehalf} asking={asking} setAsking={setAsking} />
    </form>
  );
}
