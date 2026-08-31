# Security Batch 3 — Booking + Provider Write Integrity (INVESTIGATION / DESIGN ONLY)

Scope: `public.bookings`, `public.providers`. Read-only + design. No migration,
no production/app/migration change (attack simulation used rolled-back fixtures).

**Headline (confirmed by live rolled-back simulation):**
- A provider can **self-set** `is_featured`, `is_trending`, `is_approved`,
  `average_rating`/`review_count`, and **`stripe_charges_enabled`/`stripe_payouts_enabled`**
  on their own `providers` row — RLS ALLOWS it, and no trigger guards these. **P1.**
- A provider can set `payment_amount`, `payment_status`, `status` (any value),
  `no_show_flag` and reassign `user_id` on their own bookings — RLS ALLOWS it.
  **P1.** The `x = x` "immutability" checks in the UPDATE policies are tautologies
  (a WITH CHECK cannot compare NEW vs OLD) and enforce nothing.
- Verification fields ARE protected (a trigger raises); `user_id`/`provider_id`
  identity IS protected (RLS WITH CHECK).
- The **client-cancel path is broken**: the policy requires `status='cancelled'`,
  a value the CHECK constraint forbids, while the app uses `'cancelled_by_client'`
  — so clients cannot cancel at all (over-restrictive). **P2 (functional + drift).**

---

## 1. Booking schema/policy findings

`bookings`: 40 columns, 11 rows, RLS on (not forced). Grants: anon/authenticated/
service_role all full CRUD. Key columns:
- Identity/ownership: `user_id` (client, no FK), `provider_id` (FK→providers ON DELETE CASCADE), `service_id` (FK→provider_services).
- Status: `status` (CHECK: pending, accepted, declined, canceled, cancelled_by_client, cancelled_by_provider, arriving, checked_in, completed, late_cancelled, no_show, rescheduled) — **note: no `'cancelled'` value**.
- Scheduling: requested_date, requested_time, appointment_time, created_at.
- Lifecycle timestamps: client_checked_in_at, provider_confirmed_at, completed_at, cancelled_at, provider_first_response_at, cancellation_reason, cancelled_by, cancellation_actor (CHECK client/provider/admin/system).
- **Financial (should be server-only):** stripe_payment_intent_id, payment_status (CHECK unpaid/authorized/captured/cancelled/refunded), payment_amount, payment_authorized_at, payment_captured_at, stripe_last_event_id/at, capture_scheduled_for, payment_finalized, refund_status (CHECK).
- Safety/admin: issue_reported/_at/_reason, under_review, dispute_flag, no_show_flag, provider_safety_notes, client_safety_notes, admin_resolution_notes.

Policies (all PERMISSIVE):
| policy | cmd | role | USING | WITH CHECK |
|---|---|---|---|---|
| Users can insert own bookings | INSERT | public | – | `auth.uid()=user_id` |
| Users can view own bookings | SELECT | authenticated | `auth.uid()=user_id` | – |
| Providers can view their bookings | SELECT | public | `provider_id IN (own providers)` | – |
| clients_cancel_own_bookings | UPDATE | authenticated | `auth.uid()=user_id AND status IN (pending,accepted)` | `auth.uid()=user_id AND status='cancelled' AND payment_amount=payment_amount AND payment_status=payment_status AND payment_finalized=payment_finalized AND no_show_flag=no_show_flag AND dispute_flag=dispute_flag` |
| providers_manage_own_bookings | UPDATE | authenticated | `provider_id IN (own providers)` | `provider_id IN (own providers) AND payment_amount=payment_amount` |

Problems:
- **Tautologies:** `payment_amount=payment_amount`, `payment_status=payment_status`,
  etc. always evaluate true for non-null (NULL for null) — a WITH CHECK sees only
  the NEW row, so `col=col` cannot mean "unchanged". They enforce **nothing**.
- **providers_manage_own_bookings** therefore lets a provider change ANY column of
  their bookings except provider_id (payment fields, status, flags, user_id).
