import { PRIORITIES, STATUSES, TICKET_TYPES } from "./tickets.ts";

export type QueueFilters = {
  type: string; portal: string; status: string; priority: string; assignee: string; q: string; overdue: string;
};

/** Search text goes into a PostgREST filter, so characters with special meaning are removed. */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()%*\\"'`:;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

const pick = (v: string | undefined, allowed: readonly string[], fallback = "") => (v && allowed.includes(v) ? v : fallback);

export function parseQueueFilters(sp: Record<string, string | undefined>): QueueFilters {
  return {
    type: pick(sp.type, TICKET_TYPES),
    portal: /^[a-z0-9-]{2,40}$/.test(sp.portal ?? "") ? sp.portal! : "",
    status: pick(sp.status, ["open", "all", ...STATUSES], "open"),
    priority: pick(sp.priority, PRIORITIES),
    assignee: sp.assignee === "me" || sp.assignee === "none" || /^[0-9a-f-]{36}$/i.test(sp.assignee ?? "") ? sp.assignee! : "",
    q: sanitizeSearch(sp.q ?? ""),
    overdue: sp.overdue === "1" ? "1" : "",
  };
}
