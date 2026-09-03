# The Book — Reviews Model (approved) & Phase 0 Foundation

Status: **APPROVED product model.** Phase 0 (foundation hardening) is implemented in
migration `supabase/migrations/20260902000000_reviews_phase0_foundation.sql`. The structured
review UI/schema, delayed-deliverable eligibility, and category policies are **later phases**
(not built yet).

## Core principle
Reviews capture **verified patterns of behavior from completed transactions**, not Yelp-style
public arguments. **One account · one verified human · two reputation contexts:** (A) provider
reputation (`provider_reviews`, client→provider, public) and (B) client reputation
(`client_reviews`, provider→client, private/conduct). Both directions come only from a
**legitimate completed Book transaction**.

## Content model (structured signals become the primary reusable signal)
1. **1–5 star rating** — retained (familiar), but not intended to be the primary/most useful signal.
2. **Structured experience signals** — carry most of the reusable reputation data; may be
   **positive, negative, or mixed** (a star rating may order which signals surface first but
   must never prevent selecting a truthful signal inconsistent with the stars).
3. **Optional short free text** — retained for beta; context that structured signals can't capture.
4. **Private feedback where appropriate** — some provider→client info stays private (`private_note`),
   distinct from shared conduct reputation.
5. **Safety / incident escalation** — serious misconduct routes to a **separate** Report/Safety
   process, never reduced to a review tag. (Reputation feedback and safety reporting stay separate.)

**Reputation is pattern-based, not strike-based:** one negative signal is not a strike/suspension/
ranking penalty. Repeated patterns across independent completed bookings may later feed reputation
summaries (e.g. "94% of clients said Great communication"). Phase 0 introduces **no** tag→discipline
architecture. *(Working signal vocabularies for each direction are recorded with Product; not final
schema names, deferred to Phase 2.)*

## Eligibility vs reveal — two separate clocks (Phase 0, server-authoritative)
- **Eligibility** ("when can this be reviewed?"): a booking is reviewable when
  `completed_at IS NOT NULL` **AND** `under_review=false` **AND** the review window is open.
  Note the anchor is the immutable server-stamped **`completed_at`, not live `status`** —
  see SEC-DATA-101 below; `review_eligible()` deliberately contains no `status` test.
  Delayed-deliverable eligibility (photography/videography/creative) is **deferred** — no
  `delivered_at` or category timing yet. Enforced by `public.review_eligible(booking_id)`.
- **Review window:** **7 days** from the **server-authoritative** `completed_at` (one definition,
  one `<=` boundary: `public.review_window_closed`). Both sides share the window.
- **Late reviews:** after the window closes, **no new review may be submitted** for that booking
  (server-enforced via `review_eligible`).
- **Reveal** ("when do submitted blind reviews become visible?"): a review is revealed when the
  booking is eligible-shaped (completed, not under_review) **AND** (the counterpart review exists
  **OR** the 7-day window has closed). Enforced by `public.provider_review_revealed` /
  `public.client_review_revealed`. **No 1-hour one-sided reveal** — rejected because it enables
  retaliation.
  - Client submits Day 1, provider Day 2 → both reveal Day 2.
  - Client submits Day 1, provider never → client review reveals at window close (Day 7);
    provider can no longer submit.
  - Neither submits → nothing is published.
- **under_review HOLD:** while `under_review=true`, review INSERT is blocked and submitted blind
  reviews are **not** revealed (both baked into the predicates). Final resume/void semantics on
  dispute resolution belong to later booking/dispute architecture (not invented here).
- **Repeat bookings:** each completed booking is independently reviewable (UNIQUE per direction on
  `booking_id`); the same pair reviews again after another completed booking.
- **Editability (future rule):** editable while blind/unpublished; **immutable once revealed**.
  Phase 0 does not add edit UI; there is no UPDATE policy on the review tables today (INSERT-only),
  so no conflict — an edit-while-blind capability would need a future scoped UPDATE policy.
- **Skipping:** reviewing is optional. Phase 1 will make the provider→client entry **persistent**
  so skipping once doesn't destroy the opportunity (not built in Phase 0).

