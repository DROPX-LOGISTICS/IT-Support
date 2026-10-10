# DropX IT Support

Staff report bugs, feature requests and support issues; the IT team works them.
A ticket closes only when the person who raised it confirms it works.
Spec: [`docs/it-support-spec.md`](docs/it-support-spec.md).

Next.js 14 (App Router, TypeScript) · Supabase (Postgres, auth, storage) · Gmail API · Vercel.

## Status

Phase 1: sign-in with Google (company domain only), all tables with row-level security,
raise a ticket (screenshots, `?portal=&page=` prefill), my tickets, Gmail sender.
Phase 2: developer queue (priority, then oldest; filters and search), ticket page (status,
assignee, priority, expected date, viability, update, links, comments, internal notes, history),
reporter confirmation ("Yes, it works" closes; "Still not working" reopens with a reason),
emails on raise and on confirmation request.
Phase 3: Master (portals, repositories with path prefixes, developers and their GitHub identities,
people and roles, unmatched commits), the daily job that drafts each developer's update from
yesterday's commits, and the Daily updates page (review, edit hours, blocker and next step, publish).
Phase 4: Schedule Meet (pre-filled Google Calendar link, Meet link saved on the ticket), CSV export
of tickets and published daily updates, and the one-time import script for the sheet.
Phase 6: Board (drag or "Move to…", same rules as the ticket page), Summary for managers, response and fix
targets with overdue flags and an overdue filter, all notification emails with retry, reminder and auto-close
jobs, Meet sessions created, moved and cancelled through the Google Calendar API, and export to Google Sheets
(each falls back to the earlier behaviour when Google access is not configured).
Everything still to set up or build is in [`docs/pending-setup-and-todo.md`](docs/pending-setup-and-todo.md).

## Local setup

```bash
npm install
cp .env.example .env.local     # fill in the values below
npm run dev                    # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
```

The site starts without any variables and shows a "Not configured" page listing
what is missing. Use a **development** Supabase project, never production.

## Environment variables

| Variable | Needed for | How to get it |
|---|---|---|
| `APP_URL` | Sign-in redirects, email links | The site address, e.g. `https://support.dropxlogistics.com` (`http://localhost:3000` locally) |
| `ALLOWED_EMAIL_DOMAIN` | Sign-in restriction | `dropxlogistics.com` |
| `ADMIN_EMAILS` | First admin(s), comma separated | Your own company email; promoted on first sign-in |
| `SUPABASE_URL` | Everything | Supabase dashboard, Project Settings, API |
| `SUPABASE_ANON_KEY` | Sign-in and all signed-in reads | Same page, `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin bootstrap, screenshot storage | Same page, `service_role` key. Server only, never exposed to the browser |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` | Email | Google OAuth client, see "Gmail sender" |
| `GMAIL_REFRESH_TOKEN` | Email | Printed by `scripts/get-gmail-refresh-token.mjs` |
| `MAIL_FROM` | Email | `tech@dropxlogistics.com` (display name defaults to "DropX IT Support"; `"Name" <address>` also works) |
| `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_WORKSPACE_CLIENT_EMAIL` + `GOOGLE_WORKSPACE_PRIVATE_KEY`, or the `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, `GCP_SERVICE_ACCOUNT_EMAIL` federation set) | Calendar and Sheets | The same service account pattern `dropx-hrms` uses for mailbox creation (JSON can be raw or base64). In Google Workspace Admin, Security, API controls, Domain-wide delegation, authorise the service account's client ID for the scopes `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/drive.file` |
| `GOOGLE_CALENDAR_ORGANIZER` | Calendar | The mailbox that owns the Meet events, e.g. `tech@dropxlogistics.com` (the service account acts as this person) |
| `GOOGLE_SHEETS_OWNER` | Sheets (optional) | The mailbox that owns exported sheets; defaults to `GOOGLE_CALENDAR_ORGANIZER` |
| `GITHUB_TOKEN`, optional `GITHUB_TOKEN_NISAR_DROPX`, `GITHUB_TOKEN_DROPX_LOGISTICS` | Daily updates (a repo uses its owner's token if set, else `GITHUB_TOKEN`; the repos sit under two owners) | GitHub, Settings, Developer settings, Fine-grained token. Resource owner: each organisation/user that owns a listed repo (create one token per owner if needed); repositories: the listed ones; permissions: **Contents: read-only** and **Metadata: read-only**. Nothing else. Without it the page says "GitHub is not configured" and manual rows still work |
| `CRON_SECRET` | Daily job | Any long random string (`openssl rand -hex 32`). On Vercel, set it as an environment variable: Vercel then sends it as `Authorization: Bearer <secret>` to the cron route |

On Vercel add them under Project Settings, Environment Variables. Nothing secret is
ever written to code, migrations or logs.

## Database

Migrations live in `supabase/migrations/<UTC timestamp>_<n>.sql` and are safe to re-run.
Apply `20261008120000_1.sql`, `…130000_2.sql`, `…140000_3.sql`, `…150000_4.sql`, `…160000_5.sql`, then `…170000_6.sql`, with the Supabase SQL editor, or `supabase db push` against
the **development** project. It creates only objects prefixed `support_`: 11 tables,
functions, triggers, policies and one private storage bucket (`support_attachments`).
It seeds the six portal names (only People has a site URL) and one settings row.
Repos, path prefixes and developers are entered later on the Master screen.

Rollback (development only), in this order:

```sql
drop table if exists support_daily_updates, support_attachments, support_events, support_comments,
  support_tickets, support_ticket_counters, support_developers, support_portal_repos,
  support_portals, support_users, support_settings cascade;
