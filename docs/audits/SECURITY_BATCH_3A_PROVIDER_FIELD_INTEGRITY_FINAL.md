# Security Batch 3a — Provider Field Integrity (FINAL / APPLIED)

**Result: PASS.** A provider can no longer self-set sensitive columns
(is_featured/is_trending/is_approved, ratings/aggregates, all stripe_*,
verification) on their own row, nor seed them at creation. Enforced by column-level
privileges + one ownership RLS policy + a BEFORE INSERT guard; the verification
UPDATE trigger is unchanged.

## References
- Investigation commit: `1b2f6ff935ad59f022a2de209430bbb077756a8a`
- Migration commit: `ad4ba9979bfa920d1741b3cad9c3c8fe83a68bee`
  (`supabase/migrations/20260830000000_security_batch_3a_provider_field_integrity.sql`)
- Production target: `kxregomuawwcqvisuhtr`

## Safety gate
Linked ref = `kxregomuawwcqvisuhtr`; prior six local+remote, `20260830000000`
local-only; dry-run showed exactly one pending migration.

## Apply result
`supabase db push --linked` → `Applying migration 20260830000000_...` → success.
Migration history: all seven local+remote; post-apply dry-run "Remote database is
up to date."

## Effective column privileges (live, not text)
- authenticated table-wide INSERT = **false**, UPDATE = **false** (no broad write).
- authenticated **INSERT** columns (15): bio, business_name, category_id,
  cover_image_url, custom_category, display_name, identity_verified, is_mobile,
  location, neighborhood, profile_photo_url, updated_at, user_id, username,
  verification_status.
- authenticated **UPDATE** columns (22): bio, business_name, category_id,
  cover_image_url, custom_category, deposit_type, deposit_value, display_name,
  identity_verified, is_mobile, issue_window_hours, location, neighborhood,
  next_available, payment_mode, profile_photo_url, profile_style, specialties,
  updated_at, username, verification_status, years_experience.
- Sensitive columns — effective authenticated UPDATE/INSERT both **false**:
  is_featured, is_trending, is_approved, is_demo, all stripe_*, average_rating,
  review_count, rating, follower_count, total_bookings and other counters,
  business_verified, verification_submitted_at, verification_notes, id, created_at,
  and user_id (UPDATE false; INSERT true only, by design for go-live).

## RLS policy state
`providers` UPDATE policies: `providers_update_own` and
`providers_update_safe_columns_only` are **gone**; exactly one remains:
`providers_update_owner` — FOR UPDATE TO authenticated, USING `auth.uid()=user_id`,
WITH CHECK `auth.uid()=user_id`. INSERT (`providers_insert_own`) and SELECT
(`providers_public_read`) unchanged.

## provider_insert_guard verification
Live: `public.provider_insert_guard()` — owner postgres, SECURITY DEFINER,
`search_path=''`. Trigger `providers_insert_guard` attached BEFORE INSERT on
providers (exactly once). Clamps `verification_status` to unverified/pending and
forces `identity_verified=false`, `business_verified=false` for non-service_role.

## Verification trigger verification
`prevent_provider_verification_self_update` and its BEFORE UPDATE trigger
`providers_verification_admin_only` unchanged (not dropped/altered by the migration).

## Runtime tests (rolled-back fixtures — no rows left behind)

| # | test | expected | result |
|---|---|---|---|
| A | owner edits legit profile fields (display_name, business_name, bio, location, category_id, media, specialties, years_experience, is_mobile) | ALLOW | **ALLOW** ✓ |
| B | unrelated user updates another provider's row | DENY | **DENY** (0 rows) ✓ |
| C | owner sets is_featured | DENY | **DENY** (42501 column priv) ✓ |
| C | owner sets is_approved | DENY | **DENY** (42501) ✓ |
| C | owner sets average_rating/review_count | DENY | **DENY** (42501) ✓ |
| C | owner sets stripe_charges/payouts_enabled | DENY | **DENY** (42501) ✓ |
| C | owner sets user_id | DENY | **DENY** (42501) ✓ |
| C | owner sets business_verified/verification_notes | DENY | **DENY** (42501) ✓ |
| D | owner sets verification_status='verified' | trigger block | **TRIG_BLOCK** ✓ |
| D | owner sets identity_verified=true | trigger block | **TRIG_BLOCK** ✓ |
| E | fresh go-live INSERT (real payload) | SUCCESS + safe values | **SUCCESS**, verification_status=pending, identity_verified=false, business_verified=false ✓ |
| F1 | malicious INSERT with is_featured=true | DENY (column priv) | **DENY** (42501) ✓ |
| F2 | malicious INSERT with verification_status='verified', identity_verified=true | guard clamps | **INSERT ok, clamped**: verification_status=unverified, identity_verified=false, business_verified=false ✓ |
| G | existing-provider go-live upsert (conflict/update), pending state | SUCCESS | **SUCCESS** ✓ |
| H | verified-provider go-live rerun | (see below) | **TRIG_BLOCK (verification)** — expected safe denial |
| I | service_role updates platform fields (is_featured, average_rating) | ALLOW | **ALLOW** ✓ |

