# Batch 4 — App / Data Contract Reconciliation (INVESTIGATION / DESIGN ONLY)

Source of truth: current production schema (39 tables, 2 views, 17 functions), the
8 active migrations on main, and current app code. Historical/pre-canonical
migrations are NOT used as schema truth. No app, migration, or production change
was made (read-only introspection + rolled-back role simulation only).

**Headline:** the app is unusually well-aligned with the DB contract — every
`.from(...)` resolves to a real object, and provider identity (`providers.id` vs
`providers.user_id`) is used correctly everywhere. The real gaps are: **one missing
RPC** (`feature_interest_count`), **payments are schema-only with misleading "you
were charged" copy**, a **silent contract-signing skip on a read error (P1)**, and
a **duplicate local booking-status bucketer that mis-buckets `rescheduled` (P2)**.

---

## 1. RPC inventory
Exactly **one** `supabase.rpc(...)` in the whole app:

| RPC | file | args | returns | error handling | live? |
|---|---|---|---|---|---|
| `feature_interest_count` | `components/ComingSoonInterest.tsx:54` | `{ p_feature_name }` | scalar `integer` | swallowed (line hidden if absent) | **MISSING** |

Verdict: **MISSING**. The function is defined only in a **loose, never-migrated
file** `supabase/feature_interest_count.sql`; it is not in any migration and does
not exist in production. It IS the right architecture: `feature_interest` RLS
restricts SELECT to `user_id = auth.uid()`, so a client `.from().select(count)`
would only ever see the caller's own row. A `SECURITY DEFINER` function is required
to return the true global aggregate without exposing PII. Impact is graceful: the
"N people interested" social-proof line is simply hidden — it gates nothing.

## 2. Missing/drifted RPC findings
- `feature_interest_count` — MISSING (see §1). **Fix = a tiny forward migration**
  adding the SECURITY DEFINER function from the loose SQL (B4B), *if* the coming-soon
  social-proof line is wanted; otherwise leave the RPC dead (feature degrades
  cleanly). Not a blocker.
- No SIGNATURE-DRIFT / RETURN-SHAPE-DRIFT RPCs (there are no other RPCs).

## 3. Table/view contract findings
Every distinct `.from('...')` resource resolves to a real live object — **no
DATABASE GAP, no missing table**. Notable:
- `clients_public`, `clients_provider` are **views** (S1B), read-only, keyed by
  `clients.id = auth.uid()`. MATCH.
- `conversation` (singular) is **intentional and correct** (documented); the plural
  does not exist. MATCH.
- `provider-media` / `contract-pdfs` / `contract-signatures` are **storage buckets**,
  not tables. N/A.
- **APP DRIFT (minor):** `client_reviews` reads select `review_text, tags` but the
  provider-review INSERT never sets them → those columns are always null on this
  path (dead select columns). P3.
- **DORMANT/DEAD (empty tables the app references or could):** `booking_events`,
  `provider_metrics_daily`, `provider_booking_clicks`, `provider_profile_views`,
  `post_views`, `provider_blocked_dates`, `reports`, `community_reports`,
  `care_reminders`, `provider_policies`, `shifts`, `shift_clients` are all 0-row.
  Most are write-targets for features not yet exercised (not bugs); `shifts`/
  `shift_clients` are confirmed dormant (SB1).

## 4. Provider identity findings
**Correct and consistent everywhere.** Every `provider_id` FK column references
`providers.id` (22 FK constraints); the canonical resolver `lib/resolveUserRole.ts`
exposes `AuthContext.providerId = providers.id` (resolved via
`.eq('user_id', auth uid)`). By domain: bookings, messages/`conversation`, follows,
`saved_providers`, provider_reviews, client_reviews, contracts, provider_services,
availability, community/barter, notifications — all use `providers.id` for
`provider_id` and `auth.uid()` only for ownership/RLS filters. **No place confuses
`providers.id` with `providers.user_id`.**
- The only auth-uid-keyed surface in the provider domain is **storage media paths**
  (`provider-media` keyed by `auth.uid()`) — intentional (storage RLS ownership),
  URL then saved to `providers.profile_photo_url`. Not a violation.
