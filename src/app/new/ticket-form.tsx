"use client";
import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Bug, FileText, Lightbulb, LifeBuoy, Loader2, Paperclip, Send, X } from "lucide-react";
import { raiseTicket, type RaiseState } from "./actions";
import { PRIORITIES, PRIORITY_HINT, PRIORITY_LABEL, type TicketType } from "@/lib/tickets";
import { MAX_BYTES, MAX_FILES } from "@/lib/attachments";

const TYPES: { value: TicketType; label: string; hint: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug", hint: "Something is broken", icon: Bug },
  { value: "feature", label: "Feature", hint: "Something new would help", icon: Lightbulb },
  { value: "support", label: "Support", hint: "I need help or access", icon: LifeBuoy },
];
const COPY: Record<TicketType, { label: string; placeholder: string }> = {
  bug: { label: "What went wrong?", placeholder: "What did you expect, and what happened instead?" },
  feature: { label: "What do you need, and why?", placeholder: "Describe the need and how it would help your work." },
  support: { label: "How can we help?", placeholder: "Tell us what you are trying to do." },
};
const initial: RaiseState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? <Loader2 size={18} className="spin" aria-hidden /> : <Send size={18} aria-hidden />}
      {pending ? "Sending…" : "Send ticket"}
    </button>
  );
}

export function TicketForm(props: { portals: { code: string; name: string }[]; defaultPortal: string; defaultPage: string; defaultName: string }) {
  const [state, action] = useFormState(raiseTicket, initial);
  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const e = state.errors ?? {};

  function syncFiles(next: File[]) {
    setFiles(next);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (fileInput.current) fileInput.current.files = dt.files;
  }
  function onPick(list: FileList | null) {
    if (!list) return;
    syncFiles([...files, ...Array.from(list)].slice(0, MAX_FILES));
  }
  const tooBig = files.find((f) => f.size > MAX_BYTES);

  return (
    <form action={action} className="stack" noValidate>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {state.message && !state.ok && <div className="banner bad" role="alert">{state.message}</div>}

      <section className="card">
        <div className="section-title"><span className="step">1</span> What is this about?</div>
        <div className="choices" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => (
            <label key={t.value} className="choice">
              <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} />
              <div className="t"><t.icon size={16} aria-hidden /> {t.label}</div>
              <div className="d">{t.hint}</div>
            </label>
          ))}
        </div>
        {e.type && <div className="err">{e.type}</div>}
        <div style={{ marginTop: 16 }}>
          <label className="field" htmlFor="portal">Which portal?</label>
          <select id="portal" name="portal" defaultValue={props.defaultPortal} required aria-invalid={Boolean(e.portal)}>
            <option value="" disabled>Choose a portal…</option>
            {props.portals.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          {e.portal && <div className="err">{e.portal}</div>}
        </div>
      </section>

      <section className="card">
        <div className="section-title"><span className="step">2</span> Tell us more</div>
        <label className="field" htmlFor="title">Short summary <span className="count">{title.length}/150</span></label>
        <input id="title" name="title" type="text" maxLength={150} value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="One line, e.g. “Payout page shows a blank screen”" aria-invalid={Boolean(e.title)} />
        {e.title && <div className="err">{e.title}</div>}

        <div style={{ marginTop: 16 }}>
          <label className="field" htmlFor="description">{COPY[type].label}</label>
          <textarea id="description" name="description" maxLength={5000} placeholder={COPY[type].placeholder} aria-invalid={Boolean(e.description)} />
          {e.description && <div className="err">{e.description}</div>}
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="field" htmlFor="steps">{type === "bug" ? "Steps to repeat it" : "Links or extra details"} <span className="hint">(optional)</span></label>
          <textarea id="steps" name="steps" maxLength={5000} style={{ minHeight: 76 }} placeholder={type === "bug" ? "1. Open… 2. Click…" : "Links, examples, who is affected"} />
          {e.steps && <div className="err">{e.steps}</div>}
        </div>
        <div style={{ marginTop: 16 }}>
          <label className="field" htmlFor="page">Page where it happened <span className="hint">(filled in for you when you come from a portal)</span></label>
          <input id="page" name="page" type="text" defaultValue={props.defaultPage} maxLength={2000} placeholder="Page address, if relevant" />
        </div>
      </section>

      <section className="card">
        <div className="section-title"><span className="step">3</span> How urgent is it?</div>
        <div className="choices four" role="radiogroup" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <label key={p} className="choice">
              <input type="radio" name="priority" value={p} defaultChecked={p === "P2"} />
              <div className="t">{p} · {PRIORITY_LABEL[p]}</div>
              <div className="d">{PRIORITY_HINT[p]}</div>
            </label>
          ))}
        </div>
        {e.priority && <div className="err">{e.priority}</div>}
      </section>

      <section className="card">
        <div className="section-title"><span className="step">4</span> Screenshots <span className="hint">(optional)</span></div>
        <label className="drop">
          <Paperclip size={20} aria-hidden style={{ verticalAlign: "-4px" }} /> Add screenshots or a PDF
          <div className="hint">Up to {MAX_FILES} files, 5 MB each</div>
          <input ref={fileInput} type="file" name="files" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" onChange={(ev) => onPick(ev.target.files)} />
        </label>
        {files.length > 0 && (
          <ul className="files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <FileText size={15} aria-hidden /><span>{f.name}</span>
                <span className="hint" style={{ flex: "none" }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" className="linklike" aria-label={`Remove ${f.name}`} onClick={() => syncFiles(files.filter((_, j) => j !== i))}><X size={15} aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        {(e.files || tooBig) && <div className="err">{e.files ?? `${tooBig!.name} is larger than 5 MB.`}</div>}
      </section>

      <section className="card">
        <div className="section-title"><span className="step">5</span> Who should we contact?</div>
        <div className="grid2">
          <div>
            <label className="field" htmlFor="raisedByName">Your name</label>
            <input id="raisedByName" name="raisedByName" type="text" defaultValue={props.defaultName} maxLength={100} autoComplete="name" aria-invalid={Boolean(e.raisedByName)} />
            {e.raisedByName && <div className="err">{e.raisedByName}</div>}
          </div>
          <div>
            <label className="field" htmlFor="raisedByPhone">Phone <span className="hint">(optional)</span></label>
            <input id="raisedByPhone" name="raisedByPhone" type="tel" maxLength={20} autoComplete="tel" aria-invalid={Boolean(e.raisedByPhone)} />
            {e.raisedByPhone && <div className="err">{e.raisedByPhone}</div>}
          </div>
        </div>
        <p className="hint" style={{ margin: "10px 0 0" }}>Using a shared station mailbox? Enter your own name so we know who to speak to.</p>
      </section>

      <div className="actions"><Submit /></div>
    </form>
  );
}
