import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
const sql = files.map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
const TABLES = ["settings", "users", "portals", "portal_repos", "developers", "ticket_counters", "tickets", "comments", "events", "attachments", "daily_updates"].map((t) => `support_${t}`);

test("migration files follow <timestamp>_<n>.sql", () => {
  for (const f of files) assert.match(f, /^\d{14}_\d+\.sql$/);
});
test("every spec table is created and covered by row-level security", () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`create table if not exists ${t} \\(`), `${t} created`);
    assert.ok(sql.includes(`'${t}'`), `${t} in the RLS loop`);
  }
  assert.match(sql, /enable row level security/);
});
test("only support_ objects are created, altered or dropped", () => {
  const targets = [...sql.matchAll(/(?:create (?:unique )?(?:table|index)(?: if not exists)?|alter table|drop (?:table|function|trigger|policy)(?: if exists)?|create (?:or replace )?function|create trigger|create policy)\s+([\w%]+)/gi)].map((m) => m[1]);
  assert.ok(targets.length > 20);
  for (const name of targets) assert.match(name, /^(support_|%I)/, `unexpected object: ${name}`);
  assert.ok(!/drop table/i.test(sql), "no table is dropped");
});
test("re-run safety: no bare create table, and triggers and policies are dropped first", () => {
  assert.ok(!/create table (?!if not exists)/i.test(sql));
  const policies = [...sql.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
  assert.ok(policies.length >= 15);
  for (const p of policies) assert.ok(sql.includes(`drop policy if exists ${p}`), `${p} dropped before create`);
});
test("ticket numbering is an atomic upsert on a counter row", () => {
  assert.match(sql, /insert into support_ticket_counters[\s\S]*on conflict \(ticket_type\) do update[\s\S]*last_value \+ 1[\s\S]*returning last_value/);
  assert.match(sql, /revoke all on function support_next_ticket_number\(text\) from public, anon, authenticated/);
});
test("events are append-only and tickets/comments cannot be hard-deleted", () => {
  assert.match(sql, /create trigger support_events_immutable before update or delete on support_events/);
  assert.match(sql, /create trigger support_tickets_no_delete before delete on support_tickets/);
  assert.match(sql, /create trigger support_comments_no_delete before delete on support_comments/);
});
test("reporters see only their own tickets; internal comments are staff-only", () => {
  assert.match(sql, /create policy support_tickets_select[\s\S]*support_is_staff\(\) or reporter_id = support_uid\(\)/);
  assert.match(sql, /create policy support_comments_select[\s\S]*internal = false or support_is_staff\(\)/);
  assert.ok(!/create policy support_tickets_insert/.test(sql), "tickets are created only through the function");
});
test("the status list matches the spec", () => {
  for (const s of ["New", "Viable check", "Not viable", "In progress", "Blocked", "Done – awaiting confirmation", "Closed", "Reopened"]) {
    assert.ok(sql.includes(`'${s}'`), s);
  }
});

test("phase 3: duplicate-proof draft index, unmatched commits table, publish function", () => {
  assert.match(sql, /create unique index if not exists support_daily_updates_draft_key[\s\S]*where source = 'commits' and state = 'draft'/);
  assert.match(sql, /create table if not exists support_unmatched_commits/);
  assert.ok(!/create policy support_unmatched_insert/.test(sql), "unmatched commits are written only by the job");
  assert.match(sql, /create or replace function support_publish_daily_update/);
  assert.match(sql, /'published'\)\s*;?\s*\n\s*end if;/);
});
test("phase 3: a published daily update never exposes its work text in ticket history", () => {
  const m = sql.match(/'daily_update_published', '([^']*)'/);
  assert.equal(m[1], "published");
});