- Maintenance nuance (P3, not a bug): `otherPartyId` in `useMessaging.ts:187` /
  `messages/[id].tsx:64` carries either a `provider_id` or a client auth uid
  depending on viewer role; always used against the matching table, so correct, but
  a hazard if later reused cross-table.

**Canonical identity rule (proposed, already de facto followed):** use
`providers.id` for all `provider_id` columns and `/providers/[id]` routes; use
`providers.user_id` / `auth.uid()` only for ownership resolution, RLS filters, and
storage paths; never interchange them. Resolve provider→providers.id via
`AuthContext.providerId`.

## 5. Booking status vocabulary findings
Live CHECK allows 12: pending, accepted, declined, canceled, cancelled_by_client,
cancelled_by_provider, arriving, checked_in, completed, late_cancelled, no_show,
rescheduled.
- **Written (all valid):** pending, accepted, completed, no_show,
  cancelled_by_provider, cancelled_by_client. No invalid literal is ever written.
- `'cancelled'` (17 refs) and `'confirmed'` (4) are **UI/label/bucket keys only** —
  never written or used as a DB status. `lib/bookingStatus.ts` (the canonical bucket
  helper) handles both `canceled`/`cancelled` spellings and routes unknowns to
  "cancelled", so nothing silently vanishes there.
- **P2 — divergent duplicate bucketer:** `app/bookings/[id].tsx:52-69` has a *second*
  local `statusBucket()` that omits `rescheduled` → a valid `rescheduled` booking
  buckets to "cancelled" and `ActionButtons` treats it as terminal (action-dead),
  while the pill still shows "Confirmed" and the list screen (`bookingTab`) maps it
  to "upcoming". A real active booking becomes uneditable on the detail screen.
- **P2 — analytics revenue:** `analytics-utils.ts:115-124` counts pending/accepted/
  arriving/checked_in as earning (self-flagged `TODO: revert to completed only
  before production`) → inflated revenue.
- **P3 — analytics cancel undercount:** `CANCEL_STATUSES` (`analytics-utils.ts:104`)
  omits cancelled/canceled/declined.
- **P3 — raw labels:** `analytics.tsx:42-57` renders raw DB status strings for
  arriving/checked_in/rescheduled/cancel-variants.

## 6. Contract feature findings
- **Works:** contract creation (`contracts.upsert`, one per provider), PDF upload to
  the private `contract-pdfs` bucket (`uploadContractPdf` stores the path-encoding
  `pdf_url`), and read-back via `getSignedPdfUrl`/`createSignedUrl` in the PDF viewer
  (with a real failure+retry state). Aligns with the SB2b object-bound read model.
- **Placeholder:** signatures — `app/book/payment.tsx:172-179` inserts
  `signature_url: null` (no capture canvas); the signed contract never shows a real
  signature. The `declined` signature status is a **dead branch** (`decline()` just
  `router.back()` — no row written).
- **P1 (cannot-work-correctly):** `lib/contracts.ts:123-127` `fetchProviderContract`
  returns `null` on *any* read error; the client signing flow gates on this, so a
  transient read error silently lets a client book **without being asked to sign**.
  A contract requirement is skipped with no user-visible error.
- **P2:** `app/book/payment.tsx:180-183` swallows the `contract_signatures` insert
  error → a "signed" booking can have **no signature row** (contract proof lost),
  booking still succeeds.
- **Fix split:** the P1/P2 are **app fixes** (error handling); real signatures and
  the decline path are **product decisions** (build the canvas). No DB fix needed for
  the current contract path (schema + SB2R/SB2b are correct).

## 7. client_reviews verdict
**CLOSED FALSE POSITIVE.** There is no JSON `dimensions` column; the rating
dimensions are four boolean columns — `showed_up`, `on_time`, `followed_policy`,
`payment_completed` — which the provider-review INSERT
(`post-booking/provider-review.tsx:143-156`) sets and `lib/reviews.ts:122-125`
reads and aggregates. Evidence: live `client_reviews` columns include exactly those
four booleans plus `private_note` (written, deliberately never displayed). The prior
"missing dimensions" concern does not hold. Minor residual drift (P3): the
client_reviews READ selects `review_text, tags`, which that INSERT never sets
(always null).

