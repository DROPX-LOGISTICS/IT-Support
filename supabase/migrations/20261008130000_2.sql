-- IT Support, phase 2: working the queue. Only support_ objects. Safe to re-run.

-- One extra history event type for developer updates (spec list + 'update_posted').
alter table support_events drop constraint if exists support_events_event_type_check;
alter table support_events add constraint support_events_event_type_check check (event_type in (
  'created','status_changed','assigned','priority_changed','expected_date_changed',
  'viability_set','commented','attachment_added','confirmed','reopened',
  'meet_scheduled','email_sent','email_failed','update_posted'));

create or replace function support_actor() returns support_users
language sql stable security definer set search_path = public as $$
  select * from support_users where auth_user_id = auth.uid() and is_active limit 1
$$;

-- Developers and admins: allowed moves, with the status the person saw (stale guard).
create or replace function support_change_status(
  p_ticket uuid, p_expected text, p_new text, p_reason text, p_update text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user support_users := support_actor();
  t support_tickets;
  v_ok boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_update text := nullif(trim(coalesce(p_update, '')), '');
  v_done constant text := 'Done – awaiting confirmation';
begin
  if v_user.id is null or v_user.role not in ('developer','admin') then raise exception 'Not allowed'; end if;
  select * into t from support_tickets where id = p_ticket and deleted_at is null for update;
  if t.id is null then raise exception 'Ticket not found'; end if;
  if t.status <> p_expected then raise exception 'STALE'; end if;

  v_ok := case
    when t.status = 'New' and t.type = 'feature' then p_new = 'Viable check'
    when t.status = 'New' then p_new = 'In progress'
    when t.status = 'Viable check' then p_new in ('In progress','Not viable')
    when t.status = 'In progress' then p_new in ('Blocked', v_done)
    when t.status = 'Blocked' then p_new = 'In progress'
    when t.status = 'Reopened' then p_new in ('In progress','Blocked')
    else false end;
  if not coalesce(v_ok, false) then raise exception 'That status change is not allowed'; end if;
  if p_new = 'Blocked' and v_reason is null then raise exception 'A reason is required'; end if;
  if p_new = 'Not viable' and v_reason is null then raise exception 'A reason is required'; end if;
  if p_new = v_done and coalesce(v_update, nullif(trim(coalesce(t.developer_update, '')), '')) is null then
    raise exception 'A developer update is required';
  end if;

  update support_tickets set
    status = p_new,
    developer_update = coalesce(v_update, developer_update),
    viable = case when p_new = 'Not viable' then 'no' when p_new = 'In progress' and t.status = 'Viable check' and viable is null then 'yes' else viable end,
    viable_reason = case when p_new = 'Not viable' then v_reason else viable_reason end,
    done_at = case when p_new = v_done then now() else done_at end,
    confirmed_working = case when p_new = v_done then null else confirmed_working end,
    first_response_at = coalesce(first_response_at, now())
  where id = p_ticket;
  insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value, reason)
  values (p_ticket, v_user.id, v_user.name, 'status_changed', t.status, p_new, v_reason);
  if v_update is not null and v_update is distinct from t.developer_update then
    insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
    values (p_ticket, v_user.id, v_user.name, 'update_posted', left(v_update, 500));
  end if;
  return p_new;
end $$;

-- Developers and admins: assignee, priority, expected date, viability, update, links.
-- Only the keys present in p_patch are changed. Every change writes an event.
create or replace function support_update_ticket(p_ticket uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user support_users := support_actor();
  t support_tickets;
  v_assignee support_users;
  v_old_name text;
  v_links text[];
  v_new uuid; v_prio text; v_date date; v_viable text; v_reason text; v_update text;
begin
  if v_user.id is null or v_user.role not in ('developer','admin') then raise exception 'Not allowed'; end if;
  select * into t from support_tickets where id = p_ticket and deleted_at is null for update;
  if t.id is null then raise exception 'Ticket not found'; end if;
  if t.status in ('Closed','Not viable') then raise exception 'This ticket is closed'; end if;

  if p_patch ? 'assignee_id' then
    v_new := nullif(p_patch ->> 'assignee_id', '')::uuid;
    if v_new is distinct from t.assignee_id then
      if v_new is not null then
        select * into v_assignee from support_users where id = v_new and is_active and role in ('developer','admin');
        if v_assignee.id is null then raise exception 'Choose a developer'; end if;
      end if;
      select name into v_old_name from support_users where id = t.assignee_id;
      update support_tickets set assignee_id = v_new where id = p_ticket;
      insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value)
      values (p_ticket, v_user.id, v_user.name, 'assigned', v_old_name, v_assignee.name);
    end if;
  end if;

  if p_patch ? 'priority' then
    v_prio := p_patch ->> 'priority';
    if v_prio not in ('P0','P1','P2','P3') then raise exception 'Choose a priority'; end if;
    if v_prio <> t.priority then
      update support_tickets set priority = v_prio where id = p_ticket;
      insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value)
      values (p_ticket, v_user.id, v_user.name, 'priority_changed', t.priority, v_prio);
    end if;
  end if;

  if p_patch ? 'expected_date' then
    v_date := nullif(p_patch ->> 'expected_date', '')::date;
    if v_date is distinct from t.expected_date then
      update support_tickets set expected_date = v_date where id = p_ticket;
      insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value)
      values (p_ticket, v_user.id, v_user.name, 'expected_date_changed', t.expected_date::text, v_date::text);
    end if;
  end if;

  if p_patch ? 'viable' then
    if t.type <> 'feature' then raise exception 'Viability applies to feature requests only'; end if;
    v_viable := nullif(p_patch ->> 'viable', '');
    v_reason := nullif(trim(coalesce(p_patch ->> 'viable_reason', '')), '');
    if v_viable is not null and v_viable <> 'yes' and v_reason is null then raise exception 'A reason is required'; end if;
    if v_viable is distinct from t.viable or v_reason is distinct from t.viable_reason then
      update support_tickets set viable = v_viable, viable_reason = v_reason where id = p_ticket;
      insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value, reason)
      values (p_ticket, v_user.id, v_user.name, 'viability_set', t.viable, v_viable, v_reason);
    end if;
  end if;

  if p_patch ? 'developer_update' then
    v_update := nullif(trim(coalesce(p_patch ->> 'developer_update', '')), '');
    if v_update is distinct from t.developer_update then
      update support_tickets set developer_update = v_update where id = p_ticket;
      insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
      values (p_ticket, v_user.id, v_user.name, 'update_posted', left(coalesce(v_update, '(cleared)'), 500));
    end if;
  end if;

  if p_patch ? 'links' then
    select coalesce(array_agg(l), '{}') into v_links from jsonb_array_elements_text(p_patch -> 'links') l;
    if exists (select 1 from unnest(v_links) u where u !~ '^https?://[^\s]{1,2000}$') then raise exception 'Links must start with http:// or https://'; end if;
    update support_tickets set links = v_links where id = p_ticket;
  end if;

  update support_tickets set first_response_at = coalesce(first_response_at, now()) where id = p_ticket;
