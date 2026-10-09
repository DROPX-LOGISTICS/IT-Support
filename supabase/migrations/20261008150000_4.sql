-- IT Support, phase 4: save the Meet session on a ticket. Only support_ objects. Safe to re-run.

-- Developers and admins record the Meet link and time after scheduling in Google Calendar.
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
         first_response_at = coalesce(first_response_at, now())
   where id = p_ticket;
  if v_link is not null then
    insert into support_events (ticket_id, actor_id, actor_name, event_type, new_value)
    values (p_ticket, v_user.id, v_user.name, 'meet_scheduled',
            coalesce(to_char(p_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI') || ' IST', 'time not set'));
  end if;
end $$;
revoke all on function support_save_meet(uuid,text,timestamptz) from public, anon;
grant execute on function support_save_meet(uuid,text,timestamptz) to authenticated;
