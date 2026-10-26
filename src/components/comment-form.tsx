"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";
import { addComment, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };

function Send_({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending || disabled}>{pending ? <Loader2 size={16} className="spin" aria-hidden /> : <Send size={16} aria-hidden />} Post</button>;
}

export function CommentForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  const [state, action] = useFormState(addComment, initial);
  const ref = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  useEffect(() => { if (state.ok) setBody(""); }, [state]);
  return (
    <form ref={ref} action={action} style={{ marginTop: 14 }}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder="Write a comment…" aria-label="Comment" style={{ minHeight: 80 }} />
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 8 }}>
        {staff ? <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="internal" /> Internal note (developers only)</label> : <span />}
        <Send_ disabled={!body.trim()} />
      </div>
      {state.message && <div className={state.ok ? "ok-text" : "err"} role="status">{state.message}</div>}
    </form>
  );
}
