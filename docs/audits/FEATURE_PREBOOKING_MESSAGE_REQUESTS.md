# Feature — Pre-Booking Message Requests

**Result: PASS (pre-merge correction pass complete; pending QA sign-off).** Clients can
contact a provider before booking as a **message request**: one initial message, then the
provider accepts (→ normal chat) or declines (soft-closed). Enforced server-side (migration +
triggers + RLS), not just in the UI. Booking conversations are unaffected, and a **real
booking supersedes any prior request** — it opens the same thread for two-way messaging.
Messaging stays one unified inbox. The one-initial-message gate is truly server-authoritative
(request-window and message timestamps are server-stamped, not client-trusted). Three
PR-level findings (QA-REGRESSION-001 HIGH, QA-TRUTH-001 MEDIUM, QA-TRUTH-002 MEDIUM) were
**resolved before merge** — see the dedicated section below.

## Current messaging architecture discovered
- One **singular** `conversation` table (id, client_id, provider_id, booking_id,
  last_message_at, created_at) + `messages` (conversation_id, sender_id, content, is_read,
  created_at). Unique `conversation_unique_pair (client_id, provider_id)` → **one
  conversation per pair**.
- Identity model: `conversation.client_id = auth.uid()`; `provider_id = providers.id`
  (row id); provider ownership resolved via `providers.user_id = auth.uid()`;
  `messages.sender_id = auth.uid()` for both parties.
- RLS: conversation INSERT/SELECT are participant-scoped; **there was no conversation
  UPDATE policy**; `messages` INSERT allowed either participant with no status gate.
- The provider-profile **Message** button already created a free pre-booking conversation
  (no gating) → this feature gates it behind request/accept.
- `getOrCreateConversation(client, provider, bookingId?)` matches on the pair only; booking
  flows pass a `bookingId`, pre-booking flows do not.

## Schema changes (migration `20260901000000_prebooking_message_requests.sql`)
- **Dropped a bug:** `conversation.booking_id DEFAULT gen_random_uuid()` (a nonsensical
  reconstructed-baseline default that made every booking_id-less conversation get a random
  non-null uuid — which would defeat the "booking_id IS NULL = pre-booking" gate). Existing
  rows keep their values; the app already inserts booking_id explicitly.
- Added `conversation.request_status text` (null | pending | accepted | declined, checked)
  and `conversation.request_opened_at timestamptz`.
- Added a partial unique index `conversation_one_pending_prebooking (client_id, provider_id)
  WHERE request_status='pending'` (belt-and-suspenders atop the base unique).

## RLS / security model (server-authoritative)
Three SECURITY DEFINER triggers (service_role bypass), mirroring the SB3b style, plus one
new RLS policy:
- `enforce_conversation_insert` — a client may only ever CREATE a `pending` request:
  any non-pending status is clamped to `pending`, **and a client-initiated conversation
  cannot be an ungated open chat** — if `auth.uid() = client_id` and `booking_id IS NULL`,
  status is forced to `pending` even when the client supplied `null` (closes QA-TRUTH-001),
  and if the client supplies a `booking_id` it must reference a **real booking for this
  exact pair** or the insert is rejected (so a fabricated `booking_id` cannot buy an open
  chat). **`request_opened_at` is server-authoritative** — for any non-service_role pending
  row it is stamped with `clock_timestamp()` and any client-supplied value is ignored/overwritten
  (closes QA-TRUTH-002; see below). A client thus cannot self-accept at creation.
  Provider/community-initiated inserts (`auth.uid() <> client_id`) are left untouched.
- `enforce_conversation_update` — identity fields immutable; `booking_id` attachable once
  (null→value) by a participant **and only if that booking genuinely belongs to the
  conversation's client↔provider pair** (booking_id is never a privilege-escalation vector);
  transitions restricted: attaching a legitimate booking may open the conversation
  (`null booking_id + request → accepted`) for a participant — **a real booking supersedes a
  prior pending/declined request** (QA-REGRESSION-001); `pending→accepted/declined` only by
  the **provider**, `declined→pending` only by the **client** (a re-request opens a NEW cycle
  and the server sets a fresh `clock_timestamp()` `request_opened_at`); a client may not
  otherwise mutate `request_opened_at`; all other transitions rejected.
