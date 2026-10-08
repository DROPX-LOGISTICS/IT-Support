import test from "node:test";
import assert from "node:assert/strict";
import { parseQueueFilters, sanitizeSearch } from "./queue-filters.ts";

test("defaults to open tickets", () => {
  assert.equal(parseQueueFilters({}).status, "open");
});
test("unknown filter values are dropped", () => {
  const f = parseQueueFilters({ type: "idea", priority: "P9", status: "weird", portal: "UP;drop", assignee: "x" });
  assert.deepEqual(f, { type: "", portal: "", status: "open", priority: "", assignee: "", q: "" });
});
test("valid values are kept", () => {
  const f = parseQueueFilters({ type: "bug", priority: "P0", status: "Blocked", portal: "people", assignee: "me" });
  assert.deepEqual(f, { type: "bug", portal: "people", status: "Blocked", priority: "P0", assignee: "me", q: "" });
});
test("search text cannot inject filter syntax", () => {
  assert.equal(sanitizeSearch("a),status.eq.Closed,(b"), "a status.eq.Closed b");
  assert.equal(sanitizeSearch("x".repeat(200)).length, 80);
});
