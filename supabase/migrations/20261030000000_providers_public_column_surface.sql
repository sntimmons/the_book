-- Pre-Beta Correction 2 — the PUBLIC provider surface becomes a column grant.
--
-- ── THE DEFECT, REPRODUCED RATHER THAN INFERRED ────────────────────────────
--
-- Against the non-production project, an ANONYMOUS caller holding only the
-- public anon key that ships inside the mobile bundle ran
-- `GET /rest/v1/providers?select=*` and received ALL 49 COLUMNS, including:
--
--   verification_notes          -- "Private admin moderation notes" (its own comment)
--   stripe_account_id           -- and the four stripe_* flags, and the timestamp
--   no_show_count, late_count   -- a provider's reliability record
--   payment_mode, deposit_type, deposit_value, issue_window_hours
--   is_approved, verification_status, business_verified, verification_submitted_at
--
-- `providers_public_read` is `FOR SELECT USING (true)` with no role clause, and
-- the table ACL read `anon=rdDxtm, authenticated=rdDxtm`. RLS DECIDES WHICH ROWS
-- A CALLER MAY READ AND CANNOT HIDE A COLUMN — the reasoning already written into
-- `20261019000000` § "what a participant may see of an adjudication", which used
-- column grants for exactly this reason. `providers` is the one identity table
-- that never received the same treatment.
--
-- `hooks/useProviders.ts` carries a comment forbidding `select('*')` on this
-- table, naming these very columns. THAT COMMENT IS A CONVENTION, NOT A BOUNDARY.
-- The anon key is public by design, so anyone may issue the query the comment
-- asks our own client not to issue.
--
-- ── THE FIX, AND WHY IT IS A GRANT AND NOT A VIEW ──────────────────────────
--
-- The audit proposed a `providers_public` view mirroring `clients_public`. That
-- pattern is right for `clients`, whose rows are private and need a definer view
-- to expose a subset ACROSS rows. It is the wrong instrument here, for two
-- reasons found by inspecting consumers rather than by assuming:
--
--   1. Provider ROWS are meant to be public — this is a marketplace board. Only
--      the COLUMNS are over-shared. Column privileges are the exact tool for
--      that, and PostgreSQL enforces them on SELECT lists, WHERE, ORDER BY and
--      RETURNING alike.
--   2. A view would have to be `security_invoker = false` to see all rows, which
--      would then need every one of the 42 in-app `from('providers')` call sites
--      repointed, and would leave the base table's own grants unchanged — i.e.
--      the hole open behind the new front door. Fifteen RLS policies on other
--      tables also subquery `providers`; restructuring its RLS to make an invoker
--      view work risks breaking them for no security gain.
--
-- So: revoke everything from the two client roles and re-establish the complete
-- intended posture explicitly, in one place, so the file is the whole truth.
--
-- ── WHAT DECIDED THE PUBLIC LIST ──────────────────────────────────────────
--
-- Derived mechanically from every `from('providers')` query in the app, not from
-- taste: the union of `PUBLIC_PROVIDER_FIELDS` and every column used in a
-- `.eq/.gte/.ilike/.or/.order` (a filtered or ordered column needs SELECT too).
-- Every withheld column was verified to have ZERO readers in `app/`, `lib/`,
-- `components/`, `hooks/`, `context/` and `store/` — several are mentioned only
-- inside the comment that warned about them.
--
-- `is_approved` IS granted, and the reason is worth stating rather than hiding:
-- the discovery feed filters on it, and a filtered column requires the privilege.
-- It leaks one boolean — "is this provider live" — which is already inferable
-- from whether they appear in the feed at all.
--
-- `identity_verified` is WITHHELD. Pre-Beta Correction 1 removed every render of
-- it, so nothing reads it; leaving it granted would keep a trust flag on the wire
-- for a process that does not exist (PD-004). The client select lists drop it in
-- the same change.
--
-- `updated_at`, `verification_status` and `identity_verified` stay in the INSERT /
-- UPDATE grants below because the go-live upsert writes them and Security Batch 3a
-- deliberately allows that; a write privilege is not a read privilege.
--
-- NOT CHANGED: `providers_public_read` (rows are public and stay public — beta
-- discovery must keep working), `providers_update_owner`, the Batch 3a insert
-- guard, and `service_role`, which keeps full access and is the only role that
-- can still read the withheld columns. Operator/admin tooling belongs there.

-- ── 1. Clear the two client roles completely ─────────────────────────────────
-- Table-level REVOKE does not remove column-level grants, so this is followed by
-- a full re-grant rather than a partial edit: after this file the ACL for anon and
-- authenticated is exactly what is written below and nothing survives implicitly.
-- This also removes DELETE, TRUNCATE, REFERENCES and TRIGGER, which both roles
-- held on this table and neither has ever needed. TRUNCATE matters more than it
-- looks: it is NOT filtered by row-level security.
revoke all on table public.providers from anon;
revoke all on table public.providers from authenticated;

-- ── 2. The public marketplace surface ───────────────────────────────────────
grant select (
  id,
  user_id,
  display_name,
  business_name,
  username,
  category_id,
  custom_category,
  bio,
  location,
  neighborhood,
  profile_photo_url,
  cover_image_url,
  rating,
  average_rating,
  review_count,
  total_bookings,
  completed_count,
  repeat_client_rate,
  follower_count,
  next_available,
  is_trending,
  is_featured,
  is_approved,
  is_demo,
  is_mobile,
  years_experience,
  specialties,
  created_at
) on public.providers to anon, authenticated;

-- ── 3. Re-establish Security Batch 3a's write grants verbatim ───────────────
-- Copied from `20260830000000_security_batch_3a_provider_field_integrity.sql`,
-- which is their live definition. They are restated here because § 1 above wipes
-- the role's ACL for this table; an author editing this file must not narrow them
-- by accident. The sensitive columns remain absent from both lists, so a provider
-- still cannot self-set is_approved, is_featured, is_trending, is_demo, the
-- ratings, the counters, business_verified, verification_notes or any stripe_*.
grant insert (
  user_id, display_name, username, business_name, category_id, custom_category,
  bio, location, neighborhood, profile_photo_url, cover_image_url,
  verification_status, identity_verified, is_mobile, updated_at
) on public.providers to authenticated;

grant update (
  display_name, business_name, username, bio, location, neighborhood,
  category_id, custom_category, profile_photo_url, cover_image_url,
  specialties, years_experience, is_mobile, profile_style,
  payment_mode, deposit_type, deposit_value, issue_window_hours,
  next_available, updated_at, verification_status, identity_verified
) on public.providers to authenticated;

comment on column public.providers.verification_notes is
  'Private admin moderation notes for provider verification decisions. '
  'READABLE BY service_role ONLY: no SELECT privilege is granted to anon or '
  'authenticated (20261030000000). Row-level security cannot hide a column, so '
  'the boundary here is the column grant — do not re-grant it to a client role.';
