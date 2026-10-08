import { formatTicketNumber, parseTicketNumber } from "./ticket-number.ts";

export type Commit = {
  repo: string; sha: string; message: string; date: string;
  authorLogin: string | null; authorName: string; authorEmail: string;
  parents: number; files: string[] | null;
};
export type Dev = { id: string; logins: string[]; names: string[]; emails: string[] };
export type RepoRow = { repo: string; portalId: string; prefixes: string[] };
export type PortalInfo = { id: string; sortOrder: number };
export type TicketInfo = { id: string; status: string };

const lower = (s: string) => s.trim().toLowerCase();

/** "12345+login@users.noreply.github.com" and "login@users.noreply.github.com" carry the GitHub login. */
export function noreplyLogin(email: string): string | null {
  const m = /^(?:\d+\+)?([a-z0-9-]+)@users\.noreply\.github\.com$/i.exec(email.trim());
  return m ? m[1].toLowerCase() : null;
}

export function isMerge(c: Pick<Commit, "parents">): boolean {
  return c.parents > 1;
}

export function commitSubject(message: string): string {
  return (message.split("\n")[0] ?? "").trim();
}

/** Ticket numbers in a message: any case, any zero padding. Returned in canonical form (BUG-012). */
export function extractTicketNumbers(message: string): string[] {
  const out = new Set<string>();
  for (const m of message.matchAll(/(?<![A-Za-z0-9])(BUG|FR|SUP)-(\d{1,9})(?![A-Za-z0-9])/gi)) {
    const p = parseTicketNumber(`${m[1]}-${m[2]}`);
    if (p) out.add(formatTicketNumber(p.type, p.n));
  }
  return [...out];
}

export type DevMatch = { kind: "matched"; id: string } | { kind: "none" } | { kind: "ambiguous" };

/** By GitHub login, then author email, then author name. Two different developers matching means "ambiguous", never a guess. */
export function matchDeveloper(c: Pick<Commit, "authorLogin" | "authorEmail" | "authorName">, devs: Dev[]): DevMatch {
  const login = c.authorLogin ? lower(c.authorLogin) : noreplyLogin(c.authorEmail);
  const email = lower(c.authorEmail);
  const name = lower(c.authorName);
  const hit = (pred: (d: Dev) => boolean) => devs.filter(pred).map((d) => d.id);
  const steps = [
    login ? hit((d) => d.logins.some((l) => lower(l) === login)) : [],
    email ? hit((d) => d.emails.some((e) => lower(e) === email)) : [],
    name ? hit((d) => d.names.some((n) => lower(n) === name)) : [],
  ];
  for (const ids of steps) {
    if (ids.length === 1) return { kind: "matched", id: ids[0] };
    if (ids.length > 1) return { kind: "ambiguous" };
  }
  return { kind: "none" };
}

export function normalizePrefix(p: string): string {
  return p.trim().replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

const underPrefix = (file: string, prefix: string) => file === prefix || file.startsWith(`${prefix}/`);

/** A repo needs per-file detail only when several portals share it and at least one has path prefixes. */
export function needsFiles(rows: RepoRow[], repo: string): boolean {
  const mine = rows.filter((r) => lower(r.repo) === lower(repo));
  return new Set(mine.map((r) => r.portalId)).size > 1 && mine.some((r) => r.prefixes.length > 0);
}

/**
 * The portal whose path prefix matches most changed files. Files that match no prefix go to the repo's
 * whole-repo portal (a row with no prefixes). Ties go to the lower sort order.
 */
export function portalForCommit(c: Pick<Commit, "repo" | "files">, rows: RepoRow[], portals: PortalInfo[]): string | null {
  const mine = rows.filter((r) => lower(r.repo) === lower(c.repo));
  if (!mine.length) return null;
  const order = (id: string) => portals.find((p) => p.id === id)?.sortOrder ?? 1_000_000;
  const byOrder = (a: string, b: string) => order(a) - order(b) || a.localeCompare(b);
  const distinct = [...new Set(mine.map((r) => r.portalId))].sort(byOrder);
  if (distinct.length === 1) return distinct[0];
  const fallback = mine.find((r) => r.prefixes.length === 0)?.portalId ?? distinct[0];
  if (!c.files?.length) return fallback;

  const counts = new Map<string, number>();
  for (const raw of c.files) {
    const file = normalizePrefix(raw);
    let best: { portalId: string; len: number } | null = null;
    for (const r of mine) {
      for (const pre of r.prefixes.map(normalizePrefix).filter(Boolean)) {
        if (underPrefix(file, pre) && (!best || pre.length > best.len)) best = { portalId: r.portalId, len: pre.length };
      }
    }
    const target = best?.portalId ?? mine.find((r) => r.prefixes.length === 0)?.portalId;
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  if (!counts.size) return fallback;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || byOrder(a[0], b[0]))[0][0];
}

const sentence = (subject: string) => `${subject.replace(/[\s.]+$/, "")}.`;
export function toSentences(subjects: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of subjects.map((x) => x.trim()).filter(Boolean)) {
    const key = s.replace(/[\s.]+$/, "").toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(sentence(s)); }
  }
  return out.join(" ");
}