- `enforce_prebooking_message_rules` (on `messages`) — **server-stamps `messages.created_at`
  with `clock_timestamp()` for every non-service_role insert** (so the enforcement boundary
  can't be gamed by a client-crafted timestamp; also preserves natural ordering). Open
  conversations (booking-linked, legacy null, or accepted) pass; **declined blocks**;
  **pending** allows only the client's single initial message of the current cycle (counted as
  messages whose server `created_at` ≥ the server `request_opened_at`) and blocks provider
  sends.
- New policy `participants_update_conversation` (UPDATE, authenticated) lets participants
  update their conversation (accept/decline, re-request, attach booking, `last_message_at`);
  integrity is enforced by the trigger above.

**DB security suite (rolled-back role simulation on non-prod) — 25/25 pass.**
*Original 14 authorization cases (re-run, no regression):* create pending+first ALLOW;
2nd message BLOCK; client-accept BLOCK; duplicate-pending BLOCK; wrong-provider accept
BLOCK; provider-accept ALLOW; both-message-after-accept ALLOW; pre-accept clamped to
pending; client-decline BLOCK; provider-decline ALLOW; message-after-decline BLOCK;
re-request ALLOW; booking conversation two messages ALLOW (now using a REAL booking).
*Correction-pass cases (§ booking supersession + insert gate):* (A) client null-status
non-booking insert → forced `pending`; (B) pending→attach-legit-booking → open two-way,
client+provider both send; (C) declined→attach-legit-booking → open two-way; (D) attach a
booking that does NOT belong to the pair → BLOCK; (E) accepted→attach-legit-booking → still
two-way, same row; (G) client insert with a FAKE `booking_id` → BLOCK.
*Timestamp-hardening cases (§ QA-TRUTH-002):* (A) pending + a client **backdated** second
message → BLOCK (server-stamped `created_at` still counts the first); (B) client-supplied
**future** `request_opened_at` → server overwrites it, and the second message still BLOCKs;
(C) client-supplied far-future message `created_at` → server-controlled value wins; (D)
declined → re-request → server assigns a NEW `request_opened_at`, one new initial message
ALLOW, second BLOCK. All 25 pass. *(This remains a manual role-simulation run against
non-prod, not a committed automated harness — see the honesty note below.)*

## Request lifecycle
`null` (open/booking/legacy) · `pending` (one client message, awaiting provider) ·
`accepted` (normal two-way) · `declined` (closed; client may re-request → back to pending on
the same row). One conversation per pair throughout.

## One-message rule
While `pending`, the client may send exactly the initial message of that cycle (server
counts messages whose `created_at` ≥ `request_opened_at`); the provider cannot message until
accept. The UI hides the composer accordingly (`composerState`), but the **server is the
authority — and truly so**: both sides of that comparison are server-stamped with
`clock_timestamp()` (`request_opened_at` on pending-open/re-request; `messages.created_at` on
insert), so a client cannot backdate a message or future-date the request window to slip past
the one-message limit (QA-TRUTH-002). A re-request opens a fresh cycle with a new server
`request_opened_at`.

## Accept / decline behavior
Provider opens the pending thread (surfaced under the **Requests** filter) → **Accept**
(`setRequestStatus('accepted')`) flips the same conversation to a two-way chat (no duplicate
thread); **Decline** (`'declined'`) soft-closes it and returns to the inbox. Client-facing
declined copy: *"This provider isn't available to chat right now."* — no rejected/denied/
blocked language, no reason required.

## Duplicate prevention & re-request
`conversation_unique_pair` + the partial index guarantee at most one pending request per
pair; the client helper opens the existing open/pending conversation instead of creating a
duplicate. A **declined** request may be re-opened later (no cooldown in beta) by the client;
an **accepted** conversation opens directly.

## Inbox behavior
One unified inbox with filter tabs **All / Requests / Bookings**. All shows open
conversations (`inboxSection==='active'`); Requests shows pending (incoming for a provider,
sent for a client) with a count; Bookings unchanged. Declined requests are hidden from the
active lists. No separate messaging product; no role mode (per NAVIGATION.md).

