-- 002 T001: vehicles.fuel_type (002 FR-001, SC-003).
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f7', 'fuel@test.dev');

-- SC-003: a vehicle that existed before the migration reads back as gasoline.
-- Recreate the pre-002 table shape, insert an "old" row, then apply the migration file itself.
alter table public.vehicles drop column if exists fuel_type;
insert into public.vehicles (id, user_id, year, make, model)
  values ('f7f7f7f7-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f7', 2009, 'Toyota', 'Prius');
\i migrations/20261125000001_vehicle_fuel_type.sql
select tests.ok((select fuel_type from public.vehicles where id = 'f7f7f7f7-0000-0000-0000-000000000001') = 'gasoline',
  'a vehicle that existed before the migration reads back as gasoline');

select tests.login('00000000-0000-0000-0000-0000000000f7');

-- old app versions that don't send fuel_type keep working
insert into public.vehicles (id, year, make, model) values ('f7f7f7f7-0000-0000-0000-000000000002', 2015, 'Honda', 'Fit');
select tests.ok((select fuel_type from public.vehicles where id = 'f7f7f7f7-0000-0000-0000-000000000002') = 'gasoline',
  'an insert without fuel_type defaults to gasoline');

-- every allowed value is accepted
insert into public.vehicles (year, make, model, fuel_type)
  select 2020, 'Test', v, v from unnest(array['gasoline', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'flex', 'other']) as v;
select tests.ok((select count(distinct fuel_type) from public.vehicles where make = 'Test') = 7,
  'all seven fuel types are accepted');

-- the user can correct it
update public.vehicles set fuel_type = 'hybrid' where id = 'f7f7f7f7-0000-0000-0000-000000000001';
select tests.ok((select fuel_type from public.vehicles where id = 'f7f7f7f7-0000-0000-0000-000000000001') = 'hybrid',
  'the owner can change the fuel type');

select tests.throws_code($$insert into public.vehicles (year, make, model, fuel_type) values (2020, 'Toyota', 'Mirai', 'hydrogen')$$,
  '23514', 'an unknown fuel type is rejected');
select tests.throws_code($$update public.vehicles set fuel_type = null where id = 'f7f7f7f7-0000-0000-0000-000000000002'$$,
  '23502', 'fuel type cannot be NULL');

rollback;
