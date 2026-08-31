# Security Batch 3b — Booking Write Integrity (INVESTIGATION / DESIGN ONLY)

Scope: `public.bookings`. Read-only + design (attack simulation rolled back). No
migration, no production/app/migration change.

**Headline (confirmed by live rolled-back simulation):**
- **INSERT hole:** a client can create a booking with `status='completed'`,
  `payment_status='captured'`, seeded `completed_at`/`no_show_flag`/`payment_finalized`,
  and arbitrary `payment_amount` — the INSERT policy only checks `user_id`. **P1.**
- **UPDATE hole:** a provider can change `payment_amount`, `payment_status`,
  `status` (any value), `no_show_flag`, and reassign `user_id` on their bookings —
  the policy's `col = col` clauses are tautologies. **P1.**
- **Client cancel is broken:** the policy demands `status='cancelled'` (invalid per
  the CHECK constraint; the app sends `'cancelled_by_client'`). **P2 functional.**
- Financial fields are effectively unprotected today; **payment is a placeholder**
  (nothing is charged at request time; no payment edge function exists), which
  lowers current $ impact but not the integrity/trust impact.

---

## 1. Booking schema summary
`bookings`: 40 columns, 11 rows, RLS on (not forced), grants = full CRUD to
anon/authenticated/service_role. PK `id`; FKs `provider_id→providers(id) ON DELETE
CASCADE`, `service_id→provider_services(id)`; **no FK on `user_id`**. CHECK
constraints on `status`, `payment_status`, `refund_status`, `cancellation_actor`,
and length checks on note fields. Only index: pkey. Trigger: `trg_no_self_booking`
(`reject_self_provider_action('user_id')`). Field groups:
- id: `id`. client identity: `user_id`. provider identity: `provider_id`. service:
  `service_id`, `service_name`.
- scheduling: `requested_date`, `requested_time`, `appointment_time`, `created_at`.
- status: `status` (default 'pending'). cancellation: `cancelled_at`,
  `cancellation_reason`, `cancelled_by`, `cancellation_actor`. completion:
  `completed_at`, `client_checked_in_at`, `provider_confirmed_at`,
  `provider_first_response_at`. no-show: `no_show_flag`.
- price/payment: `payment_amount`, `payment_status` (default 'unpaid'),
  `stripe_payment_intent_id`, `payment_authorized_at`, `payment_captured_at`,
  `stripe_last_event_id`, `stripe_last_event_at`, `capture_scheduled_for`,
  `payment_finalized`, `refund_status`. deposit: (none on bookings; on providers).
- safety/admin: `issue_reported`, `issue_reported_at`, `issue_reason`,
  `under_review`, `dispute_flag`, `admin_resolution_notes`,
  `provider_safety_notes`, `client_safety_notes`. updated: (none; no updated_at on bookings).

## 2. Exact policies + why they fail
| policy | cmd | role | USING | WITH CHECK | actually allows |
|---|---|---|---|---|---|
| Users can insert own bookings | INSERT | public | – | `auth.uid()=user_id` | a client to insert with **any** status/payment/completion values (only user_id is checked) |
| Users can view own bookings | SELECT | authenticated | `auth.uid()=user_id` | – | client reads own |
| Providers can view their bookings | SELECT | public | `provider_id IN (own providers)` | – | provider reads theirs |
| clients_cancel_own_bookings | UPDATE | authenticated | `auth.uid()=user_id AND status IN (pending,accepted)` | `auth.uid()=user_id AND status='cancelled' AND payment_amount=payment_amount AND …` | **nothing usable**: `status='cancelled'` violates the CHECK constraint, so it can never succeed; the `col=col` clauses are tautologies |
| providers_manage_own_bookings | UPDATE | authenticated | `provider_id IN (own providers)` | `provider_id IN (own providers) AND payment_amount=payment_amount` | a provider to change **every** column except provider_id (payment, status, flags, user_id) — the `payment_amount=payment_amount` clause is a tautology |

**Tautology explanation:** a WITH CHECK sees only the NEW row, so `payment_amount =
payment_amount` compares the new value to itself → always true (NULL for NULL). It
cannot mean "unchanged" (that needs OLD vs NEW, which only a trigger can do).