## Phase 0 foundation hardening (implemented)
Migration `20260902000000_reviews_phase0_foundation.sql` — **DB is authoritative** for eligibility,
submission-window, reveal, participant/direction binding, dispute hold, and the completion
timestamp. TypeScript owns presentation only.
- **SEC-DATA-001 (HIGH) fixed:** `client_reviews` INSERT now binds `client_user_id = booking.user_id`
  (a provider can no longer forge a conduct record against an arbitrary user).
- **SEC-DATA-002 (MED) fixed:** `providers.average_rating`/`review_count` recompute over **revealed**
  provider reviews only (a blind review never moves the public number); a counterpart `client_review`
  triggers a recompute.
- **SEC-DATA-003 (MED) fixed:** `completed_at` is **server-stamped on the FIRST-EVER completion** and
  **immutable** thereafter (no backdate/future-date/mutate/clear by an authenticated actor) — the
  review clock can't be manipulated.
- **SEC-DATA-101 (MED) closed:** reveal and eligibility are anchored on the immutable, server-stamped
  `completed_at` (**not** live `status`), so a provider **cannot suppress a revealed review** or block
  a client's review by transitioning a completed booking to `cancelled_by_provider`/`no_show`. A
  genuine void is expressed via `under_review` (a dispute hold, service_role-only), which holds reveal.
- **SEC-DATA-201 (MED) closed:** `completed_at` is stamped **once** (keyed on `old.completed_at IS NULL`),
  so a status **round-trip** (`completed → accepted/no_show → completed`) does **not** re-stamp it — the
  7-day window and any achieved reveal cannot be reset. (The transition legality itself is a deferred
  booking-lifecycle product question; the review-clock consequence is closed regardless.)
- **SEC-TRIGGER-102 (LOW) closed:** explicit `EXECUTE` grants (not default-privilege reliance) on the
  policy-referenced functions (`review_eligible` → authenticated; `provider_review_revealed` →
  authenticated, anon); internal helpers are not role-granted.
- **SEC-RLS-001 (MED) prepared:** `client_reviews` reveal is DB-owned; the SELECT policy stays
  author-only (not a cross-user leak), and `client_review_revealed()` is the required gate for any
  future cross-provider read. TypeScript is no longer the privacy boundary.
- **CODE-DUP-001 (HIGH) fixed:** one canonical reveal predicate; the redundant inline
  `provider_reviews_read_revealed` policy is dropped; a single `<=` boundary.
- **CODE-ARCH-002 (MED) improved:** eligibility centralized in `review_eligible()`, referenced by
  both INSERT policies.
- **SEC-TRUTH-001 (LOW) fixed:** `under_review` now actually blocks review submission.

**Validation:** rolled-back non-prod role simulation, 28/28 checks pass (eligibility both
directions, forged-client-id block, under_review block, window-close block, reveal
counterpart/window/hold, no cross-provider conduct leak, completed_at authority, revealed-only
aggregate, repeat booking, reveal-latching after a post-completion cancel, and completed_at
stamp-once across a status round-trip). That was a **manual, non-CI** simulation.

**A committed harness now exists.** `supabase/tests/` holds executable DB/security suites
(reviews + pre-booking messaging) run by `scripts/db-security-test.mjs` against a
**non-production** project inside an always-rolled-back transaction, wired to CI as the
`db-security` job. It asserts real Postgres enforcement — RLS exercised as the `authenticated`
role, triggers, grants and `SECURITY DEFINER` behaviour. See `supabase/tests/README.md` for
scope and the required `TEST_SUPABASE_DB_URL` secret, which is **not configured yet**.

## Phase 2 structured-signal storage — recommendation (not yet implemented)
The two tables already model structured data differently (`client_reviews` = typed booleans;
`provider_reviews` = free-form `tags text[]`). For direction-specific, positive/negative/mixed,
**aggregatable** signals, the recommended shape is a **normalized child table**
(`review_signals`: review ref, direction, signal key, value/polarity) — it represents mixed signals
cleanly, aggregates to percentages, avoids a migration-per-dimension, and keeps private notes
separate from shared conduct. Typed boolean columns (mirroring `client_reviews`) are the
lower-friction alternative but grow a migration per signal and don't model a shared vocabulary as
cleanly. **Decide in Phase 2**; whichever is chosen, it inherits the single reveal gate from Phase 0.

