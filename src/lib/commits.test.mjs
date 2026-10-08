import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDrafts, extractTicketNumbers, istDayRange, isDateString, matchDeveloper, needsFiles, noreplyLogin,
  planUpserts, portalForCommit, previousIstDate, toSentences,
} from "./commits.ts";

const commit = (o = {}) => ({
  repo: "o/r", sha: "a1", message: "Fix thing", date: "2026-10-07T05:00:00Z", authorLogin: "nisar-dropx",
  authorName: "Nisar", authorEmail: "n@x.com", parents: 1, files: null, ...o,
});
const dev = (id, o = {}) => ({ id, logins: [], names: [], emails: [], ...o });

test("finds ticket numbers in any case and padding, and ignores look-alikes", () => {
  assert.deepEqual(extractTicketNumbers("Fix BUG-12 and fr-7"), ["BUG-012", "FR-007"]);
  assert.deepEqual(extractTicketNumbers("sup-0003: retry"), ["SUP-003"]);
  assert.deepEqual(extractTicketNumbers("DEBUG-12 FRONT-3 BUG-12abc BUG-0"), []);
  assert.deepEqual(extractTicketNumbers("BUG-12\n\nAlso BUG-012 again"), ["BUG-012"]);
  assert.deepEqual(extractTicketNumbers("(BUG-5)"), ["BUG-005"]);
});

test("matches a developer by login, then email, then name, case-insensitively", () => {
  const devs = [dev("d1", { logins: ["Nisar-DropX"] }), dev("d2", { emails: ["jam@x.com"] }), dev("d3", { names: ["Joseph M"] })];
  assert.deepEqual(matchDeveloper(commit({ authorLogin: "nisar-dropx" }), devs), { kind: "matched", id: "d1" });
  assert.deepEqual(matchDeveloper(commit({ authorLogin: null, authorEmail: "JAM@x.com" }), devs), { kind: "matched", id: "d2" });
  assert.deepEqual(matchDeveloper(commit({ authorLogin: null, authorEmail: "z@z.com", authorName: "joseph m" }), devs), { kind: "matched", id: "d3" });
});
test("GitHub noreply addresses carry the login", () => {
  assert.equal(noreplyLogin("12345+Nisar-DropX@users.noreply.github.com"), "nisar-dropx");
  assert.equal(noreplyLogin("a@gmail.com"), null);
  const devs = [dev("d1", { logins: ["nisar-dropx"] })];
  assert.deepEqual(matchDeveloper(commit({ authorLogin: null, authorEmail: "1+nisar-dropx@users.noreply.github.com" }), devs), { kind: "matched", id: "d1" });
});
test("an unknown author is unmatched and two candidates are ambiguous, never guessed", () => {
  assert.deepEqual(matchDeveloper(commit({ authorLogin: "stranger", authorEmail: "s@s.com", authorName: "S" }), [dev("d1", { logins: ["x"] })]), { kind: "none" });
  assert.deepEqual(matchDeveloper(commit(), [dev("d1", { logins: ["nisar-dropx"] }), dev("d2", { logins: ["nisar-dropx"] })]), { kind: "ambiguous" });
});

const portals = [{ id: "ops", sortOrder: 20 }, { id: "dash", sortOrder: 40 }, { id: "conn", sortOrder: 50 }, { id: "people", sortOrder: 10 }];
const shared = [
  { repo: "o/r", portalId: "ops", prefixes: ["src/app/ops-pulse", "src/lib/ops-pulse"] },
  { repo: "o/r", portalId: "conn", prefixes: ["apps/connect/"] },
  { repo: "o/r", portalId: "dash", prefixes: [] },
  { repo: "o/hrms", portalId: "people", prefixes: [] },
];
test("whole-repo mapping needs no file list", () => {
  assert.equal(portalForCommit({ repo: "o/hrms", files: null }, shared, portals), "people");
  assert.equal(needsFiles(shared, "o/hrms"), false);
  assert.equal(needsFiles(shared, "O/R"), true);
});
test("portal is the one matching most changed files; unmatched files go to the whole-repo portal", () => {
  const f = (files) => portalForCommit({ repo: "o/r", files }, shared, portals);
  assert.equal(f(["src/app/ops-pulse/a.ts", "src/app/ops-pulse/b.ts", "src/lib/x.ts"]), "ops");
  assert.equal(f(["apps/connect/a.ts", "src/lib/x.ts", "src/lib/y.ts"]), "dash");
  assert.equal(f(["apps/connect/a.ts"]), "conn");
  assert.equal(f(["src/app/ops-pulse-other/a.ts"]), "dash");
  assert.equal(f(null), "dash");
});
test("a tie goes to the lower sort order", () => {
  assert.equal(portalForCommit({ repo: "o/r", files: ["src/app/ops-pulse/a.ts", "apps/connect/b.ts"] }, shared, portals), "ops");
});
test("a repo not in the registry has no portal", () => {
  assert.equal(portalForCommit({ repo: "other/repo", files: null }, shared, portals), null);
});

