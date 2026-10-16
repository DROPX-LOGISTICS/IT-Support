"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { changeStatus, type ActionResult } from "@/app/tickets/actions";
import { Avatar, OverdueBadge, PriorityPill } from "@/components/ui";
import type { Priority, Status } from "@/lib/tickets";
import { DONE } from "@/lib/status-flow";

export type BoardCard = { id: string; number: string; title: string; priority: Priority; status: Status; portal: string; assignee: string; overdueHours: number | null; next: Status[] };
export type BoardColumn = { status: Status; label: string; cards: BoardCard[] };

const COLOR: Record<Status, string> = {
  "New": "var(--info)", "Viable check": "var(--warn)", "In progress": "var(--brand)", "Blocked": "var(--warn)", "Reopened": "var(--violet)",
  "Done – awaiting confirmation": "var(--ok)", "Closed": "var(--faint)", "Not viable": "var(--bad)",
};
const initial: ActionResult = { ok: false, message: "" };
function Go({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending && <Loader2 size={16} className="spin" aria-hidden />}{label}</button>;
}

/** Same rules as the ticket page: the server checks the move again. Reason or update is asked for when the rule needs one. */
function MoveDialog({ card, to, onClose }: { card: BoardCard; to: Status; onClose: () => void }) {
  const [state, action] = useFormState(changeStatus, initial);
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const needsReason = to === "Blocked" || to === "Not viable";
  const needsUpdate = to === DONE;
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { if (state.ok) { router.refresh(); onClose(); } }, [state, router, onClose]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="mv-title">
      <form action={action} className="stack" style={{ ["--gap" as string]: "12px" }}>
        <input type="hidden" name="ticketId" value={card.id} />
        <input type="hidden" name="seen" value={card.status} />
        <input type="hidden" name="to" value={to} />
        <h2 id="mv-title">{card.number}: move to {to}</h2>
        {needsReason && <div><label className="field" htmlFor="mv-reason">Reason <span className="hint">(required)</span></label><textarea id="mv-reason" name="reason" required style={{ minHeight: 70 }} /></div>}
        {needsUpdate && <div><label className="field" htmlFor="mv-update">Update for the reporter</label><textarea id="mv-update" name="update" style={{ minHeight: 80 }} placeholder="What was fixed or delivered, and what they should check." /></div>}
        <p className="muted" style={{ margin: 0, overflowWrap: "anywhere" }}>{card.title}</p>
        {state.message && !state.ok && <div className="err" role="alert">{state.message}</div>}
        <div className="actions"><button className="btn ghost" type="button" onClick={() => ref.current?.close()}>Cancel</button><Go label="Move" /></div>
      </form>
    </dialog>
  );
}

export function Board({ columns, canMove }: { columns: BoardColumn[]; canMove: boolean }) {
  const [drag, setDrag] = useState<BoardCard | null>(null);
  const [move, setMove] = useState<{ card: BoardCard; to: Status } | null>(null);
  const close = () => { setMove(null); setDrag(null); };
  return (
    <>
      <div className="board">
        {columns.map((col) => {
          const allowed = drag ? drag.next.includes(col.status) : false;
          return (
            <section key={col.status} className={`col${drag ? (allowed ? " can-drop" : drag.status === col.status ? "" : " no-drop") : ""}`} aria-label={col.label} style={{ ["--col" as string]: COLOR[col.status] }}
              onDragOver={(e) => { if (allowed) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (drag && allowed) setMove({ card: drag, to: col.status }); }}>
              <h3><span>{col.label}</span><span>{col.cards.length}</span></h3>
              {col.cards.length === 0 && <p className="hint" style={{ margin: "4px" }}>Nothing here</p>}
              {col.cards.map((c) => (
                <article key={c.id} className={`bcard${drag?.id === c.id ? " dragging" : ""}`} draggable={canMove && c.next.length > 0}
                  onDragStart={(e) => { setDrag(c); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
                  onDragEnd={() => setDrag(null)}>
                  <div className="ticket-top" style={{ marginBottom: 2 }}><PriorityPill priority={c.priority} /><span className="num">{c.number}</span>{c.overdueHours !== null && <OverdueBadge hours={c.overdueHours} />}</div>
                  <Link className="t" href={`/tickets/${c.id}`}>{c.title}</Link>
                  <div className="meta" style={{ marginTop: 4, justifyContent: "space-between", alignItems: "center" }}>
                    <span>{c.portal}</span>
                    <span className="person" title={c.assignee ? `Assigned to ${c.assignee}` : "Unassigned"}><Avatar name={c.assignee || "?"} small neutral={!c.assignee} />{c.assignee ? c.assignee.split(" ")[0] : "Unassigned"}</span>
                  </div>
                  {canMove && c.next.length > 0 && (
                    <select aria-label={`Move ${c.number}`} value="" onChange={(e) => e.target.value && setMove({ card: c, to: e.target.value as Status })}>
                      <option value="">Move to…</option>
                      {c.next.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
      {move && <MoveDialog card={move.card} to={move.to} onClose={close} />}
    </>
  );
}
