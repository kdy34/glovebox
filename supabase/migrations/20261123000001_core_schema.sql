-- Glovebox core schema (spec 001, data-model.md)
-- Conventions: client-generated uuid PKs, integer cents, `date` for service dates,
-- user_id on every row (defaults to auth.uid()) for simple RLS.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  distance_unit text not null default 'mi' check (distance_unit in ('mi', 'km')),
  reminder_lead_days int not null default 14 check (reminder_lead_days between 0 and 90),
  notifications_enabled boolean not null default true,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text check (char_length(nickname) <= 40),
  year int not null check (year between 1950 and extract(year from now())::int + 1),
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 40),
  trim text check (char_length(trim) <= 60),
  vin text check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  odometer_unit text not null default 'mi' check (odometer_unit in ('mi', 'km')),
  photo_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_archived_consistent check ((status = 'archived') = (archived_at is not null))
);
create index vehicles_user_idx on public.vehicles (user_id);
create unique index vehicles_user_vin_uniq on public.vehicles (user_id, vin) where vin is not null;

-- ---------------------------------------------------------------------------
-- receipt extractions (referenced by service_records)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  record_id uuid, -- FK added after service_records exists
  bucket text not null default 'receipts' check (bucket in ('receipts')),
  storage_path text not null check (char_length(storage_path) <= 300),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'application/pdf')),
  bytes int not null check (bytes > 0 and bytes <= 10485760),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint attachments_path_owner check (split_part(storage_path, '/', 1) = user_id::text)
);
create index attachments_record_idx on public.attachments (record_id);
create index attachments_user_sha_idx on public.attachments (user_id, sha256);

create table public.receipt_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  attachment_id uuid not null references public.attachments (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  provider text not null,
  model text not null,
  latency_ms int check (latency_ms >= 0),
  draft jsonb,
  error_code text check (error_code in ('unreadable', 'not_a_receipt', 'timeout', 'quota_exceeded', 'provider_error', 'invalid_output')),
  corrected_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint extraction_status_payload check (
    (status = 'succeeded' and draft is not null and error_code is null)
    or (status = 'failed' and error_code is not null)
    or (status = 'pending')
  )
);
create index receipt_extractions_attachment_idx on public.receipt_extractions (attachment_id);

-- ---------------------------------------------------------------------------
-- service records + line items
-- ---------------------------------------------------------------------------
create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind text not null check (kind in ('service', 'expense')),
  category text not null,
  title text not null check (char_length(title) between 1 and 120),
  performed_on date not null check (performed_on <= current_date + 1 and performed_on >= date '1950-01-01'),
  odometer int check (odometer between 0 and 2000000),
  shop_name text check (char_length(shop_name) <= 120),
  shop_address text check (char_length(shop_address) <= 240),
  is_diy boolean not null default false,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents bigint not null default 0 check (abs(subtotal_cents) <= 100000000),
  tax_cents bigint not null default 0 check (tax_cents between 0 and 100000000),
  total_cents bigint not null default 0 check (abs(total_cents) <= 100000000),
  notes text check (char_length(notes) <= 2000),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  extraction_id uuid references public.receipt_extractions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_total_matches check (total_cents = subtotal_cents + tax_cents),
  constraint records_category_matches_kind check (
    (kind = 'service' and category in ('oil_change', 'tire_rotation', 'tires', 'brakes', 'battery', 'filters',
                                       'fluids', 'inspection', 'repair', 'body', 'other_maintenance'))
    or (kind = 'expense' and category in ('fuel', 'insurance', 'registration', 'parking_tolls', 'other_expense'))
  )
);
create index service_records_vehicle_date_idx on public.service_records (vehicle_id, performed_on desc);
create index service_records_user_idx on public.service_records (user_id);

alter table public.attachments
  add constraint attachments_record_fk foreign key (record_id) references public.service_records (id) on delete cascade;

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  record_id uuid not null references public.service_records (id) on delete cascade,
  position int not null default 0 check (position >= 0),
  item_type text not null check (item_type in ('part', 'labor', 'fee', 'discount')),
  description text not null check (char_length(description) between 1 and 200),
  quantity numeric(10, 3) not null default 1 check (quantity > 0 and quantity <= 10000),
  unit_price_cents bigint not null check (abs(unit_price_cents) <= 100000000),
  amount_cents bigint not null check (abs(amount_cents) <= 100000000),
  created_at timestamptz not null default now(),
  constraint line_items_sign_rule check (
    (item_type = 'discount' and unit_price_cents <= 0 and amount_cents <= 0)
    or (item_type <> 'discount' and unit_price_cents >= 0 and amount_cents >= 0)
  )
);
create index line_items_record_idx on public.line_items (record_id, position);

-- ---------------------------------------------------------------------------
-- odometer readings
-- ---------------------------------------------------------------------------
create table public.odometer_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  value int not null check (value between 0 and 2000000),
  unit text not null default 'mi' check (unit in ('mi', 'km')),
  read_on date not null check (read_on <= current_date + 1),
  source text not null default 'manual' check (source in ('manual', 'record', 'receipt')),
  record_id uuid references public.service_records (id) on delete cascade,
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index odometer_vehicle_date_idx on public.odometer_readings (vehicle_id, read_on desc);
create unique index odometer_record_uniq on public.odometer_readings (record_id) where record_id is not null;

-- ---------------------------------------------------------------------------
-- maintenance rules
-- ---------------------------------------------------------------------------
create table public.maintenance_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  service_category text not null check (service_category in ('oil_change', 'tire_rotation', 'tires', 'brakes',
    'battery', 'filters', 'fluids', 'inspection', 'repair', 'body', 'other_maintenance')),
  interval_miles int check (interval_miles between 100 and 200000),
  interval_months int check (interval_months between 1 and 120),
  lead_days int not null default 14 check (lead_days between 0 and 90),
  lead_miles int not null default 500 check (lead_miles between 0 and 10000),
  source text not null default 'user' check (source in ('generic', 'owners_manual', 'user')),
  last_done_on date,
  last_done_odometer int check (last_done_odometer between 0 and 2000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rules_has_interval check (interval_miles is not null or interval_months is not null)
);
create index rules_vehicle_idx on public.maintenance_rules (vehicle_id);

-- ---------------------------------------------------------------------------
-- share links
-- ---------------------------------------------------------------------------
create or replace function public.new_share_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  token text not null unique default public.new_share_token() check (token ~ '^[A-Za-z0-9_-]{43}$'),
  include_costs boolean not null default false,
  include_images boolean not null default false,
  view_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index share_links_vehicle_idx on public.share_links (vehicle_id);

-- ---------------------------------------------------------------------------
-- usage counters, entitlements, app config
-- ---------------------------------------------------------------------------
create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  scans int not null default 0 check (scans >= 0),
  primary key (user_id, period)
);

create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_pro boolean not null default false,
  product_id text,
  period_type text check (period_type in ('trial', 'normal', 'intro')),
  expires_at timestamptz,
  store text check (store in ('app_store', 'play_store')),
  last_event_id text,
  updated_at timestamptz not null default now()
);

create table public.app_config (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.service_records for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.odometer_readings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.maintenance_rules for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.entitlements for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.app_config for each row execute function public.set_updated_at();
