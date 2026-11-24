-- T009: data integrity rules (data-model.md "Validation rules") and save_record behavior.
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@test.dev');
select tests.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') = 1,
  'a profile row is created automatically for a new user');

select tests.login('00000000-0000-0000-0000-0000000000c1');
insert into public.vehicles (id, year, make, model) values ('cccccccc-0000-0000-0000-000000000001', 2009, 'Toyota', 'Prius');

-- vehicles
select tests.throws($$insert into public.vehicles (year, make, model, vin) values (2009, 'Toyota', 'Prius', 'JTDKB20U09347543I')$$,
  'VIN with letter I is rejected');
select tests.throws($$insert into public.vehicles (year, make, model, vin) values (2009, 'Toyota', 'Prius', 'SHORT')$$,
  'VIN must be 17 characters');
select tests.throws($$insert into public.vehicles (year, make, model) values (1900, 'Ford', 'T')$$,
  'year before 1950 is rejected');
select tests.throws($$update public.vehicles set status = 'archived' where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'archived vehicle needs archived_at');

-- records
select tests.throws($$insert into public.service_records (vehicle_id, kind, category, title, performed_on, subtotal_cents, tax_cents, total_cents)
  values ('cccccccc-0000-0000-0000-000000000001', 'service', 'oil_change', 'x', '2026-01-01', 1000, 100, 1200)$$,
  'total must equal subtotal + tax');
select tests.throws($$insert into public.service_records (vehicle_id, kind, category, title, performed_on)
  values ('cccccccc-0000-0000-0000-000000000001', 'service', 'fuel', 'x', '2026-01-01')$$,
  'expense category cannot be used on a service record');
select tests.throws($$insert into public.service_records (vehicle_id, kind, category, title, performed_on)
  values ('cccccccc-0000-0000-0000-000000000001', 'expense', 'fuel', 'x', current_date + 10)$$,
  'record date cannot be in the future');

-- rules
select tests.throws($$insert into public.maintenance_rules (vehicle_id, name, service_category) values ('cccccccc-0000-0000-0000-000000000001', 'x', 'oil_change')$$,
  'rule needs at least one interval');

-- save_record: subtotal derived from items, total = subtotal + tax
select (public.save_record(
  '{"id":"cccccccc-0000-0000-0000-0000000000f1","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"Oil change + rotation","performed_on":"2026-06-01","odometer":150000,"tax_cents":312,"shop_name":"Joe''s Auto"}',
  '[{"item_type":"part","description":"5W-30 synthetic","quantity":5,"unit_price_cents":899,"amount_cents":4495},
    {"item_type":"labor","description":"Labor","quantity":1,"unit_price_cents":2500,"amount_cents":2500},
    {"item_type":"discount","description":"Coupon","quantity":1,"unit_price_cents":-500,"amount_cents":-500}]'
)).id;
select tests.ok((select subtotal_cents from public.service_records where id = 'cccccccc-0000-0000-0000-0000000000f1') = 6495,
  'save_record computes subtotal from line items (4495 + 2500 - 500)');
select tests.ok((select total_cents from public.service_records where id = 'cccccccc-0000-0000-0000-0000000000f1') = 6807,
  'save_record sets total = subtotal + tax');
select tests.ok((select count(*) from public.line_items where record_id = 'cccccccc-0000-0000-0000-0000000000f1') = 3,
  'save_record stores line items');
select tests.ok((select value from public.odometer_readings where record_id = 'cccccccc-0000-0000-0000-0000000000f1') = 150000,
  'save_record adds a linked odometer reading (FR-009)');

-- idempotent: same id again (offline retry) → still one record, items replaced not duplicated
select (public.save_record(
  '{"id":"cccccccc-0000-0000-0000-0000000000f1","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"Oil change","performed_on":"2026-06-01","odometer":150100,"tax_cents":0}',
  '[{"item_type":"part","description":"Oil","quantity":1,"unit_price_cents":4999,"amount_cents":4999}]'
)).id;
select tests.ok((select count(*) from public.service_records) = 1, 'retrying save_record does not duplicate the record');
select tests.ok((select count(*) from public.line_items) = 1, 'retrying save_record replaces line items');
select tests.ok((select count(*) from public.odometer_readings) = 1 and (select max(value) from public.odometer_readings) = 150100,
  'retrying save_record updates, not duplicates, the linked reading');