- **clients_cancel_own_bookings** WITH CHECK requires `status='cancelled'` — a value
  **not allowed by the CHECK constraint** and not used by the app (`'cancelled_by_client'`).
  It can never succeed → clients cannot cancel via RLS.
- No DELETE policy (deletes denied to app roles — good).

## 2. Provider schema/policy findings

`providers`: 50 columns, 9 rows, RLS on (not forced). Grants: full CRUD to all.
- Identity: `id`, `user_id` (FK→auth.users, UNIQUE), `username` (UNIQUE, CHECK regex).
- Self-service business/profile: display_name, business_name, bio, location, neighborhood, category_id, custom_category, profile_photo_url, cover_image_url, specialties, years_experience, is_mobile, profile_style, payment_mode, deposit_type, deposit_value, issue_window_hours, next_available.
- **Verification (trigger-guarded):** verification_status (CHECK), identity_verified, business_verified, verification_submitted_at, verification_notes.
- **Platform flags (UNGUARDED):** is_approved, is_featured, is_trending, is_demo.
- **Aggregates/stats (UNGUARDED):** rating, average_rating, review_count, total_bookings, no_show_count, late_count, completed_count, follower_count, bookings_this_week, bookings_this_month, repeat_client_rate.
- **Stripe/payout (UNGUARDED, should be webhook-only):** stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_account_updated_at.

Policies (all PERMISSIVE):
| policy | cmd | role | USING | WITH CHECK |
|---|---|---|---|---|
| providers_insert_own | INSERT | public | – | `auth.uid()=user_id` |
| providers_public_read | SELECT | public | `true` | – |
| providers_update_own | UPDATE | public | `auth.uid()=user_id` | `auth.uid()=user_id` |
| providers_update_safe_columns_only | UPDATE | public | `auth.uid()=user_id` | `auth.uid()=user_id AND is_approved=is_approved AND … verification_status=verification_status AND rating=rating AND review_count=review_count AND average_rating=average_rating` |

Problems:
- **Two overlapping PERMISSIVE UPDATE policies combine with OR.** `providers_update_own`
  has NO column restriction, so it always permits — **completely defeating**
  `providers_update_safe_columns_only`. (And that policy's `col=col` checks are
  tautologies anyway.)
- Net effect: a provider can update **every** column of their own row except those
  a trigger separately blocks.

## 3. Trigger / function findings

- **`providers_verification_admin_only`** (BEFORE UPDATE, `prevent_provider_verification_self_update`,
  SECURITY DEFINER): if not service_role and any of {verification_status,
  identity_verified, business_verified, verification_submitted_at, verification_notes}
  changed → **RAISE 'Provider verification fields are admin-managed'**. Hard block.
  This is the ONLY thing protecting verification — and it guards ONLY those 5 fields.
  It does NOT guard is_approved/is_featured/is_trending/ratings/stripe_*/counters.
- **`providers_updated_at`** (BEFORE UPDATE, `set_updated_at`): sets updated_at; harmless.
- **`recompute_provider_rating`** (on `provider_reviews`, SECURITY DEFINER): recomputes
  providers.average_rating/review_count from provider_reviews. So those are meant to
  be system-maintained — yet a provider can also overwrite them directly (persists
  until the next review change recomputes).
- **`trg_no_self_booking`** (BEFORE INSERT/UPDATE on bookings, `reject_self_provider_action('user_id')`):
  raises only if `new.user_id` owns `new.provider_id` (self-booking). It does NOT
  make user_id/provider_id/financial fields immutable. Confirmed: reassigning a
  booking's user_id to a non-owning client is ALLOWED.

**Key structural fact:** provider verification and booking self-booking are the ONLY
integrity rules enforced by triggers; everything else the broad policies allow is
unprotected. The safe-columns intent lives only in a defeated policy with
tautological checks.

## 4. App usage map

Single anon-key client; no RPCs; no edge functions touch these tables. Writes:

