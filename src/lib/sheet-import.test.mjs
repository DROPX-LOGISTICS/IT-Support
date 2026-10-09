import test from "node:test";
import assert from "node:assert/strict";
import { dailyKey, mapHeaders, mapSheetStatus, parseSheetDate, parseSheetPriority, parseYesNo, planDaily, planTickets } from "./sheet-import.ts";

const NOW = "2026-10-09T05:00:00.000Z";
const lookups = (o = {}) => ({
  portals: [{ id: "p-people", name: "People" }, { id: "p-ops", name: "OpsPulse" }],
  users: [{ id: "u-asha", name: "Asha Nair", email: "asha@dropxlogistics.com" }],
  developers: [{ id: "d-ravi", display_name: "Ravi" }],
  existingNumbers: new Set(), ticketIdByNumber: new Map(), existingDailyKeys: new Set(), ...o,
});

const BUGS = `ID,Date,Portal,What went wrong,Reporter,Priority,Screenshot link,Status,Expected fix date,Developer update,Does it work now?
BUG-2,05/10/2026,people,"Payout page is blank, then crashes",Asha Nair,High,https://drive.example/a https://drive.example/b,Fixed,08/10/2026,Deployed on Tuesday,Yes
bug-003,06-Oct-26,OpsPulse,Export fails,Station Mumbai,P0,,In progress,2026-10-12,,
BUG-4,,Unknown Portal,Something,Asha Nair,Low,,,,,
,07/10/2026,People,No id here,Asha Nair,P2,,,,,
BUG-3,,People,Duplicate row,Asha Nair,P2,,,,,
BUG-5,,People,Needs a check,Asha Nair,weird,,Done,31/02/2026,,No
`;

test("maps the sheet's own header names", () => {
  const { map, unknown } = mapHeaders(["ID", "What went wrong", "Does it work now?", "Expected fix date", "Odd column"], {
    id: ["id"], description: ["whatwentwrong"], works: ["doesitworknow"], expected: ["expectedfixdate"],
  });
  assert.deepEqual(map, { id: "ID", description: "What went wrong", works: "Does it work now?", expected: "Expected fix date" });
  assert.deepEqual(unknown, ["Odd column"]);
});
test("priority, yes/no and dates", () => {
  assert.equal(parseSheetPriority("High"), "P1");
  assert.equal(parseSheetPriority("p0"), "P0");
  assert.equal(parseSheetPriority("whatever"), null);
  assert.equal(parseYesNo(" Yes "), "yes");
  assert.equal(parseYesNo("Not working"), "no");
  assert.equal(parseYesNo(""), null);
  assert.equal(parseSheetDate("05/10/2026"), "2026-10-05");
  assert.equal(parseSheetDate("5-Oct-26"), "2026-10-05");
  assert.equal(parseSheetDate("12 October 2026"), "2026-10-12");
  assert.equal(parseSheetDate("Oct 12, 2026"), "2026-10-12");
  assert.equal(parseSheetDate("2026-10-12"), "2026-10-12");
  assert.equal(parseSheetDate("31/02/2026"), null);
  assert.equal(parseSheetDate("next week"), null);
});
test("only a yes from the reporter closes a done ticket", () => {
  assert.deepEqual(mapSheetStatus("Fixed", "yes"), { status: "Closed", confirmed: "yes" });
  assert.equal(mapSheetStatus("Done", null).status, "Done – awaiting confirmation");
  assert.deepEqual(mapSheetStatus("Done", "no"), { status: "Reopened", confirmed: "no" });
  assert.equal(mapSheetStatus("In progress", "yes").status, "In progress");
  assert.equal(mapSheetStatus("On hold", null).status, "Blocked");
  assert.equal(mapSheetStatus("", null).status, "New");
  assert.match(mapSheetStatus("gibberish", null).warn, /Unknown status/);
});

