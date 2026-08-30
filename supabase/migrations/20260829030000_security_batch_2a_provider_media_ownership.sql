-- =============================================================================
-- Security Batch 2a: provider-media ownership scoping
-- =============================================================================
-- Forward migration after Security Batch 1. Closes the storage IDOR where ANY
-- authenticated user could INSERT into / UPDATE / DELETE ANY object in the
-- public provider-media bucket (the write policies were bucket-bound, not
-- owner-bound). Scopes authenticated writes to the user's own top-level folder,
-- which is auth.uid() (uploads use `${user.id}/...` via generatePath).
--
-- Public read is intentionally preserved unchanged (provider media is displayed
-- publicly). Only provider-media is touched; contract-pdfs, contract-signatures,
-- and posts-media policies are NOT modified. service_role bypasses RLS and is
-- unaffected. No storage objects are moved or mutated; no bucket config changes.
--
-- Ownership expression (matches live convention):
--   (storage.foldername(name))[1] = auth.uid()::text
-- =============================================================================

-- 1. Remove the bucket-only / duplicate write policies.
drop policy if exists "Authenticated users can upload 1x3bwnc_0" on storage.objects;
drop policy if exists "provider_media_authenticated_upload"      on storage.objects;
drop policy if exists "provider_media_authenticated_update"      on storage.objects;
drop policy if exists "provider_media_authenticated_delete"      on storage.objects;

-- 2. Owner-scoped INSERT: may only create objects under one's own uid folder.
create policy "provider_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Owner-scoped UPDATE: the existing object AND the resulting object must both
--    live in the caller's own folder. WITH CHECK prevents moving/renaming an
--    object into another user's folder.
create policy "provider_media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Owner-scoped DELETE: may only delete objects in one's own folder.
create policy "provider_media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Public read (provider_media_public_read) is intentionally left unchanged.
