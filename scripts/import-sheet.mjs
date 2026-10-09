#!/usr/bin/env node
// One-time import of the existing Google Sheet tabs (exported as CSV) into IT Support.
//
//   node --experimental-strip-types scripts/import-sheet.mjs \
//        --bugs bugs.csv --features features.csv --daily daily.csv --developer "Ravi"            (dry run)
//   ... add --apply to write. Add --create-portals to create portal names the sheet uses that do not exist yet.
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (use the STAGING project).
// It never deletes. Running it again skips tickets and daily rows that already exist, and links earlier
// imported tickets to people who have signed in since (matched by name or email).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { csvToObjects } from "../src/lib/csv.ts";
import { highestPerType } from "../src/lib/ticket-number.ts";
import { dailyKey, matchUser, planDaily, planTickets } from "../src/lib/sheet-import.ts";
import { slugify } from "../src/lib/master-input.ts";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(`--${name}`);
const files = { bugs: opt("bugs"), features: opt("features"), daily: opt("daily") };
const apply = flag("apply");
const out = (s = "") => console.log(s);

if (!files.bugs && !files.features && !files.daily) {
  out('Usage: node --experimental-strip-types scripts/import-sheet.mjs --bugs bugs.csv --features features.csv --daily daily.csv --developer "Name" [--apply] [--create-portals]');
  process.exit(1);
}
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  out("Not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the staging project) first.");
  process.exit(1);
}
const host = new URL(url).host;
out(`Target database: ${host}`);
out(apply ? "Mode: APPLY (writing)\n" : "Mode: dry run (nothing is written). Add --apply to write.\n");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const read = (p) => readFileSync(p, "utf8");
const must = (r, what) => { if (r.error) { out(`Could not read ${what}: ${r.error.message}`); process.exit(1); } return r.data ?? []; };
const now = new Date().toISOString();

let portals = must(await db.from("support_portals").select("id,name"), "portals");
const users = must(await db.from("support_users").select("id,name,email"), "users");
const developers = must(await db.from("support_developers").select("id,display_name"), "developers");
const tickets = must(await db.from("support_tickets").select("id,number"), "tickets");
const lookups = {
  portals, users, developers,
  existingNumbers: new Set(tickets.map((t) => t.number)),
  ticketIdByNumber: new Map(tickets.map((t) => [t.number, t.id])),
  existingDailyKeys: new Set(),
};

// Create missing portals only when asked.
if (flag("create-portals")) {
  const sheetPortals = new Set();
  for (const p of [files.bugs, files.features, files.daily].filter(Boolean)) {
    const { headers, rows } = csvToObjects(read(p));
    const h = headers.find((x) => /^(portal|module|application|app|system|site)$/i.test(x.trim()));
    if (h) rows.forEach((r) => r[h] && sheetPortals.add(r[h].trim()));
  }
  const known = new Set(portals.map((p) => p.name.toLowerCase().replace(/[^a-z0-9]+/g, "")));
  for (const name of sheetPortals) {
    if (known.has(name.toLowerCase().replace(/[^a-z0-9]+/g, ""))) continue;
    out(`${apply ? "Creating" : "Would create"} portal "${name}"`);
    if (apply) {
      const r = await db.from("support_portals").insert({ name, code: slugify(name) || `portal-${Date.now()}` }).select("id,name").single();
      if (r.error) out(`  could not create it: ${r.error.message}`); else portals = [...portals, r.data];
    } else portals = [...portals, { id: `new-${name}`, name }];
  }
  lookups.portals = portals;
}

const report = { inserted: 0, skipped: 0, problems: [], warnings: [], unmatched: new Set(), badPortals: new Set(), unknownHeaders: [] };
const plans = [];
for (const [kind, sheet, path] of [["bug", "bugs", files.bugs], ["feature", "features", files.features]]) {
  if (!path) continue;
  const plan = planTickets(read(path), kind, sheet, lookups, now);
  plans.push(plan);
  report.problems.push(...plan.problems); report.warnings.push(...plan.warnings);
  plan.unmatchedReporters.forEach((n) => report.unmatched.add(n)); plan.unknownPortals.forEach((n) => report.badPortals.add(n));
  report.skipped += plan.skippedExisting.length;
  if (plan.unknownHeaders.length) report.unknownHeaders.push(`${sheet}: ${plan.unknownHeaders.join(", ")}`);
  // Later tabs see numbers from earlier ones, so the same ID is not inserted twice.
  plan.inserts.forEach((t) => lookups.existingNumbers.add(t.number));
}