## Booking-conversation regression status
Unaffected, and now explicitly hardened (QA-REGRESSION-001). Booking conversations have
`request_status=null` (open) and the message trigger treats `booking_id IS NOT NULL` /
null-status / accepted as open → normal two-way messaging. `getOrCreateConversation` now,
when called **with** a real `bookingId` and an existing pre-booking conversation is found,
attaches the booking and flips the row to open (`booking_id`, `request_status='accepted'`)
instead of early-returning the still-restricted row — so a prior `pending`/`declined`
request can never block messaging about an actual booking. It **never** overwrites an
existing `booking_id` (the first booking stays; later bookings reuse the one thread), and it
does nothing when called without a `bookingId`. DB suite cases B/C/E + the committed
`getOrCreateConversation` unit tests confirm the upgrade; T12 confirms an existing booking
conversation stays a normal two-way chat.

## Navigation changes
- Provider profile **Message** → `messageEntryAction` → open existing thread or
  `app/messages/new.tsx` (compose). New route auto-registers under `app/messages/`.
- Compose screen and thread screen both have visible back; declined/pending threads show a
  status notice instead of a composer (no dead end — back exits). Five-tab navigation
  unchanged; requests live inside Messages.

## Files changed
- **New:** `supabase/migrations/20260901000000_prebooking_message_requests.sql`,
  `lib/messageRequests.ts`, `app/messages/new.tsx`,
  `__tests__/lib/messageRequests.test.ts`,
  `__tests__/hooks/getOrCreateConversation.test.ts` (correction pass), this report.
- **Modified:** `hooks/useMessaging.ts`, `app/providers/[id].tsx`, `app/messages/[id].tsx`,
  `app/(tabs)/messages.tsx`, `docs/product/BETA_SCOPE.md`, `docs/product/USER_JOURNEYS.md`.

## Tests
- Unit: `__tests__/lib/messageRequests.test.ts` — composer state per status/role, active
  request, inbox section, message-entry action.
- Unit (correction pass): `__tests__/hooks/getOrCreateConversation.test.ts` (6) — locks the
  booking-upgrade behavior: existing pending + booking → attaches booking & opens (does not
  early-return untouched); existing declined + booking → upgrades; existing booking-linked →
  reused without overwriting booking_id; existing pending + no bookingId → reused unchanged;
  none → create; **and the booking-attach error path returns null rather than silently
  pretending success** (QA-TRUTH-002 defensive fix). (Mocks Supabase; the server triggers are
  the real authority, validated by the DB role-simulation.)
- DB/security: the 25-case rolled-back role simulation above (run against non-prod;
  authorization does not rely on UI disabling).
- Suite: **17 suites / 101 tests** (was 16/95; +1 suite, +6 unit tests). Typecheck exit 0;
  `lint:ci` exit 0 (210 warnings, no new debt).

## QA Agent 1 output
Agent 1 (QA / Journey Reviewer) ran **read-only** (feature acceptance + J13). **Verdict:
PASS WITH FINDINGS.** It confirmed the dual-layer (UI + server) enforcement of every core
invariant, correct identity resolution, no booking-messaging regression, a unified modeless
inbox, soft reasonless decline copy, re-request, duplicate prevention, and visible exits.
Findings are **advisory and NOT fixed in this batch** (documented as follow-ups):

- **QA-JOURNEY-001 · MEDIUM · CONFIRMED → RESOLVED BEFORE COMMIT** — original finding: the
  `app/book/datetime.tsx` "Message them directly" (no-availability) path used the legacy
  `getOrCreateConversation` → an **open** (`request_status=null`) conversation, bypassing the
  request gate. **Correction:** both client pre-booking entry points now route through a
  single centralized `openMessageEntry` (which uses `messageEntryAction`); the datetime path
  composes a request or opens the existing thread — it can no longer create a free chat.
  Locked by the `messageEntryAction` tests. *(Agent found → review accepted → corrected →
  revalidated; Agent 1's original output is unchanged.)*
- **QA-UX-001 · MEDIUM · LIKELY → RESOLVED BEFORE COMMIT** — original finding: a client on a
  **pending** thread didn't see the composer unlock when the provider accepted (thread read
  `request_status` once; only `messages` was subscribed). **Correction:** the thread now
  holds a Supabase realtime subscription scoped to its own conversation id
  (`postgres_changes` UPDATE on `conversation`, `filter: id=eq.<id>`) that updates
  `request_status`; on accept the composer unlocks and on decline the soft notice appears —
  no reopen needed. Subscription is cleaned up on unmount/id change; RLS still limits delivery
  to participants; the composer-state transitions are locked by new unit tests. Enforcement is
  **unchanged and still server-authoritative** (DB suite re-run 14/14). *(Agent found →
  accepted → corrected → revalidated.)*
