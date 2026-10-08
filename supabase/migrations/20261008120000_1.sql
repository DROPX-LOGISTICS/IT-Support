-- IT Support, phase 1: foundation.
-- Creates ONLY objects prefixed support_ (tables, functions, triggers, policies,
-- one storage bucket). Safe to re-run. Rollback note: see the phase-1 pull request.

-- ---------------------------------------------------------------- tables
create table if not exists support_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  allowed_email_domain text not null default 'dropxlogistics.com',
  response_hours jsonb not null default '{"P0":1,"P1":4,"P2":24,"P3":48}',
  fix_hours jsonb not null default '{"P0":24,"P1":72,"P2":168,"P3":336}',
  daily_update_time text not null default '09:00',
  notify jsonb not null default '{"raised":true,"assigned":true,"status":true,"comment":true,"confirmation":true}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into support_settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists support_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null,
  name text not null default '',
  role text not null default 'reporter' check (role in ('reporter','developer','manager','admin')),
  is_active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists support_users_email_key on support_users (lower(email));

create table if not exists support_portals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{2,40}$'),
  name text not null unique,
  site_url text,
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into support_portals (code, name, site_url, sort_order) values
  ('people', 'People', 'https://people.dropxlogistics.com', 10),
  ('opspulse', 'OpsPulse', null, 20),
  ('dropx-one', 'DropX One', null, 30),
  ('dashboard', 'Dashboard', null, 40),
  ('connect', 'Connect', null, 50),
  ('delivery-tracker', 'Delivery Tracker', null, 60)
on conflict (code) do nothing;