if (apply) {
  for (const plan of plans) {
    for (const t of plan.inserts) {
      if (t.portal_id.startsWith("new-")) continue;
      const r = await db.from("support_tickets").insert(t).select("id,number").single();
      if (r.error) { report.problems.push({ sheet: "-", row: 0, message: `${t.number}: ${r.error.message}` }); continue; }
      lookups.ticketIdByNumber.set(r.data.number, r.data.id);
      await db.from("support_events").insert({ ticket_id: r.data.id, actor_name: "Sheet import", event_type: "created", new_value: t.number, reason: "Imported from the Google Sheet" });
      report.inserted++;
    }
  }
  // New tickets must be numbered after the highest imported ID (an update that only ever raises the counter).
  const highest = highestPerType(plans.flatMap((p) => [...p.inserts.map((t) => t.number), ...p.skippedExisting]));
  for (const [type, n] of Object.entries(highest)) {
    if (n > 0) await db.from("support_ticket_counters").update({ last_value: n }).eq("ticket_type", type).lt("last_value", n);
  }
} else {
  report.inserted = plans.reduce((n, p) => n + p.inserts.length, 0);
  // So the daily log's "related ID" check treats tickets that would be imported as present.
  plans.forEach((p) => p.inserts.forEach((t) => lookups.ticketIdByNumber.set(t.number, "planned")));
}

// Link earlier imported tickets to people who have signed in since.
{
  const open = must(await db.from("support_tickets").select("id,number,reporter_name,reporter_email").eq("source", "sheet_import").is("reporter_id", null), "unlinked tickets");
  let linked = 0;
  for (const t of open) {
    const u = matchUser(t.reporter_name, t.reporter_email ?? "", users);
    if (!u) continue;
    linked++;
    if (apply) await db.from("support_tickets").update({ reporter_id: u.id, reporter_email: u.email }).eq("id", t.id);
  }
  out(`${apply ? "Linked" : "Would link"} ${linked} earlier imported ticket(s) to people who have signed in.`);
}

if (files.daily) {
  const dev = opt("developer") ?? null;
  const existing = must(await db.from("support_daily_updates").select("update_date,developer_id,portal_id,work_done").eq("source", "manual").eq("state", "published"), "daily updates");
  existing.forEach((r) => lookups.existingDailyKeys.add(dailyKey(r.update_date, r.developer_id, r.portal_id, r.work_done)));
  const plan = planDaily(read(files.daily), "daily", lookups, dev, now);
  report.problems.push(...plan.problems); report.warnings.push(...plan.warnings); report.skipped += plan.skippedExisting;
  plan.unknownPortals.forEach((n) => report.badPortals.add(n));
  if (plan.unknownHeaders.length) report.unknownHeaders.push(`daily: ${plan.unknownHeaders.join(", ")}`);
  if (apply) {
    for (const r of plan.inserts) {
      if (r.portal_id.startsWith("new-")) continue;
      const res = await db.from("support_daily_updates").insert(r);
      if (res.error) report.problems.push({ sheet: "daily", row: 0, message: res.error.message }); else report.inserted++;
    }
  } else report.inserted += plan.inserts.length;
}

out(`\n${apply ? "Imported" : "Would import"}: ${report.inserted} row(s). Already there, skipped: ${report.skipped}.`);
if (report.unknownHeaders.length) out(`\nColumns not recognised (ignored):\n  ${report.unknownHeaders.join("\n  ")}`);
if (report.badPortals.size) out(`\nPortals missing from the portal list (rows skipped; add them in Master or use --create-portals):\n  ${[...report.badPortals].join("\n  ")}`);
if (report.unmatched.size) out(`\nReporters with no matching person yet (tickets keep their name; they are linked when the person signs in and you run this again):\n  ${[...report.unmatched].join("\n  ")}`);
if (report.warnings.length) out(`\nWarnings:\n${report.warnings.slice(0, 50).map((w) => `  ${w.sheet} row ${w.row}: ${w.message}`).join("\n")}${report.warnings.length > 50 ? `\n  ... and ${report.warnings.length - 50} more` : ""}`);
if (report.problems.length) out(`\nProblems (these rows were not imported):\n${report.problems.slice(0, 80).map((p) => `  ${p.sheet} row ${p.row}: ${p.message}`).join("\n")}${report.problems.length > 80 ? `\n  ... and ${report.problems.length - 80} more` : ""}`);
if (!apply) out("\nDry run only. Check the lists above, then run again with --apply.");
