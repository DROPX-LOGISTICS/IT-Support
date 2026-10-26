"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, Send, Sparkles } from "lucide-react";
import { addComment, draftTicketText, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };

function Send_({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending || disabled}>{pending ? <Loader2 size={16} className="spin" aria-hidden /> : <Send size={16} aria-hidden />} Post</button>;
}

function DraftButton({ action }: { action: (payload: FormData) => void }) {
  const { pending } = useFormStatus();
  return <button className="btn ghost sm ai-button" type="submit" formAction={action} disabled={pending} aria-busy={pending}>
    {pending ? <span className="spin" aria-hidden>◌</span> : <Sparkles size={15} aria-hidden />} {pending ? "Drafting…" : "Draft with AI"}
  </button>;
}

export function CommentForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  const [state, action] = useFormState(addComment, initial);
  const [aiState, aiAction] = useFormState(draftTicketText, initial);
  const ref = useRef<HTMLFormElement>(null);
  const [body, setBody] = useState("");
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  useEffect(() => { if (state.ok) setBody(""); }, [state]);
  useEffect(() => { if (aiState.draft) setBody(aiState.draft); }, [aiState.draft]);
  return (
    <form ref={ref} action={action} style={{ marginTop: 14 }}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="mode" value="comment" />
      <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder="Write a comment…" aria-label="Comment" style={{ minHeight: 80 }} />
      <div className="ai-compose">
        <label className="ai-prompt-label" htmlFor={`comment-ai-instruction-${ticketId}`}><Sparkles size={13} aria-hidden /> Describe your message <span>(optional)</span></label>
        <input id={`comment-ai-instruction-${ticketId}`} name="aiInstruction" className="ai-prompt" maxLength={1200} placeholder="Describe your message… e.g. ask the reporter to confirm the result" />
        <span className="ai-hint">AI uses the ticket details and your instruction. Review before posting.</span>
      </div>
      <div className="actions" style={{ justifyContent: "space-between", marginTop: 8 }}>
        {staff ? <label className="hint" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="internal" /> Internal note (developers only)</label> : <span />}
        <div className="actions" style={{ gap: 7 }}>
          <DraftButton action={aiAction} />
          <Send_ disabled={!body.trim()} />
        </div>
      </div>
      {(state.message || aiState.message) && <div className={state.ok || aiState.ok ? "ok-text" : "err"} role="status">{state.message || aiState.message}</div>}
    </form>
  );
}