## 8. Other enum/status drift
- **`deposit_type` vocab inconsistency (P3):** `providers.deposit_type` CHECK =
  `flat|percentage`; `provider_services.deposit_type` CHECK = `fixed|percentage`.
  The app writes only `provider_services.deposit_type='fixed'` (valid); it never
  writes `providers.deposit_type`. Latent inconsistency, not an active bug.
- `contract_signatures.status` allows `pending|signed|declined`; app writes only
  `'signed'` (declined path dead — see §6).
- `payment_status` CHECK allows `unpaid|authorized|captured|cancelled|refunded`; app
  only ever writes/keeps `'unpaid'` (see §11). `PaymentBadge` has dead
  captured/authorized branches.
- providers `verification_status` (`unverified|pending|verified|rejected`): app
  writes `pending` at go-live; nothing transitions it beyond that (no admin flow) —
  see §12.

## 9. Critical Supabase error-handling findings
Critical journeys that are **correct** (surface error + Sentry/Alert, or
optimistic-with-revert): booking create (`book/payment.tsx:151-165`), provider
accept/decline (dashboard + request screen, with revert), booking status update,
review submit (both directions, 23505 handled). Defects:
| # | file:line | issue | risk |
|---|---|---|---|
| 1 | `lib/contracts.ts:123-127` | read error → `null` → client books without signing | **P1** |
| 2 | `app/book/payment.tsx:180-183` | signature insert error swallowed → no signature row | **P2** |
| 3 | `lib/reviews.ts:66-73,128-136` | review reads return `[]` on error (RLS-special-cased) — can hide reviews | P3 |
| 4 | `lib/contracts.ts:162-215` | provider signature list swallows → empty list | P3 |

## 10. Dead / stale DB assumptions
- **Missing function:** `feature_interest_count` (loose SQL never migrated) — the one
  real dead RPC assumption.
- **Dormant empty tables** referenced or targeted by the app but never populated:
  `booking_events`, `provider_metrics_daily`, `provider_booking_clicks`,
  `provider_profile_views`, `post_views`, `provider_blocked_dates`, `reports`,
  `community_reports`, `care_reminders`, `provider_policies`, `shifts`,
  `shift_clients`. None is a crash risk; several are analytics/event sinks awaiting
  writers.
- **Dead select columns:** `client_reviews.review_text`/`tags` (never written on the
  provider path); `client_reviews.private_note` (written, never displayed).
- **Dead status branches:** contract-signature `declined`; booking `PaymentBadge`
  captured/authorized.
- No references to non-existent tables/columns were found.

## 11. Payment implementation truth
**SCHEMA-ONLY / NOT BUILT.**
- **NOT BUILT:** no Stripe SDK in `package.json`; no Stripe Edge Function
  (`supabase/functions/` has only `rate-limit`); no authorization/capture/charge code
  anywhere.
- **SCHEMA-ONLY:** all `stripe_*` / payment columns, CHECK constraints, and a
  `capture_scheduled_for` index exist but nothing populates them. `payment_amount` is
  client-supplied (copied from the service price, no server authority);
  `payment_status` is only ever `'unpaid'` — SB3b's trigger forcibly pins it and
  nulls the Stripe fields on INSERT and locks them on UPDATE.
- **BROKEN/PRODUCT-TRUTH DEFECT (P1):** `app/post-booking/accepted.tsx:373,430,261`
  tells the user *"Your {amount} deposit has been charged."* and writes
  "Deposit charged" into the calendar note — when the system is **incapable of
  charging**. Pre-booking copy is honest ("no payment now"); the post-acceptance copy
  is a financial misrepresentation. This is the highest-priority payment finding and
  is an **app-only fix** (copy/logic), independent of building payments.

## 12. Feature truth matrix
| domain | status |
|---|---|
| provider profiles | **REAL + WORKING** |
| bookings (create + status lifecycle) | **REAL + WORKING** (minus the `rescheduled` detail-screen bug; payment stays unpaid) |
| payments | **PLACEHOLDER / SCHEMA-ONLY (NOT BUILT)** + misleading "charged" copy |
| contracts | **REAL + PARTIALLY WORKING** (text/PDF work; signatures placeholder; P1 silent-skip) |
| reviews (both directions) | **REAL + WORKING** |
| messaging | **REAL + WORKING** |
| follows / social (`provider_follows` + `saved_providers`) | **REAL + WORKING** |
| availability | **REAL + WORKING** |
| verification | **BACKEND EXISTS / ADMIN-UI INCOMPLETE** (self-set `pending`; no path to `verified`, no admin flow — effectively dormant) |
| community / posts / barter | **REAL + WORKING** (low volume) |
| care_reminders / analytics events | **BACKEND EXISTS / DORMANT** (empty sinks) |

