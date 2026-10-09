# Pending setup and what is not done

Everything in the spec and the briefs is built except the items in section 3. This file lists what you still have
to create or enter before go-live (section 1), what has never been run against a real service (section 2), and what
was not done and why (section 3). Nothing here is a secret: values go in the hosting environment, never in git.

## 1. Setup checklist (in this order)

| # | Item | Where | Status |
|---|---|---|---|
| 1 | Create the **staging** Supabase project (never production for testing) | Supabase | pending |
| 2 | Apply the migrations in order: `20261008120000_1.sql`, `…130000_2.sql`, `…140000_3.sql`, `…150000_4.sql`, `…160000_5.sql` | SQL editor or `supabase db push` | pending; **none has run on Postgres yet, expect small SQL fixes** |
| 3 | Authentication, Providers, Google: enable, paste the Google OAuth client ID and secret | Supabase dashboard | pending |
| 4 | Authentication, URL Configuration: Site URL = `APP_URL`; redirect URLs `APP_URL/auth/callback`, `http://localhost:3000/auth/callback` | Supabase dashboard | pending |
| 5 | Google Cloud: OAuth client (Web) for sign-in, redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; consent screen **Internal** | Google Cloud | pending |
| 6 | Deploy on Vercel; add the domain `support.dropxlogistics.com`; confirm both crons appear | Vercel, DNS | pending |
| 7 | Set the environment variables below | Vercel | pending |
| 8 | Gmail sender: enable Gmail API, OAuth client (Web) with redirect URI `http://localhost:8765`, run `scripts/get-gmail-refresh-token.mjs` as `tech@dropxlogistics.com` | Google Cloud, your laptop | pending |
| 9 | GitHub token (fine-grained, **Contents: read** and **Metadata: read**). Repos sit under `nisar-dropx` and `DROPX-LOGISTICS`; the code reads one `GITHUB_TOKEN` | GitHub | pending (see 3.4) |
| 10 | Google service account for Calendar and Sheets: reuse the `dropx-hrms` service account or create one; enable the **Calendar API**, **Sheets API** and **Drive API**; in Workspace Admin, Domain-wide delegation, authorise its client ID for the three scopes in the README | Google Cloud, Workspace Admin | pending |
| 11 | Sign in once with the account in `ADMIN_EMAILS`, then fill Master (section below) | the site | pending |

### Environment variables

| Variable | Status |
|---|---|
| `APP_URL`, `ALLOWED_EMAIL_DOMAIN`, `ADMIN_EMAILS` | not set |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | not set |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `MAIL_FROM` | not set (email is skipped and recorded as `email_failed` until set) |
| `GITHUB_TOKEN` | not set (Daily updates says "GitHub is not configured") |
| `CRON_SECRET` | not set (both cron routes answer 503) |
| `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` (or the two-variable or `GCP_*` forms), `GOOGLE_CALENDAR_ORGANIZER`, optional `GOOGLE_SHEETS_OWNER` | not set (Meet falls back to the Calendar link, Sheets falls back to CSV) |

**Master, Integrations** shows which of these are set, by name only.

### Data to enter in Master

- Site addresses for OpsPulse, DropX One, Dashboard, Connect and Delivery Tracker (only People is seeded). The DropX One path prefix is still "to confirm" in the spec.
- The five repositories, each with its portal and path prefixes (the partner-dashboard repo needs the OpsPulse and Connect prefixes plus a no-prefix row for Dashboard).
- The three developers with their GitHub logins, commit emails and names, then set roles in People & access.
- Review Settings: targets, reminder and auto-close days, which emails are on.

## 2. Never run against a real service (test these first)

1. All five migrations on Postgres; row-level security with real roles (reporter, developer, manager, admin).
2. Google sign-in end to end, admin bootstrap, domain refusal.
3. Raise with screenshots, numbering under simultaneous raises, attachment download.
4. Status flow with two people at once; confirmation by reporter and by developer with reason.
5. Every email (raise, team notice, P0, assigned, update, status, comment, confirmation, reminder, reopened, not viable, Meet) and the Retry button; the Master switches.
6. GitHub client (commit lists, pagination, `author.login`, `parents`, `files`).
7. **Google Calendar**: create, move and cancel a real Meet session, guests invited, link saved; cancel on close and on auto-close. The code was tested against a fake Google (request shapes, JWT signature), never against Google.
8. **Google Sheets** export: sheet created, filled, shared with the requester.
9. Board drag and drop in a real browser (mouse) and the "Move to…" list on a phone; dialog for reason or update.
10. Summary numbers against real data; overdue flags against your real targets.
11. Both cron routes on Vercel (bearer header, schedule, 60 s limit with real volume).
12. CSV and Sheets exports in Sheets and Excel; the import dry run with your real CSV exports; all screens on a phone, light and dark.