end $$;

-- Reporter confirmation. The reporter confirms or reopens; a developer may act with a recorded reason.
create or replace function support_confirm_ticket(p_ticket uuid, p_works boolean, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user support_users := support_actor();
  t support_tickets;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_self boolean;
begin
  if v_user.id is null then raise exception 'Not allowed'; end if;
  select * into t from support_tickets where id = p_ticket and deleted_at is null for update;
  if t.id is null then raise exception 'Ticket not found'; end if;
  v_self := t.reporter_id = v_user.id;
  if not v_self and v_user.role not in ('developer','admin') then raise exception 'Not allowed'; end if;
  if t.status <> 'Done – awaiting confirmation' then raise exception 'STALE'; end if;
  if not v_self and v_reason is null then raise exception 'A reason is required'; end if;

  if p_works then
    update support_tickets set status = 'Closed', confirmed_working = 'yes', confirmed_at = now(), closed_at = now() where id = p_ticket;
    insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value, reason)
    values (p_ticket, v_user.id, v_user.name, 'confirmed', t.status, case when v_self then 'yes' else 'yes (on behalf of reporter)' end, v_reason);
    return 'Closed';
  end if;
  if v_reason is null then raise exception 'Please tell us what still fails'; end if;
  update support_tickets set status = 'Reopened', confirmed_working = 'no', confirmed_at = now(), reopen_count = reopen_count + 1 where id = p_ticket;
  insert into support_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value, reason)
  values (p_ticket, v_user.id, v_user.name, 'reopened', t.status, case when v_self then 'Reopened' else 'Reopened (on behalf of reporter)' end, v_reason);
  return 'Reopened';
end $$;

create or replace function support_add_comment(p_ticket uuid, p_body text, p_internal boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user support_users := support_actor(); t support_tickets; v_id uuid; v_body text := trim(coalesce(p_body, ''));
begin
  if v_user.id is null or not support_can_see_ticket(p_ticket) then raise exception 'Not allowed'; end if;
  if char_length(v_body) not between 1 and 5000 then raise exception 'Write a comment of up to 5000 characters'; end if;
  if coalesce(p_internal, false) and v_user.role = 'reporter' then raise exception 'Not allowed'; end if;
  select * into t from support_tickets where id = p_ticket;
  if t.status = 'Closed' then raise exception 'This ticket is closed'; end if;
  insert into support_comments (ticket_id, author_id, author_name, body, internal)
  values (p_ticket, v_user.id, v_user.name, v_body, coalesce(p_internal, false)) returning support_comments.id into v_id;
  insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
  values (p_ticket, v_user.id, v_user.name, 'commented', case when coalesce(p_internal, false) then 'internal note' else 'comment' end);
  if v_user.role <> 'reporter' and not coalesce(p_internal, false) then
    update support_tickets set first_response_at = coalesce(first_response_at, now()) where id = p_ticket;
  end if;
  return v_id;
end $$;

revoke all on function support_actor() from public, anon;
revoke all on function support_change_status(uuid,text,text,text,text) from public, anon;
revoke all on function support_update_ticket(uuid,jsonb) from public, anon;
revoke all on function support_confirm_ticket(uuid,boolean,text) from public, anon;
revoke all on function support_add_comment(uuid,text,boolean) from public, anon;
grant execute on function support_actor() to authenticated;
grant execute on function support_change_status(uuid,text,text,text,text) to authenticated;
grant execute on function support_update_ticket(uuid,jsonb) to authenticated;
grant execute on function support_confirm_ticket(uuid,boolean,text) to authenticated;
grant execute on function support_add_comment(uuid,text,boolean) to authenticated;

-- Reporters never see email delivery events in history.
drop policy if exists support_events_select on support_events;
create policy support_events_select on support_events for select to authenticated
  using (support_can_see_ticket(ticket_id)
         and (support_is_staff() or event_type not in ('email_sent','email_failed')));
