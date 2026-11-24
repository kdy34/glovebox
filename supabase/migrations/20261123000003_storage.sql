-- Private storage buckets (FR-016). Objects live under "{user_id}/..." and only
-- the owner can touch them. Clients read files through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'application/pdf']),
  ('vehicle-photos', 'vehicle-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/heic']),
  ('exports', 'exports', false, 524288000, array['application/zip'])
on conflict (id) do nothing;

-- receipts + vehicle-photos: owner-only CRUD under their own folder.
create policy storage_owner_select on storage.objects for select to authenticated
  using (bucket_id in ('receipts', 'vehicle-photos', 'exports') and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('receipts', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_owner_update on storage.objects for update to authenticated
  using (bucket_id in ('receipts', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('receipts', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_owner_delete on storage.objects for delete to authenticated
  using (bucket_id in ('receipts', 'vehicle-photos') and (storage.foldername(name))[1] = auth.uid()::text);

-- exports: written only by the export-data function (service role); owners may read their own.
