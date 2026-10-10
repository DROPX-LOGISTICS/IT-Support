import test from "node:test";
import assert from "node:assert/strict";
import { fmtDate, greeting, initials, timeAgo } from "./format.ts";

test("initials: two names, one name, an email, nothing", () => {
  assert.equal(initials("Asha Rao"), "AR");
  assert.equal(initials("asha kumari rao"), "AR");
  assert.equal(initials("Asha"), "A");
  assert.equal(initials("first.last@dropxlogistics.com"), "FL");
  assert.equal(initials(""), "?");
  assert.equal(initials(null), "?");
});

test("timeAgo: minutes, hours, days, then the date", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.equal(timeAgo("2026-10-10T11:59:40Z", now), "just now");
  assert.equal(timeAgo("2026-10-10T11:48:00Z", now), "12 min ago");
  assert.equal(timeAgo("2026-10-10T07:00:00Z", now), "5 h ago");
  assert.equal(timeAgo("2026-10-07T12:00:00Z", now), "3 d ago");
  assert.equal(timeAgo("2026-08-01T12:00:00Z", now), fmtDate("2026-08-01T12:00:00Z"));
  assert.equal(timeAgo("not a date", now), "");
});

test("greeting follows the clock in India, not the server's", () => {
  assert.equal(greeting(new Date("2026-10-10T02:00:00Z")), "Good morning"); // 07:30 IST
  assert.equal(greeting(new Date("2026-10-10T08:00:00Z")), "Good afternoon"); // 13:30 IST
  assert.equal(greeting(new Date("2026-10-10T13:00:00Z")), "Good evening"); // 18:30 IST
  assert.equal(greeting(new Date("2026-10-10T19:00:00Z")), "Good morning"); // 00:30 IST
});

test("fmtDate keeps a date-only value on its own day", () => {
  assert.equal(fmtDate("2026-10-10"), "10 Oct 2026");
  assert.equal(fmtDate(null), "");
});
