import test from "node:test";
import assert from "node:assert/strict";
import { allowedNextStatuses, checkConfirmation, checkTransition, shouldAutoClose, DONE } from "./status-flow.ts";
import { STATUSES } from "./tickets.ts";

test("bugs and support issues go New to In progress; features go through Viable check", () => {
  assert.deepEqual(allowedNextStatuses("bug", "New"), ["In progress"]);
  assert.deepEqual(allowedNextStatuses("support", "New"), ["In progress"]);
  assert.deepEqual(allowedNextStatuses("feature", "New"), ["Viable check"]);
  assert.deepEqual(allowedNextStatuses("feature", "Viable check"), ["In progress", "Not viable"]);
});
test("every allowed move passes and every other move is refused", () => {
  for (const type of ["bug", "feature", "support"]) {
    for (const from of STATUSES) {
      const allowed = allowedNextStatuses(type, from);
      for (const to of STATUSES) {
        const r = checkTransition({ type, current: from, seen: from, to, reason: "because", developerUpdate: "fixed" });
        assert.equal(r.ok, allowed.includes(to), `${type}: ${from} -> ${to}`);
      }
    }
  }
});
test("bugs cannot be declared not viable and nobody skips ahead", () => {
  assert.equal(checkTransition({ type: "bug", current: "New", seen: "New", to: "Not viable", reason: "x" }).ok, false);
  assert.equal(checkTransition({ type: "bug", current: "New", seen: "New", to: DONE, developerUpdate: "x" }).ok, false);
  assert.equal(checkTransition({ type: "bug", current: "In progress", seen: "In progress", to: "Closed" }).ok, false);
});
test("a stale page is refused", () => {
  const r = checkTransition({ type: "bug", current: "In progress", seen: "New", to: "Blocked", reason: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "stale");
});
test("Blocked and Not viable need a reason; Done needs a developer update", () => {
  assert.equal(checkTransition({ type: "bug", current: "In progress", seen: "In progress", to: "Blocked" }).code, "reason_required");
  assert.equal(checkTransition({ type: "feature", current: "Viable check", seen: "Viable check", to: "Not viable", reason: "  " }).code, "reason_required");
  assert.equal(checkTransition({ type: "bug", current: "In progress", seen: "In progress", to: DONE }).code, "update_required");
  assert.equal(checkTransition({ type: "bug", current: "In progress", seen: "In progress", to: DONE, existingUpdate: "Fixed in release" }).ok, true);
});
test("the reporter confirms to close, or reopens with a reason", () => {
  const base = { status: DONE, isReporter: true, isDeveloper: false };
  assert.deepEqual(checkConfirmation({ ...base, works: true }), { ok: true, next: "Closed" });
  assert.equal(checkConfirmation({ ...base, works: false }).code, "reason_required");
  assert.deepEqual(checkConfirmation({ ...base, works: false, reason: "Still blank" }), { ok: true, next: "Reopened" });
});
test("confirmation is refused for others, wrong status, and developers without a reason", () => {
  assert.equal(checkConfirmation({ status: DONE, works: true, isReporter: false, isDeveloper: false }).code, "not_allowed");
  assert.equal(checkConfirmation({ status: "In progress", works: true, isReporter: true, isDeveloper: false }).code, "not_waiting");
  assert.equal(checkConfirmation({ status: DONE, works: true, isReporter: false, isDeveloper: true }).code, "reason_required");
  assert.equal(checkConfirmation({ status: DONE, works: true, isReporter: false, isDeveloper: true, reason: "Confirmed by phone" }).ok, true);
});
test("auto-close applies after seven days awaiting confirmation only", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  assert.equal(shouldAutoClose({ status: DONE, doneAt: "2026-10-13T00:00:00Z" }, now), true);
  assert.equal(shouldAutoClose({ status: DONE, doneAt: "2026-10-13T00:00:01Z" }, now), false);
  assert.equal(shouldAutoClose({ status: "In progress", doneAt: "2026-10-01T00:00:00Z" }, now), false);
  assert.equal(shouldAutoClose({ status: DONE, doneAt: null }, now), false);
});
