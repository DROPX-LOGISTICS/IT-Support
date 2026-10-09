-- IT Support, phase 6: board, summary, targets, reminders, auto-close, Calendar/Sheets. Only support_ objects. Safe to re-run.

alter table support_events drop constraint if exists support_events_event_type_check;
alter table support_events add constraint support_events_event_type_check check (event_type in (
  'created','status_changed','assigned','priority_changed','expected_date_changed',
  'viability_set','commented','attachment_added','confirmed','reopened',
  'meet_scheduled','email_sent','email_failed','update_posted','daily_update_published',
  'auto_closed','reminder_sent','meet_cancelled'));

-- Reminder sent once per wait for confirmation; cleared when the ticket leaves "Done".
alter table support_tickets add column if not exists reminded_at timestamptz;
alter table support_settings add column if not exists reminder_days int not null default 3 check (reminder_days between 1 and 30);
alter table support_settings add column if not exists auto_close_days int not null default 7 check (auto_close_days between 1 and 60);

-- A ticket marked Done again after a reopen must be reminded again.
create or replace function support_clear_reminder() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status <> 'Done – awaiting confirmation' then new.reminded_at := null; end if;
  return new;
end $$;
drop trigger if exists support_tickets_clear_reminder on support_tickets;
create trigger support_tickets_clear_reminder before update on support_tickets
  for each row execute function support_clear_reminder();

-- Manual save now also forgets a calendar event id when the link is removed.
create or replace function support_save_meet(p_ticket uuid, p_link text, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user support_users := support_actor();
  t support_tickets;
  v_link text := nullif(trim(coalesce(p_link, '')), '');
begin
  if v_user.id is null or v_user.role not in ('developer','admin') then raise exception 'Not allowed'; end if;
  select * into t from support_tickets where id = p_ticket and deleted_at is null for update;
  if t.id is null then raise exception 'Ticket not found'; end if;
  if t.status = 'Closed' then raise exception 'This ticket is closed'; end if;
  if v_link is not null and v_link !~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$' then
    raise exception 'Enter a Google Meet link';
  end if;
  update support_tickets set meet_link = v_link, meet_at = case when v_link is null then null else p_at end,
         meet_event_id = case when v_link is null then null else meet_event_id end,
         first_response_at = coalesce(first_response_at, now())
   where id = p_ticket;
  if v_link is not null then
    insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
    values (p_ticket, v_user.id, v_user.name, 'meet_scheduled',
            coalesce(to_char(p_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST', 'time not set'));
  end if;
end $$;

-- A session created or moved through the Calendar API: stores the event id with the link and time.
create or replace function support_save_meet_event(p_ticket uuid, p_event_id text, p_link text, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare v_user support_users := support_actor(); t support_tickets;
begin
  if v_user.id is null or v_user.role not in ('developer','admin') then raise exception 'Not allowed'; end if;
  select * into t from support_tickets where id = p_ticket and deleted_at is null for update;
  if t.id is null then raise exception 'Ticket not found'; end if;
  if t.status = 'Closed' then raise exception 'This ticket is closed'; end if;
  if p_link !~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}$' then raise exception 'Enter a Google Meet link'; end if;
  if nullif(trim(coalesce(p_event_id, '')), '') is null then raise exception 'Missing calendar event'; end if;
  update support_tickets set meet_event_id = p_event_id, meet_link = p_link, meet_at = p_at,
         first_response_at = coalesce(first_response_at, now())
   where id = p_ticket;
  insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
  values (p_ticket, v_user.id, v_user.name, 'meet_scheduled', to_char(p_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST');
end $$;

revoke all on function support_save_meet(uuid,text,timestamptz) from public, anon;
revoke all on function support_save_meet_event(uuid,text,text,timestamptz) from public, anon;
grant execute on function support_save_meet(uuid,text,timestamptz) to authenticated;
grant execute on function support_save_meet_event(uuid,text,text,timestamptz) to authenticated;
