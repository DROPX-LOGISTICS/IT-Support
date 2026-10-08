# IT Support module — full specification

## 1. Purpose

DropX staff report portal problems and ask for features; three developers fix
and build them. Today this runs on a Google Sheet with three tabs (bugs, feature
requests, daily developer updates) plus manual emails. This module replaces the
sheet and the manual emails.

It must cover, in one place:

- Raising and tracking **bugs**, **feature requests** and **support issues**.
- A reporter **confirmation** step, so a ticket is only closed when the person
  who raised it says it works.
- **Daily developer updates**, drafted automatically from GitHub commits.
- A **registry of portals**, their repos and their live sites.
- **Google Meet** sessions scheduled from a ticket.
- Email through **Gmail**, and export to **Google Sheets** (CSV).

The company uses Google Workspace only (Gmail, Sheets, Meet). Do not add
Microsoft or Slack integrations.

## 2. People and roles

| Role | Who | What they can do |
|---|---|---|
| Reporter | Any signed-in staff member | Raise tickets, see and comment on their own tickets, confirm or reopen their own tickets |
| Developer | The IT team | See all tickets, assign, change status, set viability and expected date, write developer updates, manage daily updates, schedule sessions |
| Manager | Company owner and nominated managers | See everything a developer sees, read-only on daily updates, see the summary |
| Admin | Developer with master access | Manage portals, repos, developers and settings |

A reporter never sees another person's tickets, comments or attachments.

## 3. Where it lives and conventions to follow

IT Support is a **separate application** in its own private repo,
`DROPX-LOGISTICS/IT-Support`, with its own database and its own site. It does
not live inside the dashboard or People repos, and it keeps working when either
of those is down. The other portals link into it (section 3a).

- **Stack:** Next.js (App Router) with TypeScript, Supabase (Postgres, storage,
  auth), deployed on Vercel — the same stack as the other DropX portals, so the
  team can maintain it.
- **Database:** its own Supabase project. It never reads or writes the
  dashboard or People databases.
- **Sign-in:** "Sign in with Google", restricted to the company Google
  Workspace domain. No passwords and no separate account creation. A person's
  name and email come from their Google account. Anyone on the domain can sign
  in as a reporter; developer, manager and admin roles are granted in
  `support_users`.
- **Server actions:** `"use server"`, return `{ ok, message }`, read the caller
  from the session, check the role on the server, then revalidate the page.
- **Email:** Gmail, sent through the company Google Workspace (SMTP or the
  Gmail API with a dedicated sender such as `it-support@`).
- **Scheduled jobs:** Vercel cron routes under `src/app/api/cron/`, protected
  by a secret header.
- **File uploads:** a private Supabase storage bucket, served through a route
  that checks ticket access.
- **Migrations:** `supabase/migrations/<UTC timestamp>_<name>.sql`, safe to
  re-run.
- **Tests:** `*.test.mjs` beside the code, run with `node --test`; scripts
  `lint`, `typecheck`, `test` and `build` in `package.json`.
- **Docs:** a `README.md` covering local setup, environment variables and
  deployment.

### 3a. Integration with the other portals

Every DropX portal gets a way into IT Support, added in that portal's own repo.

- **First release — "Report a problem" link.** Each portal adds a menu item
  that opens IT Support's raise-a-ticket page with the portal and the current
  page address already filled in:
  `https://<support site>/new?portal=<code>&page=<url of the page they were on>`.
  The person signs in with Google once and stays signed in.
- **Portals to add it to:** People (`dropx-hrms`), OpsPulse and Dashboard
  (`dropx-partner-dashboard`), Connect, DropX One, Delivery Tracker.
- **Later — open-ticket badge.** A small read-only API in IT Support returns
  the signed-in person's open and awaiting-confirmation counts, so a portal can
  show "2 tickets awaiting your confirmation".