## 3. Not done, and why

1. **Ticket-creation API and "open tickets" badge for the portals** (spec phase 6). Portal users are not signed into this site, so a portal would need a way to prove who the person is (a shared secret per portal, signed tokens, or single sign-on). That is a security design decision for you, and it also needs changes in each portal's repo, which I was told not to touch. The "Report a problem" link (phase 5) is yours.
2. **"Daily update run time" setting wired to the schedule.** Vercel cron times are fixed in `vercel.json`; honouring a setting would need an hourly cron (a paid plan) plus a run log. The time stays in `vercel.json` (03:30 UTC) and the setting is not shown.
3. **Anything that needs a real service or your Google admin.** I have no Supabase, Google, GitHub, Gmail or Vercel access here, so nothing in section 2 could be run, and the Workspace delegation in item 10 of the checklist can only be done by a Workspace admin. Every integration is built behind a "not configured" state.
4. **GitHub access across two owners.** One `GITHUB_TOKEN` may not see both `nisar-dropx` and `DROPX-LOGISTICS` repos. Fix: a token per owner, or a GitHub App. Needs your choice and a GitHub admin.
5. **Station mailboxes** (spec question 1). People sharing one mailbox share one identity. The stopgap (required "Your name" and optional phone on the form) is in; a real fix needs a decision (per-person sign-in, or a name picker with a PIN).
6. **Sheet screenshot links** are kept as links on imported tickets (staff see them); the files are not downloaded into storage, because the links are private Drive files I cannot read.
7. **Editing a published daily update.** Published rows are final by design; there is no "reopen to edit". Say if you want one.
8. **Auto-close email.** The spec's email table has no auto-close notice, so none is sent; the ticket history shows it.

## 4. Decisions taken that you may want to revisit

- Overdue is measured in wall-clock hours; a reopened ticket's fix clock restarts at the reopen; a ticket waiting for the reporter is never overdue.
- The overdue queue filter is worked out in the app from up to 1000 open tickets, not in SQL.
- Summary averages cover tickets raised in the last 90 days; "closed per week" uses the closing date; weeks start Monday (IST).
- Blocked reasons stay internal (not emailed). Managers can see the board and summary but not move tickets.
- The person who did an action is not emailed about it (except the reporter's own acknowledgement).
- The reminder is sent once per wait for confirmation; if it cannot be sent it is retried the next day.
- Auto-close is recorded as closed by the system (`auto_closed`), never as a reporter confirmation.
- Every database read made by the site and the jobs skips the Next.js cache (found and fixed during testing: the scheduled jobs would otherwise act on stale rows).
- Extra columns, tables and event types added beyond the spec are listed in the earlier pull requests, plus `support_tickets.reminded_at`, `support_settings.reminder_days`, `auto_close_days`, and event types `auto_closed`, `reminder_sent`, `meet_cancelled`.

## 5. Security follow-ups

- The GitHub token used to push this code lasts 7 days and is scoped to this repo. **Delete it** once the work is merged.
- Secrets live only in the hosting environment.
- The service role is used only where the README ("Service role usage") lists it. Re-check that list after any change.
- Keep the Google consent screen **Internal**. After first sign-in, review People & access.
- Add backups and retention, error monitoring, rate limiting on raising tickets, and a content security policy review before a wide launch.

## 6. Other details

- **Phase 5** (yours): `https://support.dropxlogistics.com/new?portal=<code>&page=<encoded page URL>`; codes `people`, `opspulse`, `dropx-one`, `dashboard`, `connect`, `delivery-tracker`.
- **Import** (`npm run import:sheet`): dry run by default, `--apply` to write; flexible column names matched without seeing your real sheet, so read the dry-run report first.