export type DraftRow = {
  developerId: string; portalId: string; ticketId: string | null;
  workDone: string; status: "Done" | "In progress"; shas: string[];
};

export type DraftResult = { rows: DraftRow[]; unmatched: Commit[]; skippedMerges: number; noPortal: Commit[] };

/** One row per developer, portal and ticket, plus one per portal for unlinked commits. */
export function buildDrafts(input: {
  commits: Commit[]; developers: Dev[]; repoRows: RepoRow[]; portals: PortalInfo[];
  tickets: Map<string, TicketInfo>; alreadyLogged: Map<string, Set<string>>;
}): DraftResult {
  const unmatched: Commit[] = [];
  const noPortal: Commit[] = [];
  let skippedMerges = 0;
  type Acc = { developerId: string; portalId: string; ticket: TicketInfo | null; subjects: string[]; shas: string[] };
  const groups = new Map<string, Acc>();
  const ordered = [...input.commits].sort((a, b) => a.date.localeCompare(b.date) || a.sha.localeCompare(b.sha));

  for (const c of ordered) {
    if (isMerge(c)) { skippedMerges++; continue; }
    const m = matchDeveloper(c, input.developers);
    if (m.kind !== "matched") { unmatched.push(c); continue; }
    if (input.alreadyLogged.get(m.id)?.has(c.sha)) continue;
    const portalId = portalForCommit(c, input.repoRows, input.portals);
    if (!portalId) { noPortal.push(c); continue; }
    const linked = extractTicketNumbers(c.message).map((n) => input.tickets.get(n)).filter((t): t is TicketInfo => Boolean(t));
    const targets: (TicketInfo | null)[] = linked.length ? linked : [null];
    for (const t of targets) {
      const key = `${m.id}|${portalId}|${t?.id ?? ""}`;
      const g = groups.get(key) ?? { developerId: m.id, portalId, ticket: t, subjects: [], shas: [] };
      g.subjects.push(commitSubject(c.message));
      if (!g.shas.includes(c.sha)) g.shas.push(c.sha);
      groups.set(key, g);
    }
  }
  const rows: DraftRow[] = [...groups.values()].map((g) => ({
    developerId: g.developerId, portalId: g.portalId, ticketId: g.ticket?.id ?? null,
    workDone: toSentences(g.subjects), shas: g.shas,
    status: g.ticket && (g.ticket.status === "Closed" || g.ticket.status.startsWith("Done")) ? "Done" : "In progress",
  }));
  return { rows, unmatched, skippedMerges, noPortal };
}

export type ExistingRow = {
  id: string; developerId: string; portalId: string; ticketId: string | null;
  state: string; source: string; workDone: string; shas: string[];
};

/** New commits are added to the open draft; a developer's edits are never overwritten; published rows stay untouched. */
export function planUpserts(drafts: DraftRow[], existing: ExistingRow[]) {
  const inserts: DraftRow[] = [];
  const updates: { id: string; workDone: string; shas: string[] }[] = [];
  for (const d of drafts) {
    if (!d.shas.length) continue;
    const open = existing.find(
      (e) => e.state === "draft" && e.source === "commits" && e.developerId === d.developerId && e.portalId === d.portalId && e.ticketId === d.ticketId,
    );
    if (!open) { inserts.push(d); continue; }
    const fresh = d.shas.filter((s) => !open.shas.includes(s));
    if (!fresh.length) continue;
    updates.push({
      id: open.id,
      workDone: [open.workDone.trim(), d.workDone].filter(Boolean).join(" "),
      shas: [...open.shas, ...fresh],
    });
  }
  return { inserts, updates };
}

const IST_MS = 330 * 60_000;
export const isDateString = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** The IST calendar day as a UTC range. */
export function istDayRange(date: string): { since: string; until: string } {
  const start = new Date(`${date}T00:00:00Z`).getTime() - IST_MS;
  return { since: new Date(start).toISOString(), until: new Date(start + 86_400_000 - 1).toISOString() };
}
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}
export function previousIstDate(now: Date): string {
  return new Date(new Date(`${istDate(now)}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}
