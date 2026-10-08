import test from "node:test";
import assert from "node:assert/strict";
import { describeEvent } from "./history.ts";

const ev = (event_type, o = {}) => ({ event_type, actor_name: "A", old_value: null, new_value: null, reason: null, ...o });
test("describes status, assignment and confirmation events", () => {
  assert.equal(describeEvent(ev("status_changed", { old_value: "New", new_value: "In progress" })), "moved it from New to In progress");
  assert.equal(describeEvent(ev("assigned", { new_value: "Ravi" })), "assigned it to Ravi");
  assert.equal(describeEvent(ev("assigned", { old_value: "Ravi" })), "removed the assignee");
  assert.equal(describeEvent(ev("confirmed", { new_value: "yes" })), "confirmed it works");
  assert.match(describeEvent(ev("reopened", { new_value: "Reopened (on behalf of reporter)" })), /recorded by a developer/);
});
