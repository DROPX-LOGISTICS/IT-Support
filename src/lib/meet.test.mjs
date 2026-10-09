import test from "node:test";
import assert from "node:assert/strict";
import { isoToIstLocal, istLocalToIso, parseMeetLink } from "./meet.ts";
import { buildCalendarUrl } from "./calendar-link.ts";

test("accepts only real Google Meet links and cleans them", () => {
  assert.equal(parseMeetLink("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(parseMeetLink("meet.google.com/abc-defg-hij?authuser=1&hs=122"), "https://meet.google.com/abc-defg-hij");
  assert.equal(parseMeetLink("https://meet.google.com.evil.com/abc-defg-hij"), null);
  assert.equal(parseMeetLink("https://evil.com/meet.google.com/abc-defg-hij"), null);
  assert.equal(parseMeetLink("http://meet.google.com/abc-defg-hij"), null);
  assert.equal(parseMeetLink("javascript:alert(1)"), null);
  assert.equal(parseMeetLink("https://meet.google.com/new"), null);
  assert.equal(parseMeetLink(""), null);
});
test("a time typed in IST becomes the right UTC instant, and back", () => {
  assert.equal(istLocalToIso("2026-10-12T15:30"), "2026-10-12T10:00:00.000Z");
  assert.equal(istLocalToIso("2026-10-12T00:10"), "2026-10-11T18:40:00.000Z");
  assert.equal(isoToIstLocal("2026-10-12T10:00:00.000Z"), "2026-10-12T15:30");
  assert.equal(istLocalToIso("2026-02-30T10:00"), null);
  assert.equal(istLocalToIso("2026-10-12 15:30"), null);
  assert.equal(istLocalToIso("2026-10-12T25:00"), null);
});
test("calendar link carries title, guests and ticket link", () => {
  const u = new URL(buildCalendarUrl({ number: "BUG-012", title: "Payout page is blank", ticketUrl: "https://support.dropxlogistics.com/tickets/abc", guests: ["Asha@dropxlogistics.com", "ravi@dropxlogistics.com"] }));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("text"), "BUG-012: Payout page is blank");
  assert.equal(u.searchParams.get("add"), "Asha@dropxlogistics.com,ravi@dropxlogistics.com");
  assert.match(u.searchParams.get("details"), /https:\/\/support\.dropxlogistics\.com\/tickets\/abc/);
});
test("guests are validated and de-duplicated; missing assignee is fine; text is cleaned and capped", () => {
  const u = new URL(buildCalendarUrl({ number: "FR-001", title: "x".repeat(400) + "\nBcc: a@b.com", ticketUrl: "javascript:alert(1)", guests: ["a@x.com", "A@X.COM", null, "not-an-email", "b@x.com\r\nc@x.com"] }));
  assert.equal(u.searchParams.get("add"), "a@x.com");
  assert.equal(u.searchParams.get("text").length, 200);
  assert.ok(!/[\r\n]/.test(u.searchParams.get("text")));
  assert.ok(!u.searchParams.get("details").includes("javascript"));
});
