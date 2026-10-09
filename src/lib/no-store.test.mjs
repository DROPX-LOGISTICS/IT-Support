import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Next.js caches GET requests made with fetch. A scheduled job that reads tickets or settings must never see stale rows.
for (const file of ["../lib/supabase/admin.ts", "../lib/supabase/server.ts", "../middleware.ts"]) {
  test(`${file.split("/").pop()} never caches database reads`, () => {
    assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), /cache: "no-store"/);
  });
}
test("the GitHub client and the Google clients never cache either", () => {
  for (const f of ["github.ts", "google-calendar.ts", "google-sheets.ts", "google-auth.ts"]) {
    assert.match(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"), /no-store/, f);
  }
});