### Normal profile edit tests (A)
All legitimate profile columns update successfully for the owner.

### Unrelated-user denial (B)
User B updating User A's provider row → denied by RLS (0 rows).

### Sensitive UPDATE denial (C)
Every sensitive column update by the owner is denied at the **column-privilege
layer** (42501) — the authenticated role no longer holds UPDATE on those columns.

### Malicious INSERT (F1, F2)
- F1: inserting a non-granted sensitive column (is_featured) → denied (42501).
- F2: inserting the granted verification columns with `verified`/`true` → the row
  is created but `provider_insert_guard` clamps to `unverified`/`false`/`false`.
  A provider cannot seed a verified/identity-verified state at creation.

### Verification clamping / tampering (D, F2)
On UPDATE, changing verification_status/identity_verified is blocked by the
existing trigger; on INSERT, it is clamped by the new guard.

### go-live INSERT-path result (E)
The exact go-live payload inserts successfully; resulting verification state is
safe (pending / false / false).

### go-live conflict/update-path result (G) — HARD compatibility gate
On a provider already in `pending` state, the go-live upsert's conflict→update path
**SUCCEEDS** (all sent columns are UPDATE-granted; verification_status pending→pending
is a no-op for the trigger).

### verified-provider rerun behavior (H)
**Expected safe denial (not a 3a change).** A provider whose verification_status is
beyond pending (e.g. `verified`) re-running the go-live upsert — which tries to set
`verification_status='pending'` — is blocked by the **pre-existing**
`prevent_provider_verification_self_update` trigger (verified→pending is a
disallowed self-change). This is correct product behavior (a verified provider
cannot silently reset their verification via onboarding) and is unchanged by this
migration. It is not a realistic app-breaking flow: go-live's first run is an INSERT
(sets pending); a verified provider does not re-run onboarding go-live. No app
change is warranted.

### service_role (I)
service_role updates platform-controlled fields (is_featured, average_rating)
successfully — administrative capability preserved.

## Cleanup verification
After testing: providers = 9 rows, 0 `sb3a_%` test rows, P1 unchanged
(verification_status=unverified, is_featured=false, display_name='Stephen'). All
fixtures rolled back; nothing persisted.

## Structural regression
| object | before | after |
|---|---|---|
| tables | 39 | 39 |
| sequence | 1 | 1 |
| views | 2 | 2 |
| **functions** | 15 | **16** (+ provider_insert_guard) |
| **triggers** | 17 | **18** (+ providers_insert_guard) |
| constraints | 158 | 158 |
| non-constraint indexes | 58 | 58 |
| buckets | 4 | 4 |
| storage policies | 12 | 12 |
| **public policies** | 97 | **96** (dropped 2 provider UPDATE policies, added 1) |

SB1 (categories RLS on), SB2a (3 provider_media_owner policies), SB2R/SB2b (4
contract helpers) all intact. Typecheck: `npx tsc --noEmit` → exit 0.

## PASS / FAIL
**PASS.** Provider field write integrity is enforced at INSERT and UPDATE for all
sensitive/platform-controlled fields, with no app change and legitimate flows intact.

## Remaining findings
- **Bookings write integrity (Batch 3b) is still open** — providers can tamper
  booking financial/status fields; client-cancel is broken (policy/constraint/app
  drift). Separate migration.
- **Verified-provider go-live rerun (H)** is blocked by the verification trigger by
  design; if the product ever wants a verified provider to re-run onboarding, the
  app should omit verification_status/identity_verified from the go-live upsert
  payload (not needed for security; noted only for product awareness).
- No unintended production data changes: all attack/compat simulation was
  rolled back; providers table and all counts are unchanged aside from the
  intended +1 function / +1 trigger / −1 policy.
