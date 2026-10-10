-- IT Support, phase 7: close two gaps found by the database tests. Only support_ objects. Safe to re-run.

-- Every ticket change goes through a database function (status flow, confirmation, update, Meet, attachments).
-- A direct table update by a developer would skip those rules (for example closing without the reporter's
-- confirmation), so there is no direct update policy on tickets any more.
drop policy if exists support_tickets_update on support_tickets;

-- Comments are likewise added only through support_add_comment, which also writes the history entry and the first-response time.
drop policy if exists support_comments_insert on support_comments;

-- Raising a ticket with a missing type or priority now gets the same clear message as a wrong one (a null slipped past the check).
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
  if p_type is null or p_type not in ('bug','feature','support') then raise exception 'Choose a ticket type'; end if;
  if p_priority is null or p_priority not in ('P0','P1','P2','P3') then raise exception 'Choose a priority'; end if;
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
revoke all on function support_create_ticket(text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function support_create_ticket(text,text,text,text,text,text,text,text,text) to authenticated;

-- The link check used a repetition count above PostgreSQL's limit (255), so saving any ticket with a link failed.
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
    if exists (select 1 from unnest(v_links) u where u !~ '^https?://[^[:space:]]+$' or char_length(u) > 2000) then raise exception 'Links must start with http:// or https://'; end if;
    update support_tickets set links = v_links where id = p_ticket;
  end if;

  update support_tickets set first_response_at = coalesce(first_response_at, now()) where id = p_ticket;
end $$;
revoke all on function support_update_ticket(uuid,jsonb) from public, anon;
grant execute on function support_update_ticket(uuid,jsonb) to authenticated;
