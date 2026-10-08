import test from "node:test";
import assert from "node:assert/strict";
import { initialRole, isAllowedEmail, parseAdminEmails, safeNext } from "./identity.ts";

test("an email outside the company domain is refused", () => {
  assert.equal(isAllowedEmail("a@gmail.com", "dropxlogistics.com", true), false);
  assert.equal(isAllowedEmail("a@dropxlogistics.com.evil.com", "dropxlogistics.com", true), false);
  assert.equal(isAllowedEmail("a@evil.com@dropxlogistics.com", "dropxlogistics.com", true), false);
  assert.equal(isAllowedEmail("a@sub.dropxlogistics.com", "dropxlogistics.com", true), false);
});
test("an unverified email or missing domain config is refused", () => {
  assert.equal(isAllowedEmail("a@dropxlogistics.com", "dropxlogistics.com", false), false);
  assert.equal(isAllowedEmail("a@dropxlogistics.com", "", true), false);
  assert.equal(isAllowedEmail(null, "dropxlogistics.com", true), false);
});
test("a verified company email is allowed, case-insensitively", () => {
  assert.equal(isAllowedEmail("Asha@DropXLogistics.com", "dropxlogistics.com", true), true);
});
test("a new person starts as reporter; only configured admins start as admin", () => {
  const admins = parseAdminEmails(" Boss@dropxlogistics.com, other@dropxlogistics.com ");
  assert.equal(initialRole("new.person@dropxlogistics.com", admins), "reporter");
  assert.equal(initialRole("BOSS@dropxlogistics.com", admins), "admin");
  assert.equal(initialRole("x@dropxlogistics.com", parseAdminEmails(undefined)), "reporter");
});
test("redirect target must stay on this site", () => {
  assert.equal(safeNext("/new?portal=people&page=https%3A%2F%2Fx"), "/new?portal=people&page=https%3A%2F%2Fx");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
  assert.equal(safeNext(null), "/");
});
