# Codebase Auditor — Checklist

Concrete checks across structure and maintainability. Every claim requires cited evidence
(file:line) and a concrete future-cost reason. Apply the **false-positive controls** before
recording anything. Prefer a small number of high-signal findings.

## A. Duplicated logic / multiple sources of truth
- [ ] The same **business rule** or **product-state interpretation** implemented in >1 place
      (e.g. `request_status` composer/eligibility logic, booking-state interpretation, review
      eligibility). Do the copies already **disagree**? (That raises severity.)
- [ ] Duplicated lifecycle/status **strings/enums** (pending/accepted/declined; booking
      statuses; review states) not sourced from one canonical module.
- [ ] Repeated **Supabase query shapes** / table names / participant-resolution / provider
      ownership checks that should share a hook/service boundary.
- [ ] Duplicated **route construction** across screens; brittle string-built paths.

## B. Centralization bypass / drift from intended structure
- [ ] Paths that **bypass** a centralized entry (e.g. client pre-booking messaging that does
      not go through `openMessageEntry` / `messageEntryAction`; booking creation bypassing
      centralized rules; verification checks not using the shared helper).
- [ ] Implementation diverging from `docs/architecture/NAVIGATION.md` (stale **mode-based**
      navigation — there is **no** global client/provider `currentMode`; role is contextual).
- [ ] Multiple stores managing **overlapping** state; inconsistent state models.

## C. Dead / stale / abandoned
- [ ] Unreachable routes / screens not reachable through normal navigation.
- [ ] Unused exports/components/hooks/helpers (verify **all** call sites + tests first).
- [ ] Legacy paths superseded by a newer abstraction but **still reachable**.
- [ ] Orphaned feature files; large blocks of commented-out code; stale TODO/FIXME that
      encode obsolete assumptions.

## D. Coupling / files doing too many jobs
- [ ] Deeply coupled hooks; a module that imports/knows too much of the app.
- [ ] Circular dependencies / risky import graphs.
- [ ] Business rules embedded directly in UI screens instead of hooks/services.
- [ ] Data access duplicated across screens instead of a shared hook/service.
- [ ] A file concentrating unrelated responsibilities such that a change in one risks another.
      (File **size alone is not a finding** — name the coupling/risk.)

## E. Consistency
- [ ] Inconsistent **error-return conventions** (null vs throw vs `{error}`), especially
      swallowed Supabase errors that hide failure.
- [ ] Inconsistent data-fetching patterns for the same kind of data.
- [ ] Inconsistent naming/typed contracts for the same concept.
- [ ] Repeated **magic values** that should be named constants.

## F. Testability
- [ ] Behavior only reachable through UI/native paths that can't be unit-tested; pure logic
      not extracted from the screen; a rule proven only by manual/non-CI means.

## Surface-specific (first proving-ground audit)

### Messaging
- [ ] Remaining direct `getOrCreateConversation` callers; is `openMessageEntry` truly the
      centralized client pre-booking entry? Duplicate request-status/composer-state logic;
      duplicated lifecycle strings; repeated participant/provider-ownership resolution in
      client code; stale legacy messaging paths; booking vs pre-booking thread-creation
      inconsistency; swallowed Supabase errors; barter/business/community paths diverging from
      the main messaging abstraction; request-filtering duplicated across screens/hooks; old
      pre-unified-inbox assumptions.

### Booking
- [ ] Booking-creation → messaging hookup; duplicated booking-state interpretation; duplicate
      provider/client lookup; old booking routes still reachable; booking-store
      responsibilities; verification-gate integration; rebook paths; any path bypassing
      centralized booking rules; **remaining `currentMode`-style mode architecture if
      reachable** (there are no client/provider modes).

### Verification gate
- [ ] Centralized verification helper/state vs direct booking paths bypassing it; duplicated
      verification checks; stale hard-block assumptions; beta-notice vs required-mode
      abstraction. (Known prior LOW/future issues → raise only if still structurally significant.)

### Reviews (prep for Structured Two-Sided Reviews — do NOT redesign)
- [ ] The 7-day reveal rule embedded in **multiple** places; hard-coded reveal intervals;
      duplicate review-eligibility logic; duplicate role/context logic; client vs provider
      reputation state mixed together; structure that would make Structured Two-Sided Reviews
      risky to add.

### Navigation / routing
- [ ] Approved tabs: **Discover · Reels · Bookings · Messages · Me**, provider tools under
      **Business**, **no** separate client/provider mode. Flag stale mode-based navigation,
      duplicate route aliases, unreachable screens, legacy routes, inconsistent route names,
      screens contradicting NAVIGATION.md, routes bypassing newer centralized entry logic.

## False-positive controls (mandatory — try to DISPROVE first)
- **Search for ALL call sites** (Grep across the repo) before calling anything unused/dead.
- **Check tests** before calling code unused.
- Inspect whether a suspected "duplicate" actually serves **different semantics** (provider vs
  client role, a compatibility adapter, an intentionally-narrow helper).
- Distinguish **deprecated-but-intentionally-retained** from abandoned.
- **File size alone is not a finding.** A duplicated 5-line helper is not automatically a
  problem. Name the concrete maintenance/correctness/consistency cost.
- Do **not** recommend refactoring without a concrete benefit; do **not** reward abstraction
  for its own sake; do **not** propose a full rewrite.
- If uncertain after tracing → mark **LIKELY** or **QUESTION**.
- **Prefer few high-signal findings over many speculative ones.** A disproven suspicion is
  recorded as **H. NON-ISSUE**, not silently dropped when it was worth checking.

## Known context — do NOT raise as new findings unless the implementation contradicts them
- Client-initiated non-booking contact is request-gated; provider/community-initiated contact
  is a **deferred product decision** (QA-STATE-001); the barter swallowed-error edge is a
  known **LOW** (QA-STATE-002). These are product/security follow-ups — Agent 3 may note
  **structural duplication** around them but does not own or "fix" them.
- **SEC-AUTHZ-002** (provider-initiated unvalidated `booking_id`), **SEC-DATA-003** (FK gap),
  and the missing committed **B5B DB/security harness** are open security/coverage follow-ups
  owned by Agent 2 / Test Automation — route, don't re-own.
- The messaging one-message gate is server-authoritative and now concurrency-safe; production
  migration is not yet applied. These are not maintainability defects.
