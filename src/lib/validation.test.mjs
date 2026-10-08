import test from "node:test";
import assert from "node:assert/strict";
import { validateTicketInput } from "./validation.ts";

const good = { type: "bug", portal: "people", title: "Blank page", description: "It is blank", steps: "", priority: "P2", page: "", raisedByName: "Asha", raisedByPhone: "" };

test("accepts a valid ticket and trims text", () => {
  const r = validateTicketInput({ ...good, title: "  Blank   page  ", raisedByPhone: "+91 98765 43210" });
  assert.equal(r.ok, true);
  assert.equal(r.value.title, "Blank page");
});
test("requires type, portal, title, description, priority and name", () => {
  const r = validateTicketInput({});
  assert.equal(r.ok, false);
  for (const k of ["type", "portal", "title", "description", "priority", "raisedByName"]) assert.ok(r.errors[k], k);
});
test("title is limited to 150 characters", () => {
  assert.equal(validateTicketInput({ ...good, title: "x".repeat(150) }).ok, true);
  assert.ok(validateTicketInput({ ...good, title: "x".repeat(151) }).errors.title);
});
test("rejects unknown type or priority and bad phone", () => {
  assert.ok(validateTicketInput({ ...good, type: "idea" }).errors.type);
  assert.ok(validateTicketInput({ ...good, priority: "P9" }).errors.priority);
  assert.ok(validateTicketInput({ ...good, raisedByPhone: "call me" }).errors.raisedByPhone);
});
test("page value stays plain text without control characters", () => {
  const r = validateTicketInput({ ...good, page: "https://x/y\n<script>alert(1)</script>" });
  assert.equal(r.ok, true);
  assert.ok(!r.value.page.includes("\n"));
});