## 13. Risk classification
- **P1:** (a) contract-signing silently skipped on read error (`lib/contracts.ts`);
  (b) "deposit has been charged" copy in `accepted.tsx` (financial misrepresentation).
- **P2:** (c) `rescheduled` mis-bucketed → action-dead detail screen; (d) signature
  insert swallowed → lost signature record; (e) analytics counts non-completed as
  revenue (dev TODO).
- **P3:** deposit_type vocab inconsistency; analytics cancel undercount + raw labels;
  client_reviews dead select columns; `otherPartyId` maintenance hazard;
  `feature_interest_count` missing (graceful); dormant empty tables.
(No P0: no data-loss/security escalation — security is closed through SB3b.)

## 14. Proposed remediation batches
- **B4A — app-only correctness fixes (no migration, highest value):**
  - Fix `fetchProviderContract` to not silently skip signing on read error — surface/
    retry, or block booking until the contract is fetched (P1) [`lib/contracts.ts`].
  - Fix `accepted.tsx` "deposit charged" copy to match reality ("no charge yet")
    (P1) [`app/post-booking/accepted.tsx`].
  - Replace the local `statusBucket` in `app/bookings/[id].tsx` with the canonical
    `lib/bookingStatus.ts` helper (P2).
  - Surface the `contract_signatures` insert failure (P2) [`app/book/payment.tsx`].
  - Revert `DEV_EARNING_STATUSES` to completed-only (P2) [`analytics-utils.ts`].
  - Risk: low. No schema change. Tests: booking/contract/analytics screen flows.
- **B4B — database/API contract fixes (small migration):**
  - Add `feature_interest_count` as a proper SECURITY DEFINER migration (only if the
    social-proof line is wanted). Risk: low; one function; execute-to-authenticated.
  - Optional: unify `deposit_type` vocab (providers `flat` vs provider_services
    `fixed`) — low value, defer.
- **B4C — product decisions (no code yet):** payments (Stripe) scope; signature
  capture canvas + decline flow; whether contracts are mandatory to sign (drives the
  B4A P1 behavior); verification admin flow; booking transition ordering/terminality
  (SB3b deferred).
- **B4D — dormant/placeholder cleanup (last):** document/annotate empty sink tables;
  remove dead select columns/branches; retire the contract-decline dead path;
  post-F5C ops cleanup (delete disposable project, remove GitHub secrets).

## 15. Recommended execution order
1. **B4A** (app-only P1/P2 correctness + product-truth) — small, high-impact,
   unblocks trust/data correctness for beta; no schema risk.
2. **B4B** `feature_interest_count` migration — only if coming-soon social proof is in
   beta scope; otherwise skip.
3. **B4C** product decisions — schedule payments/signatures/verification; **do not
   block beta on full payments** (the copy fix in B4A neutralizes the trust issue).
4. **B4D** cleanup — after the above.

## 16. Product decisions required
- Are payments (Stripe auth/capture) in beta scope, or ship "request-only, pay
  later"? (Currently schema-only; copy must not claim a charge.)
- Are contracts **mandatory to sign** before a booking confirms? (Determines whether
  the B4A P1 fix blocks or merely warns.)
- Ship the signature-capture canvas + decline flow for beta?
- Verification: build an admin review flow, or hide verification UI for beta?
- Booking lifecycle: adopt strict transition ordering/terminality (SB3b deferred)?
- Unify `deposit_type` vocabulary across providers/provider_services?

## 17. Report path
`docs/audits/BATCH_4_APP_DATA_CONTRACT_RECONCILIATION.md`

## 18–21. Status
Report is the only change (untracked). No app code, migration, or production change;
migration history unchanged (8 applied). Investigation was read-only introspection +
rolled-back role simulation.