test("imports tickets keeping their IDs, and lists everything it could not place", () => {
  const plan = planTickets(BUGS, "bug", "bugs", lookups(), NOW);
  assert.deepEqual(plan.inserts.map((t) => t.number), ["BUG-002", "BUG-003", "BUG-005"]);
  const a = plan.inserts[0];
  assert.equal(a.status, "Closed");
  assert.equal(a.confirmed_working, "yes");
  assert.equal(a.reporter_id, "u-asha");
  assert.equal(a.priority, "P1");
  assert.equal(a.expected_date, "2026-10-08");
  assert.deepEqual(a.links, ["https://drive.example/a", "https://drive.example/b"]);
  assert.equal(a.created_at, "2026-10-05T00:00:00+05:30");
  assert.equal(a.title, "Payout page is blank, then crashes");
  const b = plan.inserts[1];
  assert.equal(b.reporter_id, null);
  assert.equal(b.reporter_name, "Station Mumbai");
  assert.equal(b.status, "In progress");
  const c = plan.inserts[2];
  assert.equal(c.priority, "P2");
  assert.equal(c.status, "Reopened");
  assert.equal(c.expected_date, null);
  assert.deepEqual(plan.unmatchedReporters, ["Station Mumbai"]);
  assert.deepEqual(plan.unknownPortals, ["Unknown Portal"]);
  const msgs = plan.problems.map((p) => p.message).join("\n");
  assert.match(msgs, /BUG-004.*not in the portal list/);
  assert.match(msgs, /No ID, row skipped/);
  assert.match(msgs, /BUG-003 appears twice/);
  assert.equal(plan.highest.bug, 5);
});
test("running the import again skips what already exists", () => {
  const plan = planTickets(BUGS, "bug", "bugs", lookups({ existingNumbers: new Set(["BUG-002", "BUG-003", "BUG-005"]) }), NOW);
  assert.equal(plan.inserts.length, 0);
  assert.deepEqual(plan.skippedExisting, ["BUG-002", "BUG-003", "BUG-005"]);
});
test("a reporter name shared by two people is not guessed", () => {
  const l = lookups({ users: [{ id: "u1", name: "Asha Nair", email: "a1@x.com" }, { id: "u2", name: "Asha Nair", email: "a2@x.com" }] });
  const plan = planTickets(BUGS, "bug", "bugs", l, NOW);
  assert.equal(plan.inserts[0].reporter_id, null);
});

const FEATURES = `ID,Portal,Feature request,Reporter,Priority,Status,Is it viable?,Reason
FR-1,People,Add dark mode,Asha Nair,Low,New,No,Not planned this year
FR-2,People,Bulk upload,Asha Nair,Medium,Viable check,Maybe,
FR-3,OpsPulse,Reports,Asha Nair,High,In progress,Yes,
`;
test("feature tab: viability and its reason", () => {
  const p = planTickets(FEATURES, "feature", "features", lookups(), NOW);
  assert.deepEqual(p.inserts.map((t) => [t.number, t.type, t.viable]), [["FR-001", "feature", "no"], ["FR-002", "feature", "needs_discussion"], ["FR-003", "feature", "yes"]]);
  assert.equal(p.inserts[0].viable_reason, "Not planned this year");
  assert.match(p.inserts[1].viable_reason, /not recorded/);
  assert.equal(p.inserts[2].viable_reason, null);
});
test("a tab without an ID column imports nothing", () => {
  const p = planTickets("Portal,Issue\nPeople,Broken", "bug", "bugs", lookups(), NOW);
  assert.equal(p.inserts.length, 0);
  assert.match(p.problems[0].message, /No ID column/);
});

const DAILY = `Date,Portal,Related ID,Work done,Hours,Status,Blocker,Next step
07/10/2026,People,BUG-2,Fixed payout page,3.5,Done,,Monitor
07/10/2026,OpsPulse,BUG-99,Looked at export,2h,In progress,Waiting for data,Retry
08/10/2026,People,,Code review,x,Blocked,Access,
`;
test("daily log import needs one developer name, links known tickets and keeps unknown ones in the text", () => {
  const l = lookups({ ticketIdByNumber: new Map([["BUG-002", "t2"]]) });
  assert.match(planDaily(DAILY, "daily", l, null, NOW).problems[0].message, /--developer/);
  const p = planDaily(DAILY, "daily", l, "ravi", NOW);
  assert.equal(p.inserts.length, 3);
  assert.equal(p.inserts[0].ticket_id, "t2");
  assert.equal(p.inserts[0].hours, 3.5);
  assert.equal(p.inserts[0].state, "published");
  assert.equal(p.inserts[1].hours, 2);
  assert.match(p.inserts[1].work_done, /\(Related: BUG-99\)$/);
  assert.equal(p.inserts[2].hours, null);
  assert.equal(p.inserts[2].status, "Blocked");
});
test("daily log import is safe to repeat", () => {
  const l = lookups({ ticketIdByNumber: new Map([["BUG-002", "t2"]]) });
  const first = planDaily(DAILY, "daily", l, "Ravi", NOW);
  const keys = new Set(first.inserts.map((r) => dailyKey(r.update_date, r.developer_id, r.portal_id, r.work_done)));
  const again = planDaily(DAILY, "daily", { ...l, existingDailyKeys: keys }, "Ravi", NOW);
  assert.equal(again.inserts.length, 0);
  assert.equal(again.skippedExisting, 3);
});
