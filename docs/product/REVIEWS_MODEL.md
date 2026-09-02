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
  `status='completed'` **AND** `under_review=false` **AND** the review window is open.
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
- **SEC-DATA-003 (MED) fixed:** `completed_at` is **server-stamped** on the completion transition and
  **immutable** thereafter (no backdate/future-date/mutate/clear by an authenticated actor) — the
  review clock can't be manipulated.
- **SEC-DATA-101 (MED) closed:** reveal and eligibility are anchored on the immutable, server-stamped
  `completed_at` (**not** live `status`), so a provider **cannot suppress a revealed review** or block
  a client's review by transitioning a completed booking to `cancelled_by_provider`/`no_show`. A
  genuine void is expressed via `under_review` (a dispute hold, service_role-only), which holds reveal.
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

**Validation:** rolled-back non-prod role simulation, 27/27 checks pass (eligibility both
directions, forged-client-id block, under_review block, window-close block, reveal
counterpart/window/hold, no cross-provider conduct leak, completed_at authority, revealed-only
aggregate, repeat booking, and reveal-latching after a post-completion cancel). This is a
**manual, non-CI** simulation — the committed B5B DB/security harness does not exist yet and
remains a follow-up.

## Phase 2 structured-signal storage — recommendation (not yet implemented)
The two tables already model structured data differently (`client_reviews` = typed booleans;
`provider_reviews` = free-form `tags text[]`). For direction-specific, positive/negative/mixed,
**aggregatable** signals, the recommended shape is a **normalized child table**
(`review_signals`: review ref, direction, signal key, value/polarity) — it represents mixed signals
cleanly, aggregates to percentages, avoids a migration-per-dimension, and keeps private notes
separate from shared conduct. Typed boolean columns (mirroring `client_reviews`) are the
lower-friction alternative but grow a migration per signal and don't model a shared vocabulary as
cleanly. **Decide in Phase 2**; whichever is chosen, it inherits the single reveal gate from Phase 0.

## Out of scope (later phases)
Structured signal UI, `delivered_at`/deliverable eligibility, category review policies, provider
delivery workflow, client delivery confirmation, persistent provider→client CTA, client reputation
profile, safety/report system, moderation, reputation ranking, free-text policy change.
