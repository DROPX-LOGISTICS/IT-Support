import test from "node:test";
import assert from "node:assert/strict";
import { validateDailyRow } from "./daily-row.ts";

const good = { portalId: "3f2b8c1e-0000-4000-8000-000000000000", ticketNumber: "", workDone: "Fixed it.", hours: "3.5", status: "In progress", blocker: "", nextStep: "", targetDate: "" };
test("accepts a normal row and rounds hours", () => {
  const r = validateDailyRow({ ...good, hours: "3.54", ticketNumber: "bug-12" }, true);
  assert.equal(r.ok, true);
  assert.equal(r.value.hours, 3.5);
  assert.equal(r.value.ticketNumber, "BUG-12");
});
test("publishing needs work done; saving a draft does not", () => {
  assert.ok(validateDailyRow({ ...good, workDone: "" }, true).errors.workDone);
  assert.equal(validateDailyRow({ ...good, workDone: "" }, false).ok, true);
});
test("hours are 0 to 24 and blocked rows need a blocker to publish", () => {
  assert.ok(validateDailyRow({ ...good, hours: "25" }, false).errors.hours);
  assert.ok(validateDailyRow({ ...good, hours: "abc" }, false).errors.hours);
  assert.ok(validateDailyRow({ ...good, status: "Blocked" }, true).errors.blocker);
  assert.equal(validateDailyRow({ ...good, status: "Blocked", blocker: "Waiting for access" }, true).ok, true);
});
test("bad ticket number, status and date are refused", () => {
  assert.ok(validateDailyRow({ ...good, ticketNumber: "XX-1" }, false).errors.ticketNumber);
  assert.ok(validateDailyRow({ ...good, status: "Idle" }, false).errors.status);
  assert.ok(validateDailyRow({ ...good, targetDate: "next week" }, false).errors.targetDate);
});
