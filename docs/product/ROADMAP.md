# Roadmap — session-based

**Status:** Authoritative for sequencing. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `5b1a7a9` (2026-09-06) — squash-merge of PR #58, confirmed with
`git rev-parse` against `origin/main`
**Last edited by:** PR #60 (previous edit: PR #59)

> **`Reconciled against:` is not the tip of `main`.** It is the last commit at which the
> repository facts asserted in this document were verified. A documentation-only merge that
> changes no repository, product, runtime or security fact does **not** advance it — so this
> anchor may legitimately sit behind `main`. `Last edited by:` records the documentation
> mutation separately, as a PR number, because a PR number exists before merge and a merge
> SHA does not: a document can never truthfully cite the commit that lands it.

> **This is an estimate based on current project pace, not a deadline commitment.**
> Work is sequenced by **session**, not by calendar date, deliberately. Sessions vary in
> size, findings reorder priorities, and a review that surfaces a real defect is worth
> more than hitting a date. Nothing here is a promise to anyone.

Sessions may merge, split, or reorder. A session is "complete" only when its work is
**merged to `main`** with evidence — not when a summary says so.

---

## Completed

| Session / work | Merged PR | Merge SHA | Verified artifact |
|---|---|---|---|
| Messaging foundation — pre-booking request model | [#19](https://github.com/sntimmons/the_book/pull/19) | `877089c` | `20260901000000_prebooking_message_requests.sql` |
| Messaging concurrency hardening — row lock closing the one-message race | [#21](https://github.com/sntimmons/the_book/pull/21) | `12c9bf2` | `20260901010000_prebooking_message_concurrency.sql` |
| Agent 1 — QA / Journey Reviewer | [#17](https://github.com/sntimmons/the_book/pull/17) | `cd341bb` | `.agents/qa-journey-reviewer/` |
| Agent 2 — Security Reviewer | [#20](https://github.com/sntimmons/the_book/pull/20) | `50ffe3e` | `.agents/security-reviewer/` |
| Agent 3 — Codebase Auditor | [#22](https://github.com/sntimmons/the_book/pull/22) | `714395b` | `.agents/codebase-auditor/` |
| Reviews Phase 0 — server-authoritative eligibility, reveal, `completed_at` | [#24](https://github.com/sntimmons/the_book/pull/24) | `b0c6f92` | `20260902000000_reviews_phase0_foundation.sql` |
| Reviews Phase 1 — UX consumes the Phase 0 contract | [#26](https://github.com/sntimmons/the_book/pull/26) | `a82b50e` (commit `06bff77`) | `20260903000000`, `20260904000000`, `components/ReviewStateScreen.tsx`, `hooks/useReviewOpportunity.ts` |
| Session 2 — foundation cleanup | [#27](https://github.com/sntimmons/the_book/pull/27) | `257dd5b` (commits `af2429b`, `40f5764`) | see the three rows below |
| ├ review-entry authority (no live-status gating) | [#27](https://github.com/sntimmons/the_book/pull/27) | `257dd5b` | `20260905000000_review_opportunities_batch.sql`, `hooks/useReviewOpportunities.ts` |
| ├ permanent B5B DB/security coverage | [#27](https://github.com/sntimmons/the_book/pull/27) | `257dd5b` | `supabase/tests/`, `scripts/db-security-test.mjs`, `db-security` job in `.github/workflows/ci.yml` |
| └ migration-ledger reconciliation | [#27](https://github.com/sntimmons/the_book/pull/27) | `257dd5b` | `docs/operations/MIGRATION_LEDGER.md` (dated per-migration record) |
| Repo `tmp/` hygiene | [#28](https://github.com/sntimmons/the_book/pull/28) | `b3756d9` (commit `2d69138`) | `/tmp/` rule in `.gitignore` |
| Session 3 — Project State Steward, durable PM docs, Houston Beta Strategy | [#29](https://github.com/sntimmons/the_book/pull/29) | `2ae0fd0` | see the three rows below |
| ├ Project State Steward (Agent 4) | [#29](https://github.com/sntimmons/the_book/pull/29) | `2ae0fd0` | `.agents/project-state-steward/`, `.claude/agents/project-state-steward.md` |
| ├ durable PM document set | [#29](https://github.com/sntimmons/the_book/pull/29) | `2ae0fd0` | `CURRENT_STATE.md`, `ROADMAP.md`, `PRODUCT_DECISIONS.md`, `OPEN_QUESTIONS.md`, `HOUSTON_BETA_STRATEGY.md` |
| └ documentation-authority reconciliation / cold-start handoff audit | [#29](https://github.com/sntimmons/the_book/pull/29) | `2ae0fd0` | **modified by** #29 (per its diff, not merely present): `supabase/README.md` (rewritten as routed entry point), `AGENTS.md`, `docs/README.md`, `docs/product/BETA_SCOPE.md`, `supabase/tests/README.md` |
| Steward `Area` enum — `Schema / data` (governance, isolated; **merged first**) | [#31](https://github.com/sntimmons/the_book/pull/31) | `f4e8d86` (commit `19e5f71`) | one line in `.agents/project-state-steward/OUTPUT_FORMAT.md`; no tool grant, allowlist or prohibition changed |
| Steward reconciliation contract — anchor semantics + row rule | [#33](https://github.com/sntimmons/the_book/pull/33) | `ad95855` (commit `8b35eb7`) | `.agents/project-state-steward/CHECKLIST.md` § A and § E, `OUTPUT_FORMAT.md` header — defines `Reconciled against:` as a factual verification point, adds `Last edited by:`, and ends the recursive anchor churn |
| Steward anchor tiebreak — resolves the documentation-vs-capability overlap | [#35](https://github.com/sntimmons/the_book/pull/35) | `395495e` (commits `caa4a98`, `1e00886`) | `.agents/project-state-steward/CHECKLIST.md` § A tiebreak + § E reciprocal note — a PR earning a § E row has by definition changed a repository fact and advances this document's anchor; self-citing rows are unconstructible |
| Barter **Slice 1** — integrity hardening of the existing barter surface | [#38](https://github.com/sntimmons/the_book/pull/38) | `feba568` | `supabase/migrations/20260906000000_barter_integrity_slice1.sql` (caller-bound write identity, foreign-field allow-list, delete guards, server-stamped `created_at`, one-accepted-per-offer index, write-path interest limit, `anon` revoke); `supabase/tests/barter.test.sql` registered at `scripts/db-security-test.mjs:47`; client handling of the new refusals in `app/community/index.tsx` and `app/community/barter-interests.tsx` |
| Barter **Slice 2** — accept became one atomic RPC | #39 (attested) | not supplied to this run | `supabase/migrations/20260907000000_barter_accept_handoff.sql` — `accept_barter_interest` accepts, opens or reuses the pair's conversation and posts the handoff message in one transaction |
| Barter **Slice 2B** — canonical provider-pair conversation identity | not established | not supplied to this run | `supabase/migrations/20260908000000_canonical_provider_pair.sql` — one conversation per provider pair, enforced in the database |
| Barter **Slice 3a-0** — a dead negotiation releases the post's slot (PD-049) | not established | not supplied to this run | `supabase/migrations/20260909000000_barter_interest_release.sql` — `released` status with `released_at` / `released_by` / `release_reason`, and `release_barter_interest` deriving the reason from the caller |
| Barter **Slice 3a-0b** — the counterparty is told a negotiation ended | not established | not supplied to this run | `supabase/migrations/20260910000000_barter_release_signal.sql` (server-authored notice), `20260911000000_message_authorship_pin.sql` (authorship pinned at the write boundary) |
| Barter beta contract + the barter decision ledger (PD-043 … PD-048) | not established | not supplied to this run | `docs/product/BARTER_BETA_CONTRACT.md` (locked beta contract, § 12 gap list); PD-043 … PD-048 in `docs/product/PRODUCT_DECISIONS.md` |
| Barter **Slice 3a-0c** — Trade Activity, durable negotiation access (PD-050) | [#46](https://github.com/sntimmons/the_book/pull/46) | `27756bb` | `supabase/migrations/20260912000000_trade_activity.sql` (view `my_trade_activity`, `security_invoker`, `anon` revoked), `20260913000000_trade_activity_hardening.sql`, `20260914000000_trade_activity_corrections.sql`; route `app/community/trade-activity.tsx`; pure rules in `lib/tradeActivity.ts` with `__tests__/lib/tradeActivity.test.ts` |
| Closed-post terminal cleanup (PD-051, PD-052) | [#47](https://github.com/sntimmons/the_book/pull/47) | `76f5632` | `supabase/migrations/20260915000000_barter_closed_post_terminal.sql` (`enforce_barter_offer_active_one_way`, `enforce_barter_answer_open_offer`, both SQLSTATE `55000`; accept-handoff sanitiser), `20260916000000_barter_guard_admin_escape.sql` (null-caller escape restored on both guards) |
| Barter **Slice 3a** — proposal / versioning foundation (PD-053, PD-054) | [#49](https://github.com/sntimmons/the_book/pull/49) (attested; see below) | `7713b56` (squash merge) | `supabase/migrations/20260917000000_barter_proposal_versions.sql` … `20260926000000_negotiation_stale_comment.sql` — ten files: four tables (`barter_proposals`, `barter_proposal_versions`, `barter_proposal_terms`, `barter_version_acceptances`), three RPCs (`create_barter_proposal`, `submit_barter_counter`, `accept_barter_version`, current signatures `(uuid, text, text)` / `(uuid, text, text)` / `(uuid)`), view `my_barter_proposals` with **derived** `both_accepted`; the nine forward corrections are itemised in `MIGRATION_LEDGER.md`. `supabase/tests/negotiation.test.sql` registered at `scripts/db-security-test.mjs:48`; `scripts/negotiation-concurrency.mjs`; `lib/negotiation.ts`, `lib/negotiationState.ts` with `__tests__/lib/negotiationState.test.ts`; route `app/community/negotiation/[id].tsx`, reached from `app/community/trade-activity.tsx`. **No agreement, obligation or fulfilment schema** — that is the seam, not an omission (PD-054). |
| Barter **Agreement Finalization** — one official agreement, atomic post closure (PD-055) | [#50](https://github.com/sntimmons/the_book/pull/50) | `e3fa169` (squash merge) | `supabase/migrations/20260927000000_barter_agreement_finalization.sql` … `20260930000000_confirmed_trade_sqlstate.sql` — four files: `barter_agreements`, `finalize_barter_agreement(uuid)`, agreement-facing read models, post-agreement write guards, SQLSTATE `PT409` for confirmed-trade refusals, and permanent source-post closure. `supabase/tests/agreement.test.sql` registered at `scripts/db-security-test.mjs:49`; `scripts/negotiation-concurrency.mjs` covers finalize × finalize, finalize vs counter and finalize vs release with real interval overlap; client states/copy in `lib/negotiationState.ts`, `lib/tradeActivity.ts`, `lib/barterErrors.ts` and community routes. **No obligation, fulfilment, delivery, cancellation-after-agreement, no-show, adjudication, barter reviews or reputation schema** — those stay later Session 7 work. |
| Barter **Proposal Timing Extension** — version timing and expiry guard (PD-056) | [#52](https://github.com/sntimmons/the_book/pull/52) | `4fd684e` (squash merge) | `supabase/migrations/20261001000000_proposal_term_timing.sql` and `20261002000000_proposal_timing_expiry_guards.sql` — proposal terms now include required `due_at` and optional `scheduled_at`; timing is immutable per proposal version, so updates require a new version. Server validation requires both directed terms to remain future-valid when authored, accepted and finalized; expired timing raises `PT410` and cannot create an acceptance or official agreement. `supabase/tests/negotiation.test.sql` and `supabase/tests/agreement.test.sql` cover author/accept/finalize timing boundaries, direct-write bypass attempts and no obligation schema. Client stale copy/action handling lives in `lib/barterErrors.ts`, `lib/negotiationState.ts` and `app/community/negotiation/[id].tsx`. |
| Barter **Obligations Foundation** — two directed obligations per official agreement | [#54](https://github.com/sntimmons/the_book/pull/54) | `b35ca1d` (squash merge) | `supabase/migrations/20261003000000_barter_obligations_foundation.sql` — `barter_obligations` plus an additive `barter_agreements` trigger and idempotent internal helper. Every official agreement gets exactly two immutable directed obligations derived from the accepted proposal terms; `due_at` and `scheduled_at` copy from the accepted version; both participants can read both obligations. `lib/negotiation.ts` and `app/community/negotiation/[id].tsx` expose the read-only confirmed-trade display. `supabase/tests/agreement.test.sql` and `scripts/negotiation-concurrency.mjs` pin cardinality, derivation, direct-write refusal, participant reads and idempotent concurrent creation. **No delivery, fulfilment, receiver confirmation, cancellation, no-show, adjudication, terminal obligation outcomes, terminal agreement outcomes, barter reviews or reputation schema** — those stay later Session 7 work. |
| Barter **Obligation Delivery and Receiver Confirmation** — the two participant actions (PD-057, PD-058, PD-059) | [#56](https://github.com/sntimmons/the_book/pull/56) | `46c0bef` (squash merge of `09fc8b1`; base `88670d1` — confirmed with `git`/`gh`, see below) | `supabase/migrations/20261004000000_barter_obligation_delivery.sql` — `barter_obligations` gains `status` (`pending` / `delivered` / `received` / `not_received`), `delivered_at` and `receipt_responded_at` under four CHECK constraints. The **deliverer** may mark their own obligation delivered (`mark_barter_obligation_delivered`, server-stamped, immutable, duplicate mark a safe no-op); the **receiver** may then answer exactly once (`confirm_barter_obligation_received` / `report_barter_obligation_not_received`), both routing through the internal `record_barter_obligation_receipt`, which no client role may execute. Refused before delivery (`55000`), refused for the deliverer and non-participants, and neither answer can flip to the other (`PT412`). `enforce_barter_obligations_immutable` redefined as a transition-aware deny-by-default guard; new `enforce_barter_obligation_starts_pending` BEFORE INSERT trigger. Client: `lib/obligationState.ts` (pure role/state/copy rules), the three RPC seams in `lib/negotiation.ts`, `PT412` copy in `lib/barterErrors.ts`, and the confirmed-trade detail on `app/community/negotiation/[id].tsx`. `supabase/tests/obligation.test.sql` registered at `scripts/db-security-test.mjs:50`; `scripts/negotiation-concurrency.mjs` proves the delivery and answer races. **`received` / `not_received` are events, not verdicts. No 7-day timeout transition, automatic fulfilment, automatic completion, cancellation, mutual cancellation, no-show, Needs Attention, Under Review, adjudication, terminal obligation outcome, terminal agreement outcome, barter reviews or reputation** — those stay later Session 7 work, and the AGREEMENT still reads "Trade confirmed" with no terminal outcome. |
| Barter **Pre-Delivery Cancellation** — the ordinary exit from an official agreement | [#58](https://github.com/sntimmons/the_book/pull/58) (confirmed; see below) | `5b1a7a9` (squash merge, confirmed) | Six migrations, `supabase/migrations/20261005000000_barter_pre_delivery_cancellation.sql` … `20261010000000_cancellation_notice_neutral_copy.sql`. New table `barter_agreement_cancellations` — append-only, one act per participant per agreement, no write policy and no client write grant. One RPC, `cancel_barter_agreement(uuid, text)`: **either participant may cancel while nothing has been delivered**, the counterparty's permission is not required, and the **first act immediately stops ordinary performance** (`mark_barter_obligation_delivered` and `record_barter_obligation_receipt` re-check under the obligation row lock and refuse with `PT409`). Once **any** obligation is delivered the exit is gone permanently, and a later "didn't receive" does not restore it. **"Mutually Cancelled" is derived from two explicit acts and stored nowhere** — never inferred from silence, timeout or inactivity. **Nothing is deleted**: agreement, obligations, versions, terms and acceptances all survive. The optional reason (1–200 chars, immutable, idempotent-repeat-safe) is **shared with the other provider** and shown to both in trade details; it is context, not a verdict. Cancelling writes a **durable, best-effort in-thread system notice** into the pair's existing canonical conversation via the new one-writer helper `public.pair_conversation_notice` (`20261009000000`) — **not** a push, device or email notification, and it can never veto the act. Live notice copy is `20261010000000`'s. Client: `lib/tradeCancellation.ts` with `__tests__/lib/tradeCancellation.test.ts`, plus `lib/negotiationState.ts`, `lib/obligationState.ts`, `lib/tradeActivity.ts` (the "Confirmed trades" section renamed **"Trades"** so cancelled trades stay visible in it), `lib/barterErrors.ts` and `app/community/negotiation/[id].tsx`. `supabase/tests/cancellation.test.sql` registered at `scripts/db-security-test.mjs:51`. **Cancellation implies no no-show, unfulfilled finding, dispute, adjudication or reliability verdict. No 7-day timeout, Needs Attention, Under Review, no-show, adjudication, terminal obligation outcome, terminal agreement outcome, barter reviews, reputation or push notifications** — those stay later Session 7 work. |

**Row inclusion rule.** A PR earns a row here when it **materially delivers a product,
architecture, security, governance, infrastructure or operating capability**. A routine
reconciliation that only updates documentation to reflect already-landed facts does **not**
earn a row. `git log --merges main` is the complete record of every merge; this table is the
record of delivered capability.

So #29 (the Steward and the PM document set) and #31 (the `Area` enum, a governance
capability) are rows, while #30 and #32 — which reconciled documentation to facts that had
already landed — are not. Size is not the test, and neither is "did it touch this file":
**delivered capability is the test.** An earlier draft of this section used the file-touching
test, which made every reconciliation PR earn a row describing itself, including the PR that
introduced the test.

**Evidence convention.** *Merge SHA* is the merge commit on `main`; where a single
implementation commit is more informative it is named in parentheses. Every row up to and
including #35 was verified against `gh pr list --state merged` and `git log --merges main`.

**Some rows are evidenced differently, and say so.** The **Slice 1** row's merge SHA `feba568`
was read from `.git/refs/heads/main` and `.git/refs/remotes/origin/main`, and its artifacts
were verified in the working tree — but its **PR number, #38, was supplied by the
reconciliation invocation and not independently confirmed**, because that run had no shell and
so could not call `gh`. The capability and the SHA are proven; the PR number is attested. Any
row that cannot be tied to a PR must say which part is attested rather than present the whole
row as verified.

The same applies, more widely, to the five rows between **Slice 2** and the **barter beta
contract**. Their artifacts are verified — every migration named exists in the chain on `main`
at `76f5632`, and each one's apply to non-production is dated in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) — but **their merge commits and PR
numbers were not supplied to the reconciliation that wrote them and could not be read without a
shell**. "not established" means exactly that, and nothing more: no one searched and failed —
the information was simply not available to the run. `git log --merges main` closes the gap in
one command, and a later reconciliation should fill these cells in rather than leave them. Slice 2's PR number, #39, is
carried forward from this document's own earlier text, so it is attested, not proven.

The **Slice 3a** row is evidenced the same way as Slice 1: its merge SHA `7713b56` was read from
`.git/refs/heads/main` and `.git/refs/remotes/origin/main` and every artifact it names was
verified in the working tree, but its **PR number, #49, was supplied by the invocation** and
could not be confirmed by `gh`. It is, however, corroborated by two authoritative documents
that name PR #49 independently — `BETA_SCOPE.md` § Community / barter ("Slice 3a, PR #49") and
`MIGRATION_LEDGER.md` ("a security review of PR #49") — which is more than the earlier attested
rows have, and still short of proof. The reconciliation that wrote the row again had no shell,
so the five "not established" cells above remain unfilled.

The **Obligation Delivery** row is evidenced the same way, and its limits are stated rather than
implied: **every artifact it names was read in the working tree on `main`** — the migration, the
two client libraries, the screen, the B5B suite and its registration line. Its merge SHA
`46c0bef`, the squashed commit `09fc8b1`, the base `88670d1` and the PR number #56 were supplied
to the shell-less reconciliation that wrote the row, and were **confirmed with `git` and `gh`
in the same session** (`gh pr view 56` before the merge; `git rev-parse` and
`gh run view 34007334683` after it). Both the capability and its provenance are proven here —
unlike the PR #49 row above, which remains attested only.

The **Pre-Delivery Cancellation** row is **proven, not attested**, to the same standard as the
row above it. The artifacts it names were read in the tree — the six migrations,
`lib/tradeCancellation.ts`, the four other client modules, the negotiation screen,
`supabase/tests/cancellation.test.sql` and its registration line — and the provenance was checked
with a shell **in the same session**: `gh pr view 58` before the merge (state, base, head,
mergeable, both required checks green), then `git rev-parse` confirming
`local main == origin/main == 5b1a7a9`, `gh run view 34019463222` confirming post-merge `main` CI
green, and `supabase migration list` confirming the six migrations applied to the linked
**non-production** project only, local matching remote through `20261010000000`. Production was
never touched and never queried.

The one thing this row does **not** assert is runtime behaviour on a device. Its test figures
(B5B 872/872, concurrency 102/102, Jest 515/515) come from runs executed in that session and are
recorded against `20261010000000` in `MIGRATION_LEDGER.md`.

**Existence is not evidence.** Where a row's artifact is a file that *pre-dates* its PR, the
row says "modified by" and is evidenced by that PR's diff — not by the file being present.
A path that existed before the work cannot prove the work happened.

**Why Session 4 still has no row, and why Session 5 now does.** Both were performed — the
Slice 1 migration header cites a "Session 4 audit + Session 5 agent review" (line 9), a plan
clause "E-3" (line 36), and a beta working limit attributed to "E" (line 475).

**Session 5's output is now committed** and therefore earns the barter-contract row above:
`BARTER_BETA_CONTRACT.md` records the approved clauses, and PD-043 … PD-048 record the rulings
(PD-044 names E-3 explicitly). That row is for the *durable recording of approved decisions*,
which is a product-governance capability in the same sense as #29's PM document set — not for
the session having happened.

**Session 4's read-only audit is still not committed.** There is no barter audit document on
`main`, so the defect rankings the Slice 1 migration acts on cannot be reconstructed from this
repository. A Completed row requires a verified artifact, so Session 4 gets none, and this note
stands in its place. If that audit is meant to live here, committing it is a separate, ordinary
change — not something a reconciliation can do.

---

## Current

**The barter proposal / versioning foundation, proposal timing extension, agreement
finalization, obligations foundation, obligation delivery / receiver confirmation and
pre-delivery cancellation are complete and merged.** `main` @ `5b1a7a9` holds
forty-nine migrations, newest `20261010000000_cancellation_notice_neutral_copy.sql`. Slices 2,
2B, 3a-0, 3a-0b and 3a-0c, the
closed-post terminal cleanup, **Slice 3a**, **Agreement Finalization**, **Proposal Timing
Extension**, **Obligations Foundation**, **Obligation Delivery** and **Pre-Delivery
Cancellation** are all on `main` and each has a Completed row above. What is on `main` is
authoritative in [CURRENT_STATE.md](CURRENT_STATE.md) § Barter. Both providers accepting the
same current version is a **ready-to-confirm** fact; finalization creates the official
`barter_agreements` row and closes the source post, but PR #52 requires the accepted
version's timing to remain future-valid through finalization, PR #54 creates the two
server-derived directed obligations for the official agreement, PR #56 lets each
obligation's deliverer mark it delivered and its receiver answer once, and PR #58 gives an
official agreement its **ordinary exit** — either participant may cancel until the first
delivery, after which the exit is gone for good. Delivery answers remain **events, not
verdicts**, and a cancellation is an **agreement-level act**: no outcome, timeout, no-show or
adjudication follows from either (PD-046 § 7.2, PD-057, PD-058).

**One caveat on this section's evidence.** The reconciliation that wrote the PR #58 lines had no
shell, read the working tree of `feature/barter-pre-delivery-cancellation` rather than a checkout
of `main`, and could not confirm the SHA, the PR number, the applied-migration list or any CI
run. The migration count is repository-provable from `supabase/migrations/*.sql`; the merge
provenance is attested.

The branch `chore/pre-proposal-closeout`, which the previous reconciliation recorded as in
flight at `871eb2a`, now points at `ca84100` (`.git/refs/heads/chore/pre-proposal-closeout`).
Whether its work reached `main` through PR #49 could not be determined without a shell
(`git branch --contains` answers it), so the previous note's "nothing from it is on `main`" is
**not carried forward as current** — it is history, and the cell is open.

Preceding this: Session 3 merged (PR #29, `2ae0fd0`), then documentation and governance
merges — #31 (`f4e8d86`, the `Area` enum) first, then #30 (`e7ccd87`), #32 (`f83bea2`),
#33 (`ad95855`, which introduced this convention), #34 (`dbe5dd7`), #35 (`395495e`, the
tiebreak that resolved it), #36 and #37. Per the row inclusion rule above, #31,
#33 and #35 earned Completed rows; #30, #32, #34, #36 and #37 did not. Then the barter work:
Session 4 (no in-repo artifact — see the note above), Slice 1 (**PR #38**, `feba568`), the
slices and contract listed in the Completed table through **PR #47** (`76f5632`), and then
**Slice 3a** (**PR #49**, `7713b56`), **Agreement Finalization** (**PR #50**, `e3fa169`),
**Proposal Timing Extension** (**PR #52**, `4fd684e`), **Obligations Foundation**
(**PR #54**, `b35ca1d`), **Obligation Delivery and Receiver Confirmation**
(**PR #56**, `46c0bef`) and **Pre-Delivery Cancellation** (**PR #58**, `5b1a7a9`), which is where
this document's anchor now sits.

### What Sessions 4 and 5 left outstanding — mostly discharged

The earlier version of this section recorded two gaps. Both have moved:

1. ~~**OQ-001 … OQ-007 are all still Open**, and the decision ledger holds no barter `PD-NNN`
   beyond PD-030 … PD-033.~~ **Discharged.** OQ-001, OQ-002, OQ-003, OQ-005 and OQ-008 are
   closed against [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) or a `PD-NNN`, OQ-004 by
   PD-046, and the ledger now runs to PD-059. **OQ-006 and OQ-007 remain Open** — deliberately,
   each with its reason recorded in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
2. ~~**The Slice 1 migration acts on rulings the ledger does not hold.**~~ **Discharged.** The
   ruling behind the delete guard is PD-043, "E-3" is PD-044, and the beta working limit
   attributed to "E" is PD-045.

**Still outstanding:** the Session 4 audit document itself (see the note above). The principle
that produced these entries is unchanged and still binds — transcribing a decision requires the
approval, not the implementation that followed it. **A migration is an implementation, not an
approval.**

---

## Next

### Session 7 — Barter beta readiness (continues)
Agreement finalization is merged in PR #50, proposal timing / expiry enforcement in PR #52, the
obligations foundation in PR #54, obligation delivery / receiver confirmation in PR #56, and
pre-delivery cancellation in PR #58. The
remaining barter work stays within **Session 7** until explicitly resequenced; this
reconciliation does **not** start Session 8, which **has not started**.

Next work remains within **Session 7**. Delivery, the receiver's one-time answer and the ordinary
pre-delivery exit now exist (PR #56, PR #58) — but they record events and acts, not outcomes.
Still not built: the **7-day receiver-response
window** and its anchor (**PD-057**, whose expiry must never mean Fulfilled or Completed);
automatic fulfilment or completion; **no-show**;
**Needs Attention** and **Under Review**; adjudication; terminal obligation outcomes
(Fulfilled / Unfulfilled / Closed Without Resolution); terminal agreement outcomes
(**PD-046** § 7.3–7.5, contract §§ 6–7); the **attention UX that surfaces an unanswered delivered
obligation in Trade Activity**, with **no push, device or email notification work** planned in
this pass (**PD-059** — PR #58's cancellation notice is a durable in-thread message, not a
notification system); barter reviews and reputation;
provider-eligibility gating of the barter surface (**PD-044**'s `is_approved` conjunct, whose
seam is prepared but empty); the **Open to Trades** opt-in; the 3-post and 5-offers/day limits
as server rules; the post-decline reverse-contact episode (**PD-048**); and blocking and
reporting (contract § 9). Barter completion, trade history, notifications and reputation are
recorded in the Slice 1 migration header as Session 6 scope.

**Two engineering obligations carried into the next slice, before any of the above:**

1. ~~**Consolidate the negotiation screen's write handlers first.**~~ **DISCHARGED** by the
   write-handler consolidation PR (PR #60).
   The requirement as supplied was: *"before the next Session 7 slice adds another
   negotiation-screen write action, the six write handlers in `app/community/negotiation/[id].tsx`
   must be consolidated into a shared behavior-preserving helper; no seventh hand-copied handler
   may be added."* The six — `onAccept`, `onOpen`, `onConfirm`, `runObligationWrite`,
   `onCancelTrade`, `onSend` — each repeated the same busy-guard → write → `barterWriteFailure` →
   alert → conditional reload shape and had already diverged. All six now route through
   `lib/negotiationWrite.ts` (`app/community/negotiation/[id].tsx:253-419`), which owns the
   ordering; the four real per-operation differences are declared as options at each call site.
   **Two residual items, neither a gate on the next slice generally, both a gate on the next
   write handler on this screen:** (a) the re-entrancy `busy` guard is still hand-copied at 6/6
   call sites — `runBarterWrite` sets `busy` but does not check it, so a seventh handler written
   without copying a neighbour would omit it; (b) `onOpen` and `onSend` remain near-copies that
   differ only in whether their re-read blocks the screen: proposing the FIRST terms shows the
   blocking spinner while countering does not. That difference predates the consolidation and was
   **preserved as found**, because a behavior-preserving refactor may not resolve it — but nothing
   records whether it is intended. **It needs a PM answer before those two handlers are merged**;
   it is not recorded here as a decision, and no OQ has been opened for it. This was an
   **engineering constraint
   recorded as supplied**, not a product decision, and stays filed here rather than in
   `PRODUCT_DECISIONS.md`.
2. **`release_barter_interest` still carries its own notice body**, deliberately: `20261009000000`
   routes only **new** callers through `public.pair_conversation_notice` and records that the
   shipped, authorization-adjacent release path should be migrated **the next time it is opened
   for a reason of its own** (`20261009000000_pair_conversation_notice.sql:25-30`). Its live
   definition remains `20260913000000_trade_activity_hardening.sql`.

### Session 8 — Safety & trust beta audit
Addresses OQ-020 … OQ-026. Address disclosure for home-based and house-call services is
the highest-risk open surface in the product.

### Sessions 9–10 — Reviews Phase 2 / reputation
Structured signals (PD-028) and the conduct/reliability layer that `no_show` feeds (PD-027).

### Session 11 — Delayed-deliverable review model
**Only if required pre-beta.** `delivered_at` and category-specific windows for
photography/videography/creative work.

### Sessions 12–13 — Consumer UX / design on core beta journeys

### Sessions 14–15 — Beta readiness
Full audits, native E2E, Sentry, release readiness, analytics, support, break-it testing.

---

## Then

**Houston closed beta** → beta iteration → **payments readiness programme**.

Payments are a separate programme, not a session: processor, deposits, final charges,
payouts, refunds, disputes, chargebacks, webhook handling, idempotency, ledger integrity,
payout failures, fraud, support, audit trails, non-prod destructive testing, and a
controlled pilot. See OQ-040 … OQ-046 and [HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md).

---

## Standing constraints

These hold across every session:

- Production is never a target of development or test tooling.
- Merged migrations are never edited; corrections go forward in a new migration.
- **Before redefining a Postgres function, read the definition named in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) § "Functions redefined across
  migrations", not the migration that created it.** PR #58 replaced
  `public.cancel_barter_agreement` **five times**; its current live definition is
  `supabase/migrations/20261010000000_cancellation_notice_neutral_copy.sql`. Copying an earlier
  body forward would silently delete the in-thread cancellation signal and restore the untrue
  "Both providers agreed to cancel" wording.
- **No seventh hand-copied write handler on the negotiation screen.** The consolidation this
  required is **done** — all six writes route through `lib/negotiationWrite.ts`. The constraint
  itself still stands for the next write action, and two things must be settled first: the
  re-entrancy `busy` guard is not yet owned by the helper, and `onOpen`/`onSend` are still two
  near-copies. See § Next → Session 7 item 1 for both.
- Agents 1–3 stay read-only; the Steward's writes stay inside its five-file allowlist.
- No session marks its own work complete — evidence on `main` does.
