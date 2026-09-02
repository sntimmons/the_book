# QA / Journey Reviewer — Checklist

Concrete checks for the five categories. Every claim requires cited evidence
(file:line). Apply the false-positive controls before recording anything.

## A. Journey correctness
- [ ] Every step reachable through **normal navigation** (not hidden/deep-link-only).
- [ ] Every pushed screen has a **visible back/exit** (NAVIGATION.md).
- [ ] No **dead end** (a screen you can reach but not proceed or leave).
- [ ] No **forbidden transition** (mode switches, stranding the tab shell inside
      Business tools or vice versa — NAVIGATION.md "Prohibited").
- [ ] **Terminal screens** (confirmed, review submitted) offer a forward action and
      forbid re-entry into a completed irreversible step.
- [ ] Status transitions shown to the user match the allowed lifecycle
      (`lib/bookingStatus.ts`; server rules SB3b).

## B. Product truth
- [ ] Every user-facing claim matches actual capability. Cross-check `BETA_SCOPE.md`.
- [ ] No "charged/authorized/captured/refunded" wording where no payment occurs.
- [ ] No "completed/success" screen when the underlying DB write failed.
- [ ] **Verification claims:** if the UI shows a "Verified" claim, determine what the
      verification flag means and **what documented process/evidence makes it true**.
      Verification is a core trust-and-safety requirement — evaluate the *actual*
      process, not just the presence/absence of a self-service flow.
- [ ] A displayed "Verified" trust claim without an approved real verification process
      behind it is potentially **HIGH**; if the process is undocumented/unclear, it is a
      **QUESTION → UNKNOWN — PRODUCT DECISION / TRUST-SAFETY DEFINITION REQUIRED**.

## C. User-visible state / data consistency
- [ ] Status values interpreted consistently across screens (one vocabulary).
- [ ] `providers.id` (row id) vs `providers.user_id` (owner auth id) used correctly.
- [ ] Booking state matches the actions offered.
- [ ] Missing/null data does not produce a false UI state (e.g. success from empty).
- [ ] Retry/error paths preserve correct state (no orphaned/duplicate rows visible to
      the user). Deeper RLS/privilege issues → route to Security Reviewer.

## D. Regression risk (PR mode)
- [ ] Which journeys does the diff touch? (Change Impact Map.)
- [ ] Any existing behavior that could break? Backward-compat concerns?
- [ ] Missing or now-stale tests for the changed behavior?
- [ ] Edge cases the change introduces or exposes?

## E. UX / acceptance quality
- [ ] Can the user tell what to do next? Is there an obvious next step?
- [ ] Can they recover from failure? Can they back out safely?
- [ ] Is the wording truthful? Are required actions hidden?
- [ ] Is the journey coherent end to end? (Not: is it pretty.)

## False-positive controls (mandatory)
- **Trace before claiming** — follow route → handler → data call; cite file:line. No
  finding without evidence.
- **Cite evidence** for every finding (Evidence field is not optional).
- **Current product docs over historical** — never cite `docs/history/*` as expected
  behavior; NAVIGATION.md + `BETA_SCOPE.md` + `USER_JOURNEYS.md` + source win.
- **Placeholders are not automatically defects** — a documented placeholder
  (`BETA_SCOPE.md`) is a NOTE/QUESTION, never a BLOCKER.
- **A `TODO` is not automatically a bug.**
- **No aesthetic/design critique.**
- **No assumed Stripe/payment behavior** — the build takes no payment by design;
  "no charge" is not a defect.
- **No assumed signature requirement** — signature capture is a placeholder; whether a
  real signature is required for beta is UNDECIDED.
- **No assumed verification workflow** — do not assume a self-service verification flow
  should exist.
- **Admin-managed behavior may be legitimate** — an admin/approved-process-managed state
  is not automatically invalid, and not automatically sufficient evidence either.
- **"Lack of a user-facing workflow does not by itself prove a backend/admin-managed
  state is invalid."**
- **"Verification is a core safety requirement, but the QA agent must evaluate the
  actual documented verification process before deciding whether a displayed Verified
  claim is valid."**