drop function if exists support_add_attachment(uuid,text,text,text,int), support_create_ticket(text,text,text,text,text,text,text,text,text),
  support_register_user(text), support_next_ticket_number(text), support_can_see_ticket(uuid),
  support_is_admin(), support_is_staff(), support_role(), support_uid(), support_guard_user_update(),
  support_check_user_domain(), support_block_delete(), support_block_change(), support_touch_updated_at();
-- storage: delete the files in bucket support_attachments first (dashboard), then:
delete from storage.buckets where id = 'support_attachments';
```

### Supabase dashboard settings (not changed from code)

1. Authentication, Providers, Google: enable, paste the Google OAuth client ID and secret.
2. Authentication, URL Configuration: set Site URL to `APP_URL`; add Redirect URLs
   `APP_URL/auth/callback` and `http://localhost:3000/auth/callback`.
3. In Google Cloud, create an OAuth client (Web). Authorised redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. Set the consent screen user type
   to **Internal** so only Workspace accounts can sign in. The server also checks the domain.

## Gmail sender

Email goes out through the Gmail API as `tech@dropxlogistics.com`. Without the four
variables the app works and email is simply skipped ("not configured").

1. Google Cloud console, enable the **Gmail API**.
2. Create an OAuth client of type **Web application** (can be the same project as sign-in).
   Authorised redirect URI: `http://localhost:8765`. Consent screen: Internal.
3. Run locally, once:
   ```bash
   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/get-gmail-refresh-token.mjs
   ```
   Open the printed link signed in as the sender mailbox. Only the
   `https://www.googleapis.com/auth/gmail.send` scope is requested.
4. Put the printed token in `GMAIL_REFRESH_TOKEN` (hosting environment only).

Emails are multipart text and HTML, user text is escaped, and a failed send never blocks a ticket action.

### Phase 2 rollback (development only)

```sql
drop function if exists support_add_comment(uuid,text,boolean), support_confirm_ticket(uuid,boolean,text),
  support_update_ticket(uuid,jsonb), support_change_status(uuid,text,text,text,text), support_actor();
-- restore the phase 1 event_type check and events policy by re-running the matching parts of migration _1.
```

### Phase 6 rollback (development only)

```sql
drop function if exists support_save_meet_event(uuid,text,text,timestamptz), support_clear_reminder();
drop trigger if exists support_tickets_clear_reminder on support_tickets;
alter table support_tickets drop column if exists reminded_at;
alter table support_settings drop column if exists reminder_days, drop column if exists auto_close_days;
-- the event_type check and support_save_meet are restored by re-running the matching parts of migrations _2 and _4.
```

## Testing the database

`npm run test:db` creates a throwaway database on a **local** PostgreSQL (you need `psql` and `createdb`), applies every
migration twice (they are safe to re-run), then runs `supabase/tests/rls.test.sql` as real roles (anonymous, reporter,
developer, manager, admin): who can read and write what, the status flow and its stale guard, confirmation, history that
cannot be edited, daily updates, Meet, attachments, settings, and 20 simultaneous raises that must get 20 different numbers.
Small stand-ins in `supabase/tests/stubs.sql` replace what Supabase provides (`auth.uid()`, `auth.jwt()`, the three roles,
the storage bucket table), so it proves the SQL and the access rules, not Supabase itself. Never point it at a real project.

### Phase 7 rollback (development only)

```sql
-- migration _6 only dropped two policies and replaced two functions; to undo, re-run the matching parts of migrations _1 and _2.
```

## Scheduled jobs

