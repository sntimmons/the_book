# Agent 1 — QA / Journey Reviewer: Implementation Record

**Result: READY.** The first permanent agent (a read-only QA / acceptance reviewer)
is defined, its product-truth foundation is written, stale foundation docs are
refreshed, and the definition was validated by a simulated review. No application,
Supabase, CI, EAS, or Sentry changes. No QA findings were fixed.

## Why this agent exists
The security/foundation emergency phase is closed and product development is
resuming. The team needs an independent check that answers **"does what we built
actually behave like the product we say we're building?"** — catching dead ends,
false-success states, and untruthful claims before they reach users — without a human
re-tracing every journey by hand, and without the agent silently redesigning the
product.

## Authority hierarchy (encoded in AGENT.md)
1. Approved product decisions / `docs/product/BETA_SCOPE.md`
2. `docs/product/USER_JOURNEYS.md`
3. `docs/architecture/NAVIGATION.md` + ADRs
4. Current security/data contracts (canonical baseline migration + latest audit finals)
5. Tests
6. Implementation (source code)
7. Historical audits / `docs/history/*`

Nuance: implementation is authoritative for **what exists**; product docs for **what
should exist**. On conflict the agent **reports the mismatch**; it never picks a side.

## Permission model
READ-ONLY by definition and by tool grant. The Claude Code adapter restricts tools to
`Read, Grep, Glob`. No writes, no bash mutations, no git/DB/issue/config writes, **no
production DB access**. Non-prod read access is not granted in this batch.

## Files created
- `docs/product/BETA_SCOPE.md` — product-truth ledger (REAL/PARTIAL/PLACEHOLDER/DEFERRED/UNDECIDED).
- `docs/product/USER_JOURNEYS.md` — canonical journeys (J0 browse-free through J14 provider policy/contract choice, incl. verification-gate J11, home/mobile safety J12, pre-booking message-request J13) with status + open decisions.
- `.agents/README.md` — agent-system roster, shared governance, invocation.
- `.agents/qa-journey-reviewer/AGENT.md` — mission, responsibilities, non-responsibilities, authority, severity, confidence, governance.
- `.agents/qa-journey-reviewer/CHECKLIST.md` — the five categories as concrete checks + false-positive controls.
- `.agents/qa-journey-reviewer/OUTPUT_FORMAT.md` — finding schema, review schema, verdicts.
- `.agents/qa-journey-reviewer/SOURCES.md` — deterministic context loading + journey→source map.
- `.claude/agents/qa-journey-reviewer.md` — thin native Claude Code adapter (read-only tools) pointing at the canonical `.agents/` spec.
- `docs/audits/AGENT_1_QA_JOURNEY_REVIEWER_IMPLEMENTATION.md` — this record.

## Files modified (stale-status refresh only, history preserved)
- `docs/README.md` — added the product docs + agent to the index; annotated as
  **RESOLVED** the P0 schema reconciliation (F3–F5, reproduced in 6AB), P0 booking
  write-integrity (SB3b), the dev-credential "DO NOT SHIP" artifact (6D); annotated the
  P2 lint baseline as blocking at 210 (5D) and the P1 contracts item as client-side
  fixed (4A) with the provider-side save still to verify. Original text kept as
  historical.
- `CONTRIBUTING.md` — schema is now reconciled/reproduced; migration guidance updated.

## Product-truth addendum incorporated (Founder decisions)
The Founder/Product-Owner product-truth addendum was applied to `BETA_SCOPE.md`,
`USER_JOURNEYS.md`, and the agent's `CHECKLIST.md`/`SOURCES.md` (docs + agent
understanding only; no product code). Key encoded decisions, separated as CURRENT
IMPLEMENTATION / BETA REQUIREMENT / PRODUCT DIRECTION / UNDECIDED:
- **Verification gates transactions, not browsing** (verify-before-transact, both sides);
  "verified" = government-ID match via an approved process; the "14-day" copy is
  UNDECIDED/PLACEHOLDER. Current gate is not built (known PARTIAL).
