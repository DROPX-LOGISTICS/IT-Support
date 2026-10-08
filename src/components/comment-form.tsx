"use client";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";
import { addComment, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };

function Send_() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? <Loader2 size={16} className="spin" aria-hidden /> : <Send size={16} aria-hidden />} Post</button>;
}

export function CommentForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  const [state, action] = useFormState(addComment, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} style={{ marginTop: 14 }}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <textarea name="body" maxLength={5000} placeholder="Write a comment…" aria-label="Comment" style={{ minHeight: 80 }} />
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 8 }}>
        {staff ? <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="internal" /> Internal note (developers only)</label> : <span />}
        <Send_ />
      </div>
      {state.message && <div className={state.ok ? "ok-text" : "err"} role="status">{state.message}</div>}
    </form>
  );
}
