\set ON_ERROR_STOP 1
\set QUIET 1
-- Fixed identities. All on the company domain except the outsider.

\echo 1. sign-in registration and the domain rule
do $$ begin
  perform t.as_anon();
  perform t.fails($q$select support_register_user('x')$q$, 'permission denied');
  perform t.as_user(t.u('ox'), 'mallory@gmail.com');
  perform t.fails($q$select support_register_user('Mallory')$q$, 'outside the company domain');
  perform t.as_user(t.u('ra'), 'Asha@DropXLogistics.com'); perform support_register_user('Asha');
  perform t.as_user(t.u('rb'), 'bina@dropxlogistics.com'); perform support_register_user('Bina');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com'); perform support_register_user('Dev One');
  perform t.as_user(t.u('d2'), 'dev2@dropxlogistics.com'); perform support_register_user('Dev Two');
  perform t.as_user(t.u('mg'), 'boss@dropxlogistics.com'); perform support_register_user('Boss');
  perform t.as_user(t.u('ad'), 'admin@dropxlogistics.com'); perform support_register_user('Admin');
  perform t.as_root();
  perform t.ok((select count(*) from support_users) = 6, 'six people registered, the outsider was refused');
  perform t.ok((select role from support_users where email = 'asha@dropxlogistics.com') = 'reporter', 'a new person starts as reporter');
  perform t.ok((select email from support_users where name = 'Asha') = 'asha@dropxlogistics.com', 'email stored lower case');
  -- registering again is the same person, and a pre-created row is linked by email
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com'); perform support_register_user('Asha N');
  perform t.as_root();
  perform t.ok((select count(*) from support_users where email = 'asha@dropxlogistics.com') = 1 and (select name from support_users where email = 'asha@dropxlogistics.com') = 'Asha N', 're-registering updates, never duplicates');
  insert into support_users (email, name, role) values ('pre@dropxlogistics.com', 'Pre', 'developer');
  perform t.as_user('a0000000-0000-4000-8000-0000000000aa', 'pre@dropxlogistics.com'); perform support_register_user('Pre Person');
  perform t.as_root();
  perform t.ok((select auth_user_id from support_users where email = 'pre@dropxlogistics.com') = 'a0000000-0000-4000-8000-0000000000aa' and (select role from support_users where email = 'pre@dropxlogistics.com') = 'developer', 'pre-created row is linked and keeps its role');
  delete from support_users where email = 'pre@dropxlogistics.com';
  update support_users set role = 'developer' where email in ('dev1@dropxlogistics.com', 'dev2@dropxlogistics.com');
  update support_users set role = 'manager' where email = 'boss@dropxlogistics.com';
  update support_users set role = 'admin' where email = 'admin@dropxlogistics.com';
end $$;

