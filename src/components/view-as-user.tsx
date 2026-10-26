"use client";

import { Eye, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

type ViewUser = { id: string; name: string; email: string; role: string; is_active: boolean };

export function ViewAsUserButton({ users }: { users: ViewUser[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = users.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <button className="view-as-trigger" type="button" onClick={() => setOpen(true)}><Eye size={17} aria-hidden /> View as user</button>
      {open && <div className="view-as-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <section className="view-as-modal" role="dialog" aria-modal="true" aria-labelledby="view-as-title">
          <div className="view-as-head"><div className="view-as-title"><span className="view-as-icon"><Eye size={19} aria-hidden /></span><div><h2 id="view-as-title">View as user</h2><p>See their IT Support workspace.</p></div></div><button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={21} aria-hidden /></button></div>
          <label className="view-as-search"><Search size={18} aria-hidden /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email or role" /></label>
          <p className="view-as-safe"><ShieldCheck size={15} aria-hidden /> Read-only. No ticket, approval, or account changes.</p>
          <div className="view-as-results">
            {query.trim().length < 2 ? <p className="view-as-empty">Type at least 2 characters to find a profile.</p> : filtered.length === 0 ? <p className="view-as-empty">No matching users.</p> : filtered.map((u) => <a key={u.id} href={`/api/admin/view-as?user=${encodeURIComponent(u.id)}`} onClick={() => setOpen(false)} className="view-as-result"><span className="avatar">{(u.name || u.email).slice(0, 1).toUpperCase()}</span><span><strong>{u.name || u.email}</strong><small>{u.email} · {u.role}{!u.is_active && " · inactive"}</small></span></a>)}
          </div>
          <p className="view-as-foot">Choose the exact profile when someone has more than one role.</p>
        </section>
      </div>}
    </>
  );
}