- **Later — tickets raised by a portal.** An authenticated API so a portal can
  attach context (for example the failing record's ID) when creating a ticket.

IT Support only accepts `portal` codes that exist in `support_portals`, and it
treats the `page` value as plain text: it is shown on the ticket, never
followed or rendered as HTML.

## 4. Data model

All tables have `id uuid`, `created_at`, `updated_at`, and row-level security
enabled. Prefix every table with `support_`. The application serves one
company, so there is no `company_id`.

### support_users
email (from Google, unique), name, role (`reporter`, `developer`, `manager`,
`admin`), is_active, last_sign_in_at. A row is created as `reporter` on first
sign-in. Only an admin changes roles.

### support_tickets
| Column | Notes |
|---|---|
| number | `BUG-001`, `FR-001`, `SUP-001`; unique per company; never reused |
| type | `bug`, `feature`, `support` |
| portal_id | from `support_portals` |
| title | short summary, required, max 150 |
| description | "What went wrong?" or "What do you need and why?"; required |
| steps | steps to reproduce or links (optional) |
| priority | `P0` Critical, `P1` High, `P2` Medium, `P3` Low |
| status | see section 5 |
| reporter_id, reporter_name, reporter_email | taken from the session, never from the form |
| assignee_id | a developer |
| viable | `yes`, `no`, `needs_discussion`; feature requests only |
| viable_reason | reason or alternative; required when viable is not `yes` |
| expected_date | expected fix or completion date |
| developer_update | latest plain-language update shown to the reporter |
| links | commit, pull request or page links (array) |
| confirmed_working | `null`, `yes`, `no` |
| confirmed_at, closed_at, first_response_at, done_at | timestamps |
| meet_event_id, meet_link, meet_at | latest scheduled session |
| source | `portal` or `sheet_import` |
| deleted_at | soft delete only |

### support_comments
ticket_id, author_id, author_name, body, `internal` (true = developers only),
created_at.

### support_events
Append-only history: ticket_id, actor_id, actor_name, event_type (`created`,
`status_changed`, `assigned`, `priority_changed`, `expected_date_changed`,
`viability_set`, `commented`, `attachment_added`, `confirmed`, `reopened`,
`meet_scheduled`, `email_sent`, `email_failed`), old_value, new_value,
created_at. Nobody can edit or delete these rows.

### support_attachments
ticket_id, storage_path, file_name, mime_type, size_bytes, uploaded_by. Private
bucket; files are served through a route that checks ticket access. Images and
PDF only, 5 MB each, up to 5 per ticket or comment.

### support_portals
name (People, OpsPulse, DropX One, Dashboard, Connect, Delivery Tracker…),
site_url, is_active, sort_order.

### support_portal_repos
portal_id, repo (`owner/name`), path_prefixes (array, optional). One repo can
serve several portals: a commit belongs to the portal whose path prefix matches
most of its changed files; with no prefixes, the whole repo maps to the portal.

### support_developers
user_id, display_name, github_logins (array), commit_author_names (array),
commit_author_emails (array), is_active. Used to match commits to a developer.

### support_daily_updates
update_date, developer_id, portal_id, ticket_id (optional), work_done, hours
(optional), status (`In progress`, `Done`, `Blocked`), blocker, next_step,
target_date, commit_shas (array), `state` (`draft`, `published`), published_at.

### support_settings
One row per company: target response and fix hours per priority, daily update
run time, notification on/off switches.

## 5. Ticket lifecycle

| Status | Meaning | Who moves it here |
|---|---|---|
| New | Just raised | System |
| Viable check | Feature request being assessed | Developer |
| Not viable | Declined, with reason or alternative | Developer |
| In progress | Being worked on | Developer |
| Blocked | Waiting on someone or something; reason required | Developer |
| Done – awaiting confirmation | Fix released; reporter asked to check | Developer |
| Closed | Reporter confirmed it works | Reporter, or system after 7 days without a reply |
| Reopened | Reporter says it still fails; reason required | Reporter |

Rules:

- Bugs and support issues go New → In progress. Feature requests go
  New → Viable check → In progress or Not viable.
- Moving to "Done – awaiting confirmation" requires a developer update.
- Only the reporter (or a developer acting with a recorded reason) can confirm.
- "Reopened" returns to the same assignee and counts as a reopen on the ticket.
- Auto-close after 7 days is recorded as closed by the system, not by the
  reporter.
- Every change writes a `support_events` row with the actor from the session.
- Guard status changes against stale pages: the action receives the status the
  user saw and refuses if it has changed.

Default targets (editable in settings): P0 respond in 1 hour, fix in 1 day;
P1 4 hours, 3 days; P2 1 day, 7 days; P3 2 days, 14 days. A ticket past its
target shows as overdue.

## 6. Screens

1. **Raise a ticket** — type, portal, title, description, steps or links,
   priority, screenshots. Shows the ticket number on save.
2. **My tickets** — the reporter's own tickets with status, expected date and
   latest developer update; a clear "Confirm it works / Still not working"
   action on tickets awaiting confirmation.
3. **Ticket page** — details, developer update, comments, attachments, history,
   session link. Developers also get status, assignee, priority, viability,
   expected date, links and internal notes.
4. **Developer queue** — all tickets; filters for type, portal, status,
   priority, assignee, reporter, overdue; search by number or text; default
   sort by priority, then oldest.
5. **Board** — columns by status, cards showing number, title, priority,
   assignee; drag to change status with the same rules as section 5.
6. **Daily updates** — per developer and date: review drafted rows, edit, add a
   manual row, publish. Managers see published rows across developers.
7. **Summary** (managers) — open tickets by priority and portal, overdue,
   raised vs closed per week, average time to first response and to fix,
   reopen count, awaiting confirmation for more than 3 days.
8. **Master** — portals, repos and path prefixes, developers and their GitHub
   identities, settings.

All screens work on a phone, and none scroll sideways.

## 7. Notifications (Gmail)

| Event | To |
|---|---|
| Ticket raised | Reporter (acknowledgement with number) and all developers |
| Assigned | Assignee |
| Developer update or expected date changed | Reporter |
| Comment added (not internal) | The other party |
| Done – awaiting confirmation | Reporter, with confirm link |
| Reminder: still awaiting confirmation after 3 days | Reporter |
| Reopened | Assignee |
| Not viable | Reporter, with reason |
| P0 raised | All developers and managers |
| Session scheduled | Reporter and assignee (Calendar also invites them) |

Emails are plain, mention the ticket number in the subject, link to the ticket
page, and contain no commit hashes or technical terms. A failed send never
blocks the action; it is recorded as `email_failed` and can be retried.

## 8. Automatic daily updates

- A daily job runs at the configured time (default 09:00 IST) and builds drafts
  for the previous IST day. A developer can also press "Draft from commits" for
  any date.
- For each repo in `support_portal_repos`, fetch commits for that day through
  the GitHub REST API using `GITHUB_TOKEN` (read-only). Skip merge commits.
- Match each commit to a developer by GitHub login, author email or author
  name from `support_developers`. Unmatched commits are listed for an admin to
  map; never guess.
- Assign each commit to a portal using the path prefixes.
- Link a commit to a ticket when its message contains a ticket number
  (`BUG-12`, `FR-7`, `SUP-3`, any zero padding, any case).
- Group into rows: one per developer, portal and ticket, plus one per portal
  for unlinked commits. `work_done` is the commit subjects joined into
  sentences. Status is `Done` if the linked ticket is done or closed,
  otherwise `In progress`.
- Drafts are never published automatically. The developer reviews, edits hours,
  blocker and next step, and publishes.
- Running the job twice for the same day must not duplicate rows or overwrite
  a developer's edits; new commits are added to the existing draft.
- A published row linked to a ticket appears in that ticket's history.
- With no `GITHUB_TOKEN`, the page shows "GitHub is not configured" and manual
  rows still work.

## 9. Google Meet sessions

- **First release:** a "Schedule Meet" button opens a pre-filled Google
  Calendar event (title = ticket number and title, guests = reporter and
  assignee, description = link to the ticket). After saving in Calendar, the
  developer pastes the Meet link and time into the ticket.
- **Later:** create the event through the Google Calendar API with a Meet link,
  store the event id, and update or cancel it when the session moves or the
  ticket closes. Use a Google service account with domain-wide delegation and
  the Calendar scope (the dashboard does this in
  `src/lib/google-workspace-client.ts`); if Calendar access is missing, show
  "not configured" and keep the button from the first release.

## 10. Export and import

- **Export:** CSV of tickets (filtered as on screen) and of published daily
  updates, with the same columns as the current sheet, so it opens in Google
  Sheets.
- **Import (one time):** a script reading CSV exports of the three sheet tabs.
  Keep the existing IDs (`FR-005`, `BUG-002`…) as ticket numbers and start new
  numbering after the highest imported one. Match reporters by name to users;
  list unmatched names instead of guessing. Mark rows `source = sheet_import`.
  It must be safe to run twice.

## 11. Security and data rules

- Access is enforced in server actions and in row-level security; hiding a
  button is not access control.
- Reporter and actor identity come from the signed-in Google account only.
- Sign-in is refused for any email outside the company domain; check the
  verified domain on the server, not only the Google account picker.
- Attachments are private and served only after a ticket access check.
- Internal comments are never sent to reporters, in pages, emails or exports.
- No hard deletes of tickets, comments or events.
- Secrets come from environment variables (`GITHUB_TOKEN`, and later Google
  Calendar credentials). Nothing secret in code, migrations or logs.
- Develop against a separate development Supabase project, never production.
- User text is escaped in pages and emails.

## 12. Tests required

- Sign-in: an email outside the company domain is refused; a new person starts
  as reporter.
- Ticket numbering: per type, no reuse, safe under two raises at
  once, continues after imported numbers.
- Access: a reporter cannot read or change another reporter's ticket through
  pages, actions, attachment routes or exports.
- Status flow: every allowed and refused transition in section 5, the stale
  status guard, auto-close.
- Commit matching: ticket numbers in messages, developer matching, portal by
  path prefix, merge commits skipped, re-run does not duplicate or overwrite.
- Import: runs twice without duplicates, unmatched reporters listed.
- `lint`, `typecheck` and `build` pass.

## 13. Phases

Each phase is one pull request and ends with: what was run, what passed, and
what could not be verified.

1. **Foundation** — new Next.js project, Google sign-in limited to the company
   domain, migrations for all tables with row-level security, roles, raise a
   ticket (with screenshots and the `portal` / `page` link values), my tickets.
2. **Working the queue** — developer queue, ticket page, status flow, comments,
   history, reporter confirmation, emails for raise and confirmation.
3. **Daily updates** — portals, repos and developers master; draft from
   commits; review and publish.
4. **Sessions and data** — Schedule Meet button, CSV export, sheet import.
5. **Portal links** — the "Report a problem" menu item in each portal. This is
   a small change in each portal's own repo, done as separate pull requests
   there, not in this repo.
6. **Later** — board, manager summary, remaining emails and reminders,
   targets and overdue, auto-close, Calendar API Meet creation, open-ticket
   badge and ticket-creation API for portals.

Phases 1–5 are the first release. Phase 6 follows once the team is using it.

## 14. Portals, repos and sites to seed

Confirm each line before seeding; site URLs marked "to fill" are not known yet.

| Portal | Repo | Path prefixes | Site |
|---|---|---|---|
| People | `nisar-dropx/dropx-hrms` | whole repo | `https://people.dropxlogistics.com` |
| OpsPulse | `nisar-dropx/dropx-partner-dashboard` | `src/app/ops-pulse`, `src/lib/ops-pulse`, `src/app/api/ops-pulse` | to fill |
| Dashboard | `nisar-dropx/dropx-partner-dashboard` | everything else under `src` | to fill |
| Connect | `nisar-dropx/dropx-partner-dashboard` | `apps/connect` | to fill |
| DropX One | `nisar-dropx/dropx-partner-dashboard` | `apps/dropx-tracker-android`, DropX One routes (to confirm) | to fill |
| OpsPulse (EDD / Ops Live worker) | `DROPX-LOGISTICS/Amazon-EDD-Worker` | whole repo | none |
| OpsPulse (cash recon worker) | `DROPX-LOGISTICS/ops-worker` | whole repo | none |
| Delivery Tracker | `DROPX-LOGISTICS/dropx-delivery-tracker` | whole repo | to fill |

Developers to seed: Josephmathew072, nisar-dropx, Muhammed Jamsheer (GitHub
logins and commit emails to confirm).

## 15. Open questions to settle before phase 1

1. **Does every person who should raise tickets have a company Google
   account?** Sign-in depends on it. Station staff who share one station
   mailbox would all appear as that mailbox.
2. **Site address** for IT Support (for example `support.dropxlogistics.com`),
   and the sender address for its emails.
3. **Who counts as a manager** for the summary and P0 emails?
4. **Should reporters see each other's tickets for the same station or
   portal**, to avoid duplicates? The default here is no.
5. **Which dashboard repo do daily updates read** — `nisar-dropx/…` is the
   active one; `DROPX-LOGISTICS/dropx-partner-dashboard` is an older copy.