\echo 2. raising tickets and the numbers
do $$
declare r record; n int;
begin
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  select * into r from support_create_ticket('bug', 'people', 'Payout page blank', 'It is blank', 'Open it', 'P1', 'https://people/x', 'Asha at station', '98765 43210');
  perform t.ok(r.number = 'BUG-001', 'first bug is BUG-001'); insert into t.ids values ('BUG-001', r.id);
  select * into r from support_create_ticket('feature', 'opspulse', 'Dark mode', 'Please', null, 'P3', null, 'Asha', null);
  perform t.ok(r.number = 'FR-001', 'first feature is FR-001'); insert into t.ids values ('FR-001', r.id);
  select * into r from support_create_ticket('support', 'dashboard', 'Need access', 'Please', null, 'P2', null, 'Asha', null);
  perform t.ok(r.number = 'SUP-001', 'first support is SUP-001'); insert into t.ids values ('SUP-001', r.id);
  select * into r from support_create_ticket('bug', 'people', 'Second bug', 'Broken', null, 'P0', null, 'Asha', null);
  perform t.ok(r.number = 'BUG-002', 'second bug is BUG-002'); insert into t.ids values ('BUG-002', r.id);
  perform t.as_user(t.u('rb'), 'bina@dropxlogistics.com');
  select * into r from support_create_ticket('bug', 'people', 'Bina bug', 'Broken', null, 'P2', null, 'Bina', null);
  perform t.ok(r.number = 'BUG-003', 'numbers continue across people'); insert into t.ids values ('BUG-003', r.id);
  -- validation inside the function
  perform t.fails($q$select * from support_create_ticket('idea','people','t','d',null,'P2',null,'n',null)$q$, 'Choose a ticket type');
  perform t.fails($q$select * from support_create_ticket('bug','people','t','d',null,'P9',null,'n',null)$q$, 'Choose a priority');
  perform t.fails($q$select * from support_create_ticket('bug','people','   ','d',null,'P2',null,'n',null)$q$, 'Title must be');
  perform t.fails($q$select * from support_create_ticket('bug','people','t','d',null,'P2',null,'   ',null)$q$, 'name is required');
  perform t.fails($q$select * from support_create_ticket('bug','nowhere','t','d',null,'P2',null,'n',null)$q$, 'Unknown portal');
  perform t.fails($q$select * from support_create_ticket(null,'people','t','d',null,'P2',null,'n',null)$q$, 'Choose a ticket type');
  perform t.fails($q$select * from support_create_ticket('bug','people','t','d',null,null,null,'n',null)$q$, 'Choose a priority');
  perform t.as_root();
  perform t.ok((select last_value from support_ticket_counters where ticket_type = 'bug') = 3, 'a refused raise did not use a number');
  perform t.ok((select raised_by_name from support_tickets where number = 'BUG-001') = 'Asha at station' and (select raised_by_phone from support_tickets where number = 'BUG-001') = '98765 43210', 'raised_by_name and phone stored apart from the Google identity');
  perform t.ok((select reporter_name from support_tickets where number = 'BUG-001') = 'Asha N', 'reporter identity comes from the session, not the form');
  perform t.ok((select count(*) from support_events where event_type = 'created') = 5, 'one created event per ticket');
end $$;

\echo 3. who can see and change what
do $$
declare n int;
begin
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_tickets') = 4, 'a reporter sees only their own 4 tickets');
  perform t.ok(t.count('select 1 from support_events') = 4, 'a reporter sees only history of their own tickets');
  perform t.fails($q$insert into support_tickets (number,type,portal_id,title,description,priority,reporter_name,reporter_email,raised_by_name) select 'BUG-999','bug',id,'x','x','P2','x','x','x' from support_portals limit 1$q$, 'permission denied|row-level security');
  perform t.affects($q$update support_tickets set priority = 'P3' where number = 'BUG-001'$q$, 0);
  perform t.affects($q$delete from support_tickets$q$, 0);
  perform t.fails($q$select * from support_ticket_counters$q$, 'permission denied');
  perform t.fails($q$select support_next_ticket_number('bug')$q$, 'permission denied');
  perform t.ok(t.count('select 1 from support_users') = 1, 'a reporter sees only their own person row');
  perform t.ok(t.count('select 1 from support_settings') = 0, 'settings are for staff');
  perform t.ok(t.count('select 1 from support_portals') = 6, 'every signed-in person can list portals');
  perform t.as_user(t.u('rb'), 'bina@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_tickets') = 1, 'another reporter sees only theirs');
  perform t.ok(t.count($q$select 1 from support_tickets where number = 'BUG-001'$q$) = 0, 'and cannot read someone else''s ticket');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_tickets') = 5, 'a developer sees all tickets');
  perform t.as_user(t.u('mg'), 'boss@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_tickets') = 5, 'a manager sees all tickets');
  perform t.affects($q$update support_tickets set priority = 'P3' where number = 'BUG-001'$q$, 0);
  perform t.ok(t.count('select 1 from support_settings') = 1, 'a manager can read settings');
  perform t.as_user(t.u('ad'), 'admin@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_tickets') = 5, 'an admin sees all tickets');
  perform t.as_anon();
  perform t.fails('select * from support_tickets', 'permission denied');
  perform t.fails('select * from support_users', 'permission denied');
  perform t.fails($q$select * from support_create_ticket('bug','people','t','d',null,'P2',null,'n',null)$q$, 'permission denied');
  perform t.as_root();
  -- roles can only be changed by an admin
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.affects($q$update support_users set role = 'admin' where email = 'dev1@dropxlogistics.com'$q$, 0);
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.affects($q$update support_users set role = 'admin' where email = 'asha@dropxlogistics.com'$q$, 0);
  perform t.as_user(t.u('ad'), 'admin@dropxlogistics.com');
  perform t.affects($q$update support_users set is_active = true where email = 'bina@dropxlogistics.com'$q$, 1);
  perform t.as_root();
