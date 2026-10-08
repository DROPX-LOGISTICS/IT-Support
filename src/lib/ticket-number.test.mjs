import test from "node:test";
import assert from "node:assert/strict";
import { formatTicketNumber, parseTicketNumber, highestPerType, prefixFor } from "./ticket-number.ts";

test("formats per type with three-digit padding", () => {
  assert.equal(formatTicketNumber("bug", 1), "BUG-001");
  assert.equal(formatTicketNumber("feature", 7), "FR-007");
  assert.equal(formatTicketNumber("support", 42), "SUP-042");
  assert.equal(formatTicketNumber("bug", 1234), "BUG-1234");
  assert.equal(prefixFor("feature"), "FR");
});
test("rejects invalid sequences", () => {
  assert.throws(() => formatTicketNumber("bug", 0));
  assert.throws(() => formatTicketNumber("bug", 1.5));
});
test("parses any case and zero padding", () => {
  assert.deepEqual(parseTicketNumber("bug-2"), { type: "bug", n: 2 });
  assert.deepEqual(parseTicketNumber("FR-0007"), { type: "feature", n: 7 });
  assert.deepEqual(parseTicketNumber(" Sup-003 "), { type: "support", n: 3 });
  assert.equal(parseTicketNumber("BUG-0"), null);
  assert.equal(parseTicketNumber("XYZ-1"), null);
  assert.equal(parseTicketNumber("BUG-12abc"), null);
});
test("highest imported number per type, so numbering continues after it", () => {
  assert.deepEqual(highestPerType(["FR-005", "BUG-002", "bug-9", "garbage", "FR-003"]), { bug: 9, feature: 5, support: 0 });
});