## 3. Complete app write map
| file | actor | op | columns / status | notes |
|---|---|---|---|---|
| `app/book/payment.tsx:134` | client | INSERT | user_id(self), provider_id, service_id, service_name, requested_date/time, appointment_time, message, **status='pending'**, **payment_status='unpaid'**, **payment_amount=servicePrice**, created_at | client-side; `servicePrice = parseFloat(selectedService.price)` — "information only; nothing is charged at request time" |
| `app/(tabs)/business/index.tsx:310` | provider | UPDATE | status='accepted', provider_confirmed_at, provider_first_response_at | |
| `app/(tabs)/business/index.tsx:342` | provider | UPDATE | status='cancelled_by_provider', cancelled_at, cancelled_by, cancellation_actor='provider', provider_first_response_at | |
| `app/bookings/request/[id].tsx:137` | provider | UPDATE | transition('accepted'{…}) / transition('cancelled_by_provider'{…}) | |
| `app/bookings/[id].tsx:198,236,257,273` | client & provider | UPDATE | status ∈ {cancelled_by_client, cancelled_by_provider, completed, no_show} + matching timestamps | `handleCancel`, complete, no_show |
| — | — | RPC / edge | **none** | no RPC; only `rate-limit` edge function (does not touch bookings) |

No unexplained writes. **Provider identity is `providers.id` (`bookings.provider_id`),
mapped to the caller via `providers.user_id = auth.uid()`.** Client identity is
`bookings.user_id = auth.uid()` (no separate client_id).

## 4. Status vocabulary
DB CHECK allows 12: pending, accepted, declined, canceled, cancelled_by_client,
cancelled_by_provider, arriving, checked_in, completed, late_cancelled, no_show,
rescheduled.

| status | DB-allowed | app-written | app-referenced (UI/bucket/type) | classification |
|---|---|---|---|---|
| pending | ✓ | ✓ (insert) | ✓ | live |
| accepted | ✓ | ✓ | ✓ | live |
| declined | ✓ | ✓ | ✓ | live |
| cancelled_by_provider | ✓ | ✓ | ✓ | live |
| cancelled_by_client | ✓ | ✓ | ✓ | live |
| completed | ✓ | ✓ | ✓ | live |
| no_show | ✓ | ✓ | ✓ | live |
| arriving | ✓ | ✗ | ✓ (bucket) | **DB-allowed, never written** (aspirational) |
| checked_in | ✓ | ✗ | ✓ (bucket) | **never written** (aspirational) |
| rescheduled | ✓ | ✗ | ✓ (type) | **never written** (aspirational) |
| canceled | ✓ | ✗ | rare | stale (single-l) |
| late_cancelled | ✓ | ✗ | ✓ (bucket) | never written |
| **cancelled** | ✗ | ✗ | ✓ (17 refs: UI buckets/labels) | **NOT a DB value** — UI alias; source of the policy drift |
| **confirmed** | ✗ | ✗ | ✓ (4 refs) | UI alias; not a DB value |

## 5. Lifecycle transition matrix (currently reachable, from code)
| FROM | → TO | actor | app action | fields also written |
|---|---|---|---|---|
| (none) | pending | client | create (payment.tsx) | user_id, provider_id, service_*, requested_*, appointment_time, payment_status='unpaid', payment_amount |
| pending | accepted | provider | Accept | provider_confirmed_at, provider_first_response_at |
| pending | declined / cancelled_by_provider | provider | Decline | cancelled_at, cancelled_by, cancellation_actor='provider', provider_first_response_at |
| pending/accepted | cancelled_by_provider | provider | Cancel | cancelled_at, cancelled_by, cancellation_actor |
| pending/accepted | cancelled_by_client | client | Cancel (currently **broken**) | (intended) cancellation_reason/at |
| accepted | completed | provider | Complete | completed_at |
| accepted | no_show | provider | No-show | no_show_flag(?) + timestamps |

**The app does not implement a full/strict lifecycle:** there is no reschedule
write, no check-in/arriving write, and no enforced ordering (the provider handlers
call a generic `update({status,…})`; ordering is enforced only in the UI).

