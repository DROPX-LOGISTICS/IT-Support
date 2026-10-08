import test from "node:test";
import assert from "node:assert/strict";
import { canChangeRoles, canChangeTicket, canManageMaster, canSeeInternalComments, canViewTicket } from "./access.ts";

const user = (role, id = "u1", isActive = true) => ({ id, role, isActive });
const ticket = (reporterId, deletedAt = null) => ({ reporterId, deletedAt });

test("a reporter sees only their own tickets", () => {
  assert.equal(canViewTicket(user("reporter", "a"), ticket("a")), true);
  assert.equal(canViewTicket(user("reporter", "a"), ticket("b")), false);
  assert.equal(canViewTicket(user("reporter", "a"), ticket(null)), false);
});
test("developers, managers and admins see every ticket", () => {
  for (const r of ["developer", "manager", "admin"]) assert.equal(canViewTicket(user(r), ticket("someone-else")), true);
});
test("nobody sees soft-deleted tickets, and inactive users see nothing", () => {
  assert.equal(canViewTicket(user("admin"), ticket("a", "2026-01-01")), false);
  assert.equal(canViewTicket(user("developer", "d", false), ticket("a")), false);
  assert.equal(canViewTicket(user("reporter", "a", false), ticket("a")), false);
});
test("internal comments are for staff only", () => {
  assert.equal(canSeeInternalComments(user("reporter")), false);
  assert.equal(canSeeInternalComments(user("developer")), true);
  assert.equal(canSeeInternalComments(user("manager")), true);
});
test("managers are read-only on tickets; only admins manage master data and roles", () => {
  assert.equal(canChangeTicket(user("manager")), false);
  assert.equal(canChangeTicket(user("reporter")), false);
  assert.equal(canChangeTicket(user("developer")), true);
  assert.equal(canManageMaster(user("developer")), false);
  assert.equal(canManageMaster(user("admin")), true);
  assert.equal(canChangeRoles(user("manager")), false);
  assert.equal(canChangeRoles(user("admin")), true);
});