- **Provider go-live is immediate** (no mandatory manual approval planned for beta).
- **Two-sided reputation:** one account, one verified person, two reputation contexts.
- **Reviews** only from completed Book transactions; blind; two-sided. Reveal is an
  **approved-decision implementation mismatch**: intent = counterpart-or-**~1 hour**; code
  = counterpart-or-**7 days**. This is **not** UNDECIDED — the QA agent reports it as
  **MEDIUM / CONFIRMED**, Expected ~1-hour-or-counterpart, Actual 7-day-or-counterpart,
  Owner Implementation Engineer. Review code is **not** changed in this branch.
- **Payments** not real (PLACEHOLDER/FUTURE); **revenue/fee model UNDECIDED**;
  **off-platform-leakage enforcement UNDECIDED** (no invented scanning/bans).
- **Cancellation policies / contracts:** provider-own | standardized tiers (~3) | platform
  fallback — tiers + mandatory-by-category UNDECIDED (legal review pending).
- **Messaging:** pre-booking allowed; request/accept model is PRODUCT DIRECTION (not built).
- **Launch:** Houston-first, ~top-15 categories (list = PRODUCT DECISION REQUIRED);
  four delivery models supported.
- **Home/house-call safety** and **safety-incident escalation** = RESEARCH/DESIGN
  REQUIRED; a liability waiver is explicitly **not** sufficient safety.
