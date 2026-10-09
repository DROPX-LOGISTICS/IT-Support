# Pending setup and later development

What still has to be created, entered or verified before this goes live, and what is left to build.
Written at the end of phase 4. Update it as items are done. Nothing here is a secret: values go in
the hosting environment, never in git.

## 1. Setup checklist (in this order)

| # | Item | Where | Status |
|---|---|---|---|
| 1 | Create the **staging** Supabase project (never production for testing) | Supabase | pending |
| 2 | Apply the migrations in order: `20261008120000_1.sql`, `…130000_2.sql`, `…140000_3.sql`, `…150000_4.sql` | Supabase SQL editor or `supabase db push` | pending; **none has ever run on Postgres, expect small SQL fixes** |
| 3 | Authentication, Providers, Google: enable, paste the Google OAuth client ID and secret | Supabase dashboard | pending |
| 4 | Authentication, URL Configuration: Site URL = `APP_URL`; redirect URLs `APP_URL/auth/callback` and `http://localhost:3000/auth/callback` | Supabase dashboard | pending |
| 5 | Google Cloud: OAuth client (Web) for sign-in, redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`; consent screen user type **Internal** | Google Cloud | pending |
| 6 | Deploy on Vercel; add the domain `support.dropxlogistics.com` | Vercel, DNS | pending (site not set up yet) |
| 7 | Set the environment variables below | Vercel | pending |
| 8 | Gmail sender: enable Gmail API, OAuth client (Web) with redirect URI `http://localhost:8765`, run `scripts/get-gmail-refresh-token.mjs` signed in as `tech@dropxlogistics.com` | Google Cloud, your laptop | pending |
| 9 | GitHub token for the daily job (fine-grained, **Contents: read** and **Metadata: read** only). The repos sit under two owners (`nisar-dropx` and `DROPX-LOGISTICS`), so one token per owner may be needed; the code currently reads a single `GITHUB_TOKEN` | GitHub | pending; see "Later development" for the two-owner question |
| 10 | Sign in once with the account in `ADMIN_EMAILS` (becomes admin), then fill Master (section 2) | the site | pending |
| 11 | Deploy and confirm the cron entry in `vercel.json` shows in Vercel (daily 03:30 UTC = 09:00 IST) | Vercel | pending |

### Environment variables

| Variable | Status | Notes |
|---|---|---|
| `APP_URL` | not set | `https://support.dropxlogistics.com` |
| `ALLOWED_EMAIL_DOMAIN` | not set | `dropxlogistics.com` |
| `ADMIN_EMAILS` | not set | first admin(s), comma separated |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | not set | service role key is server only |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `MAIL_FROM` | not set | until set, email is skipped and recorded as `email_failed` |
| `GITHUB_TOKEN` | not set | until set the Daily updates page says "GitHub is not configured" |
| `CRON_SECRET` | not set | until set the cron route answers 503 |

## 2. Data to enter in Master (nothing is seeded except portal names)

- **Portal site addresses** for OpsPulse, DropX One, Dashboard, Connect and Delivery Tracker (only People has `https://people.dropxlogistics.com`). The DropX One path prefix is still "to confirm" in the spec.
- **Repositories**, each attached to its portal, with path prefixes where one repo serves several portals (spec section 14):
  `nisar-dropx/dropx-partner-dashboard`, `nisar-dropx/dropx-hrms`, `DROPX-LOGISTICS/Amazon-EDD-Worker`, `DROPX-LOGISTICS/ops-worker`, `DROPX-LOGISTICS/dropx-delivery-tracker`.
  The partner-dashboard repo needs the OpsPulse prefixes plus a no-prefix row for Dashboard.
- **The three developers**: name, the person they sign in as, GitHub logins, commit emails, commit names. Unknown authors land in Master, Unmatched commits.
- **Roles**: people appear after first sign-in as reporters. Set developers, managers and admins in Master, People & access.

## 3. Must be tested once with real services (all unverified so far)

Everything below was written and unit-tested but never run against the real service:

1. All four migrations on Postgres (functions, triggers, the replaced constraints and policies, the partial unique index).
2. Row-level security with real roles: a reporter cannot open another person's ticket, attachment or history; managers are read-only and see only published daily updates; reporters never see internal notes or email events.
3. Google sign-in end to end: domain refusal, the `email_verified` check, `support_register_user`, admin bootstrap from `ADMIN_EMAILS`.
4. Raise a ticket with screenshots: numbering under two simultaneous raises, upload to the private bucket, download through `/api/attachments/[id]`.
5. Status flow with two people acting at once (stale guard), confirmation by reporter and by developer with reason.
6. Email through the Gmail API: raise, confirmation request, and `email_failed` recording when it cannot send.
7. GitHub client: commit list and single-commit endpoints, pagination, the `since`/`until` window, `author.login`, `parents`, `files`; the cron bearer header on Vercel.
8. Queue filters and search against real PostgREST (the `or(...)` search and `not in` status filter).
9. Meet panel: the Calendar link opens pre-filled with title and guests; saving the Meet link and time.
10. CSV exports opened in Google Sheets and Excel (columns, quoting, the formula guard, UTF-8).
11. The import script: run it as a dry run against staging with the real CSV exports of the three tabs and read the report before `--apply`. Its column-name matching was written without seeing the real sheet.
12. All screens in a real browser and on a phone, in light and dark mode. Only built and fetched with curl so far.

