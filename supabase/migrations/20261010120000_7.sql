-- IT Support, phase 8: two access gaps found in review. Only support_ objects. Safe to re-run.

-- A ticket with no linked reporter (one imported from the sheet) made "is this the reporter?" come out as
-- unknown instead of no, and both checks below let unknown through: any signed-in person, a reporter or a
-- manager included, could confirm or reopen such a ticket without a reason. Unknown now counts as no.
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
  v_self := coalesce(t.reporter_id = v_user.id, false);
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
revoke all on function support_confirm_ticket(uuid,boolean,text) from public, anon;
grant execute on function support_confirm_ticket(uuid,boolean,text) to authenticated;

-- Reporters never see internal notes; their history no longer shows that one was added either.
drop policy if exists support_events_select on support_events;
create policy support_events_select on support_events for select to authenticated
  using (support_can_see_ticket(ticket_id)
         and (support_is_staff()
              or (event_type not in ('email_sent','email_failed')
                  and not (event_type = 'commented' and new_value is not distinct from 'internal note'))));