- **Discovery ranking** = fair-opportunity principle, weights UNDECIDED (not "most usage
  wins").
- Guiding **trust loop** encoded; The Book is a trust marketplace, not a social-popularity
  app.

The agent's product-truth rules (CHECKLIST.md) now instruct it to treat all UNDECIDED
items as QUESTION / UNKNOWN — PRODUCT DECISION REQUIRED rather than inventing requirements,
and not to flag intentional placeholders (open browsing, no-charge, immediate go-live,
existing free-text reviews) as defects.

## Authority hierarchy — validated by the reveal-timing case
The setup surfaced a concrete case that validates why this agent exists: the review
**reveal timing** in code (7-day-or-counterpart) contradicts an **explicit Founder/Product
Owner decision** (~1-hour-or-counterpart). The correct handling is **not** "source code
wins" (that rule governs *what exists*) and **not** UNDECIDED (the intent is decided) — it
is an **implementation mismatch** the QA agent reports (MEDIUM / CONFIRMED, owner
Implementation Engineer). This demonstrates the encoded rule: implementation is
authoritative for *what exists*; approved product docs are authoritative for *what should
exist*; when they conflict the agent reports the mismatch and never lets code overwrite an
approved product decision.

## Verification product context (encoded)
Identity verification is treated as **PARTIAL — CORE SAFETY REQUIREMENT** for both
clients and providers. The docs and agent rules encode: an admin/approved-process-
managed verification may be legitimate; **lack of a self-service flow alone is not a
confirmed defect**; **an admin-set flag is not automatically sufficient evidence
either**; if the process is undocumented, the reviewer marks it **QUESTION → UNKNOWN —
PRODUCT DECISION / TRUST-SAFETY DEFINITION REQUIRED**; and UI claims must never imply a
stronger verification process than actually occurred.

## Operating modes & invocation
`QA review PR #NN` · `QA review journey: <name>` · `QA full audit: <area>` ·
`QA feature acceptance: <spec>` · `QA smoke: <checklist>` (static/paper only — does not
replace Maestro/manual execution). Modes: PR Review, Full Journey Audit, Feature
Acceptance, Release/Beta Smoke.

## False-positive safeguards
Trace-before-claim + cited evidence; current docs over historical; placeholders/TODOs
are not automatically defects; no aesthetic critique; no assumed Stripe/signature/
verification workflow; admin-managed state may be legitimate; undefined intent →
QUESTION; prefer 5 strong findings to 30 speculative.

## Simulated validation — *Discover → Provider Profile → Booking Request*
Run against the new definitions + BETA_SCOPE + USER_JOURNEYS (evidence from a read-only
trace). Verdict: **PASS WITH FINDINGS / NEEDS PRODUCT DECISION.**

- **QA-TRUTH-001 · MEDIUM · QUESTION** — Provider "ID Verified" badge
  (`components/ProviderProfile.tsx:280-284`) renders purely from `identity_verified`.
  Verification is a core safety requirement but the production process is not yet built
  (BETA_SCOPE: PARTIAL). *Expected: UNKNOWN — PRODUCT DECISION / TRUST-SAFETY DEFINITION
  REQUIRED.* The badge is not asserted fraudulent; the open question is what process
  backs the flag and whether the badge may claim more than that process supports.
  *Owner: Product Decision.*
- **QA-STATE-002 · MEDIUM · LIKELY** — Booking row is inserted before the signature
  (`app/book/payment.tsx:144` then `:188`); on signature failure the flow holds
  `pendingBookingId` to retry, but backing out can orphan a pending booking and a
  re-entry could insert a second one. Needs a device repro. *Owner: Implementation
  Engineer + Manual QA.*
- **QA-TRUTH-003 · MEDIUM · QUESTION** — Contract "signed" persists with
  `signature_url=null` (`payment.tsx:194`); on-screen copy is honest ("requires
  development build"). Whether a real signature is required for beta is UNDECIDED
  (BETA_SCOPE). *Owner: Product Decision.*
- **QA-STATE-004 · LOW · CONFIRMED** — `app/book/confirmed.tsx:15` reads `bookingId`
  but never uses it; success is store-driven (low risk in the normal path).
  *Owner: Test Automation / Implementation.*
- **QA-UX-005 · NOTE · CONFIRMED** — Confirmation offers only "Back to Home"; a forward
  link to the created booking would better satisfy NAVIGATION.md's terminal-screen
  rule. *Owner: Product Decision / Implementation.*

Payment/deposit copy was verified **truthful** (repeatedly states no charge, matching
`payment_status='unpaid'` and zero Stripe calls) — correctly **not** flagged.

### Difference from the pre-implementation simulation
The verification finding moved from **HIGH / CONFIRMED** to **MEDIUM / QUESTION** — the
new rule correctly stops the agent from asserting "no self-service flow ⇒ badge is
fraudulent" and instead ties badge validity to the (currently undefined) approved
process. All other findings held.

### False positives prevented
- "No provider verification submission ⇒ ID Verified is fraudulent" — **prevented**
  (now a product QUESTION).
- "No charge is a payment bug" — **prevented** (documented placeholder).
- "Placeholder signature is a blocker" — **prevented** (product question).

## Limitations
- Product-truth QA depends on `BETA_SCOPE.md`/`USER_JOURNEYS.md` staying current; if
  they drift, findings drift. Keep them updated when behavior changes.
- The agent cannot execute the app; runtime-only issues are **LIKELY**, not CONFIRMED,
  and route to Manual QA.
- PR-diff retrieval is supplied by the invoker (read-only tools read files at HEAD).
- `PRODUCT.md`, `DATA_MODEL.md`, `SECURITY_MODEL.md`, `TESTING.md`, ADRs remain planned.

## Future improvements
- Add `docs/product/PRODUCT.md` (tier-1 claims) and per-journey acceptance criteria.
- Optional read-only non-prod access for state-consistency checks.
- Wire PR-diff reading and Maestro/CI-result ingestion once those exist.
- Stand up Agents 2–4 (Security Reviewer, Codebase Auditor, Implementation Engineer)
  in the same `.agents/*` shape.

## Readiness verdict
**READY.** The QA / Journey Reviewer is defined, grounded in a current product-truth
foundation, governed read-only, and validated to produce useful, non-speculative signal
with correct verification handling.