end $$;

\echo 4. comments and internal notes
do $$
begin
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform support_add_comment(t.tid('BUG-001'), 'Any news?', false);
  perform t.fails(format($q$select support_add_comment(%L, 'sneaky', true)$q$, t.tid('BUG-001')), 'Not allowed');
  perform t.fails(format($q$insert into support_comments (ticket_id, author_id, author_name, body, internal) select %L, id, name, 'x', true from support_users where email = 'asha@dropxlogistics.com'$q$, t.tid('BUG-001')), 'row-level security|permission denied');
  perform t.as_user(t.u('rb'), 'bina@dropxlogistics.com');
  perform t.fails(format($q$select support_add_comment(%L, 'not mine', false)$q$, t.tid('BUG-001')), 'Not allowed');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform support_add_comment(t.tid('BUG-001'), 'Looking at it', false);
  perform support_add_comment(t.tid('BUG-001'), 'Internal: probably the cache', true);
  perform t.fails(format($q$select support_add_comment(%L, '', false)$q$, t.tid('BUG-001')), 'Write a comment');
  perform t.ok(t.count(format('select 1 from support_comments where ticket_id = %L', t.tid('BUG-001'))) = 3, 'a developer sees public and internal comments');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(t.count(format('select 1 from support_comments where ticket_id = %L', t.tid('BUG-001'))) = 2, 'the reporter never sees internal notes');
  perform t.as_root();
  perform t.ok((select first_response_at is not null from support_tickets where number = 'BUG-001'), 'a public developer comment counts as the first response');
end $$;