`vercel.json` runs two daily jobs, both protected by `CRON_SECRET`: `/api/cron/daily-updates` (03:30 UTC) and
`/api/cron/maintenance` (04:00 UTC = 09:30 IST). Maintenance sends the reminder once after the number of days in
Master, Settings (default 3) and closes tickets nobody confirmed after the auto-close days (default 7), recorded as
closed by the system. A reminder that cannot be sent is tried again the next day.

### Phase 4 rollback (development only)

```sql
drop function if exists support_save_meet(uuid,text,timestamptz);
```

## One-time import of the existing sheet

Export each tab as CSV, then (staging project in the environment, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`):

```bash
npm run import:sheet -- --bugs bugs.csv --features features.csv --daily daily.csv --developer "Ravi"           # dry run
npm run import:sheet -- --bugs bugs.csv --features features.csv --daily daily.csv --developer "Ravi" --apply   # write
```

It is a dry run unless `--apply` is given, never deletes, keeps the sheet's IDs, and is safe to run again.
See `docs/pending-setup-and-todo.md`, section 8, for what it skips and how it maps statuses.

### Phase 3 rollback (development only)

```sql
drop function if exists support_publish_daily_update(uuid);
drop table if exists support_unmatched_commits cascade;
drop index if exists support_daily_updates_draft_key;
alter table support_daily_updates drop constraint if exists support_daily_updates_source_check;
alter table support_daily_updates drop column if exists source;
-- the replaced daily-updates policies and the event_type check are restored by re-running the matching parts of migrations _1 and _2.
```

## Daily updates: how it works

- **Schedule:** `vercel.json` runs `/api/cron/daily-updates` at 03:30 UTC (09:00 IST) and drafts the previous IST day. The "daily update run time" in `support_settings` is not wired to the schedule yet; change `vercel.json` to move it. You can replay a day with `GET /api/cron/daily-updates?date=YYYY-MM-DD` and the bearer secret.
- **Matching:** developer by GitHub login (also from `…@users.noreply.github.com`), then commit email, then commit name. Two developers matching, or none, means the commit goes to Master, Unmatched commits; nothing is guessed. Merge commits are skipped.
- **Portal:** the portal whose path prefix matches most changed files; files that match no prefix go to the repository's portal with no prefixes; ties go to the lower sort order. Per-commit file lists are fetched only for repositories shared by several portals (max 200 per repository per run).
- **Tickets:** `BUG-12`, `fr-7`, `SUP-0003` in a commit message link the commit to that ticket if it exists. A commit naming two tickets appears under both.
- **Re-running** never duplicates (a unique index allows one open draft per day, developer, portal and ticket) and never overwrites edits: new commits are appended to the open draft; published rows are left alone and late commits start a new draft.
- **Limits:** only commits on each repository's default branch are read, up to 1000 per repository per day.

## Access rules

Reporters see only their own tickets. Developers, managers and admins see all; managers are
read-only on tickets. Rules are enforced by row-level security and again in server code.
Tickets are created only through the `support_create_ticket` database function, which takes
the reporter from the signed-in session. Events cannot be edited or deleted; tickets and
comments cannot be hard-deleted.

## Service role usage

The service role bypasses row-level security. It is used in exactly these places:

1. `src/app/auth/callback/route.ts`: promote a verified company-domain email listed in `ADMIN_EMAILS` to admin.
2. `src/app/new/actions.ts`: upload screenshots to the private bucket, after the ticket was created for the signed-in person. Database rows for them are written with the person's own session.
3. `src/lib/notifications.ts`: read the ticket and the staff email addresses to send the raise and confirmation emails, and record `email_sent` / `email_failed` events (reporters cannot read staff addresses).
4. `src/app/api/attachments/[id]/route.ts`: read a private file, only after the person's own session found the attachment row (row-level security is the access check).

6. `src/app/api/cron/maintenance/route.ts`: daily reminder and auto-close, protected by `CRON_SECRET`.
7. `src/lib/meet-server.ts`: cancel a ticket's Calendar event and clear its Meet fields when the ticket closes or a developer cancels (the caller's role has been checked first).
5. `src/app/api/cron/daily-updates/route.ts`: the scheduled job has no signed-in person; it is protected by `CRON_SECRET` (constant-time compare) and writes draft rows and unmatched commits. The manual "Draft from commits" button does **not** use the service role: it runs as the developer, so row-level security limits it to their own rows.

Status changes, assignment, comments, confirmation and publishing a daily update all run through database functions as the signed-in person (no service role).

## Integration with other portals

`https://<support site>/new?portal=<code>&page=<url>`. Portal codes: `people`, `opspulse`,
`dropx-one`, `dashboard`, `connect`, `delivery-tracker`. Unknown codes are ignored and `page` is plain text.
