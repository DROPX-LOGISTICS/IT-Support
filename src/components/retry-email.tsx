"use client";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2, RotateCw } from "lucide-react";
import { retryEmailAction, type ActionResult } from "@/app/tickets/actions";

const initial: ActionResult = { ok: false, message: "" };
function Go() {
  const { pending } = useFormStatus();
  return <button className="linklike" type="submit" disabled={pending} style={{ color: "var(--brand)", fontWeight: 600 }}>{pending ? <Loader2 size={13} className="spin" aria-hidden /> : <RotateCw size={13} aria-hidden style={{ verticalAlign: "-2px" }} />} Retry</button>;
}

export function RetryEmail({ ticketId, kind }: { ticketId: string; kind: string }) {
  const [s, action] = useFormState(retryEmailAction, initial);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="ticketId" value={ticketId} /><input type="hidden" name="kind" value={kind} /><Go />
      {s.message && <span className={s.ok ? "ok-text" : "err"} role="status">{s.message}</span>}
    </form>
  );
}
