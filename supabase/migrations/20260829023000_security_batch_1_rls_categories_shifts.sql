-- =============================================================================
-- Security Batch 1: enable RLS on categories, shifts, shift_clients
-- =============================================================================
-- Forward migration AFTER the canonical baseline (20260829000000). Closes the
-- P1 debt where these three tables had RLS DISABLED while anon held full CRUD.
--
-- Intended effective model (see docs/audits/SECURITY_BATCH_1_RLS_INVESTIGATION.md):
--   categories     : public reference data -> anon + authenticated SELECT only;
--                    no client writes; service_role unchanged (bypasses RLS).
--   shifts         : dormant, no owner column -> deny all app users; no policies.
--   shift_clients  : dormant -> deny all app users; no policies. A client-self
--                    read rule is intentionally NOT added yet (feature dormant and
--                    the shift-side authorization model is incomplete).
--
-- Uses normal ENABLE ROW LEVEL SECURITY (NOT forced). Does not alter ownership,
-- table structure, indexes, or data. service_role retains its existing grants and
-- bypasses RLS, so server/admin/seed paths are unaffected.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- categories: public-readable taxonomy, no writes from app users.
-- -----------------------------------------------------------------------------
alter table public.categories enable row level security;

-- Normalize the read policy explicitly (do not depend on the old inert policy).
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE policies: writes are denied for anon/authenticated.

-- Grant cleanup (defense in depth): guarantee SELECT-only for app roles.
-- service_role is not touched here, so it keeps ALL and continues to manage
-- the taxonomy (seeds/admin) via the service key.
revoke all privileges on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;


-- -----------------------------------------------------------------------------
-- shifts: dormant table with no ownership dimension -> deny all app users.
-- -----------------------------------------------------------------------------
alter table public.shifts enable row level security;

-- No policies: with RLS on and no policy, anon/authenticated are denied every
-- operation. No ownership column exists, so none is invented.
revoke all privileges on public.shifts from anon, authenticated;


-- -----------------------------------------------------------------------------
-- shift_clients: dormant link table -> deny all app users.
-- -----------------------------------------------------------------------------
alter table public.shift_clients enable row level security;

-- No policies (intentionally no client-self read yet). Deny all for app roles.
revoke all privileges on public.shift_clients from anon, authenticated;
