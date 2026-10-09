import { csvToObjects } from "./csv.ts";
import { formatTicketNumber, highestPerType, parseTicketNumber } from "./ticket-number.ts";
import type { TicketType } from "./tickets.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const same = (a: string, b: string) => norm(a) === norm(b);

type Aliases = Record<string, string[]>;
const TICKET_ALIASES: Aliases = {
  id: ["id", "ticketid", "no", "sno", "slno", "bugid", "frid", "number", "ticketno", "ref"],
  date: ["date", "dateraised", "raisedon", "reportedon", "datereported", "createdon", "createdat", "created"],
  portal: ["portal", "module", "application", "app", "system", "site"],
  title: ["title", "summary", "subject"],
  description: ["whatwentwrong", "description", "issue", "problem", "details", "whatisneeded", "request", "featurerequest", "bug", "feature"],
  reporter: ["reporter", "reportedby", "raisedby", "name", "requestedby", "requester", "reportername"],
  reporteremail: ["reporteremail", "email", "emailid"],
  priority: ["priority", "severity"],
  screenshot: ["screenshot", "screenshotlink", "screenshots", "link", "links", "attachment", "evidence"],
  status: ["status", "state"],
  expected: ["expectedfixdate", "expecteddate", "eta", "targetdate", "fixdate", "expectedcompletiondate"],
  update: ["developerupdate", "devupdate", "update", "remarks", "comments", "developerremarks", "developercomment"],
  works: ["doesitworknow", "worksnow", "confirmed", "confirmedworking", "working", "doesitwork", "isitworking", "reporterconfirmation"],
  viable: ["isitviable", "viable", "viability"],
  viablereason: ["reason", "viablereason", "viabilityreason", "whynot", "reasonifnotviable"],
};
const DAILY_ALIASES: Aliases = {
  date: ["date", "day"],
  portal: ["portal", "module", "application", "app", "system", "site"],
  related: ["relatedid", "relatedticket", "ticketid", "id", "ticket", "related", "ticketno"],
  workdone: ["workdone", "work", "taskdone", "tasks", "whatwasdone", "workdescription"],
  hours: ["hours", "hrs", "timespent", "hoursspent"],
  status: ["status", "state"],
  blocker: ["blocker", "blockers", "blockedby"],
  nextstep: ["nextstep", "nextsteps", "next", "plannext"],
  developer: ["developer", "dev", "name", "by", "developername"],
};

export type Problem = { sheet: string; row: number; message: string };

/** Maps the sheet's own header names to our fields. Returns the headers it did not recognise. */
export function mapHeaders(headers: string[], aliases: Aliases): { map: Record<string, string>; unknown: string[] } {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const [field, names] of Object.entries(aliases)) {
    const h = headers.find((x) => !used.has(x) && names.includes(norm(x)));
    if (h) { map[field] = h; used.add(h); }
  }
  return { map, unknown: headers.filter((h) => h && !used.has(h)) };
}

export function parseSheetPriority(v: string): "P0" | "P1" | "P2" | "P3" | null {
  const k = norm(v);
  if (["p0", "critical", "urgent", "blocker", "0"].includes(k)) return "P0";
  if (["p1", "high", "1"].includes(k)) return "P1";
  if (["p2", "medium", "med", "normal", "2"].includes(k)) return "P2";
  if (["p3", "low", "minor", "3"].includes(k)) return "P3";
  return null;
}

export function parseYesNo(v: string): "yes" | "no" | null {
  const k = norm(v);
  if (["yes", "y", "true", "working", "itworks", "worksnow", "ok", "confirmed", "fixed"].includes(k)) return "yes";
  if (["no", "n", "false", "notworking", "stillbroken", "stillnotworking"].includes(k)) return "no";
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
};
const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/** yyyy-mm-dd, dd/mm/yyyy (day first, as used in India), dd-Mon-yy, "12 Oct 2026", "Oct 12, 2026". Anything else is null. */
export function parseSheetDate(v: string): string | null {
  const t = v.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(t);
  if (m) return validDate(year(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,.-]+(\d{4}|\d{2})$/.exec(t);
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return validDate(year(m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]));
  m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return validDate(Number(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]));
  return null;
}

const DONE = "Done – awaiting confirmation";
export type MappedStatus = { status: string; confirmed: "yes" | "no" | null; warn?: string };

