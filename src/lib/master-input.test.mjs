import test from "node:test";
import assert from "node:assert/strict";
import { cleanSiteUrl, isPortalCode, isRepoName, parseList, parsePrefixes, slugify } from "./master-input.ts";

test("lists split on lines and commas, without duplicates", () => {
  assert.deepEqual(parseList("a, b\nA;c\n\n"), ["a", "b", "c"]);
  assert.deepEqual(parseList("Nisar@X.com, nisar@x.com", { lower: true }), ["nisar@x.com"]);
});
test("path prefixes are normalised", () => {
  assert.deepEqual(parsePrefixes("./src/app/ops-pulse/\n/apps/connect"), ["src/app/ops-pulse", "apps/connect"]);
});
test("repo names, portal codes and slugs", () => {
  assert.equal(isRepoName("nisar-dropx/dropx-hrms"), true);
  assert.equal(isRepoName("no-slash"), false);
  assert.equal(isRepoName("a/b/c"), false);
  assert.equal(isPortalCode("dropx-one"), true);
  assert.equal(isPortalCode("Bad Code"), false);
  assert.equal(slugify("DropX One"), "dropx-one");
});
test("site address must be http(s) or empty", () => {
  assert.deepEqual(cleanSiteUrl(""), { ok: true, value: null });
  assert.deepEqual(cleanSiteUrl("https://people.dropxlogistics.com/"), { ok: true, value: "https://people.dropxlogistics.com" });
  assert.equal(cleanSiteUrl("javascript:alert(1)").ok, false);
  assert.equal(cleanSiteUrl("not a url").ok, false);
});