-- validation inside save_record
select tests.throws($$select public.save_record('{"id":"cccccccc-0000-0000-0000-0000000000f2","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"repair","title":"x","performed_on":"2026-01-01"}',
  '[{"item_type":"part","description":"x","quantity":2,"unit_price_cents":1000,"amount_cents":1500}]')$$,
  'save_record rejects amount != quantity × unit price');
select tests.throws($$select public.save_record('{"id":"cccccccc-0000-0000-0000-0000000000f3","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"repair","title":"x","performed_on":"2026-01-01","subtotal_cents":999}',
  '[{"item_type":"part","description":"x","quantity":1,"unit_price_cents":1000,"amount_cents":1000}]')$$,
  'save_record rejects a subtotal that disagrees with line items');
select tests.throws($$select public.save_record('{"id":"cccccccc-0000-0000-0000-0000000000f4","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"repair","title":"x","performed_on":"2026-01-01"}',
  '[{"item_type":"part","description":"Refund","quantity":1,"unit_price_cents":-1000,"amount_cents":-1000}]')$$,
  'only discount lines may be negative');

-- FR-022: logging an oil change resets the oil rule
insert into public.maintenance_rules (id, vehicle_id, name, service_category, interval_miles, interval_months, last_done_on, last_done_odometer)
values ('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001', 'Oil', 'oil_change', 5000, 6, '2026-01-01', 145000);
select (public.save_record(
  '{"id":"cccccccc-0000-0000-0000-0000000000f5","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"Oil change","performed_on":"2026-11-01","odometer":155200}',
  '[]'
)).id;
select tests.ok((select last_done_on from public.maintenance_rules where id = 'cccccccc-0000-0000-0000-0000000000a1') = '2026-11-01'
  and (select last_done_odometer from public.maintenance_rules where id = 'cccccccc-0000-0000-0000-0000000000a1') = 155200,
  'saving a matching service resets the rule (FR-022)');
-- an older back-dated record must not move the rule backwards
select (public.save_record(
  '{"id":"cccccccc-0000-0000-0000-0000000000f6","vehicle_id":"cccccccc-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"Old oil change","performed_on":"2025-05-01","odometer":140000}',
  '[]'
)).id;
select tests.ok((select last_done_on from public.maintenance_rules where id = 'cccccccc-0000-0000-0000-0000000000a1') = '2026-11-01',
  'back-dated records do not reset a rule to an older date');

-- share-link tokens are 43-char url-safe and unique
insert into public.share_links (vehicle_id) values ('cccccccc-0000-0000-0000-000000000001'), ('cccccccc-0000-0000-0000-000000000001');
select tests.ok((select bool_and(token ~ '^[A-Za-z0-9_-]{43}$') from public.share_links), 'share tokens are 43-char base64url');
select tests.ok((select count(distinct token) = count(*) from public.share_links), 'share tokens are unique');
reset role;

-- quota (service role path)
set local role service_role;
select tests.ok(public.consume_scan('00000000-0000-0000-0000-0000000000c1', 2), 'scan 1 of 2 allowed');
select tests.ok(public.consume_scan('00000000-0000-0000-0000-0000000000c1', 2), 'scan 2 of 2 allowed');
select tests.ok(not public.consume_scan('00000000-0000-0000-0000-0000000000c1', 2), 'scan 3 of 2 refused');
select public.refund_scan('00000000-0000-0000-0000-0000000000c1');
select tests.ok(public.consume_scan('00000000-0000-0000-0000-0000000000c1', 2), 'refund gives one scan back');
select tests.ok(public.consume_scan('00000000-0000-0000-0000-0000000000c1', null), 'null limit means unlimited (Pro fair use handled by limit value)');
reset role;

-- account deletion cascades everything (US6)
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c1';
select tests.ok((select count(*) from public.vehicles) + (select count(*) from public.service_records)
  + (select count(*) from public.line_items) + (select count(*) from public.odometer_readings)
  + (select count(*) from public.maintenance_rules) + (select count(*) from public.share_links)
  + (select count(*) from public.usage_counters) + (select count(*) from public.profiles) = 0,
  'deleting the auth user removes all of their rows');

rollback;