| file | table | op | actor | fields written |
|---|---|---|---|---|
| `app/book/payment.tsx:134` | bookings | INSERT | client | user_id(self), provider_id, service_id, service_name, requested_date/time, appointment_time, message, status='pending', payment_status='unpaid', **payment_amount=servicePrice**, created_at |
| `app/(tabs)/business/index.tsx:310` | bookings | UPDATE | provider | status='accepted', provider_confirmed_at, provider_first_response_at |
| `app/(tabs)/business/index.tsx:342` | bookings | UPDATE | provider | status='cancelled_by_provider', cancelled_at, cancelled_by, cancellation_actor='provider', provider_first_response_at |
| `app/bookings/[id].tsx:198` (`updateStatus`) | bookings | UPDATE | client/provider | status + extraFields (e.g. completed) |
| `app/bookings/[id].tsx:236` (`handleCancel`) | bookings | UPDATE | client/provider | status='cancelled_by_client' or 'cancelled_by_provider' |
| `app/bookings/request/[id].tsx:137` (`transition`) | bookings | UPDATE | provider | status + extra |
| `app/(tabs)/business/edit-profile.tsx:284` | providers | UPDATE | provider | display_name, business_name, bio, location, neighborhood, category_id, custom_category, profile_photo_url, cover_image_url, specialties, years_experience, updated_at |
| `app/onboarding/provider/golive.tsx:211` | providers | UPSERT | provider | user_id, display_name, username, business_name, category_id, custom_category, bio, location, neighborhood, profile_photo_url, cover_image_url, verification_status='pending', identity_verified=false, is_mobile, updated_at |
| `components/AvailabilityEditor.tsx:544` | providers | UPDATE | provider | is_mobile |

- The client sets `payment_amount` on INSERT (from the chosen service price).
- The app **never** updates is_featured/is_trending/is_approved/ratings/stripe_*/counters, nor booking payment fields on UPDATE — confirming those have no legitimate client write path.
- The client-cancel uses `'cancelled_by_client'` (bookings/[id].tsx:236), which the current cancel policy rejects.

## 5. Booking field ownership matrix (intended)

| field group | client | provider | service_role/server |
|---|---|---|---|
| user_id, provider_id, service_id | set at INSERT (own) | **immutable** | any |
| service_name, requested_date/time, appointment_time, message | set at INSERT | reschedule (status='rescheduled' + times) | any |
| status | cancel-only transition | lifecycle transitions (accept/decline/checkin/complete/cancel/no_show) | any |
| lifecycle timestamps | cancellation_* on cancel | provider_confirmed_at, completed_at, checked_in_at, cancelled_* | any |
| **payment_amount, payment_status, stripe_*, capture_scheduled_for, payment_finalized, refund_status, payment_*_at** | **none** | **none** | **server/Stripe only** |
| issue_reported*, under_review, dispute_flag, admin_resolution_notes | report issue (issue_reported/_reason) | – | admin/server |
| no_show_flag | – | maybe (via a controlled transition) | server |
| provider_safety_notes / client_safety_notes | own note | own note | any |

## 6. Booking status model + drift

Constraint vocabulary: pending, accepted, declined, canceled, cancelled_by_client,
cancelled_by_provider, arriving, checked_in, completed, late_cancelled, no_show,
rescheduled. App/UI buckets map several of these to a "cancelled" tab
(`lib/bookingStatus.ts`).

Observed intended transitions (from app):
`pending → accepted` (provider) / `pending|accepted → cancelled_by_provider` (provider decline/cancel) / `accepted → checked_in → completed` (provider) / `pending|accepted → cancelled_by_client` (client).

**Drift:** `clients_cancel_own_bookings` WITH CHECK demands `status='cancelled'`, which
(a) is not in the constraint vocabulary and (b) is not the app value
(`cancelled_by_client`). Current UPDATE policies otherwise place **no** transition
restriction on providers — a provider can jump to any status (e.g. `pending →
completed`, `→ no_show`) directly.

## 7. Provider field ownership matrix (intended)

