-- T099: partial changes must be sent as UPDATE, not upsert.
-- PostgREST's upsert is INSERT ... ON CONFLICT (id) DO UPDATE. Postgres checks NOT NULL
-- on the proposed INSERT row before it looks for a conflict, so a payload with only a few
-- columns fails with 23502 even when the row already exists. A plain UPDATE succeeds.
-- The statements below are what the outbox executor sends through PostgREST.
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd@test.dev');
select tests.login('00000000-0000-0000-0000-0000000000d1');
insert into public.vehicles (id, year, make, model)
  values ('dddddddd-0000-0000-0000-000000000001', 2009, 'Toyota', 'Prius');
insert into public.odometer_readings (id, vehicle_id, value, read_on)
  values ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-000000000001', 1000, '2026-01-01');

-- vehicles: archive / unarchive
select tests.throws_code($$
  insert into public.vehicles (id, status, archived_at)
  values ('dddddddd-0000-0000-0000-000000000001', 'archived', now())
  on conflict (id) do update set status = excluded.status, archived_at = excluded.archived_at
$$, '23502', 'partial upsert that archives an existing vehicle fails NOT NULL (23502)');

update public.vehicles set status = 'archived', archived_at = now()
  where id = 'dddddddd-0000-0000-0000-000000000001';
select tests.ok(
  (select status = 'archived' and archived_at is not null and make = 'Toyota' and model = 'Prius'
     from public.vehicles where id = 'dddddddd-0000-0000-0000-000000000001'),
  'partial update archives the vehicle and keeps the other columns');

update public.vehicles set status = 'active', archived_at = null
  where id = 'dddddddd-0000-0000-0000-000000000001';
select tests.ok(
  (select status = 'active' and archived_at is null
     from public.vehicles where id = 'dddddddd-0000-0000-0000-000000000001'),
  'partial update unarchives the vehicle');

-- odometer_readings: exclude
-- As the API role the INSERT half fails RLS first: vehicle_id is null, so the ownership
-- WITH CHECK fails (42501) before NOT NULL is reached. Either way the upsert never succeeds.
select tests.throws_code($$
  insert into public.odometer_readings (id, is_excluded)
  values ('dddddddd-0000-0000-0000-0000000000a1', true)
  on conflict (id) do update set is_excluded = excluded.is_excluded
$$, '42501', 'partial upsert that excludes an existing odometer reading fails as the API role (RLS, 42501)');
reset role;
select tests.throws_code($$
  insert into public.odometer_readings (id, is_excluded)
  values ('dddddddd-0000-0000-0000-0000000000a1', true)
  on conflict (id) do update set is_excluded = excluded.is_excluded
$$, '23502', 'without RLS the same partial upsert fails NOT NULL (23502)');
select tests.login('00000000-0000-0000-0000-0000000000d1');

update public.odometer_readings set is_excluded = true
  where id = 'dddddddd-0000-0000-0000-0000000000a1';
select tests.ok(
  (select is_excluded and value = 1000
     from public.odometer_readings where id = 'dddddddd-0000-0000-0000-0000000000a1'),
  'partial update excludes the reading and keeps its value');

rollback;
