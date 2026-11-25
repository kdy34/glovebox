-- US2: a service record may only reference the caller's own receipt extraction.
-- The FK alone doesn't check ownership (FK checks bypass RLS). Same pattern as owns_vehicle.
create or replace function public.owns_extraction(p_extraction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.receipt_extractions e where e.id = p_extraction_id and e.user_id = auth.uid());
$$;
revoke all on function public.owns_extraction(uuid) from public;
grant execute on function public.owns_extraction(uuid) to authenticated;

drop policy records_insert on public.service_records;
create policy records_insert on public.service_records for insert to authenticated
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id)
    and (extraction_id is null or public.owns_extraction(extraction_id)));

drop policy records_update on public.service_records;
create policy records_update on public.service_records for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.owns_vehicle(vehicle_id)
    and (extraction_id is null or public.owns_extraction(extraction_id)));
