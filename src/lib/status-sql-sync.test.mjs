import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowedNextStatuses, DONE } from "./status-flow.ts";
import { STATUSES } from "./tickets.ts";

const sql = readFileSync(new URL("../../supabase/migrations/20261008130000_2.sql", import.meta.url), "utf8");
const block = sql.match(/v_ok := case([\s\S]*?)else false end;/)[1];

// Reads the transition table out of the SQL, so the TypeScript rules and the database cannot drift apart.
function sqlAllowed(type, from) {
  for (const line of block.split("\n")) {
    const m = /when t\.status = '([^']+)'( and t\.type = 'feature')? then (?:p_new = (v_done|'[^']+')|p_new in \(([^)]*)\))/.exec(line);
    if (!m || m[1] !== from) continue;
    if (m[2] && type !== "feature") continue;
    const raw = m[3] ? [m[3]] : m[4].split(",").map((s) => s.trim());
    return raw.map((s) => (s === "v_done" ? DONE : s.replace(/'/g, "")));
  }
  return [];
}

test("SQL transition table matches the TypeScript status flow", () => {
  for (const type of ["bug", "feature", "support"]) {
    for (const from of STATUSES) {
      assert.deepEqual(sqlAllowed(type, from).sort(), allowedNextStatuses(type, from).sort(), `${type}: ${from}`);
    }
  }
});
test("the database enforces the stale guard, reasons, update requirement and reporter-only confirmation", () => {
  assert.match(sql, /if t\.status <> p_expected then raise exception 'STALE'/);
  assert.match(sql, /p_new = 'Blocked' and v_reason is null/);
  assert.match(sql, /p_new = v_done and coalesce\(v_update/);
  assert.match(sql, /if not v_self and v_user\.role not in \('developer','admin'\) then raise exception 'Not allowed'/);
  assert.match(sql, /if not v_self and v_reason is null then raise exception/);
});
test("reporters cannot see email delivery events", () => {
  assert.match(sql, /create policy support_events_select[\s\S]*event_type not in \('email_sent','email_failed'\)/);
});
