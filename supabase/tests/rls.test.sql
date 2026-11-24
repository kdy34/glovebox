-- T008: Row-level security. User A must never see or change user B's data,
-- and must never attach rows to B's vehicle (constitution IV, FR-004).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

-- B's data (created as B through the API role)
select tests.login('00000000-0000-0000-0000-00000000000b');
insert into public.vehicles (id, year, make, model) values ('bbbbbbbb-0000-0000-0000-000000000001', 2015, 'Honda', 'Civic');
select (public.save_record(
  '{"id":"bbbbbbbb-0000-0000-0000-0000000000f1","vehicle_id":"bbbbbbbb-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"Oil change","performed_on":"2026-10-01","odometer":80000,"tax_cents":0}',
  '[{"item_type":"part","description":"Oil","quantity":1,"unit_price_cents":4999,"amount_cents":4999}]'
)).id is not null as saved;
insert into public.maintenance_rules (vehicle_id, name, service_category, interval_miles) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Oil', 'oil_change', 5000);
insert into public.share_links (vehicle_id) values ('bbbbbbbb-0000-0000-0000-000000000001');
reset role;

-- Now act as A
select tests.login('00000000-0000-0000-0000-00000000000a');

select tests.ok((select count(*) from public.vehicles) = 0, 'A cannot read B''s vehicles');
select tests.ok((select count(*) from public.service_records) = 0, 'A cannot read B''s records');
select tests.ok((select count(*) from public.line_items) = 0, 'A cannot read B''s line items');
select tests.ok((select count(*) from public.odometer_readings) = 0, 'A cannot read B''s odometer readings');
select tests.ok((select count(*) from public.maintenance_rules) = 0, 'A cannot read B''s rules');
select tests.ok((select count(*) from public.share_links) = 0, 'A cannot read B''s share links');
select tests.ok((select count(*) from public.profiles) = 1, 'A sees only their own profile');

-- Updates / deletes on B's rows silently affect 0 rows under RLS
with u as (update public.vehicles set make = 'Hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1)
select tests.ok((select count(*) from u) = 0, 'A cannot update B''s vehicle');
with d as (delete from public.service_records where vehicle_id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1)
select tests.ok((select count(*) from d) = 0, 'A cannot delete B''s records');

-- A cannot impersonate B via user_id, nor attach to B's vehicle
select tests.throws($$insert into public.vehicles (user_id, year, make, model) values ('00000000-0000-0000-0000-00000000000b', 2020, 'X', 'Y')$$,
  'A cannot insert a vehicle owned by B');
select tests.throws($$insert into public.service_records (vehicle_id, kind, category, title, performed_on) values ('bbbbbbbb-0000-0000-0000-000000000001', 'service', 'repair', 'x', '2026-01-01')$$,
  'A cannot add a record to B''s vehicle');
select tests.throws($$insert into public.odometer_readings (vehicle_id, value, read_on) values ('bbbbbbbb-0000-0000-0000-000000000001', 1, '2026-01-01')$$,
  'A cannot add a reading to B''s vehicle');
select tests.throws($$insert into public.share_links (vehicle_id) values ('bbbbbbbb-0000-0000-0000-000000000001')$$,
  'A cannot create a share link for B''s vehicle');
select tests.throws($$insert into public.line_items (record_id, item_type, description, unit_price_cents, amount_cents) values ('bbbbbbbb-0000-0000-0000-0000000000f1', 'part', 'x', 1, 1)$$,
  'A cannot add line items to B''s record');
select tests.throws($$select public.save_record('{"id":"aaaaaaaa-0000-0000-0000-0000000000f9","vehicle_id":"bbbbbbbb-0000-0000-0000-000000000001","kind":"service","category":"repair","title":"x","performed_on":"2026-01-01"}', '[]')$$,
  'A cannot save_record onto B''s vehicle');

-- Server-only tables: clients cannot write
select tests.throws($$insert into public.entitlements (user_id, is_pro) values ('00000000-0000-0000-0000-00000000000a', true)$$,
  'A cannot grant themselves Pro');
select tests.throws($$insert into public.usage_counters (user_id, period, scans) values ('00000000-0000-0000-0000-00000000000a', '2026-11-01', 0)$$,
  'A cannot write usage counters');
select tests.throws($$select public.consume_scan('00000000-0000-0000-0000-00000000000a', 5)$$,
  'A cannot call consume_scan directly');
select tests.throws($$update public.app_config set value = 'false' where key = 'monetization_enabled'$$,
  'A cannot change remote config');
select tests.throws($$update public.share_links set view_count = 999$$,
  'A cannot change share-link view counts');

-- A's own data works end to end
insert into public.vehicles (id, year, make, model, vin) values ('aaaaaaaa-0000-0000-0000-000000000001', 2009, 'Toyota', 'Prius', 'JTDKB20U093475432');
select tests.ok((select count(*) from public.vehicles) = 1, 'A can create and read their own vehicle');
reset role;

-- Storage: A cannot upload into B's folder
insert into storage.buckets (id, name) values ('receipts', 'receipts') on conflict do nothing;
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.throws($$insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-00000000000b/x.jpg')$$,
  'A cannot upload into B''s receipts folder');
insert into storage.objects (bucket_id, name) values ('receipts', '00000000-0000-0000-0000-00000000000a/x.jpg');
select tests.ok((select count(*) from storage.objects) = 1, 'A can upload into and list only their own folder');
reset role;

-- Anonymous callers see nothing but app config
set local role anon;
select tests.throws($$select count(*) from public.vehicles$$, 'anon cannot read vehicles');
select tests.throws($$select count(*) from public.share_links$$, 'anon cannot read share links');
select tests.ok((select count(*) from public.app_config) >= 0, 'anon can read app_config');
reset role;

rollback;