\echo 5. the status flow, stale guard and confirmation
do $$
declare s text;
begin
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.ok(support_change_status(t.tid('BUG-001'), 'New', 'In progress', null, null) = 'In progress', 'New to In progress');
  perform t.fails(format($q$select support_change_status(%L, 'New', 'Blocked', 'why', null)$q$, t.tid('BUG-001')), 'STALE');
  perform t.fails(format($q$select support_change_status(%L, 'In progress', 'Closed', null, null)$q$, t.tid('BUG-001')), 'not allowed');
  perform t.fails(format($q$select support_change_status(%L, 'In progress', 'Blocked', '  ', null)$q$, t.tid('BUG-001')), 'reason is required');
  perform t.fails(format($q$select support_change_status(%L, 'In progress', 'Done – awaiting confirmation', null, null)$q$, t.tid('BUG-001')), 'developer update is required');
  perform t.ok(support_change_status(t.tid('BUG-001'), 'In progress', 'Blocked', 'Waiting for access', null) = 'Blocked', 'Blocked with a reason');
  perform t.ok(support_change_status(t.tid('BUG-001'), 'Blocked', 'In progress', null, null) = 'In progress', 'back to In progress');
  perform t.ok(support_change_status(t.tid('BUG-001'), 'In progress', 'Done – awaiting confirmation', null, 'Fixed. Please check the payout page.') = 'Done – awaiting confirmation', 'Done with an update');
  perform t.as_user(t.u('mg'), 'boss@dropxlogistics.com');
  perform t.fails(format($q$select support_change_status(%L, 'Done – awaiting confirmation', 'In progress', null, null)$q$, t.tid('BUG-001')), 'Not allowed');
  perform t.fails(format($q$select support_confirm_ticket(%L, true, null)$q$, t.tid('BUG-001')), 'Not allowed');
  perform t.as_user(t.u('rb'), 'bina@dropxlogistics.com');
  perform t.fails(format($q$select support_confirm_ticket(%L, true, null)$q$, t.tid('BUG-001')), 'Not allowed');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.fails(format($q$select support_confirm_ticket(%L, false, null)$q$, t.tid('BUG-001')), 'tell us what still fails');
  perform t.ok(support_confirm_ticket(t.tid('BUG-001'), false, 'Still blank on mobile') = 'Reopened', 'still broken reopens');
  perform t.as_root();
  perform t.ok((select reopen_count from support_tickets where number = 'BUG-001') = 1 and (select confirmed_working from support_tickets where number = 'BUG-001') = 'no', 'reopen counted');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.ok(support_change_status(t.tid('BUG-001'), 'Reopened', 'In progress', null, null) = 'In progress', 'Reopened to In progress');
  perform t.ok(support_change_status(t.tid('BUG-001'), 'In progress', 'Done – awaiting confirmation', null, null) = 'Done – awaiting confirmation', 'Done again (existing update is enough)');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(support_confirm_ticket(t.tid('BUG-001'), true, null) = 'Closed', 'confirming closes');
  perform t.fails(format($q$select support_confirm_ticket(%L, true, null)$q$, t.tid('BUG-001')), 'STALE');
  perform t.fails(format($q$select support_add_comment(%L, 'late', false)$q$, t.tid('BUG-001')), 'closed');
  perform t.as_root();
  perform t.ok((select status = 'Closed' and confirmed_working = 'yes' and closed_at is not null and confirmed_at is not null from support_tickets where number = 'BUG-001'), 'closed with the confirmation recorded');
  -- a ticket closes only through confirmation: no direct path from In progress
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.fails(format($q$select support_change_status(%L, 'Closed', 'In progress', null, null)$q$, t.tid('BUG-001')), 'not allowed');
  -- nobody, developers included, can write a ticket directly (status, confirmation, anything): only the functions can
  perform t.affects($q$update support_tickets set status = 'Closed' where number = 'BUG-002'$q$, 0);
  perform t.affects($q$update support_tickets set confirmed_working = 'yes' where number = 'BUG-002'$q$, 0);
  perform t.fails(format($q$insert into support_comments (ticket_id, author_id, author_name, body, internal) select %L, id, name, 'direct', false from support_users where email = 'dev1@dropxlogistics.com'$q$, t.tid('BUG-002')), 'row-level security');
  -- features: Viable check first, Not viable needs a reason
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.fails(format($q$select support_change_status(%L, 'New', 'In progress', null, null)$q$, t.tid('FR-001')), 'not allowed');
  perform t.ok(support_change_status(t.tid('FR-001'), 'New', 'Viable check', null, null) = 'Viable check', 'feature goes to Viable check');
  perform t.fails(format($q$select support_change_status(%L, 'Viable check', 'Not viable', null, null)$q$, t.tid('FR-001')), 'reason is required');
  perform t.ok(support_change_status(t.tid('FR-001'), 'Viable check', 'Not viable', 'Not planned this year', null) = 'Not viable', 'Not viable with a reason');
  perform t.as_root();
  perform t.ok((select viable = 'no' and viable_reason = 'Not planned this year' from support_tickets where number = 'FR-001'), 'viability recorded');
  -- a developer may confirm for the reporter only with a reason
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform support_change_status(t.tid('SUP-001'), 'New', 'In progress', null, null);
  perform support_change_status(t.tid('SUP-001'), 'In progress', 'Done – awaiting confirmation', null, 'Access granted.');
  perform t.fails(format($q$select support_confirm_ticket(%L, true, null)$q$, t.tid('SUP-001')), 'reason is required');
  perform t.ok(support_confirm_ticket(t.tid('SUP-001'), true, 'Asha confirmed by phone') = 'Closed', 'developer confirms with a reason');
  perform t.as_root();
  perform t.ok((select new_value from support_events where ticket_id = t.tid('SUP-001') and event_type = 'confirmed') like 'yes (on behalf%' and (select reason from support_events where ticket_id = t.tid('SUP-001') and event_type = 'confirmed') = 'Asha confirmed by phone', 'on-behalf confirmation and its reason are in the history');
