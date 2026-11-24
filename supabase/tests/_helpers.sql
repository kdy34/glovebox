-- Tiny assertion helpers so tests run with plain psql (no pgTAP needed).
-- Each failed assertion raises, and the runner stops with ON_ERROR_STOP=1.
create schema if not exists tests;

create or replace function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Runs a statement and asserts that it raises (RLS violation, check constraint, etc).
create or replace function tests.throws(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (raised: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (statement did not raise)', msg;
end $$;

-- Runs a statement and asserts that it raises with a specific SQLSTATE (e.g. 23502).
create or replace function tests.throws_code(stmt text, code text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> code then
      raise exception 'FAIL: % (expected SQLSTATE %, got %: %)', msg, code, sqlstate, sqlerrm;
    end if;
    raise notice 'ok - % (raised: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (statement did not raise)', msg;
end $$;

-- Act as a signed-in user, the way PostgREST does for each request.
create or replace function tests.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'postgres', true);
end $$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;
