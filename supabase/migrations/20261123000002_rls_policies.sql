-- Row-level security (constitution IV, data-model.md "RLS summary").
-- Rule: a signed-in user can only see and change rows where user_id = auth.uid(),
-- and can only attach child rows to parents they own.

alter table public.profiles            enable row level security;
alter table public.vehicles            enable row level security;
alter table public.attachments         enable row level security;
alter table public.receipt_extractions enable row level security;
alter table public.service_records     enable row level security;
alter table public.line_items          enable row level security;
alter table public.odometer_readings   enable row level security;
alter table public.maintenance_rules   enable row level security;
alter table public.share_links         enable row level security;
alter table public.usage_counters      enable row level security;
alter table public.entitlements        enable row level security;
alter table public.app_config          enable row level security;

-- Ownership helpers (security definer so they can be used inside policies
-- without recursive RLS evaluation; they only ever compare against auth.uid()).
create or replace function public.owns_vehicle(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.user_id = auth.uid());
$$;

create or replace function public.owns_record(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.service_records r where r.id = p_record_id and r.user_id = auth.uid());
$$;

revoke all on function public.owns_vehicle(uuid) from public;
revoke all on function public.owns_record(uuid) from public;
grant execute on function public.owns_vehicle(uuid) to authenticated;
grant execute on function public.owns_record(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: read/update own row (insert happens via trigger)
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create policy vehicles_select on public.vehicles for select to authenticated using (user_id = auth.uid());
create policy vehicles_insert on public.vehicles for insert to authenticated with check (user_id = auth.uid());
create policy vehicles_update on public.vehicles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy vehicles_delete on public.vehicles for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- children of vehicles: records, readings, rules, attachments, share links
-- ---------------------------------------------------------------------------
create policy records_select on public.service_records for select to authenticated using (user_id = auth.uid());
create policy records_insert on public.service_records for insert to authenticated
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id));
create policy records_update on public.service_records for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id));
create policy records_delete on public.service_records for delete to authenticated using (user_id = auth.uid());

create policy readings_select on public.odometer_readings for select to authenticated using (user_id = auth.uid());
create policy readings_insert on public.odometer_readings for insert to authenticated
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id) and (record_id is null or public.owns_record(record_id)));
create policy readings_update on public.odometer_readings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id) and (record_id is null or public.owns_record(record_id)));
create policy readings_delete on public.odometer_readings for delete to authenticated using (user_id = auth.uid());

create policy rules_select on public.maintenance_rules for select to authenticated using (user_id = auth.uid());
create policy rules_insert on public.maintenance_rules for insert to authenticated
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id));
create policy rules_update on public.maintenance_rules for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id));
create policy rules_delete on public.maintenance_rules for delete to authenticated using (user_id = auth.uid());

create policy attachments_select on public.attachments for select to authenticated using (user_id = auth.uid());
create policy attachments_insert on public.attachments for insert to authenticated
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id) and (record_id is null or public.owns_record(record_id)));
create policy attachments_update on public.attachments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id) and (record_id is null or public.owns_record(record_id)));
create policy attachments_delete on public.attachments for delete to authenticated using (user_id = auth.uid());

-- Share links: owners create/read/revoke. No anon policy — public access is only
-- through the public-report Edge Function (service role), contracts/edge-functions.md.
create policy share_select on public.share_links for select to authenticated using (user_id = auth.uid());
create policy share_insert on public.share_links for insert to authenticated
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id) and view_count = 0 and revoked_at is null);
create policy share_update on public.share_links for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy share_delete on public.share_links for delete to authenticated using (user_id = auth.uid());
-- Owners may only change these columns (token and view_count are server-managed).
revoke update on public.share_links from authenticated;
grant update (include_costs, include_images, revoked_at) on public.share_links to authenticated;

-- ---------------------------------------------------------------------------
-- line items: owned via user_id AND parent record ownership
-- ---------------------------------------------------------------------------
create policy items_select on public.line_items for select to authenticated using (user_id = auth.uid());
create policy items_insert on public.line_items for insert to authenticated
  with check (user_id = auth.uid() and public.owns_record(record_id));
create policy items_update on public.line_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.owns_record(record_id));
create policy items_delete on public.line_items for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- server-written tables: clients read only (plus one column on extractions)
-- ---------------------------------------------------------------------------
create policy extractions_select on public.receipt_extractions for select to authenticated using (user_id = auth.uid());
create policy extractions_update_corrections on public.receipt_extractions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.receipt_extractions from authenticated, anon;
grant update (corrected_fields) on public.receipt_extractions to authenticated;

create policy usage_select on public.usage_counters for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.usage_counters from authenticated, anon;

create policy entitlements_select on public.entitlements for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.entitlements from authenticated, anon;

-- ---------------------------------------------------------------------------
-- app config: public read, no client writes
-- ---------------------------------------------------------------------------
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
revoke insert, update, delete on public.app_config from authenticated, anon;

-- Nothing in public is readable by anon except app_config.
revoke all on public.profiles, public.vehicles, public.attachments, public.receipt_extractions,
  public.service_records, public.line_items, public.odometer_readings, public.maintenance_rules,
  public.share_links, public.usage_counters, public.entitlements from anon;