## 4. Phase 5 (done by you in the portals' own repos)

A "Report a problem" link in each portal: `https://support.dropxlogistics.com/new?portal=<code>&page=<current page URL, encoded>`.
Codes: `people`, `opspulse`, `dropx-one`, `dashboard`, `connect`, `delivery-tracker`. Unknown codes are ignored; `page` is shown as plain text and never followed.

## 5. Later development (from the spec and the briefs, not built yet)

- **Google Meet created through the Calendar API** (spec phase 6). Today phase 4 opens a pre-filled Calendar link and the developer pastes the Meet link back. Needed for the API version: a Workspace service account with domain-wide delegation and the `calendar.events` scope (reuse the pattern in `dropx-hrms` for mailbox creation), an organiser mailbox to impersonate, storing the event ID in the existing `meet_event_id` column, and update/cancel when the session is rescheduled or the ticket closes.
- **Manager board and summary**: board by status; open by priority, overdue, average time to fix, first-response time.
- **Targets and overdue**: `response_hours` and `fix_hours` exist in `support_settings` but nothing reads them or shows an editor yet; the queue has no overdue filter.
- **Remaining emails**: assignment, status change, comment, reminders. Only "raised" and "confirmation request" are sent. The notification switches in `support_settings.notify` are not read.
- **Auto-close job**: `shouldAutoClose` (7 days awaiting confirmation) is written and tested; the scheduled job that applies it, and the reminder before it, are not.
- **Export to Google Sheets** (briefs mentioned it): only CSV download exists. A Sheets API export would need a Google credential and a target sheet.
- **Daily update run time**: the `daily_update_time` setting is not connected to the schedule; the time lives in `vercel.json`.
- **GitHub access**: a GitHub App would replace one personal token per owner. The daily job reads default-branch commits only (unmerged branch work does not appear), up to 1000 commits per repo per day and 200 per-commit file lookups per repo per run.
- **Station mailboxes** (spec question 1): people sharing one mailbox share one identity and can see each other's tickets. Stopgap in place: required "Your name" and optional phone on the form. A proper fix needs a decision (per-person sign-in, or a PIN/name picker).
- **Attachments from the sheet**: imported screenshot links are kept as links on the ticket (staff see them); the files are not copied into storage.
- **Edit published daily updates**: published rows are final today; there is no "reopen to edit".
- **Operational**: backups and retention policy, error monitoring, rate limiting on raising tickets, security headers and a content security policy review, accessibility audit, load test with the real ticket volume.

## 6. Decisions taken that you may want to revisit

- Ticket numbers are unique per type (`BUG-001`, `FR-001`, `SUP-001`) via a counter table; the import raises the counter past the highest imported ID.
- Managers are read-only on tickets. Developers and admins can change tickets.
- "Not viable" is terminal; "Done – awaiting confirmation" is left only through confirmation.
- A developer or admin can confirm or reopen for the reporter only with a written reason, stored in history.
- Comments are allowed until a ticket is Closed.
- Published daily updates add only "logged work on this ticket" to ticket history, because reporters can read history.
- A commit in a repository that is not registered, or by an author that matches no developer (or two), is reported and never guessed.
- The import never deletes, defaults to a dry run, and needs `--apply` to write.
- Extra columns and event types added beyond the spec: `support_portals.code`, `support_tickets.page_url`, `reopen_count`, `support_events.reason`, `support_attachments.comment_id`, `support_users.auth_user_id`, `support_settings.allowed_email_domain`, `support_daily_updates.source`, table `support_unmatched_commits`, event types `update_posted` and `daily_update_published`.

## 7. Security follow-ups

- The GitHub token used to push this code was valid for 7 days and scoped to this repo. **Delete it** once the work is merged.
- Secrets live only in the hosting environment. Check nothing was pasted into issues, pull requests or chat.
- The service role is used in five places only (README, "Service role usage"). Re-check that list after any change.
- Keep the Google consent screen **Internal**; the server also checks the email domain.
- After first sign-in, review the People & access list and remove anyone who should not be there.

## 8. Phase 4 specifics (this pull request)

- **Schedule Meet**: ticket page, developers and admins. Opens a Google Calendar "new event" link with the title `NUMBER: title`, the reporter and assignee as guests and the ticket link in the description. The developer saves the event with Meet in Calendar, then pastes the Meet link and time (IST) on the ticket. Only `https://meet.google.com/xxx-xxxx-xxx` links are accepted. The reporter sees the session on the ticket. No time is pre-filled; the person picks it in Calendar (a suggested time could be added later).
- **CSV export**: Queue, "Export CSV" (same filters as the screen, up to 5000 rows, staff only); Daily updates, "Export published updates" (date range up to one year, up to 10000 rows). Internal notes and comments are never exported. Cells that start with `=`, `+`, `-` or `@` get an apostrophe so they cannot run as formulas.
- **Import**: `npm run import:sheet -- --bugs bugs.csv --features features.csv --daily daily.csv --developer "Ravi"` (dry run), add `--apply` to write, `--create-portals` to create portal names the sheet uses. Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the staging project. Keeps existing IDs; skips rows without a valid ID, with an unknown portal, or already imported; links reporters by email or exact name (re-run after they sign in to link earlier tickets); a ticket is closed only when the sheet's status is done **and** "does it work now?" is yes. The daily log tab has no developer column, so `--developer` names whose rows they are. Dates are read day first (`05/10/2026` is 5 October).
