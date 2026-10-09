import { PRIORITIES, type Priority, type Status } from "./tickets.ts";
import { overdueInfo, type Targets } from "./targets.ts";

export type SummaryTicket = {
  number: string; title: string; priority: Priority; status: Status; portal: string; created_at: string;
  first_response_at: string | null; done_at: string | null; closed_at: string | null; confirmed_at: string | null; reopen_count: number;
};
const OPEN: Status[] = ["New", "Viable check", "In progress", "Blocked", "Reopened", "Done – awaiting confirmation"];
const HOUR = 3_600_000, DAY = 86_400_000, IST = 330 * 60_000;
export const WEEKS = 8, WINDOW_DAYS = 90, AWAITING_DAYS = 3;

/** Monday of the IST week containing the instant, as YYYY-MM-DD. */
export function weekStartIst(iso: string | Date): string {
  const t = new Date((typeof iso === "string" ? new Date(iso) : iso).getTime() + IST);
  const day = (t.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - day)).toISOString().slice(0, 10);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export function buildSummary(tickets: SummaryTicket[], targets: Targets, now: Date) {
  const open = tickets.filter((t) => OPEN.includes(t.status));
  const openByPriority = Object.fromEntries(PRIORITIES.map((p) => [p, open.filter((t) => t.priority === p).length])) as Record<Priority, number>;

  const portals = [...new Set(open.map((t) => t.portal))].sort();
  const byPortal = portals.map((portal) => {
    const mine = open.filter((t) => t.portal === portal);
    const row = { portal, total: mine.length } as { portal: string; total: number } & Record<Priority, number>;
    for (const p of PRIORITIES) row[p] = mine.filter((t) => t.priority === p).length;
    return row;
  });

  const overdueItems = open
    .map((t) => ({ t, o: overdueInfo(t, targets, now) }))
    .filter((x) => x.o.overdue)
    .sort((a, b) => a.t.priority.localeCompare(b.t.priority) || b.o.hoursOver - a.o.hoursOver);

  // Last 8 IST weeks, oldest first.
  const thisWeek = weekStartIst(now);
  const weekKeys = Array.from({ length: WEEKS }, (_, i) => new Date(new Date(`${thisWeek}T00:00:00Z`).getTime() - (WEEKS - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
  const weekly = weekKeys.map((w) => ({ weekStart: w, raised: 0, closed: 0 }));
  for (const t of tickets) {
    const a = weekly.find((x) => x.weekStart === weekStartIst(t.created_at)); if (a) a.raised++;
    if (t.closed_at) { const c = weekly.find((x) => x.weekStart === weekStartIst(t.closed_at!)); if (c) c.closed++; }
  }

  const since = now.getTime() - WINDOW_DAYS * DAY;
  const recent = tickets.filter((t) => new Date(t.created_at).getTime() >= since);
  const firstResponse = recent.filter((t) => t.first_response_at).map((t) => (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / HOUR);
  const fixTimes = recent.filter((t) => t.done_at).map((t) => (new Date(t.done_at!).getTime() - new Date(t.created_at).getTime()) / HOUR);
  const reopened = recent.filter((t) => t.reopen_count > 0);

  const awaiting = open
    .filter((t) => t.status === "Done – awaiting confirmation" && t.done_at && now.getTime() - new Date(t.done_at).getTime() > AWAITING_DAYS * DAY)
    .map((t) => ({ number: t.number, title: t.title, portal: t.portal, days: Math.floor((now.getTime() - new Date(t.done_at!).getTime()) / DAY) }))
    .sort((a, b) => b.days - a.days);

  return {
    openTotal: open.length, openByPriority, byPortal,
    overdue: { count: overdueItems.length, items: overdueItems.slice(0, 10).map(({ t, o }) => ({ number: t.number, title: t.title, priority: t.priority, portal: t.portal, hoursOver: Math.round(o.hoursOver) })) },
    weekly,
    avgFirstResponseHours: r1(mean(firstResponse)), avgFixHours: r1(mean(fixTimes)), medianFixHours: r1(median(fixTimes)),
    fixedCount: fixTimes.length,
    reopens: { tickets: reopened.length, total: reopened.reduce((n, t) => n + t.reopen_count, 0), rate: fixTimes.length ? Math.round((reopened.length / fixTimes.length) * 100) : null },
    awaiting,
  };
}
export type Summary = ReturnType<typeof buildSummary>;