/** Sheet status plus "does it work now?" to our status flow. Only a "yes" from the reporter closes a ticket. */
export function mapSheetStatus(raw: string, works: "yes" | "no" | null): MappedStatus {
  const k = norm(raw);
  const has = (...w: string[]) => w.some((x) => k.includes(x));
  let status: string; let warn: string | undefined;
  if (!k) status = "New";
  else if (has("notviable", "reject", "wontdo", "declin")) status = "Not viable";
  else if (has("closed")) status = "Closed";
  else if (has("block", "hold", "waiting")) status = "Blocked";
  else if (has("done", "fixed", "complete", "resolved", "deployed", "delivered")) status = DONE;
  else if (has("progress", "wip", "working", "ongoing", "started", "development", "testing")) status = "In progress";
  else if (has("viable", "review", "check")) status = "Viable check";
  else if (has("reopen")) status = "Reopened";
  else if (has("new", "open", "pending", "todo", "notstarted", "backlog")) status = "New";
  else { status = "New"; warn = `Unknown status "${raw}", imported as New`; }
  if (status === DONE && works === "yes") return { status: "Closed", confirmed: "yes" };
  if (status === DONE && works === "no") return { status: "Reopened", confirmed: "no" };
  if (status === "Closed") return { status, confirmed: works };
  return { status, confirmed: null, warn };
}

export function mapSheetViable(v: string): "yes" | "no" | "needs_discussion" | null {
  const k = norm(v);
  if (!k) return null;
  if (["yes", "y", "viable", "true"].includes(k)) return "yes";
  if (["no", "n", "notviable", "false"].includes(k)) return "no";
  if (["maybe", "needsdiscussion", "discuss", "partial", "partially", "tbd"].includes(k) || k.includes("discuss")) return "needs_discussion";
  return null;
}

export type Lookups = {
  portals: { id: string; name: string }[];
  users: { id: string; name: string; email: string }[];
  developers: { id: string; display_name: string }[];
  existingNumbers: Set<string>;
  ticketIdByNumber: Map<string, string>;
  existingDailyKeys: Set<string>;
};

export type TicketInsert = {
  number: string; type: TicketType; portal_id: string; title: string; description: string; steps: null; priority: string; status: string;
  reporter_id: string | null; reporter_name: string; reporter_email: string; raised_by_name: string;
  viable: string | null; viable_reason: string | null; expected_date: string | null; developer_update: string | null;
  links: string[]; confirmed_working: string | null; confirmed_at: string | null; closed_at: string | null; done_at: string | null;
  reopen_count: number; source: "sheet_import"; created_at: string;
};

export type TicketPlan = {
  inserts: TicketInsert[]; skippedExisting: string[]; problems: Problem[]; warnings: Problem[];
  unmatchedReporters: string[]; unknownPortals: string[]; unknownHeaders: string[]; highest: Record<TicketType, number>;
};

export function matchUser(name: string, email: string, users: Lookups["users"]) {
  const e = email.trim().toLowerCase();
  if (e) {
    const byEmail = users.filter((u) => u.email.toLowerCase() === e);
    if (byEmail.length === 1) return byEmail[0];
  }
  const n = norm(name);
  if (!n) return null;
  const byName = users.filter((u) => norm(u.name) === n);
  return byName.length === 1 ? byName[0] : null; // two people with the same name: not guessed
}

const titleFrom = (text: string) => {
  const first = (text.split(/\n|(?<=[.!?])\s/)[0] ?? text).trim();
  return (first.length > 120 ? `${first.slice(0, 117)}…` : first) || "(no title)";
};

