-- IT Support, phase 3: daily updates from commits. Only support_ objects. Safe to re-run.

alter table support_events drop constraint if exists support_events_event_type_check;
alter table support_events add constraint support_events_event_type_check check (event_type in (
  'created','status_changed','assigned','priority_changed','expected_date_changed',
  'viability_set','commented','attachment_added','confirmed','reopened',
  'meet_scheduled','email_sent','email_failed','update_posted','daily_update_published'));

alter table support_daily_updates add column if not exists source text not null default 'commits';
alter table support_daily_updates drop constraint if exists support_daily_updates_source_check;
alter table support_daily_updates add constraint support_daily_updates_source_check check (source in ('commits','manual'));

-- Running the job twice must not duplicate: one open draft per day, developer, portal and ticket.
create unique index if not exists support_daily_updates_draft_key on support_daily_updates
  (update_date, developer_id, portal_id, coalesce(ticket_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where source = 'commits' and state = 'draft';

-- Commits whose author matches no developer. An admin maps them; nothing is guessed.
create table if not exists support_unmatched_commits (
  id uuid primary key default gen_random_uuid(),
  repo text not null,
  sha text not null,
  commit_date date not null,
  author_login text,
  author_name text,
  author_email text,
  subject text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repo, sha)
);
drop trigger if exists support_unmatched_commits_touch on support_unmatched_commits;
create trigger support_unmatched_commits_touch before update on support_unmatched_commits
  for each row execute function support_touch_updated_at();
alter table support_unmatched_commits enable row level security;
revoke all on table support_unmatched_commits from anon;
drop policy if exists support_unmatched_select on support_unmatched_commits;
create policy support_unmatched_select on support_unmatched_commits for select to authenticated
  using (support_is_staff());
drop policy if exists support_unmatched_admin on support_unmatched_commits;
create policy support_unmatched_admin on support_unmatched_commits for all to authenticated
  using (support_is_admin()) with check (support_is_admin());
-- Inserts come only from the job (service role); no insert policy for other people.

-- Daily update rows: a developer works on their own drafts; published rows are final.
drop policy if exists support_daily_updates_write on support_daily_updates;
drop policy if exists support_daily_updates_insert on support_daily_updates;
create policy support_daily_updates_insert on support_daily_updates for insert to authenticated
  with check (
    support_is_admin()
    or (state = 'draft' and developer_id in (select d.id from support_developers d where d.user_id = support_uid())));
drop policy if exists support_daily_updates_update on support_daily_updates;
create policy support_daily_updates_update on support_daily_updates for update to authenticated
  using (
    (state = 'draft' and developer_id in (select d.id from support_developers d where d.user_id = support_uid()))
    or (support_is_admin() and state = 'draft'))
  with check (state = 'draft' and (support_is_admin()
    or developer_id in (select d.id from support_developers d where d.user_id = support_uid())));
drop policy if exists support_daily_updates_delete on support_daily_updates;
create policy support_daily_updates_delete on support_daily_updates for delete to authenticated
  using (state = 'draft' and (support_is_admin()
    or developer_id in (select d.id from support_developers d where d.user_id = support_uid())));

-- Publishing is the only way a row leaves draft. It runs as the person and writes the ticket history.
create or replace function support_publish_daily_update(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user support_users := support_actor();
  r support_daily_updates;
  d support_developers;
begin
  if v_user.id is null then raise exception 'Not allowed'; end if;
  select * into r from support_daily_updates where id = p_id for update;
  if r.id is null then raise exception 'Not found'; end if;
  select * into d from support_developers where id = r.developer_id;
  if not (v_user.role = 'admin' or (v_user.role = 'developer' and d.user_id = v_user.id)) then raise exception 'Not allowed'; end if;
  if r.state = 'published' then raise exception 'Already published'; end if;
  if char_length(trim(coalesce(r.work_done, ''))) = 0 then raise exception 'Write what was done first'; end if;
  if r.status = 'Blocked' and char_length(trim(coalesce(r.blocker, ''))) = 0 then raise exception 'Add the blocker first'; end if;
  update support_daily_updates set state = 'published', published_at = now() where id = p_id;
  if r.ticket_id is not null then
    -- Only a neutral note goes to history; the work text stays on the daily updates page.
    insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
    values (r.ticket_id, v_user.id, d.display_name, 'daily_update_published', 'published');
  end if;
end $$;
revoke all on function support_publish_daily_update(uuid) from public, anon;
grant execute on function support_publish_daily_update(uuid) to authenticated;