end $$;

\echo 6. history cannot be edited, nothing is hard-deleted, email events stay hidden from reporters
do $$
begin
  perform t.as_root();
  perform t.fails($q$update support_events set reason = 'tampered'$q$, 'cannot be changed');
  perform t.fails($q$delete from support_events$q$, 'cannot be changed');
  perform t.fails($q$delete from support_tickets$q$, 'Hard deletes');
  perform t.fails($q$delete from support_comments$q$, 'Hard deletes');
  insert into support_events (ticket_id, actor_name, event_type, new_value, reason) values (t.tid('BUG-001'), 'System', 'email_failed', 'assigned', 'email is not configured');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(t.count($q$select 1 from support_events where event_type in ('email_sent','email_failed')$q$) = 0, 'reporters never see email events');
  perform t.fails($q$insert into support_events (ticket_id, actor_name, event_type) select id, 'x', 'created' from support_tickets limit 1$q$, 'permission denied|row-level security');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.ok(t.count($q$select 1 from support_events where event_type = 'email_failed'$q$) = 1, 'developers see email failures');
  perform t.as_root();
end $$;

\echo 7. updating a ticket: assignee, priority, date, viability, links
do $$
begin
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform support_update_ticket(t.tid('BUG-002'), jsonb_build_object('assignee_id', (select id from support_users where email = 'dev2@dropxlogistics.com'), 'priority', 'P1', 'expected_date', '2026-12-01', 'developer_update', 'We have started', 'links', jsonb_build_array('https://github.com/o/r/pull/1')));
  perform t.fails(format($q$select support_update_ticket(%L, '{"assignee_id": "%s"}')$q$, t.tid('BUG-002'), (select id from support_users where email = 'asha@dropxlogistics.com')), 'Choose a developer');
  perform t.fails(format($q$select support_update_ticket(%L, '{"priority": "P7"}')$q$, t.tid('BUG-002')), 'Choose a priority');
  perform t.fails(format($q$select support_update_ticket(%L, '{"links": ["javascript:alert(1)"]}')$q$, t.tid('BUG-002')), 'Links must start');
  perform t.fails(format($q$select support_update_ticket(%L, '{"viable": "no", "viable_reason": ""}')$q$, t.tid('BUG-002')), 'Viability applies');
  perform t.fails(format($q$select support_update_ticket(%L, '{"viable": "no", "viable_reason": ""}')$q$, t.tid('FR-001')), 'closed');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.fails(format($q$select support_update_ticket(%L, '{"priority": "P3"}')$q$, t.tid('BUG-002')), 'Not allowed');
  perform t.as_user(t.u('mg'), 'boss@dropxlogistics.com');
  perform t.fails(format($q$select support_update_ticket(%L, '{"priority": "P3"}')$q$, t.tid('BUG-002')), 'Not allowed');
  perform t.as_root();
  perform t.ok((select priority = 'P1' and expected_date = '2026-12-01' and developer_update = 'We have started' and assignee_id is not null from support_tickets where number = 'BUG-002'), 'changes applied');
  perform t.ok((select count(*) from support_events where ticket_id = t.tid('BUG-002') and event_type in ('assigned','priority_changed','expected_date_changed','update_posted')) = 4, 'one history entry per change');
end $$;