- **QA-STATE-001 · LOW · CONFIRMED** — provider-initiated contact from business tools
  (`business/index.tsx`, `clients.tsx`, `client-intelligence.tsx`) creates open
  conversations (ungated cold contact). Consistent with the server (null=open) and likely
  intended for existing relationships, but outside the documented request model. Owner:
  Product Decision.
- **QA-UX-002 · LOW · CONFIRMED** — the "Requests (n)" filter mixes a user's incoming and
  sent pending requests under one label (correct for a unified inbox, but role-ambiguous for
  a user who is both). Owner: Product Decision / Implementation.

**Focused re-review (after the two corrections):** Agent 1 re-ran read-only and confirmed
**QA-JOURNEY-001 and QA-UX-001 RESOLVED** (verdict PASS WITH FINDINGS), with security still
server-authoritative and no regressions. It raised one new **QA-UX-002 · LOW** — the new
realtime channel name keyed only on the conversation id, not collision-hardened like the
codebase's `channelInstanceSeq` pattern (risking a "cannot add postgres_changes after
subscribe" blank-screen on a double-mount). Since that was a robustness defect in the code
just added for the QA-UX-001 fix, it was **corrected in the same pass**: the status channel
now appends a monotonic per-mount suffix (`conversation-status-<id>-<seq>`), mirroring
`hooks/useMessaging.ts`. Gates remained green (16 suites / 95 tests **at that pass**; the
later pre-merge correction pass added the `getOrCreateConversation` suite → **17 suites /
100 tests**, the current count).

**Coverage-gap correction (honest):** the DB security suite cited above (now **25 cases** —
14 original authorization + 6 booking-supersession/insert-gate + 1 fake-booking-insert + 4
timestamp-hardening) is a **manual rolled-back role-simulation run against non-prod during
development — it is NOT a committed automated test** (the B5B DB/security harness does not
exist yet). The QA agent correctly could not locate/execute it. The only committed automated
coverage is the pure `lib/messageRequests.ts` unit tests plus the `getOrCreateConversation`
unit tests; the server triggers/RLS are validated by the manual simulation only. Standing up a
committed DB/security harness (B5B) that includes these 25 cases is a recommended follow-up.

Full QA output is returned separately to the reviewer.

## PR #19 review findings — RESOLVED BEFORE MERGE (pre-merge correction pass)
Agent 1's **PR-level** review (read-only, on the pushed branch) returned **PASS WITH
FINDINGS** with two confirmed issues. Both were accepted and corrected on the branch
**before merge**; the migration (not yet in production) was corrected in place — no second
corrective migration was added. History preserved: the findings were real and are recorded,
not rewritten away.

- **QA-REGRESSION-001 · HIGH · CONFIRMED → RESOLVED BEFORE MERGE** — original finding:
  `getOrCreateConversation(userId, providerId, bookingId)` early-returned an existing
  conversation's id immediately; if that row was a `pending`/`declined` pre-booking request
  with `booking_id` null, a subsequent real booking never attached and the request
  restrictions kept blocking messaging about the actual booking. **Correction:** the helper
  now, when called with a real `bookingId` and an existing conversation lacking one, attaches
  the booking and opens the row (`request_status='accepted'`) on the **same** conversation
  (no duplicate, existing booking_id never overwritten); the `enforce_conversation_update`
  trigger authorizes this transition **server-side** and validates that the booking belongs
  to the pair. Locked by the new `getOrCreateConversation` unit tests + DB cases B/C/E.