## Phase 1 — UX consumes the Phase 0 contract (implemented)
Phase 1 makes the review experience accurately reflect the Phase 0 server contract (no DB
contract change; two additive read helpers). **submitted ≠ revealed:** the client confirmation
now says the review was **submitted and stays private** until the other side reviews or the
window closes — never "now live/public/visible". A single server-authoritative read,
`review_opportunity(booking_id, direction)` (migration `20260903000000`), returns one of
`eligible / already_submitted / window_closed / under_review / not_completed /
not_participant`. It is `SECURITY DEFINER`, `authenticated`-only (anon EXECUTE explicitly
revoked), and fails closed for a null `auth.uid()`. It **composes** the Phase 0 predicates rather than
restating them: the 7-day window comes from `review_window_closed()` (one definition; the UI
never computes it client-side), and the positive answer is gated on `review_eligible()` — the
same predicate both INSERT policies use — so the helper can never report `eligible` for a
booking the write boundary would reject. The `completed_at` / `under_review` branches above it
exist only to explain **why** a booking is not eligible; they are not a second definition. When
`review_eligible()` later gains a condition (`delivered_at`, category windows), this stays
correct automatically instead of inviting the user into a form the DB will refuse.

`review_opportunities(booking_ids[], direction)` (migration `20260905000000`) is its **batch
form** for list surfaces, added when the client list was moved off live booking status. It is
`SECURITY INVOKER` and delegates per id to `review_opportunity`, so it adds no eligibility
logic, grants no privilege, and there remains exactly one implementation of review-entry state.
**Review availability is decided by the server in every surface** — a booking whose live status
drifts after completion keeps the review it earned, which is the client-side half of
SEC-DATA-101. Presentation grouping (the Past tab) decides where a card sits, never whether it
is reviewable. Consumers: a **persistent provider→client "Review client" entry** on a completed
booking's detail (survives skipping the completion prompt; keyed by `booking_id`, so repeat
bookings are independently reviewable); a **proactive client entry gate** (no routing into a
guaranteed-fail form); and **truthful terminal submit messages** ("already reviewed", "the
review period has ended", "under review") instead of a permanent retry loop — mapped by
re-reading the authoritative state (all RLS `WITH CHECK` rejections surface as `42501`). No
structured signals, `delivered_at`, category timing, editing, or moderation (Phase 2+).

## `no_show` — recorded, but not a service review (Phase 1 decision)
A `no_show` is a real booking event that **should** matter to reputation, but it is **not a
completed service experience**. Phase 1 therefore draws the line at *what kind of* reputation
it feeds:

- **No normal 1-5 star service-quality review flow** in either direction for a `no_show` —
  neither party is asked to rate service quality, quality of work, or outcome, because the
  service did not occur. ONE authoritative mechanism, deliberately: a booking that never
  completed has `completed_at IS NULL`, so `review_opportunity()` resolves it to
  `not_completed` and no surface offers a review. The booking list previously added a
  second, status-based presentation guard; that was **removed** (migration
  `20260905000000`) because keying any review decision on live status is exactly what let
  a status change suppress an earned review. Review availability now comes from the server
  answer alone, in every tab.
- **Eligibility is NOT gated on live status.** `review_opportunity()` deliberately contains
  no `status='no_show'` test. Testing live status there would let a provider suppress an
  already-earned client review — the exact vector Phase 0 closed as **SEC-DATA-101** — and
  would disagree with `review_eligible()`, which the INSERT policies use.
- **DECIDED: `completed → no_show` is an ILLEGAL transition** (migration `20260904000000`).
  `completed` and `no_show` are **alternative outcomes**; a legitimately completed booking
  cannot later become a no-show through the normal lifecycle. Enforced by one added condition
  in the `no_show` branch of `enforce_booking_write_integrity()`: `old.completed_at is not
  null` raises. This is the reason the read helper needs no status test — the contradictory
  state `completed_at IS NOT NULL AND status='no_show'` is now **unreachable for
  authenticated writers going forward** (a `BEFORE` trigger on new writes; it rewrites no
  pre-existing row, and `service_role` still bypasses). That is sufficient: since neither
  `review_opportunity()` nor `review_eligible()` tests live status, any legacy row in that
  state is treated identically by both — reviewable — which is the intended
  anti-suppression posture. The `completed_at` anchor keeps its guarantee. No other transition's legality
  changed. `service_role` still bypasses the trigger, so an **administrative correction
  workflow remains possible — it is a later product/ops concern and is NOT built here.** A
  genuine void on a completed booking is expressed via `under_review` (service_role-only).
- **The event is preserved, never suppressed.** The booking keeps `status = 'no_show'` and
  `no_show_flag`; it still appears in the Past tab with a "No show" pill, and it already
  feeds `fetchClientCompletionRate()`.
- **Past-tab grouping is not review eligibility.** The Past tab correctly groups `completed`
  + `no_show`; review entry is driven only by the server-authoritative review state.

**Future (NOT Phase 1, NOT Phase 2-committed):** a separate **conduct / reliability**
reputation layer, distinct from service-quality stars, could incorporate verified Book
transaction history and platform-recorded events — no-show, late cancellation, repeated
last-minute rescheduling, communication responsiveness, on-time behavior, completion
reliability, and following booking policy. It should be grounded in events The Book itself
records rather than free-text opinion. Schema, scoring, surfacing, and any ranking or
enforcement effects are **explicitly undesigned** and out of scope here.

## Phase 1 — submission rules and confirmations (decided)
- **A rating-only review is VALID.** A selected 1–5 star rating is sufficient to submit in
  **both** directions. Free text and tags are **optional**; no Phase 2 structured signal is
  required. (The client form previously demanded >10 characters of text *or* a tag, so a
  client who only tapped stars could not submit at all.) Client `canPost = parsedRating != null`
  mirrors the provider's `canSubmit = rating > 0`.
- **A negative experience is a NORMAL review.** Every selected 1-5 star rating continues
  through the **same** review flow, carrying the rating (`satisfaction` → `review?rating=N` →
  the value written to the row). A low rating is never discarded, never routed into a different
  system, and no control asks the client to affirm the experience was good — the single CTA is
  rating-neutral ("Continue to review"). Ordinary dissatisfaction is **not** an incident:
  "Report a problem" is a clearly separate, secondary action into the `reports` system
  (safety / billing / conduct), it carries no rating, and taking it leaves the booking's review
  opportunity open. Serious safety/incident handling remains later work.
- **Both submissions are confirmed, and both confirmations are blind-truthful.** A successful
  provider→client review no longer exits silently: it shows **"Review submitted" / "Your
  review stays private until they submit theirs or the review window closes."** — the shared
  `REVIEW_SUBMITTED_TITLE` / `REVIEW_SUBMITTED_BODY` constants, rendered through the existing
  shared state screen rather than new navigation. Neither direction may say *now live*,
  *public*, *visible immediately*, or *posted publicly*.

## Out of scope (later phases)
The Phase 2 structured-**signal schema/vocabulary** (a shared `review_signals` model),
`delivered_at`/deliverable eligibility, category review policies, provider delivery workflow,
client delivery confirmation, a public client reputation **profile**, conduct/reliability
reputation (incl. no-show and cancellation signals), safety/report system, moderation,
reputation ranking, review editing, free-text policy change.

*Already SHIPPED, and therefore NOT in the list above (pre-dates Phase 1 — do not read these as
unapproved scope):* the provider review form's four typed accountability booleans on
`client_reviews` (`showed_up` / `on_time` / `followed_policy` / `payment_completed`) and the
client reputation summary a provider sees on a booking request, aggregated by
`aggregateClientDimensions()`. What Phase 2 would add is the shared signal *vocabulary*, not
these existing typed columns.

*(The persistent provider→client CTA moved OUT of this list — it shipped in Phase 1 above.)*
