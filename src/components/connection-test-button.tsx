"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useFormStatus } from "react-dom";

type Props = {
  provider: string;
  detail: string;
  label?: string;
  pendingLabel?: string;
};

export function ConnectionTestButton({ provider, detail, label = "Test connection", pendingLabel = "Testing…" }: Props) {
  const { pending } = useFormStatus();

  return (
    <>
      <button className="btn ghost sm" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 size={14} className="spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />}
        {pending ? pendingLabel : label}
      </button>
      {pending && (
        <div className="connection-test-backdrop" role="presentation">
          <div className="connection-test-modal" role="dialog" aria-modal="true" aria-labelledby="connection-test-title" aria-describedby="connection-test-detail" aria-live="polite">
            <div className="connection-test-icon"><Loader2 size={20} className="spin" aria-hidden /></div>
            <div>
              <p className="eyebrow">Integration check</p>
              <h2 id="connection-test-title">Testing {provider}</h2>
              <p id="connection-test-detail">{detail}</p>
              <div className="connection-test-status"><span className="pulse-dot" /> Secure check in progress…</div>
              <small>The result will appear here when the check finishes. Your credentials stay on the server.</small>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