\echo 8. attachments
do $$
begin
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  for i in 1..5 loop perform support_add_attachment(t.tid('BUG-002'), 'p/' || i || '.png', 'shot' || i || '.png', 'image/png', 1000); end loop;
  perform t.fails(format($q$select support_add_attachment(%L, 'p/6.png', 's6.png', 'image/png', 1000)$q$, t.tid('BUG-002')), 'up to 5');
  perform t.fails(format($q$select support_add_attachment(%L, 'p/x.exe', 'x.exe', 'application/x-msdownload', 1000)$q$, t.tid('BUG-001')), 'check|violates');
  perform t.as_user(t.u('rb'), 'bina@dropxlogistics.com');
  perform t.fails(format($q$select support_add_attachment(%L, 'p/b.png', 'b.png', 'image/png', 1000)$q$, t.tid('BUG-002')), 'Not allowed');
  perform t.ok(t.count('select 1 from support_attachments') = 0, 'another reporter cannot see the files');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_attachments') = 5, 'a developer sees them');
  perform t.as_root();
end $$;

\echo 9. daily updates: own drafts, publishing, managers, one open draft
do $$
declare p uuid; dev1 uuid; dev2 uuid; row1 uuid;
begin
  perform t.as_root();
  select id into p from support_portals where code = 'people';
  insert into support_developers (user_id, display_name) select id, 'Dev One' from support_users where email = 'dev1@dropxlogistics.com' returning id into dev1;
  insert into support_developers (user_id, display_name) select id, 'Dev Two' from support_users where email = 'dev2@dropxlogistics.com' returning id into dev2;
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  insert into support_daily_updates (update_date, developer_id, portal_id, ticket_id, work_done, hours, status, source) values ('2026-10-07', dev1, p, t.tid('BUG-002'), 'Looked at BUG-002.', 3.5, 'In progress', 'manual') returning id into row1;
  perform t.fails(format($q$insert into support_daily_updates (update_date, developer_id, portal_id, work_done) values ('2026-10-07', %L, %L, 'for someone else')$q$, dev2, p), 'row-level security');
  perform t.fails(format($q$insert into support_daily_updates (update_date, developer_id, portal_id, work_done, hours) values ('2026-10-07', %L, %L, 'x', 30)$q$, dev1, p), 'check');
  perform t.as_user(t.u('d2'), 'dev2@dropxlogistics.com');
  perform t.affects(format($q$update support_daily_updates set work_done = 'hijack' where id = %L$q$, row1), 0);
  perform t.fails(format($q$select support_publish_daily_update(%L)$q$, row1), 'Not allowed');
  perform t.as_user(t.u('mg'), 'boss@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_daily_updates') = 0, 'managers see no drafts');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_daily_updates') = 0, 'reporters see no daily updates');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.affects(format($q$update support_daily_updates set work_done = '' where id = %L$q$, row1), 1);
  perform t.fails(format($q$select support_publish_daily_update(%L)$q$, row1), 'Write what was done');
  perform t.affects(format($q$update support_daily_updates set work_done = 'Fixed BUG-002 payout.', status = 'Blocked', blocker = '' where id = %L$q$, row1), 1);
  perform t.fails(format($q$select support_publish_daily_update(%L)$q$, row1), 'Add the blocker');
  perform t.affects(format($q$update support_daily_updates set status = 'Done' where id = %L$q$, row1), 1);
  perform support_publish_daily_update(row1);
  perform t.fails(format($q$select support_publish_daily_update(%L)$q$, row1), 'Already published');
  perform t.affects(format($q$update support_daily_updates set work_done = 'edited after publishing' where id = %L$q$, row1), 0);
  perform t.affects(format($q$delete from support_daily_updates where id = %L$q$, row1), 0);
  perform t.as_user(t.u('mg'), 'boss@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_daily_updates') = 1, 'managers see published updates');
  perform t.as_root();
  perform t.ok((select new_value from support_events where ticket_id = t.tid('BUG-002') and event_type = 'daily_update_published') = 'published', 'ticket history gets a neutral note only');
  -- the job's duplicate protection
  insert into support_daily_updates (update_date, developer_id, portal_id, work_done, source) values ('2026-10-08', dev1, p, 'a', 'commits');
  perform t.fails(format($q$insert into support_daily_updates (update_date, developer_id, portal_id, work_done, source) values ('2026-10-08', %L, %L, 'b', 'commits')$q$, dev1, p), 'duplicate key|unique');
  insert into support_daily_updates (update_date, developer_id, portal_id, work_done, source) values ('2026-10-08', dev1, p, 'manual one', 'manual');
  perform t.ok(t.count($q$select 1 from support_daily_updates where update_date = '2026-10-08'$q$) = 2, 'manual rows are not limited');
