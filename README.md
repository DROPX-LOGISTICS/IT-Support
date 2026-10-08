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
emails on raise and on confirmation request. Later phases: spec section 13.

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
| `GITHUB_TOKEN`, `CRON_SECRET` | Phase 3 (daily updates) | Not used yet |

On Vercel add them under Project Settings, Environment Variables. Nothing secret is
ever written to code, migrations or logs.

## Database

Migrations live in `supabase/migrations/<UTC timestamp>_<n>.sql` and are safe to re-run.
Apply `20261008120000_1.sql`, then `20261008130000_2.sql`, with the Supabase SQL editor, or `supabase db push` against
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

Status changes, assignment, comments and confirmation all run through database functions as the signed-in person (no service role).

## Integration with other portals

`https://<support site>/new?portal=<code>&page=<url>`. Portal codes: `people`, `opspulse`,
`dropx-one`, `dashboard`, `connect`, `delivery-tracker`. Unknown codes are ignored and `page` is plain text.
