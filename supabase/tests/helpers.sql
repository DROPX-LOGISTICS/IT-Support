-- Test helpers (schema t). Not part of the product.
create schema if not exists t;
create or replace function t.u(p_who text) returns uuid language sql immutable as $$
  select (case p_who when 'ra' then 'a0000000-0000-4000-8000-000000000001' when 'rb' then 'a0000000-0000-4000-8000-000000000002'
    when 'd1' then 'a0000000-0000-4000-8000-000000000003' when 'd2' then 'a0000000-0000-4000-8000-000000000004'
    when 'mg' then 'a0000000-0000-4000-8000-000000000005' when 'ad' then 'a0000000-0000-4000-8000-000000000006'
    when 'ox' then 'a0000000-0000-4000-8000-000000000009' end)::uuid $$;
create schema if not exists t;
grant usage on schema t to anon, authenticated, service_role;
create table if not exists t.ids (name text primary key, id uuid);
grant select, insert on t.ids to anon, authenticated, service_role;

create or replace function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'ASSERTION FAILED: %', p_msg; end if; end $$;

-- Act as a signed-in person (what Supabase does from the JWT), as the "authenticated" role.
create or replace function t.as_user(p_sub uuid, p_email text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'email', p_email)::text, true);
  set local role authenticated;
end $$;
create or replace function t.as_anon() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true); set local role anon; end $$;
create or replace function t.as_root() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true); end $$;

-- The statement must fail with a message matching the pattern.
create or replace function t.fails(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then return; end if;
    raise exception 'ASSERTION FAILED: expected error /%/ but got "%" for: %', p_pattern, sqlerrm, p_sql;
  end;
  raise exception 'ASSERTION FAILED: expected error /%/ but it succeeded: %', p_pattern, p_sql;
end $$;

-- The statement must succeed and affect exactly p_rows rows.
create or replace function t.affects(p_sql text, p_rows int) returns void language plpgsql as $$
declare n int;
begin execute p_sql; get diagnostics n = row_count;
  if n <> p_rows then raise exception 'ASSERTION FAILED: expected % row(s) changed, got %: %', p_rows, n, p_sql; end if; end $$;

create or replace function t.count(p_sql text) returns int language plpgsql as $$ declare n int; begin execute 'select count(*) from (' || p_sql || ') q' into n; return n; end $$;
create or replace function t.tid(p_number text) returns uuid language sql stable as $$ select id from t.ids where name = p_number $$;
grant execute on all functions in schema t to anon, authenticated, service_role;