end $$;

\echo 10. Meet sessions
do $$
begin
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.fails(format($q$select support_save_meet(%L, 'https://evil.com/abc-defg-hij', now())$q$, t.tid('BUG-002')), 'Google Meet link');
  perform t.fails(format($q$select support_save_meet(%L, 'https://meet.google.com.evil.com/abc-defg-hij', now())$q$, t.tid('BUG-002')), 'Google Meet link');
  perform support_save_meet(t.tid('BUG-002'), 'https://meet.google.com/abc-defg-hij', '2026-10-22T10:00:00Z');
  perform support_save_meet_event(t.tid('BUG-002'), 'evt123', 'https://meet.google.com/abc-defg-hij', '2026-10-22T11:00:00Z');
  perform t.fails(format($q$select support_save_meet_event(%L, '', 'https://meet.google.com/abc-defg-hij', now())$q$, t.tid('BUG-002')), 'Missing calendar event');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(t.count($q$select 1 from support_tickets where number = 'BUG-002' and meet_link is not null$q$) = 1, 'the reporter can see the Meet link');
  perform t.fails(format($q$select support_save_meet(%L, 'https://meet.google.com/abc-defg-hij', now())$q$, t.tid('BUG-002')), 'Not allowed');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform support_save_meet(t.tid('BUG-002'), null, null);
  perform t.as_root();
  perform t.ok((select meet_link is null and meet_event_id is null and meet_at is null from support_tickets where number = 'BUG-002'), 'clearing the link forgets the calendar event');
  perform t.ok(exists (select 1 from support_events where ticket_id = t.tid('BUG-002') and event_type = 'meet_scheduled' and new_value = '22 Oct 2026 16:30 IST'), 'the history shows the time in IST (11:00 UTC is 16:30 IST)');
end $$;

\echo 11. reminder flag and settings
do $$
begin
  perform t.as_root();
  update support_tickets set status = 'Done – awaiting confirmation', reminded_at = now(), done_at = now() where number = 'BUG-003';
  update support_tickets set status = 'Reopened' where number = 'BUG-003';
  perform t.ok((select reminded_at is null from support_tickets where number = 'BUG-003'), 'leaving Done clears the reminder so the next wait is reminded again');
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.affects($q$update support_settings set reminder_days = 5$q$, 0);
  perform t.as_user(t.u('ad'), 'admin@dropxlogistics.com');
  perform t.affects($q$update support_settings set reminder_days = 5, auto_close_days = 9$q$, 1);
  perform t.fails($q$update support_settings set reminder_days = 99$q$, 'check');
  perform t.as_root();
end $$;

\echo 12. master data is admin-only
do $$
begin
  perform t.as_user(t.u('d1'), 'dev1@dropxlogistics.com');
  perform t.fails($q$insert into support_portals (code, name) values ('x1', 'X1')$q$, 'row-level security');
  perform t.fails($q$insert into support_portal_repos (portal_id, repo) select id, 'o/r' from support_portals limit 1$q$, 'row-level security');
  perform t.as_user(t.u('ad'), 'admin@dropxlogistics.com');
  perform t.affects($q$update support_portals set site_url = 'https://ops.example' where code = 'opspulse'$q$, 1);
  perform t.fails($q$insert into support_portal_repos (portal_id, repo) select id, 'not a repo' from support_portals limit 1$q$, 'check');
  perform t.as_user(t.u('ra'), 'asha@dropxlogistics.com');
  perform t.ok(t.count('select 1 from support_unmatched_commits') = 0, 'reporters cannot read unmatched commits');
  perform t.as_root();
end $$;

\echo all database checks passed
