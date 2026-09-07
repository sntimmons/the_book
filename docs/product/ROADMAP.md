# Roadmap — session-based

**Status:** Authoritative for sequencing. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `23df39c` (2026-09-07) — squash-merge of PR #64, which earns the
Completed row below and therefore moves this document's anchor (CHECKLIST § A tiebreak). The SHA
and the PR number were **supplied to this reconciliation**, which had no shell and could not
confirm either with `git` or `gh`.
**Last edited by:** PR #64 (previous edit: PR #62). PR #64 carried its own § Next text in with its
code; the reconciliation that added the Completed row afterwards was **not given its own PR
number**, so this field names the last mutation whose number is known.

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
| Barter **Receiver-Response Window and Needs Attention** — PD-057 and the Trade Activity half of PD-059 | [#62](https://github.com/sntimmons/the_book/pull/62) (supplied; see below) | `26fb7fd` (squash merge, supplied) | One migration, `supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql`, and it **adds no column, table, trigger, RPC, background job or write path**. The PD-057 window is **derived read state**: `public.barter_confirmation_anchor` returns `max(delivered_at, coalesce(scheduled_at, due_at))` and NULL before delivery (`:81-99`); `public.barter_confirmation_deadline` is that plus 7 days, the **only** place the interval is written, and pins `timezone = 'UTC'` so both participants compute one instant (`:108-136`); `public.barter_receiver_window` returns `none \| awaiting_receiver \| needs_attention` and begins attention at `p_as_of >= deadline`, **inclusive** (`:171-200`). New participant-scoped view `public.my_barter_obligations` (`security_invoker`, scoped by the existing participant policy, `anon` revoked, not a write path — `:342-379`); `my_trade_activity` recreated in full with role-relative `my_response_state` / `my_response_deadline` / `their_response_state` / `their_response_deadline`, all read from that view so the rule is applied once (`:398-464`). **Needs Attention is an unresolved operational state, not an outcome:** an elapsed window leaves the row `delivered`, the four-value `status` vocabulary is unchanged, **the receiver may still Confirm received / Didn't receive after the deadline** (neither RPC consults it), an explicit answer clears the condition however long ago the window closed, and cancelled trades never enter the flow. Client: `lib/obligationState.ts` (`ReceiverWindowState`, the total role × window copy table, `NEEDS_ATTENTION_LABEL` / `ACTION_NEEDED_LABEL`), `lib/tradeActivity.ts` (the total mine × theirs note matrix, the row badge, the row deadline), `lib/negotiation.ts` reading `my_barter_obligations`, `lib/barter.ts` selecting the four new columns, and both screens — `app/community/trade-activity.tsx` and `app/community/negotiation/[id].tsx`. `supabase/tests/receiver_window.test.sql` registered at `scripts/db-security-test.mjs:52`; `__tests__/lib/receiverWindow.test.ts` for the client half. **Also, and it is a narrowing rather than a capability:** § 3b replaces the live body of `enforce_barter_obligations_immutable` so the obligation's contract fields are frozen against **every** writer, `service_role` and the no-JWT path included (Founder ruling 2026-09-06); privileged DELETE is deliberately unchanged, because account erasure depends on it. **Still not built: no-show, Under Review, adjudication, automatic fulfilment, automatic completion, terminal obligation outcomes, terminal agreement outcomes, barter reviews, reputation, and push / device / email notifications** — the push half of PD-059 is untouched. |
| Barter **No-Show Reporting and the Under Review Foundation** — PD-062 and PD-063 | [#64](https://github.com/sntimmons/the_book/pull/64) | `23df39c` (squash merge; base `ddcb229`, PR #63) — **verified** | Seven migrations, `supabase/migrations/20261012000000_barter_no_show_under_review.sql` … `20261018000000_no_show_created_at_server_stamped.sql`. **One new table** — `public.barter_obligation_no_show_reports`, append-only, at most one row per obligation, participant-read policy only, **no write policy and no client write grant** (`20261012000000:64-108`, `:110-139`, `:216-240`). **One new RPC** — `report_barter_obligation_no_show(uuid, text)`: **receiver-only**, only for an obligation whose `scheduled_at` is non-null, only **at or after** it, and only against **server time** (`now()`; there is no `p_as_of` and no client value reaches the comparison). Idempotent — a repeat returns the ORIGINAL timestamp and merges no second reason. **Under Review is DERIVED, not persisted**: `(a report exists) OR (status = 'not_received')`, minus cancelled — **no status value, no column, no case table and nothing on a timer**, and the four-value `status` vocabulary is unchanged (`20261012000000:242-287`). It means **a human must look**; it is **not** a finding of fault and **not** Fulfilled, Unfulfilled, Completed, Closed Without Resolution or any terminal outcome, none of which exist. **A no-show produces no Needs Attention, no reliability impact and no reputation impact.** **PD-063 — Under Review outranks the ordinary exit:** `cancel_barter_agreement` refuses with the new SQLSTATE **`PT423`** once any report exists (`20261015000000`, now the live body), with `enforce_barter_cancellation_consistent` carrying the same rule as defence in depth (`20261017000000`, now the live body); a cancellation that commits first refuses a later report with **`PT409`**; a race resolves to **exactly one** state because both writers take the `barter_agreements` row lock first — `20261014000000` moved the no-show RPC onto that order after a real `40P01` was **reproduced**. **The reason is participant-visible context** (PD-062): both participants read it through `my_barter_obligations.no_show_reason` with **no policy widened** (`20261016000000`), and the UI attributes it as the reporting participant's STATEMENT with the sharing disclosed ABOVE the input. Client: `lib/obligationState.ts` (`UNDER_REVIEW_LABEL` / `UNDER_REVIEW_NOTE`, `noShowStatement`, the reason rules), `lib/tradeCancellation.ts` (the `underReview` gate), `lib/tradeActivity.ts`, `lib/negotiation.ts` (the fourth obligation RPC), `lib/barter.ts`, `lib/barterErrors.ts` (`PT423`) and `app/community/negotiation/[id].tsx`. `supabase/tests/no_show_under_review.test.sql` registered at `scripts/db-security-test.mjs:53`; `__tests__/lib/underReview.test.ts`; race #20 in `scripts/negotiation-concurrency.mjs`. **Still not built: adjudication and any operator decision path, terminal obligation outcomes, terminal agreement outcomes, automatic fulfilment or completion, barter reviews, reputation, and push / device / email notifications. No in-thread conversation notice for a no-show — deliberately deferred. How a plain Needs Attention might later enter Under Review is UNRESOLVED: no second timer, no automatic escalation, no participant escalation action, no operator auto-escalation.** |

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

The **Receiver-Response Window** row is **artifact-proven but provenance-attested**, which is
weaker than the two rows above it and is stated rather than blurred. Every artifact it names was
read on this tree — the migration, the five client modules, the two screens,
`supabase/tests/receiver_window.test.sql`, `__tests__/lib/receiverWindow.test.ts` and the
registration line at `scripts/db-security-test.mjs:52`. The reconciliation that wrote it had **no
shell**, so it recorded the merge provenance as attested; **that gap has since been closed with
the commands it named.** Confirmed 2026-09-07 against the repository and GitHub:

- `gh pr view 62` — PR #62 **MERGED into `main` at 2026-09-07T19:19:18Z**, squash, merge commit
  **`26fb7fd`**; pre-merge `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, base `main` at
  `c49ee89`, with the required `check` and `db-security` gates green on head `6df1042`.
- `git rev-parse` — local `main` **equals** `origin/main` at `26fb7fd`; working tree clean.
- `gh run list --branch main` — the post-merge CI run for `26fb7fd` is
  [run 34155130832](https://github.com/sntimmons/the_book/actions/runs/34155130832), conclusion
  **success**. The earlier "no CI run number exists" statement is superseded.
- `supabase migration list` — **50** versions, local == remote, **no drift**, newest
  `20261011000000`.

Its database figures — **B5B 985/985, of which 113 are `receiver_window`; concurrency 102/102**,
zero residue — were **re-run against merged `main`** rather than read from the ledger, together
with `tsc --noEmit` clean, `lint:ci` **0 errors** and Jest **605/605**. The migration was applied
to the linked non-production project on 2026-09-06 and reconfirmed 2026-09-07; production was
never targeted.

The **No-Show Reporting and Under Review** row is **artifact-proven but provenance-attested**, and
that gap is stated rather than blurred. Every artifact it names was read on this tree — the seven
migrations, the six client modules, the negotiation screen,
`supabase/tests/no_show_under_review.test.sql`, `__tests__/lib/underReview.test.ts` and the
registration line at `scripts/db-security-test.mjs:53`. The reconciliation that wrote it had **no
shell**, so these were taken **as supplied in the invocation** and not confirmed: the merge SHA
`23df39c`, the PR number #64, the squash strategy, the prior base `ddcb229` (PR #63),
`local main == origin/main` with a clean tree, the post-merge `main` CI run
[34165346538](https://github.com/sntimmons/the_book/actions/runs/34165346538) (**success**), and
`supabase migration list` reporting **57** versions with local == remote and no drift. Its database
figures — **B5B 1097/1097, concurrency 129/129**, zero residue — are **read from
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)** (§ `20261015000000` … `20261018000000`)
rather than re-run, and they supersede the intermediate snapshot recorded at `20261014000000`
(1074/1074, 124/124). `gh pr view 64`, `git rev-parse`, `gh run view 34165346538` and
`supabase migration list` close the provenance gap in four commands.

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
finalization, obligations foundation, obligation delivery / receiver confirmation,
pre-delivery cancellation, the receiver-response window / Needs Attention, and no-show reporting
with the Under Review foundation are complete and
merged.** `main` @ `23df39c` holds
**fifty-seven** migrations, newest
`20261018000000_no_show_created_at_server_stamped.sql`. Slices 2,
2B, 3a-0, 3a-0b and 3a-0c, the
closed-post terminal cleanup, **Slice 3a**, **Agreement Finalization**, **Proposal Timing
Extension**, **Obligations Foundation**, **Obligation Delivery**, **Pre-Delivery
Cancellation**, the **Receiver-Response Window and Needs Attention** and **No-Show Reporting with
the Under Review Foundation** are all on `main` and each
has a Completed row above. What is on `main` is
authoritative in [CURRENT_STATE.md](CURRENT_STATE.md) § Barter. Both providers accepting the
same current version is a **ready-to-confirm** fact; finalization creates the official
`barter_agreements` row and closes the source post, but PR #52 requires the accepted
version's timing to remain future-valid through finalization, PR #54 creates the two
server-derived directed obligations for the official agreement, PR #56 lets each
obligation's deliverer mark it delivered and its receiver answer once, PR #58 gives an
official agreement its **ordinary exit** — either participant may cancel until the first
delivery, after which the exit is gone for good — PR #62 gives a delivered, unanswered
obligation a **deadline and a Needs Attention state, derived per read**, and PR #64 lets the
**receiver of a SCHEDULED obligation report a no-show at or after `scheduled_at`, against server
time**, routing that obligation — like a plain `not_received` — into **Under Review**. Delivery
answers remain
**events, not verdicts**; a cancellation is an **agreement-level act**; an elapsed window is
an **unresolved operational state**; and Under Review means only that **a human must look**. No
outcome, automatic completion, fault finding or
adjudication follows from any of them, and the receiver may still answer after the deadline
(PD-046 § 7.2, PD-057, PD-058, PD-062, PD-063). The one ordering rule PR #64 adds is precedence,
not judgment: a recorded report **removes** the ordinary exit (`PT423`), and a committed
cancellation **refuses** a later report (`PT409`).

**One caveat on this section's evidence.** The reconciliation that wrote the PR #58 lines had no
shell, read the working tree of `feature/barter-pre-delivery-cancellation` rather than a checkout
of `main`, and could not confirm the SHA, the PR number, the applied-migration list or any CI
run. **The PR #62 lines were initially in the same position** — written by a reconciliation that
was told `26fb7fd` and `#62` rather than reading them — but they no longer are: the merge SHA,
the PR number, the squash strategy, `main == origin/main`, the green post-merge CI run and the
50-version no-drift migration state were all subsequently verified with `git`, `gh` and
`supabase migration list`, and the B5B and concurrency figures were re-run against merged `main`.
The PR #62 row is **proven, not attested**. **The PR #64 row is now proven too.** It was written
by a shell-less reconciliation and recorded as attested; the gap was closed immediately afterwards
with the commands that reconciliation named, on 2026-09-07:

- `gh pr view 64` — **MERGED into `main` 2026-09-07T22:03:55Z**, squash, merge commit **`23df39c`**,
  base `main` @ `ddcb229`; pre-merge `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, both required
  checks green on head `ec4c6ec`.
- `git rev-parse` — local `main` **equals** `origin/main` at `23df39c`; working tree clean.
- `gh run list --branch main` — post-merge CI for `23df39c` is
  [run 34165346538](https://github.com/sntimmons/the_book/actions/runs/34165346538), **success**.
- `supabase migration list --linked` — **57** versions, local == remote, **no drift**.
- **B5B 1097/1097 and concurrency 129/129 were re-run against merged `main`**, alongside
  `tsc --noEmit` clean, `lint:ci` 0 errors and Jest 646/646. Zero residue on both harnesses.

The older rows are unchanged and remain attested.

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
(**PR #56**, `46c0bef`), **Pre-Delivery Cancellation** (**PR #58**, `5b1a7a9`), the
**Receiver-Response Window and Needs Attention** (**PR #62**, `26fb7fd`) and **No-Show Reporting
with the Under Review Foundation** (**PR #64**, `23df39c`), which is where
this document's anchor now sits. Three merges sit between #58 and #62: **#59** and **#61**
(documentation), and **#60**, the negotiation-screen write-handler consolidation, whose outcome is
recorded as the discharged engineering obligation in § Next → Session 7 item 1. **None of the
three carries a Completed row**, which is the record as previous reconciliations left it and is
not re-opened here. **PR #63 sits between #62 and #64**, and the open cell is now CLOSED: `git log --oneline
26fb7fd..23df39c` and `git show --stat ddcb229` show it is
*"docs: reconcile project state against main after PR #62"* — a **docs-only** commit touching
exactly `CURRENT_STATE.md`, `OPEN_QUESTIONS.md`, `PRODUCT_DECISIONS.md` and `ROADMAP.md`. It is a
reconciliation PR, not a capability, so **no Completed row is warranted** — the same treatment
PR #57 and PR #59 already receive.

### What Sessions 4 and 5 left outstanding — mostly discharged

The earlier version of this section recorded two gaps. Both have moved:

1. ~~**OQ-001 … OQ-007 are all still Open**, and the decision ledger holds no barter `PD-NNN`
   beyond PD-030 … PD-033.~~ **Discharged.** OQ-001, OQ-002, OQ-003, OQ-005 and OQ-008 are
   closed against [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) or a `PD-NNN`, OQ-004 by
   PD-046, and the ledger now runs to PD-061. **OQ-006 and OQ-007 remain Open** — deliberately,
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
obligations foundation in PR #54, obligation delivery / receiver confirmation in PR #56,
pre-delivery cancellation in PR #58, the receiver-response window and Needs Attention in PR #62,
and no-show reporting with the Under Review foundation in PR #64. The
remaining barter work stays within **Session 7** until explicitly resequenced; this
reconciliation does **not** start Session 8, which **has not started**.

Next work remains within **Session 7**. Delivery, the receiver's one-time answer and the ordinary
pre-delivery exit now exist (PR #56, PR #58) — but they record events and acts, not outcomes.
The **7-day receiver-response window** and **Needs Attention** now exist too (PR #62, **PD-057**
and the Trade Activity half of **PD-059**), as DERIVED read state: the anchor is
`max(delivered_at, scheduled_at ?? due_at)`, the deadline is that plus 7 days, attention begins
at `server_now >= deadline` inclusive, and an unanswered elapsed window leaves the obligation
`delivered` — **it manufactures no outcome**, and the receiver may still answer. Trade Activity
now surfaces an unanswered delivered obligation as needing the right provider's attention.
**CARRY-FORWARD CODEBASE GATE — FIVE items, all to be cleaned up BEFORE the adjudication slice.**
Recorded by the Codebase audits of PR #64 and ruled by the Founder, 2026-09-07: a **bounded,
behaviour-preserving** cleanup, and **adjudication must not be added on top of any of these five
unresolved patterns.**

The first two were widened by the no-show slice and must not be widened again:

- **`obligationView`'s positional-argument expansion.** It now takes seven positional parameters
  ending in two adjacent, same-typed, same-defaulted booleans (`underReview`, `canReportNoShow`).
  Swapping them type-checks cleanly and produces two opposite defects at once. Every neighbouring
  view-model in `lib/` takes a facts OBJECT; this one is the outlier. Adjudication would add an
  eighth.
- **The duplicated attention-chip mapping.** The label → chip-style ternary is hand-copied in
  `app/community/negotiation/[id].tsx` and `app/community/trade-activity.tsx`, with six duplicated
  colour literals; this slice added the third branch to both by hand, and the fallthrough is a
  silent `null`. A fourth state would render at two different severities on two surfaces.

The PR #64 re-audit added **three more, bringing the gate to five**, all found while applying the
PD-062 / PD-063 rulings and none refactored there:

- **`cancellationView` now has the same shape as `obligationView`** — three positional
  parameters, of which the last two are adjacent booleans of identical type. A transposed call
  type-checks silently, on the function that decides whether an irreversible control is drawn.
  Fix it in the SAME change as `obligationView`, or the cleanup lands with the anti-pattern
  re-established one module over.
- **The reason composer is authored twice** in `app/community/negotiation/[id].tsx` (no-show and
  cancellation), as two near-identical JSX blocks with parallel `validate*`/`*Payload` helpers.
  The PD-060/PD-062 rule that the disclosure sits ABOVE the input is currently enforced by two
  hand-authored copies and a reviewer's eye. A third composer is likely in adjudication.
- **`underReview` names two different predicates.** The client gate is `report OR not_received`;
  PD-063's server rule is `report exists`. They cannot diverge today only because
  `not_received` implies `delivered_at is not null`, which independently blocks cancellation —
  a coincidence between a CHECK constraint two migrations away and a client predicate, named
  nowhere. Resolve it while it is still theoretical.

**None was refactored inside PR #64** — the Founder ruled they are not required for that
correction, and doing them there would have widened the diff across the surface adjudication will
touch. **Adjudication must not widen any of these patterns further; fix them first.**

**Recorded for Session 7 closeout / cross-app audit** (Founder rulings, 2026-09-07, both
deliberately out of PR #62's scope):
- **Surface consistency.** The general barter feed card and the offer-responses screen still
  render agreement-level state only ("Trade confirmed. The agreed terms can no longer change.")
  and do not carry the receiver-window state. That copy stays TRUE, so nothing there became
  actively false and PD-059 is satisfied by Trade Activity — but the two surfaces disagree in
  completeness with Trade Activity and the trade detail, and that belongs in the cross-app audit.
- **Agreement identity immutability.** The contract-integrity principle behind § 3b now extends
  by ruling to core `barter_agreements` identity, and is **not yet enforced**:
  `enforce_barter_agreement_immutable` gives `service_role` and the no-JWT path an unconditional
  early return with no contract-field diff. The bounded fix is a forward migration applying the
  same deny-by-default treatment while preserving privileged DELETE. Evidence and scope are in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md).

**No-show reporting and Under Review now exist too** — merged as **PR #64** (**PD-062**,
**PD-063**; Founder rulings, 2026-09-07): the **receiver** of an obligation with a non-null
`scheduled_at` may report, **at or after** that time and against **server time**, that the
scheduled service did not happen. The report is **immutable participant-reported history** —
append-only, one per obligation, server-stamped on every insert path, idempotent on repeat — and
it, or a plain `not_received`,
puts the obligation into **Under Review**, meaning a human must look. Derived per read like Needs
Attention: no status value, no column, no case table, nothing on a timer. **It is not a finding of
fault**, and a no-show automatically means **no** Needs Attention, **no** Unfulfilled, **no**
reliability impact, **no** reputation impact and **no** terminal outcome. The receiver keeps their
controls, and the reason is participant-visible context both providers read. Under Review
**outranks the
ordinary exit** (**PD-063**): a reported trade can no longer be cancelled (`PT423`), so the party a
report is about cannot make it stop counting; a cancellation that commits first refuses a later
report (`PT409`), and the race resolves to exactly one state.

Two absences from PR #64 are **decided, not overlooked**, and must stay documented as absent:

- **How a plain Needs Attention might later enter Under Review is UNRESOLVED and deliberately
  UNDECIDED.** It belongs to the adjudication slice. **No second timer, no automatic escalation,
  no participant escalation button and no operator auto-escalation was created**
  (`supabase/migrations/20261012000000_barter_no_show_under_review.sql:38-52`, and the record in
  [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) § Closed — index).
- **A no-show conversation / in-thread notice is DEFERRED** (Founder ruling, 2026-09-07), to be
  decided with the later adjudication / review workflow. `public.pair_conversation_notice` is
  still called only from the cancellation paths; nothing in `20261012000000` … `20261018000000`
  writes to a thread. The deliverer learns of a report by opening the trade.

Still not built: automatic fulfilment or completion; **adjudication and any operator decision
path** — which is what an Under Review case will eventually need, and is the next slice, not this
one; terminal obligation outcomes
(Fulfilled / Unfulfilled / Closed Without Resolution); terminal agreement outcomes
(**PD-046** § 7.3–7.5, contract §§ 6–7); **no push, device or email notification work** — which
is the half of **PD-059** that remains deliberately absent, and PR #58's cancellation notice is a
durable in-thread message, not a notification system; barter reviews and reputation;
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
   **preserved as found**, because a behavior-preserving refactor may not resolve it.
   **Answered by the Founder on 2026-09-06, on merging PR #60: the difference is approved as it
   stands** — the initial propose/open path *may* use a blocking authoritative re-read, and the
   counter/send path *may* re-read without blocking the whole screen. **Do not normalize them.**
   Recorded here as an **engineering note**, deliberately not as a PD: the ruling approves existing
   behavior and mints no product decision, and no OQ is open for it. So (b) is **settled**, and
   only (a) — the `busy` guard — remains a gate on the next write handler.
   This was an **engineering constraint
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
  `public.cancel_barter_agreement` **five times** and PR #64 replaced it a **sixth**; its current
  live definition is
  `supabase/migrations/20261015000000_under_review_precedes_cancellation.sql`. Copying an earlier
  body forward would silently delete the PD-063 `PT423` refusal and the in-thread cancellation
  signal, and restore the untrue
  "Both providers agreed to cancel" wording. **PR #62 added a second live-definition hazard of the
  same shape:** `public.enforce_barter_obligations_immutable` was created by `20261003000000`,
  narrowed by `20261004000000`, and its **current live body is
  `20261011000000_barter_receiver_window_needs_attention.sql` § 3b**. Copying the `20261004000000`
  body forward would silently re-open a `service_role` rewrite of the agreed trade — including
  `due_at` and `scheduled_at`, which are now the PD-057 deadline anchor both providers act on.
  **PR #64 added four more, and one of them is not hypothetical — it already happened inside that
  PR.** `20261015000000` wrote `public.enforce_barter_cancellation_consistent` from
  `20261005000000` instead of its live `20261006000000` and silently reverted the actor binding
  and the server-stamped `created_at`; B5B caught it, and `20261017000000` is the restoration and
  is now the live body. The other three: `public.report_barter_obligation_no_show` lives in
  `20261014000000_no_show_lock_order.sql` — and **`20261012000000` § 6 states a lock-order contract
  that is false and instructs future writers to preserve it**; `public.enforce_barter_no_show_
  consistent` lives in `20261018000000_no_show_created_at_server_stamped.sql`; and both read models
  are recreated in full, so `public.my_barter_obligations` lives in `20261016000000` and
  `public.my_trade_activity` in `20261013000000`. **Enumerate the implicit locks too:** an INSERT,
  or an UPDATE writing a foreign-key column, takes `for key share` on the parent row.
- **No seventh hand-copied write handler, and no seventh hand-copied `busy` guard, on the
  negotiation screen.** The consolidation this required is **done** — all six writes route through
  `lib/negotiationWrite.ts`. One thing remains before the next write action: **`runBarterWrite`
  sets `busy` but does not check it**, so the re-entrancy guard is still hand-copied at 6/6 call
  sites. Founder ruling, 2026-09-06 (PR #60): that was deliberately left alone in PR #60, and
  **before any next Session 7 change adds a seventh negotiation-screen write handler, the
  busy/re-entrancy guard is to be centralized rather than copied again.** The `onOpen`/`onSend`
  re-read difference is **settled** — approved as it stands, not to be normalized. See § Next →
  Session 7 item 1.
  **PR #64 did not trip this constraint, and that is worth recording rather than assuming.** Its
  new no-show write is a **fourth `op` on the existing `runObligationWrite`**
  (`app/community/negotiation/[id].tsx:369-397`), not a seventh handler, so it reuses that
  handler's single `if (busy) return` at `:373` and copies no new guard. The count is still
  **six** handlers and six hand-copied guards; `lib/negotiationWrite.ts` still exposes `setBusy`
  and no `busy` check, so the obligation stands unchanged for the next handler.
- Agents 1–3 stay read-only; the Steward's writes stay inside its five-file allowlist.
- No session marks its own work complete — evidence on `main` does.