/** Plans the import of one ticket tab. Pure: it returns what to insert and everything it could not place. */
export function planTickets(csv: string, kind: "bug" | "feature", sheet: string, lookups: Lookups, nowIso: string): TicketPlan {
  const { headers, rows } = csvToObjects(csv);
  const { map, unknown } = mapHeaders(headers, TICKET_ALIASES);
  const plan: TicketPlan = { inserts: [], skippedExisting: [], problems: [], warnings: [], unmatchedReporters: [], unknownPortals: [], unknownHeaders: unknown, highest: { bug: 0, feature: 0, support: 0 } };
  const seen = new Set<string>();
  const unmatched = new Set<string>(), badPortals = new Set<string>();
  const get = (r: Record<string, string>, f: string) => (map[f] ? r[map[f]] ?? "" : "");
  const problem = (row: number, message: string) => plan.problems.push({ sheet, row, message });
  const warn = (row: number, message: string) => plan.warnings.push({ sheet, row, message });
  if (!map.id) problem(0, "No ID column found, so nothing can be imported from this tab.");

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const parsed = parseTicketNumber(get(r, "id"));
    if (!parsed) { problem(rowNo, get(r, "id") ? `"${get(r, "id")}" is not a ticket ID like BUG-002 or FR-005` : "No ID, row skipped"); return; }
    const number = formatTicketNumber(parsed.type, parsed.n);
    if (parsed.type !== (kind === "bug" ? "bug" : "feature") && parsed.type !== "support") warn(rowNo, `${number} is on the ${kind} tab but is a ${parsed.type === "bug" ? "bug" : "feature"} ID; kept as ${number}`);
    if (seen.has(number)) { problem(rowNo, `${number} appears twice in this file, the later row is skipped`); return; }
    seen.add(number);
    if (parsed.n > plan.highest[parsed.type]) plan.highest[parsed.type] = parsed.n;
    if (lookups.existingNumbers.has(number)) { plan.skippedExisting.push(number); return; }

    const portalName = get(r, "portal");
    const portal = lookups.portals.find((p) => same(p.name, portalName));
    if (!portal) { badPortals.add(portalName || "(empty)"); problem(rowNo, `${number}: portal "${portalName}" is not in the portal list, row skipped`); return; }

    const description = get(r, "description") || "(imported without a description)";
    const title = get(r, "title") || titleFrom(description);
    const reporterName = get(r, "reporter");
    const user = matchUser(reporterName, get(r, "reporteremail"), lookups.users);
    if (!user) unmatched.add(reporterName || "(empty)");

    let priority = parseSheetPriority(get(r, "priority"));
    if (!priority) { priority = "P2"; warn(rowNo, `${number}: priority "${get(r, "priority")}" not recognised, set to P2`); }
    const works = parseYesNo(get(r, "works"));
    const st = mapSheetStatus(get(r, "status"), works);
    if (st.warn) warn(rowNo, `${number}: ${st.warn}`);
    const expectedRaw = get(r, "expected");
    const expected = expectedRaw ? parseSheetDate(expectedRaw) : null;
    if (expectedRaw && !expected) warn(rowNo, `${number}: expected date "${expectedRaw}" not understood, left empty`);
    const dateRaw = get(r, "date");
    const created = dateRaw ? parseSheetDate(dateRaw) : null;
    if (dateRaw && !created) warn(rowNo, `${number}: date "${dateRaw}" not understood, import time used`);

    let viable = parsed.type === "feature" || kind === "feature" ? mapSheetViable(get(r, "viable")) : null;
    let viableReason: string | null = get(r, "viablereason") || null;
    if (st.status === "Not viable") viable = "no";
    if (viable && viable !== "yes" && !viableReason) viableReason = "(reason not recorded in the sheet)";
    if (!viable) viableReason = viableReason && kind === "feature" ? viableReason : null;
    const links = get(r, "screenshot").split(/[\s,;]+/).filter((l) => /^https?:\/\/\S+$/i.test(l));

    plan.inserts.push({
      number, type: parsed.type, portal_id: portal.id, title, description, steps: null, priority, status: st.status,
      reporter_id: user?.id ?? null, reporter_name: user?.name || reporterName || "(unknown)", reporter_email: user?.email ?? get(r, "reporteremail"),
      raised_by_name: reporterName || user?.name || "(unknown)", viable, viable_reason: viable ? viableReason : null,
      expected_date: expected, developer_update: get(r, "update") || null, links,
      confirmed_working: st.confirmed, confirmed_at: st.confirmed ? nowIso : null,
      closed_at: st.status === "Closed" ? nowIso : null, done_at: st.status === DONE || st.confirmed ? nowIso : null,
      reopen_count: st.status === "Reopened" ? 1 : 0, source: "sheet_import",
      created_at: created ? `${created}T00:00:00+05:30` : nowIso,
    });
  });
  plan.unmatchedReporters = [...unmatched].sort();
  plan.unknownPortals = [...badPortals].sort();
  return plan;
}