create table if not exists support_portal_repos (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references support_portals(id),
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  path_prefixes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_developers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references support_users(id),
  display_name text not null,
  github_logins text[] not null default '{}',
  commit_author_names text[] not null default '{}',
  commit_author_emails text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_ticket_counters (
  ticket_type text primary key check (ticket_type in ('bug','feature','support')),
  last_value int not null default 0,
  updated_at timestamptz not null default now()
);
insert into support_ticket_counters (ticket_type) values ('bug'), ('feature'), ('support')
on conflict (ticket_type) do nothing;

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  type text not null check (type in ('bug','feature','support')),
  portal_id uuid not null references support_portals(id),
  title text not null check (char_length(title) between 1 and 150),
  description text not null check (char_length(description) between 1 and 5000),
  steps text check (steps is null or char_length(steps) <= 5000),
  page_url text check (page_url is null or char_length(page_url) <= 2000),
  priority text not null check (priority in ('P0','P1','P2','P3')),
  status text not null default 'New' check (status in (
    'New','Viable check','Not viable','In progress','Blocked',
    'Done – awaiting confirmation','Closed','Reopened')),
  reporter_id uuid references support_users(id),
  reporter_name text not null,
  reporter_email text not null,
  raised_by_name text not null,
  raised_by_phone text,
  assignee_id uuid references support_users(id),
  viable text check (viable in ('yes','no','needs_discussion')),
  viable_reason text,
  expected_date date,
  developer_update text,
  links text[] not null default '{}',
  confirmed_working text check (confirmed_working in ('yes','no')),
  reopen_count int not null default 0,
  confirmed_at timestamptz,
  closed_at timestamptz,
  first_response_at timestamptz,
  done_at timestamptz,
  meet_event_id text,
  meet_link text,
  meet_at timestamptz,
  source text not null default 'portal' check (source in ('portal','sheet_import')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_viable_reason check (
    viable is null or viable = 'yes' or char_length(coalesce(viable_reason, '')) > 0)
);
create index if not exists support_tickets_reporter_idx on support_tickets (reporter_id, created_at desc);
create index if not exists support_tickets_queue_idx on support_tickets (status, priority, created_at);
create index if not exists support_tickets_portal_idx on support_tickets (portal_id);
create index if not exists support_tickets_assignee_idx on support_tickets (assignee_id);

create table if not exists support_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  author_id uuid not null references support_users(id),
  author_name text not null,
  body text not null check (char_length(body) between 1 and 5000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_comments_ticket_idx on support_comments (ticket_id, created_at);

create table if not exists support_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  actor_id uuid references support_users(id),
  actor_name text not null,
  event_type text not null check (event_type in (
    'created','status_changed','assigned','priority_changed','expected_date_changed',
    'viability_set','commented','attachment_added','confirmed','reopened',
    'meet_scheduled','email_sent','email_failed')),
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_events_ticket_idx on support_events (ticket_id, created_at);

create table if not exists support_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  comment_id uuid references support_comments(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/gif','image/webp','application/pdf')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid not null references support_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_attachments_ticket_idx on support_attachments (ticket_id);

create table if not exists support_daily_updates (
  id uuid primary key default gen_random_uuid(),
  update_date date not null,
  developer_id uuid not null references support_developers(id),
  portal_id uuid not null references support_portals(id),
  ticket_id uuid references support_tickets(id),
  work_done text not null default '',
  hours numeric(4,1) check (hours is null or (hours >= 0 and hours <= 24)),
  status text not null default 'In progress' check (status in ('In progress','Done','Blocked')),
  blocker text,
  next_step text,
  target_date date,
  commit_shas text[] not null default '{}',
  state text not null default 'draft' check (state in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_daily_updates_idx on support_daily_updates (update_date, developer_id);

-- ------------------------------------------------------------- functions
create or replace function support_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function support_block_change() returns trigger
language plpgsql as $$
begin raise exception 'support_events rows cannot be changed or deleted'; end $$;

create or replace function support_block_delete() returns trigger
language plpgsql as $$
begin raise exception 'Hard deletes are not allowed on %. Use soft delete.', tg_table_name; end $$;

create or replace function support_check_user_domain() returns trigger
language plpgsql as $$
declare v_domain text;
begin
  select lower(allowed_email_domain) into v_domain from support_settings limit 1;
  if v_domain is null or lower(split_part(new.email, '@', 2)) <> v_domain then
    raise exception 'Email is outside the company domain';
  end if;
  return new;
end $$;

create or replace function support_uid() returns uuid
language sql stable security definer set search_path = public as $$
  select id from support_users where auth_user_id = auth.uid() and is_active limit 1
$$;

create or replace function support_role() returns text
language sql stable security definer set search_path = public as $$
  select role from support_users where auth_user_id = auth.uid() and is_active limit 1
$$;

create or replace function support_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(support_role() in ('developer','manager','admin'), false)
$$;

create or replace function support_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(support_role() = 'admin', false)
$$;

create or replace function support_can_see_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from support_tickets t
    where t.id = p_ticket and t.deleted_at is null
      and (support_is_staff() or t.reporter_id = support_uid()))
$$;

create or replace function support_guard_user_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only an admin changes roles or active flags (service role has no auth.uid()).
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or lower(new.email) <> lower(old.email))
     and auth.uid() is not null and not support_is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end $$;

-- Atomic numbering: the upsert row-locks the counter, so two raises never share a number.
create or replace function support_next_ticket_number(p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare v_next int; v_prefix text;
begin
  v_prefix := case p_type when 'bug' then 'BUG' when 'feature' then 'FR' when 'support' then 'SUP' end;
  if v_prefix is null then raise exception 'Unknown ticket type'; end if;
  insert into support_ticket_counters (ticket_type, last_value) values (p_type, 1)
  on conflict (ticket_type) do update
    set last_value = support_ticket_counters.last_value + 1, updated_at = now()
  returning last_value into v_next;
  return v_prefix || '-' || lpad(v_next::text, 3, '0');
end $$;

create or replace function support_register_user(p_name text) returns support_users
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row support_users;
begin
  if auth.uid() is null or v_email = '' then raise exception 'Not signed in'; end if;
  update support_users
     set auth_user_id = auth.uid(), name = coalesce(nullif(trim(p_name), ''), name),
         last_sign_in_at = now()
   where lower(email) = v_email and (auth_user_id is null or auth_user_id = auth.uid())
   returning * into v_row;
  if v_row.id is null then
    insert into support_users (auth_user_id, email, name, role, last_sign_in_at)
    values (auth.uid(), v_email, coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)), 'reporter', now())
    returning * into v_row;
  end if;
  return v_row;
end $$;

create or replace function support_create_ticket(
  p_type text, p_portal_code text, p_title text, p_description text, p_steps text,
  p_priority text, p_page text, p_raised_by_name text, p_raised_by_phone text
) returns table (id uuid, number text)
language plpgsql security definer set search_path = public as $$
declare
  v_user support_users;
  v_portal uuid;
  v_number text;
  v_id uuid;
begin
  select * into v_user from support_users where auth_user_id = auth.uid() and is_active;
  if v_user.id is null then raise exception 'Not signed in'; end if;
  if p_type not in ('bug','feature','support') then raise exception 'Choose a ticket type'; end if;
  if p_priority not in ('P0','P1','P2','P3') then raise exception 'Choose a priority'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 150 then raise exception 'Title must be 1 to 150 characters'; end if;
  if char_length(trim(coalesce(p_description, ''))) not between 1 and 5000 then raise exception 'Description is required'; end if;
  if char_length(trim(coalesce(p_raised_by_name, ''))) = 0 then raise exception 'Your name is required'; end if;
  select pt.id into v_portal from support_portals pt where pt.code = p_portal_code and pt.is_active;
  if v_portal is null then raise exception 'Unknown portal'; end if;

  v_number := support_next_ticket_number(p_type);
  insert into support_tickets (number, type, portal_id, title, description, steps, page_url, priority,
      reporter_id, reporter_name, reporter_email, raised_by_name, raised_by_phone)
  values (v_number, p_type, v_portal, trim(p_title), trim(p_description), nullif(trim(coalesce(p_steps, '')), ''),
      nullif(left(trim(coalesce(p_page, '')), 2000), ''), p_priority,
      v_user.id, v_user.name, v_user.email, trim(p_raised_by_name), nullif(trim(coalesce(p_raised_by_phone, '')), ''))
  returning support_tickets.id into v_id;
  insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
  values (v_id, v_user.id, v_user.name, 'created', v_number);
  return query select v_id, v_number;
end $$;

create or replace function support_add_attachment(
  p_ticket uuid, p_path text, p_name text, p_mime text, p_size int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user support_users; v_count int; v_id uuid;
begin
  select * into v_user from support_users where auth_user_id = auth.uid() and is_active;
  if v_user.id is null or not support_can_see_ticket(p_ticket) then raise exception 'Not allowed'; end if;
  select count(*) into v_count from support_attachments where ticket_id = p_ticket and comment_id is null;
  if v_count >= 5 then raise exception 'A ticket can have up to 5 attachments'; end if;
  insert into support_attachments (ticket_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (p_ticket, p_path, p_name, p_mime, p_size, v_user.id) returning support_attachments.id into v_id;
  insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
  values (p_ticket, v_user.id, v_user.name, 'attachment_added', p_name);
  return v_id;
end $$;

-- Function privileges: nothing runs for anon; numbering is internal only.
revoke all on function support_next_ticket_number(text) from public, anon, authenticated;
revoke all on function support_register_user(text) from public, anon;
revoke all on function support_create_ticket(text,text,text,text,text,text,text,text,text) from public, anon;
revoke all on function support_add_attachment(uuid,text,text,text,int) from public, anon;
revoke all on function support_uid() from public, anon;
revoke all on function support_role() from public, anon;
revoke all on function support_is_staff() from public, anon;
revoke all on function support_is_admin() from public, anon;
revoke all on function support_can_see_ticket(uuid) from public, anon;
grant execute on function support_register_user(text) to authenticated;
grant execute on function support_create_ticket(text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function support_add_attachment(uuid,text,text,text,int) to authenticated;
grant execute on function support_uid() to authenticated;
grant execute on function support_role() to authenticated;
grant execute on function support_is_staff() to authenticated;
grant execute on function support_is_admin() to authenticated;
grant execute on function support_can_see_ticket(uuid) to authenticated;

-- --------------------------------------------------------------- triggers
do $$
declare t text;
begin
  foreach t in array array['support_settings','support_users','support_portals','support_portal_repos',
    'support_developers','support_tickets','support_comments','support_attachments','support_daily_updates'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function support_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

drop trigger if exists support_events_immutable on support_events;
create trigger support_events_immutable before update or delete on support_events
  for each row execute function support_block_change();
drop trigger if exists support_tickets_no_delete on support_tickets;
create trigger support_tickets_no_delete before delete on support_tickets
  for each row execute function support_block_delete();
drop trigger if exists support_comments_no_delete on support_comments;
create trigger support_comments_no_delete before delete on support_comments
  for each row execute function support_block_delete();
drop trigger if exists support_users_domain on support_users;
create trigger support_users_domain before insert or update of email on support_users
  for each row execute function support_check_user_domain();
drop trigger if exists support_users_guard on support_users;
create trigger support_users_guard before update on support_users
  for each row execute function support_guard_user_update();

-- ------------------------------------------------- row-level security
do $$
declare t text;
begin
  foreach t in array array['support_settings','support_users','support_portals','support_portal_repos',
    'support_developers','support_ticket_counters','support_tickets','support_comments','support_events',
    'support_attachments','support_daily_updates'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon', t);
  end loop;
end $$;
-- Counters are reachable only through support_next_ticket_number (no policies = no access).
revoke all on table support_ticket_counters from authenticated;

drop policy if exists support_users_select on support_users;
create policy support_users_select on support_users for select to authenticated
  using (id = support_uid() or support_is_staff());
drop policy if exists support_users_update on support_users;
create policy support_users_update on support_users for update to authenticated
  using (support_is_admin()) with check (support_is_admin());

drop policy if exists support_portals_select on support_portals;
create policy support_portals_select on support_portals for select to authenticated
  using (support_uid() is not null);
drop policy if exists support_portals_write on support_portals;
create policy support_portals_write on support_portals for all to authenticated
  using (support_is_admin()) with check (support_is_admin());

drop policy if exists support_portal_repos_select on support_portal_repos;
create policy support_portal_repos_select on support_portal_repos for select to authenticated
  using (support_is_staff());
drop policy if exists support_portal_repos_write on support_portal_repos;
create policy support_portal_repos_write on support_portal_repos for all to authenticated
  using (support_is_admin()) with check (support_is_admin());

drop policy if exists support_developers_select on support_developers;
create policy support_developers_select on support_developers for select to authenticated
  using (support_is_staff());
drop policy if exists support_developers_write on support_developers;
create policy support_developers_write on support_developers for all to authenticated
  using (support_is_admin()) with check (support_is_admin());

drop policy if exists support_settings_select on support_settings;
create policy support_settings_select on support_settings for select to authenticated
  using (support_is_staff());
drop policy if exists support_settings_write on support_settings;
create policy support_settings_write on support_settings for update to authenticated
  using (support_is_admin()) with check (support_is_admin());

-- Tickets: reporters see only their own; developers, managers and admins see all.
-- Inserts happen only through support_create_ticket. Managers are read-only.
drop policy if exists support_tickets_select on support_tickets;
create policy support_tickets_select on support_tickets for select to authenticated
  using (deleted_at is null and (support_is_staff() or reporter_id = support_uid()));
drop policy if exists support_tickets_update on support_tickets;
create policy support_tickets_update on support_tickets for update to authenticated
  using (support_role() in ('developer','admin'))
  with check (support_role() in ('developer','admin'));

drop policy if exists support_comments_select on support_comments;
create policy support_comments_select on support_comments for select to authenticated
  using (support_can_see_ticket(ticket_id) and (internal = false or support_is_staff()));
drop policy if exists support_comments_insert on support_comments;
create policy support_comments_insert on support_comments for insert to authenticated
  with check (
    author_id = support_uid() and support_can_see_ticket(ticket_id)
    and (internal = false or support_is_staff())
    and exists (select 1 from support_tickets t where t.id = ticket_id and t.status <> 'Closed'));

drop policy if exists support_events_select on support_events;
create policy support_events_select on support_events for select to authenticated
  using (support_can_see_ticket(ticket_id));

drop policy if exists support_attachments_select on support_attachments;
create policy support_attachments_select on support_attachments for select to authenticated
  using (support_can_see_ticket(ticket_id));

drop policy if exists support_daily_updates_select on support_daily_updates;
create policy support_daily_updates_select on support_daily_updates for select to authenticated
  using (support_role() in ('developer','admin') or (support_role() = 'manager' and state = 'published'));
drop policy if exists support_daily_updates_write on support_daily_updates;
create policy support_daily_updates_write on support_daily_updates for all to authenticated
  using (support_is_admin() or developer_id in (select d.id from support_developers d where d.user_id = support_uid()))
  with check (support_is_admin() or developer_id in (select d.id from support_developers d where d.user_id = support_uid()));

-- ---------------------------------------------------------------- storage
-- Private bucket; no storage policies are created. Files are written and read only
-- by server code (service role) after a ticket access check.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('support_attachments', 'support_attachments', false, 5242880,
            array['image/png','image/jpeg','image/gif','image/webp','application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
