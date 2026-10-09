import type { QueueFilters } from "./queue-filters.ts";

/**
 * Applies the queue filters to a PostgREST ticket query. The queue page and the CSV export share this,
 * so the export is "filtered as on screen" by construction.
 */
export function applyQueueFilters(q: any, f: QueueFilters, ctx: { portalId?: string; userId: string }): any {
  let r = q.is("deleted_at", null);
  if (f.type) r = r.eq("type", f.type);
  if (f.priority) r = r.eq("priority", f.priority);
  if (f.status === "open") r = r.not("status", "in", '("Closed","Not viable")');
  else if (f.status !== "all") r = r.eq("status", f.status);
  if (f.portal && ctx.portalId) r = r.eq("portal_id", ctx.portalId);
  if (f.assignee === "me") r = r.eq("assignee_id", ctx.userId);
  else if (f.assignee === "none") r = r.is("assignee_id", null);
  else if (f.assignee) r = r.eq("assignee_id", f.assignee);
  if (f.q) r = r.or(`number.ilike.%${f.q}%,title.ilike.%${f.q}%,description.ilike.%${f.q}%,reporter_name.ilike.%${f.q}%`);
  return r;
}
