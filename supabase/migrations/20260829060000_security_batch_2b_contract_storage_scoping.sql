-- =============================================================================
-- Security Batch 2b: object-bound authorization for contract storage buckets
-- =============================================================================
-- Scope: contract-pdfs and contract-signatures ONLY (both PRIVATE, currently
-- empty). Closes the broad, object-unbound read policies:
--   * contract_pdfs_read allowed ANY signing client to read ANY contract PDF.
--   * signatures_read_own_storage allowed ANY provider to read ANY signature.
-- Replaced with reads bound to the EXACT contract behind each object, using
-- SECURITY DEFINER helpers (the SB2R non-recursive model) so no RLS recursion
-- can occur. Object->row binding uses the exact stored path, mirroring the app's
-- own storagePathFromUrl extraction (marker '/<bucket>/', query stripped).
--
-- Writes stay owner-folder-scoped ((storage.foldername(name))[1] = auth.uid()).
-- posts-media and provider-media are untouched. service_role bypasses RLS.
-- No bucket config change, no data mutation.
-- =============================================================================

-- 1. Object-binding helpers (SECURITY DEFINER: read contracts/contract_signatures
--    without RLS, so evaluating a storage policy never re-enters table RLS).

-- True iff the caller is a participant (owner provider, or signer client) of the
-- contract whose pdf_url points at this exact contract-pdfs object.
create or replace function public.can_read_contract_pdf(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contracts c
    where c.pdf_url is not null
      and split_part(split_part(c.pdf_url, '/contract-pdfs/', 2), '?', 1) = object_name
      and (
        c.user_id = auth.uid()                 -- contract owner (provider)
        or public.is_contract_signer(c.id)     -- a client who signed THIS contract
      )
  );
$$;
alter function public.can_read_contract_pdf(text) owner to postgres;
revoke all on function public.can_read_contract_pdf(text) from public;
-- No anon EXECUTE: the storage SELECT policy is TO authenticated, so anon never
-- invokes this helper.
grant execute on function public.can_read_contract_pdf(text) to authenticated, service_role;

-- True iff the caller is a participant of the signature row whose signature_url
-- points at this exact contract-signatures object.
create or replace function public.can_read_contract_signature(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contract_signatures cs
    where cs.signature_url is not null
      and split_part(split_part(cs.signature_url, '/contract-signatures/', 2), '?', 1) = object_name
      and (
        cs.client_user_id = auth.uid()             -- the signer (client)
        or public.is_contract_owner(cs.contract_id) -- the owning provider of THIS contract
      )
  );
$$;
alter function public.can_read_contract_signature(text) owner to postgres;
revoke all on function public.can_read_contract_signature(text) from public;
-- No anon EXECUTE (storage SELECT policy is TO authenticated).
grant execute on function public.can_read_contract_signature(text) to authenticated, service_role;


-- 2. contract-pdfs policies.
--    KEEP: contract_pdfs_upload_own (INSERT, owner folder), contract_pdfs_delete_own
--          (DELETE, owner folder).
--    ADD:  owner-folder UPDATE (for upsert:true re-uploads by the owner).
--    REPLACE: contract_pdfs_read (broad) -> object-bound, authenticated only.

drop policy if exists contract_pdfs_read on storage.objects;
create policy contract_pdfs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-pdfs'
    and public.can_read_contract_pdf(name)
  );

create policy contract_pdfs_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'contract-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'contract-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- 3. contract-signatures policies.
--    KEEP: signatures_upload_own (INSERT, owner folder).
--    REPLACE: signatures_read_own_storage (broad) -> object-bound, authenticated only.
--    No UPDATE/DELETE policy: signature objects are write-once (deny).

drop policy if exists signatures_read_own_storage on storage.objects;
create policy signatures_read_own_storage on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-signatures'
    and public.can_read_contract_signature(name)
  );