const base = (commits, extra = {}) => ({
  commits, developers: [dev("d1", { logins: ["nisar-dropx"] })], repoRows: [{ repo: "o/r", portalId: "dash", prefixes: [] }],
  portals, tickets: new Map([["BUG-012", { id: "t12", status: "In progress" }], ["FR-007", { id: "t7", status: "Closed" }]]),
  alreadyLogged: new Map(), ...extra,
});

test("groups per developer, portal and ticket, with unlinked commits per portal", () => {
  const r = buildDrafts(base([
    commit({ sha: "a", message: "Fix payout page (BUG-12)" }),
    commit({ sha: "b", message: "Tidy styles" }),
    commit({ sha: "c", message: "Add retry. bug-12 follow up" }),
    commit({ sha: "d", message: "Ship export for fr-7" }),
  ]));
  assert.equal(r.rows.length, 3);
  const bug = r.rows.find((x) => x.ticketId === "t12");
  assert.deepEqual(bug.shas, ["a", "c"]);
  assert.equal(bug.status, "In progress");
  assert.equal(r.rows.find((x) => x.ticketId === "t7").status, "Done");
  assert.equal(r.rows.find((x) => x.ticketId === null).workDone, "Tidy styles.");
});
test("merge commits are skipped; unmatched authors are listed; ticket numbers that do not exist are ignored", () => {
  const r = buildDrafts(base([
    commit({ sha: "m", parents: 2, message: "Merge branch x" }),
    commit({ sha: "u", authorLogin: "stranger", authorEmail: "s@s.com", authorName: "S", message: "Other work" }),
    commit({ sha: "n", message: "Work on BUG-999" }),
  ]));
  assert.equal(r.skippedMerges, 1);
  assert.deepEqual(r.unmatched.map((c) => c.sha), ["u"]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].ticketId, null);
});
test("a commit mentioning two tickets lands in both rows", () => {
  const r = buildDrafts(base([commit({ sha: "x", message: "Fix BUG-12 and FR-7" })]));
  assert.deepEqual(r.rows.map((x) => x.ticketId).sort(), ["t12", "t7"]);
});
test("commits from an unregistered repo are reported, not guessed into a portal", () => {
  const r = buildDrafts(base([commit({ repo: "other/repo" })]));
  assert.equal(r.rows.length, 0);
  assert.equal(r.noPortal.length, 1);
});

test("running twice does not duplicate rows or overwrite edits; new commits are added to the draft", () => {
  const first = buildDrafts(base([commit({ sha: "a", message: "Fix payout" })]));
  const p1 = planUpserts(first.rows, []);
  assert.equal(p1.inserts.length, 1);
  // The developer edits the row and a second run sees the same commit plus a new one.
  const existing = [{ id: "r1", developerId: "d1", portalId: "dash", ticketId: null, state: "draft", source: "commits", workDone: "Fix payout. Tested on staging.", shas: ["a"] }];
  const alreadyLogged = new Map([["d1", new Set(["a"])]]);
  const second = buildDrafts(base([commit({ sha: "a", message: "Fix payout" }), commit({ sha: "b", message: "Add export" })], { alreadyLogged }));
  const p2 = planUpserts(second.rows, existing);
  assert.equal(p2.inserts.length, 0);
  assert.deepEqual(p2.updates, [{ id: "r1", workDone: "Fix payout. Tested on staging. Add export.", shas: ["a", "b"] }]);
  const third = buildDrafts(base([commit({ sha: "a", message: "Fix payout" }), commit({ sha: "b", message: "Add export" })], { alreadyLogged: new Map([["d1", new Set(["a", "b"])]]) }));
  assert.deepEqual(planUpserts(third.rows, existing), { inserts: [], updates: [] });
});
test("late commits after publishing make a new draft and leave the published row alone", () => {
  const published = [{ id: "r1", developerId: "d1", portalId: "dash", ticketId: null, state: "published", source: "commits", workDone: "Done.", shas: ["a"] }];
  const r = buildDrafts(base([commit({ sha: "a" }), commit({ sha: "z", message: "Late fix" })], { alreadyLogged: new Map([["d1", new Set(["a"])]]) }));
  const p = planUpserts(r.rows, published);
  assert.equal(p.updates.length, 0);
  assert.equal(p.inserts.length, 1);
  assert.deepEqual(p.inserts[0].shas, ["z"]);
});

test("work done joins subjects into sentences without duplicates", () => {
  assert.equal(toSentences(["Fix a.", "Add b", "fix a"]), "Fix a. Add b.");
});
test("IST day boundaries and the previous day", () => {
  assert.deepEqual(istDayRange("2026-10-07"), { since: "2026-10-06T18:30:00.000Z", until: "2026-10-07T18:29:59.999Z" });
  assert.equal(previousIstDate(new Date("2026-10-08T03:30:00Z")), "2026-10-07");
  assert.equal(previousIstDate(new Date("2026-10-07T20:00:00Z")), "2026-10-07"); // already 8 Oct 01:30 IST
  assert.equal(isDateString("2026-02-30"), false);
  assert.equal(isDateString("2026-10-07"), true);
});
