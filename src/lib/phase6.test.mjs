import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { DEFAULT_TARGETS, overdueInfo, parseTargets, validateSettingsInput } from "./targets.ts";
import { buildSummary, weekStartIst } from "./summary.ts";
import { selectAutoClose, selectReminders } from "./maintenance.ts";
import { isAuthorizedCron } from "./cron-auth.ts";
import { buildEmail, MAIL_KINDS, recipientsFor } from "./email-content.ts";
import { clearGoogleTokenCache, googleAccessToken, signJwtRs256, serviceAccountFromEnv } from "./google-auth.ts";
import { buildEventBody, calendarStatus, cancelEvent, createMeetEvent, rescheduleEvent, calendarErrorMessage, GoogleApiError } from "./google-calendar.ts";
import { createSheetExport, sheetsStatus } from "./google-sheets.ts";
import { ticketCells, dailyCells } from "./export-columns.ts";

const DONE = "Done – awaiting confirmation";
const NOW = new Date("2026-10-20T06:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

/* ---------- targets and overdue ---------- */
test("defaults match the spec and bad settings fall back", () => {
  assert.deepEqual(DEFAULT_TARGETS.response, { P0: 1, P1: 4, P2: 24, P3: 48 });
  assert.deepEqual(DEFAULT_TARGETS.fix, { P0: 24, P1: 72, P2: 168, P3: 336 });
  const t = parseTargets({ P0: 2, P1: -5, P2: "x" }, null);
  assert.equal(t.response.P0, 2); assert.equal(t.response.P1, 4); assert.equal(t.fix.P3, 336);
});
test("overdue: no response in time, or not fixed in time; waiting for the reporter is never overdue", () => {
  const t = { priority: "P0", status: "New", created_at: hoursAgo(2), first_response_at: null, confirmed_at: null };
  assert.equal(overdueInfo(t, DEFAULT_TARGETS, NOW).respondOverdue, true);
  assert.equal(overdueInfo({ ...t, first_response_at: hoursAgo(1) }, DEFAULT_TARGETS, NOW).overdue, false);
  assert.equal(overdueInfo({ ...t, priority: "P2", created_at: hoursAgo(200), first_response_at: hoursAgo(190), status: "In progress" }, DEFAULT_TARGETS, NOW).fixOverdue, true);
  assert.equal(overdueInfo({ ...t, status: DONE, created_at: hoursAgo(5000) }, DEFAULT_TARGETS, NOW).overdue, false);
  assert.equal(overdueInfo({ ...t, status: "Closed", created_at: hoursAgo(5000) }, DEFAULT_TARGETS, NOW).overdue, false);
});
test("a reopened ticket's fix clock restarts at the reopen", () => {
  const base = { priority: "P1", status: "Reopened", created_at: hoursAgo(400), first_response_at: hoursAgo(390), confirmed_at: hoursAgo(10) };
  assert.equal(overdueInfo(base, DEFAULT_TARGETS, NOW).fixOverdue, false);
  assert.equal(overdueInfo({ ...base, confirmed_at: hoursAgo(80) }, DEFAULT_TARGETS, NOW).fixOverdue, true);
});
test("settings form: valid, and each rule refuses", () => {
  const ok = { response_P0: 1, response_P1: 4, response_P2: 24, response_P3: 48, fix_P0: 24, fix_P1: 72, fix_P2: 168, fix_P3: 336, reminder_days: 3, auto_close_days: 7, n_raised: "on", n_status: "on" };
  const r = validateSettingsInput(ok);
  assert.equal(r.ok, true); assert.deepEqual(r.value.notify, { raised: true, assigned: false, status: true, comment: false, confirmation: false });
  assert.equal(validateSettingsInput({ ...ok, response_P0: 0 }).ok, false);
  assert.equal(validateSettingsInput({ ...ok, fix_P1: 2 }).ok, false);
  assert.equal(validateSettingsInput({ ...ok, auto_close_days: 3 }).ok, false);
  assert.equal(validateSettingsInput({ ...ok, reminder_days: 2.5 }).ok, false);
});

/* ---------- summary ---------- */
const tk = (o) => ({ number: "BUG-001", title: "t", priority: "P2", status: "New", portal: "People", created_at: hoursAgo(1), first_response_at: null, done_at: null, closed_at: null, confirmed_at: null, reopen_count: 0, ...o });
test("IST week starts on Monday", () => {
  assert.equal(weekStartIst("2026-10-20T06:00:00Z"), "2026-10-19");
  assert.equal(weekStartIst("2026-10-18T19:00:00Z"), "2026-10-19"); // Sunday 18 Oct 19:00 UTC is already Monday in IST
  assert.equal(weekStartIst("2026-10-18T17:00:00Z"), "2026-10-12");
});
test("summary: open by priority and portal, overdue, averages, reopens, awaiting too long", () => {
  const s = buildSummary([
    tk({ number: "BUG-001", priority: "P0", created_at: hoursAgo(5) }),
    tk({ number: "BUG-002", priority: "P2", portal: "OpsPulse", status: "In progress", created_at: hoursAgo(30), first_response_at: hoursAgo(28) }),
    tk({ number: "BUG-003", status: DONE, created_at: hoursAgo(200), first_response_at: hoursAgo(190), done_at: hoursAgo(24 * 5) }),
    tk({ number: "BUG-004", status: "Closed", created_at: hoursAgo(100), first_response_at: hoursAgo(98), done_at: hoursAgo(50), closed_at: hoursAgo(40), reopen_count: 1 }),
    tk({ number: "BUG-005", status: DONE, created_at: hoursAgo(60), first_response_at: hoursAgo(58), done_at: hoursAgo(24) }),
  ], DEFAULT_TARGETS, NOW);
  assert.equal(s.openTotal, 4);
  assert.deepEqual(s.openByPriority, { P0: 1, P1: 0, P2: 3, P3: 0 });
  assert.deepEqual(s.byPortal.map((r) => [r.portal, r.total]), [["OpsPulse", 1], ["People", 3]]);
  assert.deepEqual(s.overdue.items.map((i) => i.number), ["BUG-001"]);
  assert.equal(s.avgFirstResponseHours, 4); // responses after 2, 10, 2 and 2 hours
  assert.equal(s.fixedCount, 3);
  assert.deepEqual(s.reopens, { tickets: 1, total: 1, rate: 33 });
  assert.deepEqual(s.awaiting.map((a) => [a.number, a.days]), [["BUG-003", 5]]);
  assert.equal(s.weekly.length, 8);
  assert.equal(s.weekly.at(-1).raised, 2); // only BUG-001 and BUG-002 were raised since Monday 00:00 IST
  assert.equal(s.weekly.at(-2).closed, 1); // BUG-004 was closed 40 hours ago, before this Monday
});
test("summary with no tickets has no averages and no crash", () => {
  const s = buildSummary([], DEFAULT_TARGETS, NOW);
  assert.equal(s.openTotal, 0); assert.equal(s.avgFixHours, null); assert.equal(s.reopens.rate, null);
});

/* ---------- reminders and auto-close ---------- */
test("reminder after 3 days once; auto-close after 7 days; nothing else", () => {
  const rows = [
    { id: "a", status: DONE, done_at: hoursAgo(24 * 4), reminded_at: null },
    { id: "b", status: DONE, done_at: hoursAgo(24 * 4), reminded_at: hoursAgo(24) },
    { id: "c", status: DONE, done_at: hoursAgo(24 * 8), reminded_at: hoursAgo(24 * 5) },
    { id: "d", status: DONE, done_at: hoursAgo(24 * 2), reminded_at: null },
    { id: "e", status: "In progress", done_at: hoursAgo(24 * 9), reminded_at: null },
  ];
  assert.deepEqual(selectReminders(rows, NOW, 3), ["a"]);
  assert.deepEqual(selectAutoClose(rows, NOW, 7), ["c"]);
});
test("cron bearer check", () => {
  assert.equal(isAuthorizedCron("Bearer s3cret", "s3cret"), true);
  assert.equal(isAuthorizedCron("Bearer nope", "s3cret"), false);
  assert.equal(isAuthorizedCron(null, "s3cret"), false);
  assert.equal(isAuthorizedCron("Bearer ", ""), false);
  assert.equal(isAuthorizedCron("Bearer undefined", undefined), false);
});

/* ---------- emails ---------- */
const ticket = { id: "t1", number: "BUG-012", title: "Payout <b>page</b> blank", type: "bug", priority: "P1", portal: "People", reporterName: "Asha", developerUpdate: "Fixed it", viableReason: "Not planned", expectedDate: "2026-10-25", meetLink: "https://meet.google.com/abc-defg-hij", meetAt: "2026-10-22T10:00:00Z", status: "In progress" };
test("every email has the ticket number in the subject, a link, and nothing technical", () => {
  for (const kind of MAIL_KINDS) {
    const { subject, content } = buildEmail(kind, ticket, "https://s.example/tickets/t1", { reason: "why", commentBody: "hello", commentAuthor: "Ravi" });
    assert.ok(subject.includes("BUG-012"), kind);
    assert.ok(!/[\r\n]/.test(subject), kind);
    assert.equal(content.link.url, "https://s.example/tickets/t1");
    assert.ok(!/\b[0-9a-f]{7,40}\b/.test(JSON.stringify(content).replace(/BUG-012|https?:\/\/\S+/g, "")), `${kind} has no hash`);
  }
});
test("recipients per event; the actor is not emailed; duplicates removed", () => {
  const c = { reporterEmail: "asha@x.com", assigneeEmail: "ravi@x.com", developers: ["ravi@x.com", "joe@x.com"], managers: ["boss@x.com"], priority: "P1" };
  assert.deepEqual(recipientsFor("raised", { ...c, actorEmail: "asha@x.com" }), ["asha@x.com"]);
  assert.deepEqual(recipientsFor("team_new", c), ["ravi@x.com", "joe@x.com"]);
  assert.deepEqual(recipientsFor("team_new", { ...c, priority: "P0" }), ["ravi@x.com", "joe@x.com", "boss@x.com"]);
  assert.deepEqual(recipientsFor("assigned", { ...c, actorEmail: "ravi@x.com" }), []);
  assert.deepEqual(recipientsFor("assigned", { ...c, actorEmail: "joe@x.com" }), ["ravi@x.com"]);
  assert.deepEqual(recipientsFor("comment", { ...c, commenterIsReporter: true, actorEmail: "asha@x.com" }), ["ravi@x.com"]);
  assert.deepEqual(recipientsFor("comment", { ...c, assigneeEmail: null, commenterIsReporter: true }), ["ravi@x.com", "joe@x.com"]);
  assert.deepEqual(recipientsFor("comment", { ...c, commenterIsReporter: false, actorEmail: "ravi@x.com" }), ["asha@x.com"]);
  assert.deepEqual(recipientsFor("reopened", c), ["ravi@x.com"]);
  assert.deepEqual(recipientsFor("meet", { ...c, actorEmail: "ravi@x.com" }), ["asha@x.com"]);
  for (const k of ["update", "status", "confirmation", "reminder", "not_viable"]) assert.deepEqual(recipientsFor(k, c), ["asha@x.com"], k);
});

/* ---------- Google auth, Calendar, Sheets (fake fetch, no network) ---------- */
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const saEnv = { GOOGLE_WORKSPACE_CLIENT_EMAIL: "sa@proj.iam.gserviceaccount.com", GOOGLE_WORKSPACE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"), GOOGLE_CALENDAR_ORGANIZER: "tech@dropxlogistics.com" };
const jsonRes = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the JWT is a valid RS256 signature over the delegated claim", () => {
  const jwt = signJwtRs256({ iss: "a", sub: "b" }, privateKey);
  const [h, p, s] = jwt.split(".");
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url")));
  assert.equal(JSON.parse(Buffer.from(p, "base64url")).sub, "b");
});
test("credentials are read the same way as the dashboard (JSON, base64 JSON, or two variables)", () => {
  const sa = { client_email: "x@y", private_key: "k\\nk" };
  assert.equal(serviceAccountFromEnv({ GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa) }).private_key, "k\nk");
  assert.equal(serviceAccountFromEnv({ GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(sa)).toString("base64") }).client_email, "x@y");
  assert.equal(serviceAccountFromEnv({}), null);
});
test("service-account token exchange sends the delegated assertion and caches the token", async () => {
  clearGoogleTokenCache();
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, body: String(init.body) }); return jsonRes({ access_token: "tok1", expires_in: 3600 }); };
  const a = await googleAccessToken(["scope.a"], "tech@x.com", { env: saEnv, fetchFn });
  const b = await googleAccessToken(["scope.a"], "tech@x.com", { env: saEnv, fetchFn });
  assert.equal(a, "tok1"); assert.equal(b, "tok1"); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
  const assertion = new URLSearchParams(calls[0].body).get("assertion");
  assert.equal(JSON.parse(Buffer.from(assertion.split(".")[1], "base64url")).sub, "tech@x.com");
});
test("federation path: Vercel OIDC to STS to signJwt to token", async () => {
  clearGoogleTokenCache();
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(String(url));
    if (String(url).includes("sts.googleapis")) return jsonRes({ access_token: "sts" });
    if (String(url).includes("signJwt")) return jsonRes({ signedJwt: "signed" });
    return jsonRes({ access_token: "tokF" });
  };
  const env = { GCP_PROJECT_NUMBER: "1", GCP_WORKLOAD_IDENTITY_POOL_ID: "p", GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "v", GCP_SERVICE_ACCOUNT_EMAIL: "sa@p.iam.gserviceaccount.com" };
  assert.equal(await googleAccessToken(["s"], "tech@x.com", { env, fetchFn, oidcToken: async () => "oidc" }), "tokF");
  assert.equal(urls.length, 3);
});
test("missing credentials give a clear error and a not-configured status", async () => {
  clearGoogleTokenCache();
  await assert.rejects(googleAccessToken(["s"], "a@b", { env: {} }), /not configured/);
  assert.deepEqual(calendarStatus({}).configured, false);
  assert.equal(calendarStatus(saEnv).configured, true);
  assert.equal(calendarStatus({ ...saEnv, GOOGLE_CALENDAR_ORGANIZER: "" }).configured, false);
  assert.equal(sheetsStatus(saEnv).configured, true);
});