- **Self-editable (business/profile):** display_name, business_name, username(at create), bio, location, neighborhood, category_id, custom_category, profile_photo_url, cover_image_url, specialties, years_experience, is_mobile, profile_style, payment_mode, deposit_type, deposit_value, issue_window_hours, next_available, updated_at.
- **Verification (admin/server-only, trigger-guarded today):** verification_status, identity_verified, business_verified, verification_submitted_at, verification_notes.
- **Platform flags (admin-only, UNGUARDED today):** is_approved, is_featured, is_trending, is_demo.
- **Aggregates/stats (system-maintained, UNGUARDED today):** rating, average_rating, review_count, total_bookings, no_show_count, late_count, completed_count, follower_count, bookings_this_week/month, repeat_client_rate.
- **Stripe/payout (webhook-only, UNGUARDED today):** stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_account_updated_at.
- **Identity (immutable):** id, user_id.

## 8. Exploit simulation results (live, rolled back — no data changed)

Legend: RLS_ALLOW = the write succeeded (vulnerable); RLS_DENY_42501 = WITH CHECK
rejected; TRIG_BLOCK = trigger raised; CONSTRAINT_BLOCK = CHECK constraint rejected.

### providers (attacker = the provider owner, on own row)
| attack | result | meaning |
|---|---|---|
| set `is_featured=true` | **RLS_ALLOW** | self-promote (VULNERABLE) |
| set `is_trending=true` | **RLS_ALLOW** | self-promote (VULNERABLE) |
| set `average_rating=5.0, review_count=999` | **RLS_ALLOW** | rating inflation (VULNERABLE) |
| set `stripe_charges_enabled/payouts_enabled=true` | **RLS_ALLOW** | payout-state spoofing (VULNERABLE) |
| set `is_approved=false/true` | **RLS_ALLOW** | self-approve toggle (VULNERABLE) |
| set `verification_status='verified'` | TRIG_BLOCK | protected by trigger ✓ |
| set `identity_verified=true` | TRIG_BLOCK | protected by trigger ✓ |
| set `user_id=<other>` | RLS_DENY_42501 | identity protected by WITH CHECK ✓ |

### bookings (attacker = the booking's provider owner)
| attack | result | meaning |
|---|---|---|
| set `payment_amount=0` | **RLS_ALLOW** | financial tampering (VULNERABLE) |
| set `payment_status='captured'` | **RLS_ALLOW** | mark paid (VULNERABLE) |
| set `status='completed'` (arbitrary jump) | **RLS_ALLOW** | uncontrolled transition (VULNERABLE) |
| set `no_show_flag=true` | **RLS_ALLOW** | flag client (VULNERABLE) |
| reassign `user_id=<other client>` | **RLS_ALLOW** | client reassignment (VULNERABLE; trigger only blocks self-booking) |
| reassign `provider_id=<other>` | RLS_DENY_42501 | protected by WITH CHECK ✓ |

### bookings (attacker = the booking's client, status pending)
| attack | result | meaning |
|---|---|---|
| cancel via `status='cancelled_by_client'` (app value) | RLS_DENY_42501 | **client cannot cancel** (over-restrictive) |
| cancel via `status='cancelled'` (policy value) | CONSTRAINT_BLOCK | policy value is invalid per constraint |
| self-`status='completed'` | RLS_DENY_42501 | protected ✓ |
| change `payment_amount=0` | RLS_DENY_42501 | protected ✓ |

## 9. Risk classification

- **P1 — Provider self-controls Stripe readiness** (`stripe_charges_enabled`,
  `stripe_payouts_enabled`, `stripe_onboarding_complete`, `stripe_details_submitted`):
  a provider flipping these could defeat payout gating that depends on them. RLS
  allows it; no trigger. Exploitable by any provider on their own row.
- **P1 — Provider rating/social inflation** (`average_rating`, `review_count`,
  `rating`, `follower_count`, `completed_count`, `total_bookings`): trust-and-safety
  and ranking fraud. RLS allows.
- **P1 — Provider self-promotion / approval** (`is_featured`, `is_trending`,
  `is_approved`, `is_demo`): manipulates Discover ranking/visibility. RLS allows.
- **P1 — Booking financial/status tampering by provider** (`payment_amount`,
  `payment_status`, `status`, `no_show_flag`, `refund_status`, `payment_finalized`):
  a provider can mark bookings paid/completed/no-show or alter amounts on their own
  bookings. RLS allows; tautological checks do nothing.
