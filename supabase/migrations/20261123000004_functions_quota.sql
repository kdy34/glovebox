-- Server-side functions: scan quota (FR-017) and atomic record save (FR-007/009/022).

-- ---------------------------------------------------------------------------
-- consume_scan / refund_scan — called only by the extract-receipt Edge Function
-- ---------------------------------------------------------------------------
create or replace function public.consume_scan(p_user_id uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_scans int;
begin
  insert into public.usage_counters (user_id, period, scans)
  values (p_user_id, v_period, 0)
  on conflict (user_id, period) do nothing;

  update public.usage_counters
     set scans = scans + 1
   where user_id = p_user_id
     and period = v_period
     and (p_limit is null or scans < p_limit)
  returning scans into v_scans;

  return v_scans is not null;
end;
$$;

create or replace function public.refund_scan(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usage_counters
     set scans = greatest(scans - 1, 0)
   where user_id = p_user_id
     and period = date_trunc('month', now() at time zone 'utc')::date;
$$;

revoke all on function public.consume_scan(uuid, int) from public, anon, authenticated;
revoke all on function public.refund_scan(uuid) from public, anon, authenticated;
grant execute on function public.consume_scan(uuid, int) to service_role;
grant execute on function public.refund_scan(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- save_record(record, items) — one transaction:
--   upsert record → replace line items → sync linked odometer reading → reset rules.
-- SECURITY INVOKER: every statement runs under the caller's RLS.
-- The server recomputes subtotal from line items and rejects mismatches,
-- so stored totals are always internally consistent.
-- ---------------------------------------------------------------------------
create or replace function public.save_record(p_record jsonb, p_items jsonb default '[]'::jsonb)
returns public.service_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rec public.service_records;
  v_id uuid := (p_record ->> 'id')::uuid;
  v_vehicle uuid := (p_record ->> 'vehicle_id')::uuid;
  v_subtotal bigint;
  v_tax bigint := coalesce((p_record ->> 'tax_cents')::bigint, 0);
  v_unit text;
  v_item jsonb;
  v_pos int := 0;
begin
  if v_id is null or v_vehicle is null then
    raise exception 'record id and vehicle_id are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  -- amount = round(quantity * unit_price) for every item
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'amount_cents')::bigint
       <> round((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price_cents')::bigint) then
      raise exception 'line item amount mismatch' using errcode = '22023';
    end if;
  end loop;

  select coalesce(sum((i ->> 'amount_cents')::bigint), 0) into v_subtotal
  from jsonb_array_elements(p_items) as i;

  if jsonb_array_length(p_items) = 0 then
    -- no itemization: trust the provided subtotal (simple expenses like "Fuel $42")
    v_subtotal := coalesce((p_record ->> 'subtotal_cents')::bigint, 0);
  elsif p_record ? 'subtotal_cents' and (p_record ->> 'subtotal_cents')::bigint <> v_subtotal then
    raise exception 'subtotal does not equal sum of line items' using errcode = '22023';
  end if;

  insert into public.service_records as r (
    id, vehicle_id, kind, category, title, performed_on, odometer, shop_name, shop_address,
    is_diy, currency, subtotal_cents, tax_cents, total_cents, notes, source, extraction_id
  ) values (
    v_id, v_vehicle,
    p_record ->> 'kind', p_record ->> 'category', p_record ->> 'title',
    (p_record ->> 'performed_on')::date, (p_record ->> 'odometer')::int,
    p_record ->> 'shop_name', p_record ->> 'shop_address',
    coalesce((p_record ->> 'is_diy')::boolean, false), coalesce(p_record ->> 'currency', 'USD'),
    v_subtotal, v_tax, v_subtotal + v_tax,
    p_record ->> 'notes', coalesce(p_record ->> 'source', 'manual'), (p_record ->> 'extraction_id')::uuid
  )
  on conflict (id) do update set
    vehicle_id = excluded.vehicle_id, kind = excluded.kind, category = excluded.category,
    title = excluded.title, performed_on = excluded.performed_on, odometer = excluded.odometer,
    shop_name = excluded.shop_name, shop_address = excluded.shop_address, is_diy = excluded.is_diy,
    currency = excluded.currency, subtotal_cents = excluded.subtotal_cents, tax_cents = excluded.tax_cents,
    total_cents = excluded.total_cents, notes = excluded.notes, source = excluded.source,
    extraction_id = excluded.extraction_id
  returning * into v_rec;

  -- replace line items
  delete from public.line_items where record_id = v_rec.id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.line_items (id, record_id, position, item_type, description, quantity, unit_price_cents, amount_cents)
    values (
      coalesce((v_item ->> 'id')::uuid, gen_random_uuid()), v_rec.id, v_pos,
      v_item ->> 'item_type', v_item ->> 'description',
      coalesce((v_item ->> 'quantity')::numeric, 1),
      (v_item ->> 'unit_price_cents')::bigint, (v_item ->> 'amount_cents')::bigint
    );
    v_pos := v_pos + 1;
  end loop;

  -- linked odometer reading (FR-009)
  select odometer_unit into v_unit from public.vehicles where id = v_rec.vehicle_id;
  if v_rec.odometer is not null then
    insert into public.odometer_readings (vehicle_id, value, unit, read_on, source, record_id)
    values (v_rec.vehicle_id, v_rec.odometer, coalesce(v_unit, 'mi'), v_rec.performed_on,
            case when v_rec.source = 'ai' then 'receipt' else 'record' end, v_rec.id)
    on conflict (record_id) where record_id is not null do update
      set value = excluded.value, unit = excluded.unit, read_on = excluded.read_on, vehicle_id = excluded.vehicle_id;
  else
    delete from public.odometer_readings where record_id = v_rec.id;
  end if;

  -- reset matching maintenance rules (FR-022)
  if v_rec.kind = 'service' then
    update public.maintenance_rules
       set last_done_on = v_rec.performed_on,
           last_done_odometer = coalesce(v_rec.odometer, last_done_odometer)
     where vehicle_id = v_rec.vehicle_id
       and service_category = v_rec.category
       and is_active
       and (last_done_on is null or last_done_on <= v_rec.performed_on);
  end if;

  return v_rec;
end;
$$;

revoke all on function public.save_record(jsonb, jsonb) from public, anon;
grant execute on function public.save_record(jsonb, jsonb) to authenticated;