test("create event: body, Meet request, invites, and the returned link", async () => {
  clearGoogleTokenCache();
  const seen = [];
  const fetchFn = async (url, init = {}) => {
    if (String(url).includes("oauth2")) return jsonRes({ access_token: "t", expires_in: 3600 });
    seen.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
    return jsonRes({ id: "ev1", hangoutLink: "https://meet.google.com/abc-defg-hij" });
  };
  const r = await createMeetEvent("tech@dropxlogistics.com", { number: "BUG-012", title: "Payout\nblank", ticketUrl: "https://s/t/1", guests: ["a@x.com", "b@x.com"], startIso: "2026-10-22T10:00:00.000Z", minutes: 30 }, "req-1", { env: saEnv, fetchFn });
  assert.deepEqual(r, { eventId: "ev1", meetLink: "https://meet.google.com/abc-defg-hij" });
  const post = seen.find((s) => s.method === "POST" && s.url.includes("/events"));
  assert.match(post.url, /conferenceDataVersion=1/); assert.match(post.url, /sendUpdates=all/);
  assert.equal(post.body.summary, "BUG-012: Payout blank");
  assert.deepEqual(post.body.attendees, [{ email: "a@x.com" }, { email: "b@x.com" }]);
  assert.equal(post.body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.equal(post.body.end.dateTime, "2026-10-22T10:30:00.000Z");
});
test("a late Meet link is fetched; no link at all is an error", async () => {
  clearGoogleTokenCache();
  let gets = 0;
  const fetchFn = async (url, init = {}) => {
    if (String(url).includes("oauth2")) return jsonRes({ access_token: "t" });
    if (init.method === "GET") { gets++; return jsonRes({ id: "ev2", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/xyz-abcd-efg" }] } }); }
    return jsonRes({ id: "ev2" });
  };
  const r = await createMeetEvent("o@x.com", { number: "FR-001", title: "t", ticketUrl: "https://s", guests: [], startIso: "2026-10-22T10:00:00Z", minutes: 30 }, "r", { env: saEnv, fetchFn, sleep: async () => {} });
  assert.equal(r.meetLink, "https://meet.google.com/xyz-abcd-efg"); assert.equal(gets, 1);
  clearGoogleTokenCache();
  const none = async (url) => (String(url).includes("oauth2") ? jsonRes({ access_token: "t" }) : jsonRes({ id: "ev3" }));
  await assert.rejects(createMeetEvent("o@x.com", { number: "FR-001", title: "t", ticketUrl: "https://s", guests: [], startIso: "2026-10-22T10:00:00Z", minutes: 30 }, "r", { env: saEnv, fetchFn: none, sleep: async () => {} }), /Meet link/);
});
test("reschedule patches the time and notifies guests; cancel deletes and treats 'already gone' as done", async () => {
  clearGoogleTokenCache();
  const seen = [];
  const fetchFn = async (url, init = {}) => {
    if (String(url).includes("oauth2")) return jsonRes({ access_token: "t" });
    seen.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
    return init.method === "DELETE" ? jsonRes({ error: { message: "Resource has been deleted" } }, 410) : jsonRes({ id: "ev1" });
  };
  await rescheduleEvent("o@x.com", "ev/1", "2026-10-23T04:00:00.000Z", 45, { env: saEnv, fetchFn });
  assert.equal(seen[0].method, "PATCH"); assert.match(seen[0].url, /events\/ev%2F1\?sendUpdates=all/);
  assert.equal(seen[0].body.end.dateTime, "2026-10-23T04:45:00.000Z");
  await cancelEvent("o@x.com", "ev1", { env: saEnv, fetchFn });
  assert.equal(seen[1].method, "DELETE");
});
test("calendar errors become short safe messages", () => {
  assert.match(calendarErrorMessage(new GoogleApiError("secret detail", 403)), /access is missing/);
  assert.ok(!calendarErrorMessage(new GoogleApiError("secret detail", 500)).includes("secret"));
  assert.match(calendarErrorMessage(new Error("Google Workspace refused the delegated access")), /not set up/);
});

test("sheet export: creates, writes RAW values, shares with the requester", async () => {
  clearGoogleTokenCache();
  const seen = [];
  const fetchFn = async (url, init = {}) => {
    if (String(url).includes("oauth2")) return jsonRes({ access_token: "t" });
    seen.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).endsWith("/v4/spreadsheets")) return jsonRes({ spreadsheetId: "sh1", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sh1/edit" });
    return jsonRes({});
  };
  const r = await createSheetExport("o@x.com", { title: "Tickets", tab: "Tickets!", header: ["ID"], rows: [["=HYPERLINK(\"x\")"], [null]], shareWith: "asha@x.com" }, { env: saEnv, fetchFn });
  assert.equal(r.url, "https://docs.google.com/spreadsheets/d/sh1/edit");
  const put = seen.find((s) => s.method === "PUT");
  assert.match(put.url, /valueInputOption=RAW/);
  assert.deepEqual(put.body.values, [["ID"], ["=HYPERLINK(\"x\")"], [""]]);
  const share = seen.find((s) => s.url.includes("/permissions"));
  assert.deepEqual(share.body, { type: "user", role: "writer", emailAddress: "asha@x.com" });
  await assert.rejects(createSheetExport("o@x.com", { title: "t", tab: "t", header: ["a"], rows: [], shareWith: "bad" }, { env: saEnv, fetchFn }));
});
test("export cells are raw (no apostrophe guard needed for Sheets RAW)", () => {
  const cells = dailyCells([{ update_date: "2026-10-07", developer: "R", portal: "P", ticket: null, work_done: "=1+1", hours: 2, status: "Done", blocker: null, next_step: null, target_date: null }]);
  assert.equal(cells[0][4], "=1+1");
  assert.equal(ticketCells([]).length, 0);
});

/* ---------- migration ---------- */
test("phase 6 migration: reminder column, settings, event types, Meet event function", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261008160000_5.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists reminded_at/);
  assert.match(sql, /reminder_days int not null default 3/);
  assert.match(sql, /auto_close_days int not null default 7/);
  for (const e of ["auto_closed", "reminder_sent", "meet_cancelled"]) assert.ok(sql.includes(`'${e}'`), e);
  assert.match(sql, /create or replace function support_save_meet_event[\s\S]*role not in \('developer','admin'\) then raise exception 'Not allowed'/);
});
