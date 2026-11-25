-- US2 (T055/T057): AI-assisted records keep their audit trail, and a record can only point at
-- the caller's own extraction; the client may update only corrected_fields on an extraction.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'ai-a@test.dev'),
  ('00000000-0000-0000-0000-0000000000d2', 'ai-b@test.dev');
insert into public.vehicles (id, user_id, year, make, model) values
  ('d1d1d1d1-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 2009, 'Toyota', 'Prius'),
  ('d2d2d2d2-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d2', 2015, 'Honda', 'Fit');
insert into public.attachments (id, user_id, vehicle_id, bucket, storage_path, mime_type, bytes, sha256) values
  ('d1d1d1d1-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 'd1d1d1d1-0000-0000-0000-000000000001', 'receipts', '00000000-0000-0000-0000-0000000000d1/a1.jpg', 'image/jpeg', 100, repeat('a', 64)),
  ('d2d2d2d2-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', 'd2d2d2d2-0000-0000-0000-000000000001', 'receipts', '00000000-0000-0000-0000-0000000000d2/a1.jpg', 'image/jpeg', 100, repeat('b', 64));
-- written by the extract-receipt function (service role)
insert into public.receipt_extractions (id, user_id, attachment_id, status, provider, model, draft) values
  ('d1d1d1d1-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'd1d1d1d1-0000-0000-0000-0000000000a1', 'succeeded', 'mock', 'mock-1', '{}'),
  ('d2d2d2d2-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'd2d2d2d2-0000-0000-0000-0000000000a1', 'succeeded', 'mock', 'mock-1', '{}');

select tests.login('00000000-0000-0000-0000-0000000000d1');

select (public.save_record(
  '{"id":"d1d1d1d1-0000-0000-0000-0000000000f1","vehicle_id":"d1d1d1d1-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"Oil change","performed_on":"2026-06-01","odometer":150000,"tax_cents":0,"source":"ai","extraction_id":"d1d1d1d1-0000-0000-0000-0000000000e1"}',
  '[{"item_type":"part","description":"Oil","quantity":1,"unit_price_cents":4999,"amount_cents":4999}]'
)).id;
select tests.ok((select source = 'ai' and extraction_id = 'd1d1d1d1-0000-0000-0000-0000000000e1' from public.service_records where id = 'd1d1d1d1-0000-0000-0000-0000000000f1'),
  'save_record keeps source = ai and the extraction id');
select tests.ok((select source from public.odometer_readings where record_id = 'd1d1d1d1-0000-0000-0000-0000000000f1') = 'receipt',
  'the odometer reading from an AI record has source receipt');

select tests.throws($$select public.save_record(
  '{"id":"d1d1d1d1-0000-0000-0000-0000000000f2","vehicle_id":"d1d1d1d1-0000-0000-0000-000000000001","kind":"service","category":"oil_change","title":"x","performed_on":"2026-06-01","tax_cents":0,"source":"ai","extraction_id":"d2d2d2d2-0000-0000-0000-0000000000e1"}',
  '[{"item_type":"part","description":"Oil","quantity":1,"unit_price_cents":100,"amount_cents":100}]')$$,
  'a record cannot point at another user''s extraction');

-- linking the receipt image to the saved record (partial update, as the outbox sends it)
update public.attachments set record_id = 'd1d1d1d1-0000-0000-0000-0000000000f1' where id = 'd1d1d1d1-0000-0000-0000-0000000000a1';
select tests.ok((select record_id from public.attachments where id = 'd1d1d1d1-0000-0000-0000-0000000000a1') = 'd1d1d1d1-0000-0000-0000-0000000000f1',
  'the owner links the receipt image to the record');

-- corrected_fields is the only column the client may change
update public.receipt_extractions set corrected_fields = array['odometer', 'tax_cents'] where id = 'd1d1d1d1-0000-0000-0000-0000000000e1';
select tests.ok((select corrected_fields from public.receipt_extractions where id = 'd1d1d1d1-0000-0000-0000-0000000000e1') = array['odometer', 'tax_cents'],
  'the owner records corrected_fields');
select tests.throws_code($$update public.receipt_extractions set status = 'failed', error_code = 'timeout' where id = 'd1d1d1d1-0000-0000-0000-0000000000e1'$$,
  '42501', 'the client cannot change other extraction columns');
update public.receipt_extractions set corrected_fields = array['x'] where id = 'd2d2d2d2-0000-0000-0000-0000000000e1';
reset role;
select tests.ok((select corrected_fields from public.receipt_extractions where id = 'd2d2d2d2-0000-0000-0000-0000000000e1') = '{}',
  'a user cannot change another user''s extraction');

rollback;
