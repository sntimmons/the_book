# Security Batch 3b — Booking Write Integrity (FINAL / APPLIED)

**Result: PASS.** Booking INSERT/UPDATE integrity is enforced: clients and
providers can no longer seed or tamper identity/financial fields, actor-specific
status authorship is enforced, and the previously-broken client cancellation now
works. Strict transition ordering remains deferred (product decisions).

## References
- Design report commit: `c654636ee4e36e6382b5e883b9396ba7e1ff2e55`
- Migration commits: `0547c0dd43562f67a684ff139132b210361f9249` (initial),
  `b52c18f126f049d517d60610355e671d4b76b9dc` (tightened actor allowlists + cast fix)
  — file `supabase/migrations/20260830010000_security_batch_3b_booking_write_integrity.sql`
- Production target: `kxregomuawwcqvisuhtr`

## Safety gate
Linked ref = `kxregomuawwcqvisuhtr`; prior seven local+remote, `20260830010000`
local-only; dry-run showed exactly one pending migration.

## Apply result
`supabase db push --linked` → `Applying migration 20260830010000_...` → success.

## Migration history
All eight local+remote (`…000000/023000/030000/050000/060000/070000/20260830000000/
20260830010000`). Post-apply `db push --linked --dry-run` → "Remote database is up
to date."

## Trigger / function verification (live)
`public.enforce_booking_write_integrity()` — owner **postgres**, **SECURITY
DEFINER**, `search_path=''`, no dynamic SQL. Trigger
`enforce_booking_write_integrity` **BEFORE INSERT OR UPDATE** on `public.bookings`
(exactly once; `trg_no_self_booking` also present). service_role bypass preserved.

## Final booking UPDATE policies
- `clients_cancel_own_bookings`: USING `auth.uid()=user_id AND status IN
  ('pending','accepted')`, WITH CHECK `auth.uid()=user_id AND
  status='cancelled_by_client'`.
- `providers_manage_own_bookings`: USING/WITH CHECK `provider_id IN (SELECT p.id
  FROM providers p WHERE p.user_id=auth.uid())`.
- No `col=col` tautologies; no DELETE policy; no alternate permissive UPDATE path
  (client and provider predicates are mutually exclusive per row — self-booking is
  blocked by `trg_no_self_booking`; the trigger enforces fields regardless of which
  policy admitted the row).

## Runtime results (rolled-back fixtures; existing 11 bookings preserved)

### Legitimate (ALLOW) — verified against the live trigger
| test | result |
|---|---|
| client INSERT (real payload) | **ALLOW** (status=pending, payment_status=unpaid, refund_status=none) |
| provider accept | **ALLOW** |
| provider decline/cancel (cancelled_by=auth.uid()::text, actor='provider') | **ALLOW** |
| provider complete | **ALLOW** |
| provider no_show | **ALLOW** |
| client cancel from **pending** | **ALLOW** |
| client cancel from **accepted** (HARD regression gate) | **ALLOW** |

### Malicious INSERT — clamped
Client insert seeding `status='completed'`, `payment_status='captured'`,
`payment_finalized=true`, `stripe_payment_intent_id`, `payment_authorized_at`,
`completed_at`, `no_show_flag=true`, `cancelled_at`, `cancellation_actor='admin'`,
`under_review=true`, `dispute_flag=true`, `admin_resolution_notes` →
**row created but CLAMPED**: status=pending, payment_status=unpaid,
payment_finalized=false, completed_at=null, no_show_flag=false, under_review=false.
Insert as another user's `user_id` → **DENY (RLS)**.

### Unauthorized status authorship — DENY
Provider → `cancelled_by_client` / `pending` / `declined` (and any non-allowlist
status) → **DENY**. Client → `accepted` / `completed` / `no_show` /
`cancelled_by_provider` → **DENY**. (Strict ordering NOT enforced; e.g. provider
pending→completed is not blocked by ordering — only authorship is.)

### Identity tampering — DENY
`user_id`, `provider_id`, `service_id`, `service_name`, `created_at` → **DENY**.

### Scheduling/request tampering — DENY
`requested_date`, `requested_time`, `appointment_time`, `message` → **DENY**.

### Financial/payment tampering — DENY
`payment_amount`, `payment_status`, `stripe_payment_intent_id`,
`payment_authorized_at`, `payment_captured_at`, `stripe_last_event_id`,
`stripe_last_event_at`, `capture_scheduled_for`, `payment_finalized`,
`refund_status` → **DENY**.

### Unused/future-field tampering — DENY
`client_checked_in_at`, `cancellation_reason`, `provider_safety_notes`,
`client_safety_notes`, `issue_reported`, `issue_reported_at`, `issue_reason` →
**DENY**.

### Action-specific tampering — DENY
Provider accept + `no_show_flag` → DENY; provider complete + cancellation fields →
DENY; provider no_show + `completed_at` → DENY; client cancel + `completed_at` →
DENY; client cancel + `cancellation_actor='provider'` → DENY; provider cancel +
`cancellation_actor='client'` → DENY.

### Unrelated authenticated user
UPDATE of a booking they neither own as client nor provider → **DENY** (RLS, no
row). DELETE → **DENY** (no delete policy).

### service_role
Update of otherwise-protected fields (`payment_status`, `completed_at`) → **ALLOW**
(administrative capability preserved).

## Cleanup verification
After all tests: bookings = **11** (unchanged), fixture booking `3a56748a` still
`pending`, providers = 9, zero test rows (`svc`/`mal`/`x`/`hack` = 0). All fixtures
rolled back; nothing persisted.

## Structural regression
| object | before | after |
|---|---|---|
| tables | 39 | 39 |
| views | 2 | 2 |
| **functions** | 16 | **17** (+ enforce_booking_write_integrity) |
| **triggers** | 18 | **19** (+ enforce_booking_write_integrity) |
| constraints | 158 | 158 |
| non-constraint indexes | 58 | 58 |
| buckets | 4 | 4 |
| storage policies | 12 | 12 |
| public policies | 96 | 96 (two booking UPDATE policies rewritten in place; net 0) |

SB1 (categories RLS), SB2a (3 provider_media_owner policies), SB2R/SB2b (4 contract
helpers), SB3a (providers_insert_guard present; authenticated has no table-wide
provider UPDATE) all intact. Typecheck: `npx tsc --noEmit` → exit 0.

## payment_amount initial trust limitation
`payment_amount` is still client-supplied at INSERT (copied from the service price;
no server-side authoritative pricing; payment integration remains a placeholder).
SB3b locks it against UPDATE but does NOT make the initial value trustworthy —
remaining payment/pricing architecture debt for a future batch.

## Strict lifecycle still deferred
This migration enforces actor + action → allowed status/fields (write integrity).
It does NOT enforce: strict transition ordering (e.g. pending→accepted→completed),
terminal-state semantics, reschedule lifecycle, arriving/checked_in ordering,
late-cancellation semantics, or reopening. Those remain product decisions.

## PASS / FAIL
**PASS.**

## Remaining findings
- `payment_amount` server-authoritative pricing (payment/pricing architecture) —
  deferred debt.
- Full booking lifecycle state machine (ordering/terminality/reschedule) — product
  decisions, deferred.
- No unintended production data changes: all simulation rolled back; bookings and
  all structural counts unchanged aside from the intended +1 function / +1 trigger.