- **P2 — Provider can reassign a booking's client** (`user_id`): limited value but a
  data-integrity/IDOR concern; trigger only blocks self-booking.
- **P2 — Client sets own `payment_amount` at INSERT:** the chosen price is client-set;
  real charge is via Stripe, but the stored amount is not server-validated.
- **P2 — Client-cancel broken (policy/constraint/app drift):** functional defect,
  over-restrictive (not a privilege escalation, but a real bug to fix in the same
  batch).
- **P3 — Redundant/overlapping provider UPDATE policies + tautological WITH CHECKs:**
  dead/ineffective policy surface that should be removed to avoid false assurance.

## 10. Proposed provider remediation (design; do not implement yet)

RLS cannot express "update the row but only these columns" (WITH CHECK sees only
NEW). PostgreSQL **column-level UPDATE privileges** can, and they are role-based —
which fits providers (only the owner, one role `authenticated`, ever self-edits).

- **Drop** `providers_update_own` and `providers_update_safe_columns_only`
  (overlapping/defeated) and replace with a single row-ownership UPDATE policy:
  `USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id)`.
- **Revoke** table-wide `UPDATE` on `public.providers` from `anon, authenticated`;
  **grant** `UPDATE (<self-editable column list>)` to `authenticated` (the list in
  §7 self-editable). Sensitive columns are then un-updatable by authenticated at the
  privilege layer regardless of RLS — closing the is_featured/ratings/stripe_* holes.
- **Keep** `prevent_provider_verification_self_update` (defense in depth) and
  `recompute_provider_rating` (aggregate maintenance). No new helper needed.
- **App change:** none required IF the granted column list covers every column the
  app writes (edit-profile, go-live, AvailabilityEditor). Caveat: go-live's upsert
  writes `verification_status`/`identity_verified` — on the INSERT path (new
  provider) this is fine; a re-upsert on an existing row would need those excluded
  (the verification trigger already blocks them), so go-live should send them only
  on first creation. Flag for the implementation gate.
- anon: no UPDATE at all.

## 11. Proposed booking remediation (design; do not implement yet)

Column-level grants can NOT separate client-writable vs provider-writable columns
(both are role `authenticated`, differentiated per-row, not per-role). RLS cannot do
NEW-vs-OLD column comparison. Therefore field integrity here needs a **BEFORE UPDATE
trigger** (or revoke-UPDATE + controlled RPCs).

Recommended: a `SECURITY DEFINER` `BEFORE UPDATE` trigger
`enforce_booking_write_integrity()` that:
- returns NEW unchanged for `service_role`.
- computes actor: client (`auth.uid()=OLD.user_id`) vs provider (owns `OLD.provider_id`).
- **rejects** any change to server/identity columns for both actors: `user_id`,
  `provider_id`, `service_id`, `payment_amount`, `payment_status`, all `stripe_*`,
  `payment_authorized_at`, `payment_captured_at`, `capture_scheduled_for`,
  `payment_finalized`, `refund_status`, `created_at`, `id`, `under_review`,
  `dispute_flag`, `admin_resolution_notes`.
- **client** may only: transition `status` from {pending,accepted} to a cancel value
  (`cancelled_by_client`), set `cancellation_reason`, `cancelled_at`,
  `cancellation_actor='client'`, `client_safety_notes`, `issue_reported`/`_reason`.
- **provider** may only: transition `status` along the allowed map (accept, decline,
  check-in, complete, no_show, cancel), set the matching lifecycle timestamps,
  `provider_safety_notes`, `no_show_flag` (only with a no_show transition).
- Plus **fix the client-cancel policy**: change `clients_cancel_own_bookings` WITH
  CHECK to accept the real cancel value(s) (`cancelled_by_client`) instead of the
  invalid `'cancelled'`, and drop the tautological financial clauses (the trigger
  now enforces immutability).
- Also consider revoking table-wide `UPDATE` isn't enough here (client & provider
  need different columns), so the trigger is the enforcement point.
