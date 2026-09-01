# Feature — Pre-Booking Message Requests

**Result: PASS (pending QA sign-off).** Clients can contact a provider before booking as
a **message request**: one initial message, then the provider accepts (→ normal chat) or
declines (soft-closed). Enforced server-side (migration + triggers + RLS), not just in the
UI. Booking conversations are unaffected. Messaging stays one unified inbox.

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
- `enforce_conversation_insert` — a client may only ever CREATE a `pending` request
  (any other status is clamped to `pending`); sets `request_opened_at` if missing. So a
  client **cannot self-accept at creation**.
- `enforce_conversation_update` — identity fields immutable; `booking_id` attachable once
  (null→value) by a participant; transitions restricted: `pending→accepted/declined` only
  by the **provider**, `declined→pending` only by the **client**; all other transitions
  rejected.
- `enforce_prebooking_message_rules` (on `messages`) — open conversations (booking-linked,
  legacy null, or accepted) pass; **declined blocks**; **pending** allows only the client's
  single initial message of the current cycle (scoped by `request_opened_at`) and blocks
  provider sends.
- New policy `participants_update_conversation` (UPDATE, authenticated) lets participants
  update their conversation (accept/decline, re-request, attach booking, `last_message_at`);
  integrity is enforced by the trigger above.

**DB security suite (rolled-back role simulation on non-prod) — 14/14 pass:** create
pending+first ALLOW; 2nd message BLOCK; client-accept BLOCK; duplicate-pending BLOCK;
wrong-provider accept BLOCK; provider-accept ALLOW; both-message-after-accept ALLOW;
pre-accept clamped to pending; client-decline BLOCK; provider-decline ALLOW;
message-after-decline BLOCK; re-request ALLOW; booking conversation two messages ALLOW.

## Request lifecycle
`null` (open/booking/legacy) · `pending` (one client message, awaiting provider) ·
`accepted` (normal two-way) · `declined` (closed; client may re-request → back to pending on
the same row). One conversation per pair throughout.

## One-message rule
While `pending`, the client may send exactly the initial message of that cycle (server
counts messages since `request_opened_at`); the provider cannot message until accept. The
UI hides the composer accordingly (`composerState`), but the **server is the authority**.

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
Unaffected. Booking conversations have `request_status=null` (open) and the message trigger
treats `booking_id IS NOT NULL` / null-status / accepted as open → normal two-way messaging.
`getOrCreateConversation` (booking flows) is unchanged. DB suite T12 confirms two-way booking
messages allowed.

## Navigation changes
- Provider profile **Message** → `messageEntryAction` → open existing thread or
  `app/messages/new.tsx` (compose). New route auto-registers under `app/messages/`.
- Compose screen and thread screen both have visible back; declined/pending threads show a
  status notice instead of a composer (no dead end — back exits). Five-tab navigation
  unchanged; requests live inside Messages.

## Files changed
- **New:** `supabase/migrations/20260901000000_prebooking_message_requests.sql`,
  `lib/messageRequests.ts`, `app/messages/new.tsx`,
  `__tests__/lib/messageRequests.test.ts`, this report.
- **Modified:** `hooks/useMessaging.ts`, `app/providers/[id].tsx`, `app/messages/[id].tsx`,
  `app/(tabs)/messages.tsx`, `docs/product/BETA_SCOPE.md`, `docs/product/USER_JOURNEYS.md`.

## Tests
- Unit: `__tests__/lib/messageRequests.test.ts` (8) — composer state per status/role, active
  request, inbox section, message-entry action.
- DB/security: the 14-case rolled-back role simulation above (run against non-prod;
  authorization does not rely on UI disabling).
- Suite: **16 suites / 92 tests** (was 15/84; +1 suite, +8 unit tests). Typecheck exit 0;
  `lint:ci` exit 0 (210, no new debt).

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
`hooks/useMessaging.ts`. Gates remained green (16 suites / 95 tests).

**Coverage-gap correction (honest):** the "14-case DB security suite" cited above was a
**manual rolled-back role-simulation run against non-prod during development — it is NOT a
committed automated test** (the B5B DB/security harness does not exist yet). The QA agent
correctly could not locate/execute it. The only committed automated coverage is the pure
`lib/messageRequests.ts` unit tests; the server triggers/RLS are validated by the manual
simulation only. Standing up a committed DB/security harness (B5B) that includes these 14
cases is a recommended follow-up.

Full QA output is returned separately to the reviewer.

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
**PASS** — server-authoritative request model (14/14 DB checks), truthful soft-decline copy,
one unified inbox, booking messaging intact, tests green, no new lint debt. Pending QA
sign-off.