export type DailyInsert = {
  update_date: string; developer_id: string; portal_id: string; ticket_id: string | null; work_done: string; hours: number | null;
  status: "In progress" | "Done" | "Blocked"; blocker: string | null; next_step: string | null; state: "published"; source: "manual";
  published_at: string; commit_shas: string[];
};
export type DailyPlan = { inserts: DailyInsert[]; skippedExisting: number; problems: Problem[]; warnings: Problem[]; unknownHeaders: string[]; unknownPortals: string[] };

export const dailyKey = (date: string, developerId: string, portalId: string, work: string) => `${date}|${developerId}|${portalId}|${work.slice(0, 200)}`;

/** Plans the daily log tab. The sheet has no developer column, so one developer name is given for the whole file unless a column exists. */
export function planDaily(csv: string, sheet: string, lookups: Lookups, fallbackDeveloper: string | null, nowIso: string): DailyPlan {
  const { headers, rows } = csvToObjects(csv);
  const { map, unknown } = mapHeaders(headers, DAILY_ALIASES);
  const plan: DailyPlan = { inserts: [], skippedExisting: 0, problems: [], warnings: [], unknownHeaders: unknown, unknownPortals: [] };
  const get = (r: Record<string, string>, f: string) => (map[f] ? r[map[f]] ?? "" : "");
  const problem = (row: number, message: string) => plan.problems.push({ sheet, row, message });
  const warn = (row: number, message: string) => plan.warnings.push({ sheet, row, message });
  const badPortals = new Set<string>();
  if (!map.date || !map.workdone) problem(0, "The daily log needs a Date and a Work done column.");
  if (!map.developer && !fallbackDeveloper) problem(0, "The daily log has no developer column. Pass --developer \"Name\" (as shown in Master, Developers).");
  if (plan.problems.length) return plan;
  const seen = new Set<string>();

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const date = parseSheetDate(get(r, "date"));
    if (!date) { problem(rowNo, `Date "${get(r, "date")}" not understood, row skipped`); return; }
    const devName = get(r, "developer") || fallbackDeveloper || "";
    const dev = lookups.developers.filter((d) => same(d.display_name, devName));
    if (dev.length !== 1) { problem(rowNo, `Developer "${devName}" ${dev.length ? "matches more than one developer" : "is not in Master, Developers"}, row skipped`); return; }
    const portal = lookups.portals.find((p) => same(p.name, get(r, "portal")));
    if (!portal) { badPortals.add(get(r, "portal") || "(empty)"); problem(rowNo, `Portal "${get(r, "portal")}" is not in the portal list, row skipped`); return; }
    let work = get(r, "workdone");
    if (!work) { problem(rowNo, "No work done text, row skipped"); return; }
    let ticketId: string | null = null;
    const relatedRaw = get(r, "related");
    if (relatedRaw) {
      const p = parseTicketNumber(relatedRaw);
      const number = p ? formatTicketNumber(p.type, p.n) : null;
      ticketId = number ? lookups.ticketIdByNumber.get(number) ?? null : null;
      if (!ticketId) { warn(rowNo, `Related "${relatedRaw}" is not an imported ticket; kept in the text`); work = `${work} (Related: ${relatedRaw})`; }
    }
    const hoursRaw = get(r, "hours");
    let hours: number | null = null;
    if (hoursRaw) { const h = Number(hoursRaw.replace(/h(rs?)?$/i, "").trim()); if (Number.isFinite(h) && h >= 0 && h <= 24) hours = Math.round(h * 10) / 10; else warn(rowNo, `Hours "${hoursRaw}" not understood, left empty`); }
    const k = norm(get(r, "status"));
    const status: DailyInsert["status"] = k.includes("block") ? "Blocked" : k.includes("done") || k.includes("complete") ? "Done" : "In progress";
    const key = dailyKey(date, dev[0].id, portal.id, work);
    if (lookups.existingDailyKeys.has(key) || seen.has(key)) { plan.skippedExisting++; return; }
    seen.add(key);
    plan.inserts.push({
      update_date: date, developer_id: dev[0].id, portal_id: portal.id, ticket_id: ticketId, work_done: work, hours, status,
      blocker: get(r, "blocker") || null, next_step: get(r, "nextstep") || null, state: "published", source: "manual", published_at: nowIso, commit_shas: [],
    });
  });
  plan.unknownPortals = [...badPortals].sort();
  return plan;
}

export { highestPerType };
