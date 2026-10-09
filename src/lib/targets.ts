import { PRIORITIES, type Priority, type Status } from "./tickets.ts";

export type Targets = { response: Record<Priority, number>; fix: Record<Priority, number> };

/** Spec defaults: P0 respond in 1 hour, fix in 1 day; P1 4 h / 3 d; P2 1 d / 7 d; P3 2 d / 14 d. */
export const DEFAULT_TARGETS: Targets = {
  response: { P0: 1, P1: 4, P2: 24, P3: 48 },
  fix: { P0: 24, P1: 72, P2: 168, P3: 336 },
};
export const DEFAULT_REMINDER_DAYS = 3;
export const DEFAULT_AUTO_CLOSE_DAYS = 7;

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 8760;

/** Reads the jsonb settings, falling back to the defaults for anything missing or invalid. */
export function parseTargets(response: unknown, fix: unknown): Targets {
  const pick = (src: unknown, fallback: Record<Priority, number>) => {
    const out = { ...fallback };
    if (src && typeof src === "object") for (const p of PRIORITIES) { const v = (src as Record<string, unknown>)[p]; if (positive(v)) out[p] = v; }
    return out;
  };
  return { response: pick(response, DEFAULT_TARGETS.response), fix: pick(fix, DEFAULT_TARGETS.fix) };
}

export type TargetTicket = {
  priority: Priority; status: Status; created_at: string; first_response_at: string | null; confirmed_at: string | null;
};
const HOUR = 3_600_000;
const OPEN: Status[] = ["New", "Viable check", "In progress", "Blocked", "Reopened"];

/**
 * Overdue means open and past a target on wall-clock time: no first response within the response target,
 * or not done within the fix target. A reopened ticket's fix clock restarts at the reopen.
 * A ticket waiting for the reporter to confirm is not overdue.
 */
export function overdueInfo(t: TargetTicket, targets: Targets, now: Date) {
  if (!OPEN.includes(t.status)) return { overdue: false, respondOverdue: false, fixOverdue: false, hoursOver: 0 };
  const created = new Date(t.created_at).getTime();
  const fixStart = t.status === "Reopened" && t.confirmed_at ? new Date(t.confirmed_at).getTime() : created;
  const respondBy = created + targets.response[t.priority] * HOUR;
  const fixBy = fixStart + targets.fix[t.priority] * HOUR;
  const respondOverdue = !t.first_response_at && now.getTime() > respondBy;
  const fixOverdue = now.getTime() > fixBy;
  const hoursOver = Math.max(respondOverdue ? (now.getTime() - respondBy) / HOUR : 0, fixOverdue ? (now.getTime() - fixBy) / HOUR : 0);
  return { overdue: respondOverdue || fixOverdue, respondOverdue, fixOverdue, hoursOver };
}

export type SettingsInput = {
  response_hours: Record<Priority, number>; fix_hours: Record<Priority, number>; reminder_days: number; auto_close_days: number;
  notify: { raised: boolean; assigned: boolean; status: boolean; comment: boolean; confirmation: boolean };
};

export function validateSettingsInput(raw: Record<string, unknown>): { ok: true; value: SettingsInput } | { ok: false; error: string } {
  const num = (k: string) => Number(String(raw[k] ?? "").trim());
  const response = {} as Record<Priority, number>, fix = {} as Record<Priority, number>;
  for (const p of PRIORITIES) {
    response[p] = num(`response_${p}`); fix[p] = num(`fix_${p}`);
    if (!positive(response[p]) || !positive(fix[p])) return { ok: false, error: `Targets for ${p} must be hours between 1 and 8760.` };
    if (fix[p] < response[p]) return { ok: false, error: `The fix target for ${p} cannot be shorter than its response target.` };
  }
  const reminder = num("reminder_days"), auto = num("auto_close_days");
  if (!Number.isInteger(reminder) || reminder < 1 || reminder > 30) return { ok: false, error: "The reminder must be 1 to 30 days." };
  if (!Number.isInteger(auto) || auto < 1 || auto > 60) return { ok: false, error: "Auto-close must be 1 to 60 days." };
  if (auto <= reminder) return { ok: false, error: "Auto-close must come after the reminder." };
  const on = (k: string) => raw[k] === "on" || raw[k] === true;
  return { ok: true, value: { response_hours: response, fix_hours: fix, reminder_days: reminder, auto_close_days: auto, notify: { raised: on("n_raised"), assigned: on("n_assigned"), status: on("n_status"), comment: on("n_comment"), confirmation: on("n_confirmation") } } };
}