- **QA-TRUTH-001 · MEDIUM · CONFIRMED → RESOLVED BEFORE MERGE** — original finding: the
  request gate was effectively UI-driven — a client could bypass it by inserting a
  conversation directly with `booking_id=null` and `request_status=null` and get an open
  chat. **Correction:** `enforce_conversation_insert` now forces a client-initiated
  non-booking conversation to `pending` server-side regardless of the supplied status, and
  additionally rejects a client-supplied `booking_id` that isn't a real booking for the pair
  (closing the sibling "fake booking_id" vector). Provider/business/community-initiated
  contact (`auth.uid() <> client_id`) is deliberately left open — a separate product
  question, not forced into the request model. Locked by DB cases A + G.
- **QA-TRUTH-002 · MEDIUM · LIKELY → RESOLVED BEFORE MERGE** — surfaced by Agent 1's PR
  re-review: the "one initial message while pending" invariant counted messages by
  `messages.created_at ≥ request_opened_at`, but **both timestamps were client-controlled**
  (no server default on `messages.created_at`; `request_opened_at` client-settable, trigger
  filled only when null). A crafted client could backdate a message's `created_at` (or
  future-date `request_opened_at`) to keep the count at zero and send unlimited messages while
  pending. Same trust-class as QA-TRUTH-001. **Correction (timestamp hardening, server-side):**
  `enforce_conversation_insert` now stamps `request_opened_at := clock_timestamp()` for any
  non-service_role pending row (ignoring client input) and nulls it otherwise;
  `enforce_conversation_update` sets a fresh `clock_timestamp()` on a `declined→pending`
  re-request and forbids any other direct change to `request_opened_at`;
  `enforce_prebooking_message_rules` stamps `messages.created_at := clock_timestamp()` on every
  non-service_role insert (preserving ordering). The gate no longer depends on any
  client-controlled time. Locked by DB cases A–D (backdated second msg BLOCK; future
  `request_opened_at` overwritten; message `created_at` server-controlled; re-request resets
  the cycle) + the `getOrCreateConversation` attach-error unit test. *(Agent 1 found →
  Product/Architecture accepted → timestamps hardened server-side → DB bypass tests added →
  revalidated; original finding preserved.)*
- **Defensive fix (Agent 1 note, same flow):** `getOrCreateConversation` previously swallowed
  the booking-attach `update` error and still returned the existing conversation id. It now
  checks the error and returns `null` on failure — it no longer silently pretends a booking
  attached (the conversation could still be request-gated). Smallest change; no architecture
  broadened. Locked by a unit test.

**Realtime publication (QA-UX-001 follow-up, §checked):** the conversation-UPDATE realtime
subscription that unlocks the composer on accept requires `public.conversation` to be a
member of the `supabase_realtime` publication. On the non-prod project the publication
**exists but is empty** (no tables — this also affects the pre-existing `messages` realtime),
and **no migration manages publication membership** (it is dashboard/config-managed). So
conversation realtime is **not** verifiably working on non-prod today. This is an
environment/deploy-config gap, **not** a dead-end: the thread re-reads `request_status` on
every mount, so the composer still unlocks when the client re-opens the thread; realtime only
makes it live-in-place. **Not changed here** (per instruction, publication config is not
modified blindly) — flagged for the deploy runbook: enable Realtime for `conversation`
(matching however `messages` is enabled), or add a guarded `alter publication
supabase_realtime add table public.conversation;` if publication membership should become
migration-managed.

## Limitations
- Client verified state / verification gating is unrelated here (unchanged).
- Conversation-merging when a pre-booking chat later becomes a booking is not specially
  handled beyond attaching `booking_id`; documented as an open decision.
- No cooldown/anti-spam timing (approved as none for beta).
- No structured notifications/moderation of requests (not built).
- The migration is applied and validated on **non-prod**; production application is a
  separate, deliberate release step (not done here).

## Open product decisions
Cooldown/anti-spam; conversation-merge semantics; whether providers can initiate contact as
a request; request notifications/moderation. All deferred (documented, not invented).

## PASS / FAIL
**PASS** — server-authoritative request model (25/25 DB checks), client-bypass /
fake-booking / timestamp-manipulation vectors all closed server-side, a real booking
supersedes a prior request on the same thread (no duplicate), truthful soft-decline copy, one
unified inbox, booking messaging intact and hardened, tests green (17 suites / 101), no new
lint debt. All three pre-merge findings (QA-REGRESSION-001, QA-TRUTH-001, QA-TRUTH-002)
resolved before merge. Pending QA sign-off.