- **Undefined intent → QUESTION** (Expected behavior: UNKNOWN — PRODUCT DECISION
  REQUIRED); never invent a requirement.
- **Prefer 5 strong findings over 30 speculative ones.**

## Product-truth rules (current decisions — see BETA_SCOPE.md)
The agent applies these approved decisions; anything marked UNDECIDED yields a QUESTION,
not an invented requirement.
- **Browsing without verification is allowed** — do not flag open browsing as a defect.
- **Identity verification gates transactions, not browsing.** The intended model is
  verify-before-transact (both sides). Transactions currently occurring *without* that
  gate are a known PARTIAL against approved direction — report as QUESTION/PARTIAL, not a
  confirmed regression, unless a UI claim overstates the verification that occurred.
- **"Identity verified" = government-ID match via an approved process.** Do not assume it
  should also mean background checks / licenses / business verification.
- **The "14-day to verify" copy is UNDECIDED/PLACEHOLDER** — flag any UI that presents it
  as established policy.
- **Provider go-live is immediate** (no mandatory manual approval planned for beta) — do
  not flag the absence of an approval step as a defect.
- **Reviews require a completed Book transaction** (no random/friend/competitor/open
  public reviews); reviews are blind and two-sided; both client and provider reputation
  matter.
- **Review reveal timing is DECIDED AND IMPLEMENTED — do not report it as a mismatch.**
  Approved model: blind until **both sides submit** (reveal immediately), otherwise
  submitted reviews reveal when the **7-day window closes** from the server-authoritative
  `completed_at`; late submissions blocked; `under_review` blocks submission and holds
  reveal. The code does exactly this (DB-authoritative, migration `20260902000000`), so it
  is **CORRECT**. *(An earlier ~1-hour one-sided fallback was reconsidered and **rejected**
  — a one-sided early reveal enables retaliation. `~1 hour` is stale; do NOT raise it, and
  do not treat older audits/reports that still cite it as current approved truth.)* Still
  DO flag: any copy claiming a review is public/live at submission time, any client-side
  re-derivation of the window, or any path that lets a late/blocked review through.
- **`no_show` is not reviewable.** A no-show is a recorded booking event but not a
  completed service, so there must be **no 1-5 star service-quality review flow** in
  either direction — while the no-show itself stays visible on the booking. The Past tab
  groups `completed` + `no_show`; that grouping is correct, but review eligibility must
  never be derived from it. Conduct/reliability reputation for no-shows is a LATER phase:
  do not flag its absence as a defect, and do flag any Phase 2 leakage.
- **Do not flag existing free-text reviews** merely because structured input is a future
  direction.
- **Client accountability is an escalating model** — never assert "three bad reviews =
  suspension"; ordinary negative ratings ≠ a safety strike; severe incidents are a
  separate higher-severity process (UNDECIDED).
- **Payments are not real yet** — "no charge" is intentional; do not assume Stripe/Apple
  Pay/Cash App integrations exist; do not treat deferred payment as a bug.
- **Revenue/fee model, anti-leakage enforcement, safety escalation, home/house-call
  safety mechanisms, standardized policy tiers, mandatory-contract-by-category, the
  message request/accept model, discovery ranking weights, and the Houston first-15
  category list are UNDECIDED/RESEARCH** — surface as PRODUCT QUESTIONS; do not invent
  enforcement rules (no message scanning/bans/keyword blocking), ranking weights, or
  category lists.
- **Houston-first / category concentration is product strategy**, not a code defect.
- **A liability waiver is not sufficient safety** — never accept "The Book is not
  responsible" as evidence that a real safety control exists; missing safety controls for
  home/house-call are a QUESTION (RESEARCH REQUIRED), and a UI that implies waiver = safety
  is a TRUTH finding.
- **Guiding loop:** real identity → verified transaction → platform record → two-sided
  review → reputation → safer future transactions. The Book is a trust marketplace, not a
  social-popularity app; weigh findings against trust, not virality.