- **App change:** none expected — the app already performs exactly these
  status+timestamp transitions — but the exact transition map MUST be validated
  against every app `.update` call before enabling (risk of breaking a legitimate
  transition). Mark UNCERTAIN until each transition is enumerated and tested.

Alternative (cleaner long-term, larger app change): revoke UPDATE and expose
`SECURITY DEFINER` RPCs (`booking_accept`, `booking_decline`, `booking_cancel`,
`booking_complete`, …), each enforcing one transition. Not chosen now due to app
surface.

## 12. Compatibility analysis

| app write | providers-fix | bookings-fix |
|---|---|---|
| edit-profile `.update(profile fields)` | WILL CONTINUE WORKING (columns granted) | – |
| go-live `.upsert(...)` | WILL CONTINUE WORKING on create; **UNCERTAIN** on re-upsert (verification_status/identity_verified) | – |
| AvailabilityEditor `is_mobile` | WILL CONTINUE WORKING | – |
| booking INSERT (payment.tsx) | – | WILL CONTINUE WORKING (INSERT policy unchanged; payment_amount still client-set — see P2) |
| provider accept/decline/complete/checkin updates | – | **WILL CONTINUE WORKING** only if the trigger's transition map includes them — must be verified per call |
| client cancel (`cancelled_by_client`) | – | **FIXED** (currently broken) once the policy value is corrected |

No provider app change required (column list must be complete). Bookings: no app
change expected but requires exhaustive transition enumeration → treat as UNCERTAIN
until validated.

## 13. Test matrix (for implementation)

### bookings (INSERT/SELECT/UPDATE/DELETE × anon, booking client, booking provider, unrelated client, unrelated provider, service_role)
- INSERT: client own ALLOW; anon DENY; setting someone else's user_id DENY.
- SELECT: client own ALLOW; provider own ALLOW; unrelated DENY; anon DENY.
- UPDATE field-tamper: provider set payment_amount/payment_status/stripe_* → DENY (trigger); provider valid status transition → ALLOW; provider invalid jump (pending→completed) → DENY; provider reassign user_id/provider_id → DENY; client cancel (cancelled_by_client from pending/accepted) → ALLOW; client set completed/payment → DENY; unrelated → DENY.
- DELETE: all app roles DENY; service_role ALLOW.

### providers (INSERT/SELECT/UPDATE/DELETE × anon, owner, unrelated, service_role)
- INSERT: owner (user_id=self) ALLOW; anon DENY.
- SELECT: public ALLOW.
- UPDATE self-editable columns (owner) ALLOW; UPDATE sensitive columns (is_featured, ratings, stripe_*, is_approved) → DENY (column privilege); verification fields → DENY (trigger); user_id → DENY; unrelated → DENY; anon → DENY.
- DELETE: app roles DENY; service_role ALLOW.

## 14. Batch recommendation

**B. SPLIT INTO BOOKING + PROVIDER MIGRATIONS.**
Different mechanisms and risk profiles: providers is a clean column-privilege +
policy-consolidation change (low app risk); bookings needs a write-integrity trigger
plus a status-transition map that must be validated against every app call (higher
risk). Recommended order:
1. **Providers first** (column-level UPDATE grants + single ownership policy) — closes
   the P1 stripe/rating/self-promotion holes with minimal app risk.
2. **Bookings second** (write-integrity trigger + fix client-cancel drift) — after
   enumerating and testing every app transition.

## 15. Proposed migration filename(s) (NOT created)
- `supabase/migrations/20260830000000_security_batch_3a_provider_field_integrity.sql`
- `supabase/migrations/20260830010000_security_batch_3b_booking_write_integrity.sql`

## 16. Report path
`docs/audits/SECURITY_BATCH_3_BOOKING_PROVIDER_WRITE_INTEGRITY_INVESTIGATION.md`

## 17. Status
No migration created; no RLS/policy/trigger/grant change; no production data change
(all attack simulation rolled back — bookings still 11 rows, provider row unchanged).
Production access was read-only introspection + rolled-back role simulation.
