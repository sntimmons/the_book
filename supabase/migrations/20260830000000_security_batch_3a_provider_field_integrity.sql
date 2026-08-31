-- =============================================================================
-- Security Batch 3a: provider field integrity
-- =============================================================================
-- Closes the write-integrity holes where a provider could self-set sensitive
-- columns on their own providers row (RLS allowed it; only verification was
-- trigger-guarded) AND could seed sensitive values at INSERT (the verification
-- trigger is BEFORE UPDATE only, so it never fired on creation).
--
-- Mechanism (RLS cannot restrict columns; column-level privileges can, and the
-- one INSERT value nuance needs a trigger):
--   1. Consolidate the two overlapping UPDATE policies into ONE row-ownership
--      policy (no column logic in RLS).
--   2. Revoke broad table INSERT/UPDATE from app roles; grant column-level
--      INSERT/UPDATE only on legitimately self-editable columns. Sensitive
--      columns (is_featured/is_trending/is_approved/is_demo, ratings/aggregates,
--      counters, all stripe_*, business_verified, verification_submitted_at,
--      verification_notes, id, user_id, created_at) become un-writable by
--      authenticated at the privilege layer.
--   3. Add a BEFORE INSERT guard: verification_status / identity_verified /
--      business_verified are granted for INSERT so the go-live upsert works, but
--      a provider must not be able to insert as already-verified, so the guard
--      clamps them to safe values for non-service_role.
--   4. Keep prevent_provider_verification_self_update (BEFORE UPDATE) unchanged
--      (defense in depth; makes verification_status/identity_verified immutable
--      on UPDATE even though the column is granted for go-live upsert).
--
-- No app change: the only provider writes are edit-profile (UPDATE), go-live
-- (UPSERT), and AvailabilityEditor (is_mobile UPDATE); every column they send is
-- granted. service_role keeps full privileges. Only public.providers is touched.
-- =============================================================================

-- 1. One ownership UPDATE policy (row-level only).
drop policy if exists providers_update_own on public.providers;
drop policy if exists providers_update_safe_columns_only on public.providers;
create policy providers_update_owner on public.providers
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Replace broad table write privileges with column-level grants.
revoke insert, update on public.providers from anon;
revoke insert, update on public.providers from authenticated;

-- INSERT: only onboarding columns (exactly what go-live sends). Sensitive
-- columns are absent, so an insert that tries to set them is rejected.
grant insert (
  user_id, display_name, username, business_name, category_id, custom_category,
  bio, location, neighborhood, profile_photo_url, cover_image_url,
  verification_status, identity_verified, is_mobile, updated_at
) on public.providers to authenticated;

-- UPDATE: self-editable business/profile columns. verification_status and
-- identity_verified are included ONLY so the go-live upsert's conflict->update
-- path keeps working; the verification trigger keeps them effectively immutable.
grant update (
  display_name, business_name, username, bio, location, neighborhood,
  category_id, custom_category, profile_photo_url, cover_image_url,
  specialties, years_experience, is_mobile, profile_style,
  payment_mode, deposit_type, deposit_value, issue_window_hours,
  next_available, updated_at, verification_status, identity_verified
) on public.providers to authenticated;

-- service_role is untouched (retains full privileges; bypasses RLS).

-- 3. BEFORE INSERT guard: prevent seeding a verified/approved-looking provider.
--    (The BEFORE UPDATE verification trigger does not fire on INSERT.)
create or replace function public.provider_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.verification_status is null
     or new.verification_status not in ('unverified', 'pending') then
    new.verification_status := 'unverified';
  end if;
  new.identity_verified := false;
  new.business_verified := false;
  return new;
end;
$$;
alter function public.provider_insert_guard() owner to postgres;
revoke all on function public.provider_insert_guard() from public;

drop trigger if exists providers_insert_guard on public.providers;
create trigger providers_insert_guard
  before insert on public.providers
  for each row execute function public.provider_insert_guard();

-- 4. prevent_provider_verification_self_update (BEFORE UPDATE) is intentionally
--    left in place unchanged.