## 6. Actor predicates (SQL-safe)
- **A. booking client:** `auth.uid() = bookings.user_id`.
- **B. booking provider:** `EXISTS (SELECT 1 FROM providers p WHERE p.id = bookings.provider_id AND p.user_id = auth.uid())` (note: `provider_id` = `providers.id`, mapped via `providers.user_id`; the two are **not** interchangeable).
- **C. unrelated authenticated user:** neither A nor B (RLS already blocks; SELECT/UPDATE policies don't match).
- **D. service_role:** `auth.role() = 'service_role'` (bypasses RLS; trigger returns early).

## 7. 40-column ownership matrix
Legend: CI=client on insert, PA=provider after insert, CA=client after insert,
SRO=service_role only, IMM=immutable after insert, DER=derived/trigger.

| column | writer |
|---|---|
| id | IMM (default) |
| user_id | CI; IMM after |
| provider_id | CI; IMM after |
| service_id | CI; IMM after |
| service_name | CI; IMM after |
| requested_date, requested_time | CI; IMM after (reschedule = PRODUCT DECISION) |
| appointment_time | CI; change = PRODUCT DECISION |
| message | CI; IMM after |
| status | CI forced 'pending'; PA (accept/decline/complete/no_show/cancel), CA (cancel only) |
| created_at | IMM (default) |
| provider_confirmed_at, provider_first_response_at | PA |
| client_checked_in_at | CA/PA (check-in unused today) |
| completed_at | PA (on complete) |
| cancelled_at, cancellation_reason, cancelled_by, cancellation_actor | PA or CA (whoever cancels) |
| no_show_flag | PA (on no_show) |
| payment_amount | CI (from service price); IMM after — **should be server-authoritative** |
| payment_status | CI forced 'unpaid'; SRO after |
| stripe_payment_intent_id, payment_authorized_at, payment_captured_at, stripe_last_event_id, stripe_last_event_at, capture_scheduled_for, payment_finalized, refund_status | **SRO only** (webhook/server; unused today) |
| issue_reported, issue_reported_at, issue_reason | CA (client reports); SRO |
| under_review, dispute_flag, admin_resolution_notes | **SRO/admin only** |
| provider_safety_notes | PA |
| client_safety_notes | CA |

No UNKNOWN columns.

## 8. INSERT integrity result (HARD GATE — rolled-back simulation)
Client, non-owned provider:
| attempt | result |
|---|---|
| create with `payment_amount=99999` | **ALLOW** |
| seed `status='completed'` | **ALLOW** ← hole |
| seed `payment_status='captured'` | **ALLOW** ← hole |
| seed `completed_at`+`no_show_flag`+`payment_finalized` | **ALLOW** ← hole |
| insert as another user's `user_id` | **DENY** (RLS WITH CHECK) |
| anon insert | **DENY** (RLS) |

**Payment questions:** `payment_amount` is copied client-side from
`selectedService.price` (provider-set on `provider_services`); the client can send
any value; there is **no DB-side authoritative price enforcement**; deposits/fees
are computed client-side; **payment integration is a placeholder** (nothing
charged; no capture edge function). So the price is not server-trusted — a PRODUCT
DECISION for when payments go live; low $ risk today.

## 9. UPDATE attack results (rolled-back; from SB3 + reconfirmed)
Provider on own booking: change payment_amount → **RLS_ALLOW**; payment_status →
**RLS_ALLOW**; status='completed' (arbitrary) → **RLS_ALLOW**; no_show_flag →
**RLS_ALLOW**; reassign user_id → **RLS_ALLOW** (trg only blocks self-booking);
change provider_id → **DENY** (WITH CHECK).
Client on own booking: cancel via `'cancelled_by_client'` → **DENY** (WITH CHECK
wants 'cancelled'); via `'cancelled'` → **CONSTRAINT_BLOCK**; self-complete /
change payment_amount → **DENY**.
Unrelated user → **DENY** (RLS). service_role → allowed (admin).

## 10. DELETE findings
No DELETE policy on bookings → authenticated DELETE returns **0 rows (denied)** by
RLS. The app never deletes bookings (cancellation is a status change).
**Recommendation:** keep it — authenticated DELETE should not exist; cancellation
replaces deletion. (Optionally revoke the inert table DELETE grant for cleanliness;
not required since RLS denies.)

## 11. Client-cancel root cause
`clients_cancel_own_bookings` WITH CHECK requires `status='cancelled'`, a value the
`status` CHECK constraint forbids and the app never sends (it sends
`'cancelled_by_client'`). The policy can therefore never be satisfied → clients
cannot cancel. Fix: change the required value to `'cancelled_by_client'` (the app's
real value) and drop the tautological financial clauses (a trigger enforces
immutability). No new status is needed.

## 12. Proposed state machine
Security-critical (enforceable now, SECURITY FACT):
- Initial status on INSERT = **pending** (forced); payment_status = **unpaid**
  (forced); completion/no-show/payment fields must be null/false at INSERT.
- Immutable after INSERT for authenticated: id, user_id, provider_id, service_id,
  service_name, message, created_at, requested_*, and all payment/stripe/refund
  fields, plus under_review/dispute_flag/admin_resolution_notes.
- Client may set status only `→ cancelled_by_client` (from pending/accepted) plus
  cancellation fields + client_safety_notes + issue_reported/_reason.
- Provider may set status to accepted/declined/cancelled_by_provider/completed/
  no_show plus the matching timestamps + no_show_flag + provider_safety_notes.

PRODUCT DECISION REQUIRED (do not invent):
- Strict ordering (may provider jump pending→completed? enforce accepted→completed
  only?).
- Reschedule flow (who, and mutability of appointment_time/requested_*).
- Check-in/arriving statuses (currently unwritten — real feature or dead?).
- Terminality (are completed/cancelled_* terminal / non-editable?).
- Whether `payment_amount` must be server-derived from the service price.

## 13. Enforcement architecture
**B. BEFORE INSERT + BEFORE UPDATE trigger + RLS**, plus the client-cancel policy
value fix. Rationale: RLS cannot compare OLD vs NEW (needed for immutability and
transitions); column-level grants cannot distinguish client from provider (both are
role `authenticated`, differentiated per-row). A trigger inspects OLD/NEW and
`auth.uid()`. Options C/D (revoke UPDATE + per-actor RPCs) are cleaner long-term but
require a large app rewrite (the app uses direct `.update`) — not warranted for the
security-critical fix. Recommend the trigger.

## 14. Trigger design (pseudocode — not created)
```
-- BEFORE INSERT (non-service_role): force safe initial state
if auth.role() <> 'service_role' then
  new.status := 'pending';
  new.payment_status := 'unpaid';
  new.completed_at := null; new.client_checked_in_at := null;
  new.provider_confirmed_at := null; new.no_show_flag := false;
  new.payment_finalized := false; new.payment_captured_at := null;
  new.payment_authorized_at := null; new.capture_scheduled_for := null;
  new.refund_status := 'none'; new.under_review := false; new.dispute_flag := false;
  -- user_id is enforced by the INSERT RLS policy (auth.uid()=user_id)
end if;

-- BEFORE UPDATE: enforce immutability + actor-scoped changes (use IS DISTINCT FROM)
if auth.role() = 'service_role' then return new; end if;
is_client   := auth.uid() = old.user_id;
is_provider := exists(select 1 from providers p where p.id=old.provider_id and p.user_id=auth.uid());
-- hard-immutable for both:
if new.id IS DISTINCT FROM old.id
   or new.user_id IS DISTINCT FROM old.user_id
   or new.provider_id IS DISTINCT FROM old.provider_id
   or new.service_id IS DISTINCT FROM old.service_id
   or new.created_at IS DISTINCT FROM old.created_at
   or new.payment_amount IS DISTINCT FROM old.payment_amount
   or new.payment_status IS DISTINCT FROM old.payment_status
   or new.stripe_payment_intent_id IS DISTINCT FROM old.stripe_payment_intent_id
   or new.payment_authorized_at IS DISTINCT FROM old.payment_authorized_at
   or new.payment_captured_at IS DISTINCT FROM old.payment_captured_at
   or new.capture_scheduled_for IS DISTINCT FROM old.capture_scheduled_for
   or new.payment_finalized IS DISTINCT FROM old.payment_finalized
   or new.refund_status IS DISTINCT FROM old.refund_status
   or new.under_review IS DISTINCT FROM old.under_review
   or new.dispute_flag IS DISTINCT FROM old.dispute_flag
   or new.admin_resolution_notes IS DISTINCT FROM old.admin_resolution_notes
then raise exception 'Booking financial/identity fields are not user-editable'; end if;
-- client may only cancel (+ own note/issue); provider may only status+operational:
if is_client and not is_provider then
   if new.status IS DISTINCT FROM old.status and new.status <> 'cancelled_by_client' then
     raise exception 'Clients may only cancel a booking'; end if;
   -- disallow provider-only columns changing (provider_safety_notes, completed_at, no_show_flag, ...)
elsif is_provider then
   -- disallow client-only columns changing (client_safety_notes, issue_reason, ...)
   null; -- status transitions allowed (strict ordering = PRODUCT DECISION)
end if;
return new;
```
Uses `IS DISTINCT FROM`; **raises** on illegal authenticated changes (never silently
resets). Strict status ORDERING is deliberately not enforced pending product
decisions (§12).

## 15. Compatibility matrix
| app write | verdict |
|---|---|
| client create (status='pending', payment_status='unpaid') | **WILL CONTINUE WORKING** (INSERT guard forces the same values the app already sends) |
| provider accept/decline/cancel/complete/no_show (status + timestamps) | **WILL CONTINUE WORKING** (provider status+timestamp changes allowed) |
| client cancel (`cancelled_by_client`) | **FIXED** (currently broken) |
| any financial/identity change post-insert | not used by app → no breakage; now blocked |

No app change required for the security-critical fix. (If a future strict-ordering
trigger is added, provider handlers must be validated against the transition map.)

## 16. Product decisions required vs security facts
**SECURITY FACTS (enforce now):** initial status = pending; payment_status = unpaid;
provider accept/decline/complete/no_show/cancel statuses; client cancel =
`cancelled_by_client`; financial/identity/admin fields immutable to authenticated;
no authenticated DELETE.
**PRODUCT DECISIONS REQUIRED (defer):** strict transition ordering & terminality;
reschedule ownership and appointment_time mutability; check-in/arriving/rescheduled
(real or dead); whether `payment_amount` must be server-derived; who may edit a
terminal booking.

## 17. Remediation verdict
**Split by scope:**
- **Security-critical subset (field immutability + INSERT integrity + client-cancel
  fix): A — DATABASE-ONLY FIX SAFE.** No app change; ship as Batch 3b.
- **Full status-transition state machine: C — PRODUCT DECISIONS REQUIRED.** Defer to
  a follow-up once the §16 product questions are answered.

Recommendation: implement the security-critical subset now via one BEFORE INSERT +
BEFORE UPDATE trigger and the client-cancel policy fix; do NOT invent transition
rules.

## 18. Proposed migration filename (NOT created)
`supabase/migrations/20260830010000_security_batch_3b_booking_write_integrity.sql`

## 19. Runtime test plan (for the security-critical migration)
Actors {anon, booking client, booking provider, unrelated auth, service_role} ×
{INSERT, SELECT, UPDATE, DELETE}:
- **Legitimate:** client create (status forced pending/unpaid); provider
  accept/decline/complete/no_show/cancel; client cancel (`cancelled_by_client`);
  provider cancel.
- **Tampering:** client/provider change user_id/provider_id/service_id → DENY;
  change payment_amount/payment_status/stripe_*/refund → DENY; arbitrary INSERT seed
  of completed/captured/no_show → forced-safe; unrelated user UPDATE → DENY; fake
  paid/complete/no_show via UPDATE → DENY; DELETE → DENY.
- **Regression:** existing booking screens load; app status filters still match DB
  values (verify no reliance on writing 'cancelled'/'confirmed'); provider dashboard
  transitions succeed. Use rolled-back fixtures; leave no rows.

## 20. Report path
`docs/audits/SECURITY_BATCH_3B_BOOKING_WRITE_INTEGRITY_DESIGN.md`

## 21–22. Status
No migration created; no RLS/policy/trigger/grant change; no production data change
(all attack simulation rolled back — bookings still 11 rows). No app change.
Production access was read-only introspection + rolled-back role simulation.
