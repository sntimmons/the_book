# Roadmap — session-based

**Status:** Authoritative for sequencing. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `e5b9125` (2026-09-10) — squash-merge of **PR #76**, Session 8
(safety, trust and operator handling), which earns a Completed row below and therefore moves this
document's anchor (CHECKLIST § A tiebreak). **Three earlier merges earn rows in the same pass** —
`6a3fb69`, `a125cd7` (Pre-Beta Correction 2) and `0781f49` (**PR #74**, Pre-Session-8 Correction 3)
— and the anchor sits at the latest of the four.

This run had **no shell**. What it confirmed from files: `.git/refs/heads/main` and
`.git/refs/remotes/origin/main` both read `e5b912511829ecfa8793c2a5ad8feaba40dfa3a0`; `.git/HEAD`
points at `chore/post-session-8-state-reconciliation`, whose ref is **`76c4576` — one commit ahead
of `e5b9125`**, and that commit is not a Steward edit; `supabase/migrations/*.sql` holds **97**
files; and the merge order `224d609` → `6a3fb69` → `a125cd7` → `0781f49` → `e5b9125`, read from
`.git/logs/HEAD`. **The PR numbers for `6a3fb69` and `a125cd7` were not supplied and are recorded as
not established**, not guessed. PR #76 and PR #74 were supplied.
**Last edited by:** this reconciliation, which was **not given its own PR number**. The last
numbered edit to this file that can be proven is **PR #71** (`224d609`), the post-Session-7
reconciliation; PR #75, which would have carried the post-Correction-3 edit, **never merged**.

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
| Barter **pre-adjudication cleanup gate** — the five-item Founder-ruled gate on the adjudication slice, discharged | [#66](https://github.com/sntimmons/the_book/pull/66) | `0f2b93c` (squash merge; base `1c0fe54`, PR #65) — **verified** | **No migration, no database object, no write path, no lifecycle state and no product behaviour** — the count is 57 before and after, newest `20261018000000` (`supabase/migrations/*.sql`), and `git diff 1c0fe54 -- supabase/` was empty. This row is here because the gate itself is an **architecture capability**: it was ruled by the Founder as work that had to land BEFORE adjudication, and until it did, adjudication could not begin. All five items discharged and verified on this tree: (1) `obligationView` takes one `ObligationViewFacts` object, not seven positional arguments (`lib/obligationState.ts:310-333`, `:335-344`) and **no positional call site remains** — a sweep for `obligationView(` not followed by `{` matches only the definition itself, across `lib/`, `app/` and `__tests__/`; (2) the attention mapping is single-sourced as `attentionTone` / `ATTENTION_TONE`, keyed by an `AttentionLabel` union so a fourth state is a COMPILE error (`:541-569`, union at `:544-547`), with both `attention` fields typed to it (`:117`, `lib/tradeActivity.ts:169`) and each screen keeping its own palette (`app/community/negotiation/[id].tsx:1147-1154`, `app/community/trade-activity.tsx:551-555`); (3) `cancellationView` takes one `CancellationViewFacts` object with **both gates REQUIRED** — neither `anyDelivered` nor `noShowReported` has a safe default, because `false` on either ASSERTS the permissive fact and draws an irreversible control (`lib/tradeCancellation.ts:143-178`, applied `:193`, `:200`), while `cancellationState` still takes only the two acts (`:43-50`); (4) the reason composer is one component, `components/ReasonComposer.tsx`, used by both call sites (`app/community/negotiation/[id].tsx:684-695`, `:857-872`), owning the SHAPE and not the meaning (`components/ReasonComposer.tsx:3-38`); (5) the `underReview` name collision is split into `ObligationViewFacts.obligationUnderReview` (`lib/obligationState.ts:330`) and `TradeRowFacts.agreementUnderReview` (`lib/tradeActivity.ts:138`), **and the PD-063 predicate is aligned** — the client gate now reads the report itself, `noShowReportedAt !== null` (`app/community/negotiation/[id].tsx:237`, consumed at `:246`), which is the same predicate `PT423` evaluates, rather than the server's broader `under_review` (`report OR not_received`). New tests: `__tests__/lib/obligationViewShape.test.ts` (the 192-combination `obligationView` matrix, the tone mapping over every label both view models can emit, the two cancellation gates asserted independently and order-independently) and `__tests__/components/ReasonComposer.test.tsx` (the PD-060/PD-062 disclosure-above-input rule asserted by RENDER ORDER, not by presence). **Nothing else changed: PD-062 and PD-063 are untouched, and the no-show + Under Review foundation stays exactly as PR #64 merged it.** *(This row's line citations, its migration count and its closing absence claim describe the tree **at `0f2b93c`**, which is what a Completed row is for. As at `f5fd197` the count is 68, the `lib/` citations have moved, and adjudication and the terminal obligation outcomes — which this row asserted UNBUILT — were built by PR #68, two rows down. Read [CURRENT_STATE.md](CURRENT_STATE.md) for what is true now.)* |
| **Future-ideas bank and marketing message bank** — durable product-thinking documents | [#69](https://github.com/sntimmons/the_book/pull/69) | `c04e5bd` (squash merge) — **supplied, not verified** | `docs/product/FUTURE_PRODUCT_IDEAS.md` and `docs/product/MARKETING_MESSAGE_BANK.md`, both **new files that did not previously exist**. This row is included on the same basis as #29's PM document set: it is the durable recording of product thinking, not a reconciliation of already-landed facts, which is what the inclusion rule excludes. **It is a documentation artifact and NOT a capability**, so it earns a row without moving this document's anchor — and, critically, **nothing in either file is a decision.** An idea written up there is exploration, not commitment; only a `PD-NNN` in [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) commits the product to anything. This row is placed by merge order: `c04e5bd` landed **before** `5c24e8f`. |
| Barter **manual operator adjudication and the three terminal OBLIGATION outcomes** — implements PD-064 … PD-067; PD-068 and PD-069 were **recorded** alongside it ([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md):7 attributes PD-064 … PD-069 to this PR), while **PD-069's implementation landed in PR #70** | [#68](https://github.com/sntimmons/the_book/pull/68) | `5c24e8f` (squash merge) — **supplied, not verified** | Eight migrations, `supabase/migrations/20261019000000_barter_obligation_adjudication.sql` … `20261026000000_append_only_honest_privileged_predicate.sql`. **One new table** — `public.barter_obligation_adjudications`, the **eleventh** barter table: at most one row per obligation (`unique (obligation_id)`), append-only, participant-read policy, **no write policy and no client write grant** (`20261019000000:62-99`, `:105-137`, `:210-243`). **One new RPC** — `adjudicate_barter_obligation(uuid, text, uuid, text)`, **the only function in this repo whose `EXECUTE` is granted to `service_role` alone** (`:352-355`). A participant is refused at **four independent layers**: the grant; the in-function privileged-caller check (`:280-282`); the in-function adjudicator-may-not-be-a-participant check (added by `20261023000000`); and the same check re-made in the `BEFORE INSERT` trigger (`:168-175`), which is the copy that holds against a direct privileged INSERT. **Three terminal outcomes, obligation-level and resolved independently**: `fulfilled`, `unfulfilled`, `closed_without_resolution` — the third records that the information supported **neither** finding, is **not** a softer *unfulfilled*, is **not** a finding of fault and carries **no reputation effect** (PD-065). **Eligible only while UNDER REVIEW**; a passed deadline, Needs Attention, a delivery, a passed `due_at` and a passed `scheduled_at` are all insufficient, and a cancelled agreement cannot be adjudicated at all (PD-064). **Immutable**: no edit, no withdrawal, no flip — the same outcome is a safe no-op, a different one is refused (PD-066) — and it **rewrites no history**, so a receiver's "Didn't receive" and a later `fulfilled` coexist permanently. **The outcome is participant-visible; the rationale and the adjudicator are INTERNAL**, enforced by **column-level grants** because an RLS policy cannot hide a column (PD-067, `:229-241`). A terminal outcome then **dominates**: the derived read states are suppressed and the three participant write RPCs refuse, with `PT424` after `20261022000000` gave that refusal its own SQLSTATE. `supabase/tests/adjudication.test.sql` registered at `scripts/db-security-test.mjs:54`; seven new races in `scripts/negotiation-concurrency.mjs`. **NO OPERATOR UI WAS BUILT AND NONE MAY BE INFERRED** — the secure server path lands first by Founder ruling (`20261019000000:52-55`), a minimal internal **Review Queue is a PRE-BETA requirement** (PD-068), and **no resolution SLA is promised to anyone**. **Still not built: any operator surface, agreement-level outcomes of any kind, automatic fulfilment or completion, barter reviews, reputation, and push / device / email notifications. How a plain Needs Attention might enter Under Review is STILL UNRESOLVED — this slice did not answer it.** |
| Barter **derived agreement presentation, and the removal of the last live dollar-value UX** — PD-069, PD-070 | [#70](https://github.com/sntimmons/the_book/pull/70) | `f5fd197` (squash merge) — **supplied, not verified** | Three migrations, `supabase/migrations/20261027000000_suppression_computed_once.sql` … `20261029000000_offering_value_comment_precision.sql`, **none of which adds a table, a column, a write path or a lifecycle state**. `20261027000000` drops and recreates both read models so the terminal-outcome suppression predicate is computed **once** in a lateral instead of inlined three times, and renames the `p_trade_cancelled` parameter that had stopped meaning "cancelled"; it is now the **live definition of `public.my_barter_obligations` and `public.my_trade_activity`**. `20261028000000` implements PD-069's server half: `barter_offers.offering_value` becomes **DEPRECATED legacy data** — `enforce_barter_offer_write` **nulls it on INSERT** (silently, so a not-yet-updated mobile build keeps posting) and makes it **one-directional on UPDATE** (keepable or clearable, never introduced or changed), with `service_role` short-circuiting first. **The column is deliberately NOT dropped**: pre-ruling rows hold a figure a provider entered, and `20260917000000` copies it into immutable proposal-version snapshots. `20261029000000` is a comment precision fix on that deprecation. Client: the **estimated-value composer input and the `~$N value` board badge are REMOVED** (`app/community/barter-compose.tsx:61`, `app/community/index.tsx:944-948`) and `offering_value` is **not selected, not mapped and not typed** (`lib/barter.ts:27-35`, `:83-87`), pinned as an absence by `__tests__/guards/barterValueAbsent.test.ts`. **PD-070's derived agreement presentation**: `agreementResolution` (`lib/obligationState.ts:741-749`) returns one of four **coarse** states — `none`, `partial`, `allSettled`, `allSettledMixed` — **none of which names an outcome**, and `CONFIRMED_DETAIL` (`lib/negotiationState.ts:226-245`) is total over them, so a settled trade no longer instructs two providers to arrange something an operator already concluded. `fulfilled + closed_without_resolution` does **not** become *Partially Fulfilled* and `closed + closed` does **not** become *Not Completed*; where a roll-up would overstate, the two obligation truths are shown instead. **NO agreement-level terminal outcome is persisted, and PD-070 makes that permanent rather than pending.** |
| **Pre-Beta Correction 1** — unsupported beta claims removed from live surfaces, and pinned as an absence | **not established** — the reconciliation that wrote this row had no shell and no PR number was supplied | `6a3fb69` (read from `.git/logs/HEAD`, commit subject *"fix: remove unsupported payment, identity, notification and SLA claims from live beta surfaces"*; the name **Pre-Beta Correction 1** and the date 2026-09-08 are [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)'s, under OQ-036) | `__tests__/guards/betaClaimsAbsent.test.ts` — a source-reading guard over every root that can produce a user-visible string, which strips comments first so prose cannot satisfy it, and deliberately excludes `app/preview/**` and documentation. The claims it pins as gone: payment protection and deposit safety (**PD-042** — The Book processes no payment), user-completable identity verification (**PD-004**), push/device/email notification (**PD-059**), and any promised response time behind a report. Its header records that `hooks/` was originally out of scope and that `hooks/useNotifications.ts` was still shipping *"No charge was made."* while the suite reported clean — **a guard scoped narrower than the claim in its own header is worse than no guard**. This row is here because a sentence that misdescribes money or identity is the one kind of inaccuracy a beta cannot recover from, and pinning its absence is a product-truth capability. **Only the guard file was verified by this run**; the copy changes themselves were not diffed, because that needs a shell. |
| **Pre-Beta Correction 2** — provider, contract, signature and storage ownership bound; least-privilege defaults | **not established** — no PR number was supplied | `a125cd7` (read from `.git/logs/HEAD`, commit subject *"fix(security): bind provider, contract, signature and storage ownership; least-privilege defaults"*) | Seven migrations, `supabase/migrations/20261030000000_providers_public_column_surface.sql` … `20261036000000_signature_immutability_and_review_corrections.sql`. `providers` stops being world-readable on every column and becomes a **column-level SELECT grant** — 28 public columns to `anon`/`authenticated`, 21 to `service_role` alone; contracts and `contract_signatures` are bound to a row the caller owns on both write paths; the client contract-signing gate becomes reachable through a `SECURITY DEFINER` read function; `posts-media` becomes owner-bound on INSERT, UPDATE and DELETE; and default privileges stop granting `anon`/`authenticated` every privilege on every future table. **Five defects were REPRODUCED at runtime against non-production before being fixed**, and it surfaced a pre-existing one that mattered more than any of them: provider go-live (J7) had been failing for every real provider since 2026-08-30, because `.upsert(…, { onConflict: 'user_id' })` emits `DO UPDATE SET user_id = excluded.user_id` and Batch 3a deliberately withheld UPDATE on that column. `supabase/tests/authorization_boundaries.test.sql` registered at `scripts/db-security-test.mjs:57`; `__tests__/guards/providerColumnGrant.test.ts`. Post-apply figures in [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md): **B5B 1305/1305, concurrency 181/181**, at **75** applied versions. The narrative is in [CURRENT_STATE.md](CURRENT_STATE.md) § Security posture, written by the slice itself. |
| **Pre-Session-8 Correction 3** — booking-request lifecycle, the deliverer's review request, and the beta-flow truths (PD-071 … PD-081) | [#74](https://github.com/sntimmons/the_book/pull/74) — **supplied, not verified** | `0781f49` — **supplied, not verified** | Nine migrations, `supabase/migrations/20261037000000_booking_request_lifecycle.sql` … `20261045000000_drafts_are_not_relationships.sql`, **four of them forward corrections to the other five**. A booking gains `submitted_at` (NULL = a private DRAFT the provider cannot see) and a server-authoritative `expires_at` at `LEAST(submitted_at + 72h, appointment_time)` (**PD-071**); `contract_for_booking()` replaces a function that returned any approved provider's contract text to any authenticated caller; **`20261039000000` adds the deliverer's barter review request (PD-072) — the THIRD route into Under Review, and the answer to OQ-071**, completed by `20261042000000` after the eligibility rule was found updated in only one of its two enforcing copies; `posts` gains the owner-scoped DELETE policy it never had and the `WITH CHECK` whose absence let a provider republish their media onto a stranger's profile. **Two corrections are the record of this slice, not footnotes to it:** `20261044000000` replaced an `available_today` PostgREST **computed column** that could never have worked — a whole-row reference against Correction 2's 28 named column grants — and which had broken **discovery, the provider profile and search for every user** while passing a suite that only ever ran as `service_role`; and `20261045000000` closed the fact that a DRAFT booking satisfied three boundaries written before drafts existed, letting any authenticated account open an ungated conversation with any approved provider and reverse a provider's explicit decline. `supabase/tests/booking_lifecycle.test.sql` and `supabase/tests/barter_review_request.test.sql`, registered at `scripts/db-security-test.mjs:55-56`; `__tests__/guards/bookingLifecycleReads.test.ts`. **PD-080 is the only one of the eleven decisions not implemented, deliberately.** **No post-apply B5B, concurrency or Jest figure is recorded for this block** in the ledger or was supplied here. |
| **Session 8 — safety, trust and operator handling** (PD-082 … PD-089) | [#76](https://github.com/sntimmons/the_book/pull/76) — **supplied, not verified** | `e5b9125` — **proven from `.git/refs`** | Thirteen migrations, `supabase/migrations/20261046000000_user_blocks.sql` … `20261058000000_block_gates_fire_last_and_name_no_stranger.sql`, **six of them forward corrections**. **User blocking** (PD-082) with the **live-transaction exception** — a blocked pair keeps an EXISTING conversation while they hold a submitted, non-terminal booking or a confirmed agreement with an unresolved obligation, because severing it would trap two people inside an obligation while removing the only means of resolving it; a DRAFT booking deliberately does not qualify. **`PT427` is the block refusal and is deliberately distinct from `PT426`.** **One reporting path** into `public.reports` with a trigger that opens an operator case (PD-083); the community feed's `community_reports` is **retired — write grant revoked and INSERT policy dropped, ROWS AND CASCADES DELIBERATELY PRESERVED**, because erasing unread safety reports is a worse answer than never having read them. **Provider eligibility gates WRITES only** via `caller_eligible_provider_id()` (PD-086) — a de-approved provider can still close their own offers and answer their own obligations. **The operator Review Queue's BACKEND** (PD-085): `operator_cases`, `operator_case_events`, `is_operator()`, intake for all three sources, and operator RPCs granted to **`service_role` alone**, with no role table and no `is_admin` column. **The de-approved provider's appeal route** (PD-086). **THE LIMIT IS THE POINT: NO OPERATOR UI WAS BUILT, and PD-068 is amended to PARTIALLY SATISFIED — do not mark it complete.** Working a case today requires a `psql` session; verified as an absence by searching `app/`, `lib/`, `components/`, `hooks/`, `store/` and `context/` for a caller of `operator_update_case`, `operator_set_provider_eligibility` or `adjudicate_barter_obligation` and finding only three prose comments. Three Founder rulings closed the questions the branch filed rather than answered: **PD-087** (a block is never announced, need not be undiscoverable — **no code change**), **PD-088** (bounded report intake before broad beta — **NOT IMPLEMENTED**) and **PD-089** (a blocked person disappears from ordinary discovery and community surfaces — **NOT IMPLEMENTED**). Client: `lib/safety.ts`, `lib/safetyMenu.ts`, `components/ReportSheet.tsx`, `app/settings/blocked.tsx`, symmetric block/report in `app/messages/[id].tsx`, and a `blockedByMe` state on the provider profile. `supabase/tests/safety_operator.test.sql` registered at `scripts/db-security-test.mjs:58`; `__tests__/lib/safety.test.ts`; `__tests__/components/ReportSheet.test.tsx`. **No post-apply B5B, concurrency or Jest figure is recorded for this block** in the ledger or was supplied here. |

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

The **pre-adjudication cleanup gate** row is **artifact-proven but provenance-attested**, and it
carries one extra burden the rows above do not: it claims an ABSENCE — that nothing behaved
differently afterwards — and an absence cannot be proven by reading files. What was verified on
this tree by the reconciliation itself: every artifact the row names, item by item, at the lines
it cites; that `supabase/migrations/*.sql` still holds **57** files with the same newest file as
before; and that no positional `obligationView` call site survives.

**The provenance half is now PROVEN too**, closed immediately afterwards with the commands the
reconciliation named — it had no shell:

- `gh pr view 66` — **MERGED into `main` 2026-09-08T02:53:24Z**, squash, merge commit `0f2b93c`,
  base `main` @ `1c0fe54`; pre-merge `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`, both required
  checks green on head `e94ad5d`.
- `git rev-parse` / `git status --porcelain` — local `main` **equals** `origin/main` at `0f2b93c`;
  working tree clean.
- `gh run list --branch main` — post-merge CI
  [run 34181613351](https://github.com/sntimmons/the_book/actions/runs/34181613351), **success**.
- `supabase migration list --linked` — **57** versions, local == remote, **no drift**.
- `git diff 1c0fe54 --stat -- supabase/` — **empty**, so the no-database-change claim is proven
  rather than inferred.
- **B5B 1097/1097 re-run against merged `main`** — the same figure as before the refactor, which
  is what makes the ABSENCE claim evidence rather than assertion. Concurrency 129/129, Jest
  663/663, `tsc --noEmit` clean, `lint:ci` 0 errors, zero residue.

**The identity of those first two figures is the load-bearing evidence for the row, not a
footnote.** B5B and the concurrency harness both exercise the database; a refactor confined to
`lib/`, `components/`, `app/` and `__tests__/` should move neither, and neither moved — 1097/1097
and 129/129 before and after. Jest changed (646 → 663) because tests were ADDED, which is the
expected direction for a cleanup that pins invariants. `gh pr view 66`, `git rev-parse`,
`gh run view 34181613351`, `git diff 1c0fe54 -- supabase/` and `supabase migration list` close the
provenance gap in five commands.

**The three newest rows — #69, #68 and #70, in merge order — are artifact-proven but
provenance-attested**, and
that is stated rather than blurred, because the reconciliation that wrote them had **no shell**.

*What was proven*, by reading this tree at `f5fd197`: every migration each row names exists in the
chain (the inventory is **68** files, newest `20261029000000`); the adjudication table, its two
triggers, its participant-read policy and its **column-level** grant list; that
`adjudicate_barter_obligation`'s `EXECUTE` is revoked from `public`, `anon` and `authenticated` and
granted to `service_role` alone; that the participant refusal exists in **both** the RPC and the
trigger; that `supabase/tests/adjudication.test.sql` exists and is registered at
`scripts/db-security-test.mjs:54`; that **no file under `app/` or `lib/` calls
`adjudicate_barter_obligation`**, which is what makes the "no operator surface" claim evidence
rather than assertion; that `offering_value` is not selected, mapped or typed on the client; and
that `.git/refs/heads/main` == `.git/refs/remotes/origin/main` == `f5fd197`.

*What is attested only*, as supplied in the invocation: the three merge commits `c04e5bd`,
`5c24e8f` and `f5fd197` and their PR numbers; the squash strategy; the clean working tree; that
`main` CI on `f5fd197` concluded **success** on both `check` and `db-security` — **no run number
was supplied, so none is recorded here**; that `supabase migration list --linked` reports **68**
versions with local == remote and no drift; and the figures **B5B 1229/1229**, **concurrency
181/181** and **Jest 746/746 across 36 suites**, of which only the suite count is
repository-provable. `gh pr view 68`, `gh pr view 69`, `gh pr view 70`, `git rev-parse`,
`gh run list --branch main` and `supabase migration list --linked` close that gap.

**The four newest rows are the weakest-evidenced in this table on PROVENANCE and among the
strongest on ARTIFACT**, and that asymmetry is stated rather than averaged. They were written by a
reconciliation with **no shell**, four merges after the last one this document recorded.

*What was proven*, by reading this tree: every migration each of the four rows names exists in the
chain, and the chain is **97** files with the four blocks the rows describe; every test file and
guard named exists, at the registration lines given; the **absence** of any operator-RPC caller in
client code; and `.git/refs/heads/main` == `.git/refs/remotes/origin/main` == `e5b9125`.

*What is attested only*: that `e5b9125` is **PR #76** and `0781f49` is **PR #74**, both supplied in
the invocation; the squash strategy; and the clean working tree. *What is **not established** and is
recorded as such rather than guessed*: the PR numbers behind `6a3fb69` and `a125cd7`. *What was
neither supplied nor found*: any CI run number or conclusion for `e5b9125`, and any post-apply B5B,
concurrency or Jest figure for Correction 3 or Session 8 — the ledger dates both applies but records
no figures for either, so the last figures this document can cite are Correction 2's.
`git log --oneline --merges f5fd197..e5b9125`, `gh pr view 76`, `gh run list --branch main` and
`supabase migration list --linked` close every one of those gaps.

**One governance note the reviewer of this diff needs.** `.git/HEAD` resolves to
`chore/post-session-8-state-reconciliation`, whose ref is **`76c4576`** — `e5b9125` plus one commit,
*"docs: the discovery comment named a function that was dropped"*, salvaged from the superseded
**PR #75** and touching a file **outside the Steward's five-file allowlist**. It is not a Steward
edit and predates this reconciliation, but it means the tree these rows were verified against is
that commit's, not `e5b9125`'s. No row above depends on the difference.

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

**SESSION 8 IS MERGED, AND PD-068 IS STILL NOT SATISFIED.** Those two facts belong in one sentence,
because separating them is how this document would become untrue. `main` @ `e5b9125` (**PR #76**)
holds **ninety-seven** migrations, newest
`20261058000000_block_gates_fire_last_and_name_no_stranger.sql`. Blocking, one reporting path into
`public.reports`, provider-eligibility gating of barter writes, the de-approved provider's appeal
route and the **operator Review Queue's BACKEND** are all on `main`, each described in the Completed
row above and in [CURRENT_STATE.md](CURRENT_STATE.md) § Safety, trust and operator handling.
**There is no operator UI. The operator RPCs are reachable only as `service_role`. Working a case
today requires a `psql` session.** PD-068 is therefore **PARTIALLY SATISFIED — do not mark it
complete** ([PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md):1001-1012), and equally, any statement that
the queue does not exist at all, or that nothing can reach a terminal outcome by any route, is now
also wrong. **Backend yes, surface no.**

**Two decisions from the same session are LOCKED AND NOT IMPLEMENTED**, and neither may be read as
shipped: **PD-088** (bounded report intake before broad beta — every report now opens a case, and
reporting is still neither rate-limited nor idempotent per subject) and **PD-089** (a blocked person
disappears from ordinary discovery and community surfaces — Session 8 stopped at CONTACT, so a
blocker still sees the person they blocked and can still tap Respond). **PD-087 required no code
change** and is satisfied by current behaviour.

**Three capability merges preceded Session 8 and had never been recorded here**: **Pre-Beta
Correction 1** (`6a3fb69`), **Pre-Beta Correction 2** (`a125cd7`) and **Pre-Session-8 Correction 3**
(`0781f49`, PR #74). All three now carry Completed rows. **PR #71** (`224d609`) was the
documentation-only post-Session-7 reconciliation and earns none; **PR #75**, which would have been
the post-Correction-3 one, **never merged** — `.git/logs/HEAD` records `main` going `0781f49` →
`e5b9125` in one fast-forward — which is why the header of this document still read `f5fd197` four
merges later.

---

**Historical, and correct as of `f5fd197`:**

**SESSION 7 IS COMPLETE. The barter lifecycle engine is closed.** The proposal / versioning
foundation, proposal timing extension, agreement
finalization, obligations foundation, obligation delivery / receiver confirmation,
pre-delivery cancellation, the receiver-response window / Needs Attention, no-show reporting
with the Under Review foundation, the five-item pre-adjudication cleanup gate, **manual operator
adjudication with the three terminal OBLIGATION outcomes (PR #68)** and **the derived agreement
presentation with the removal of the last live dollar-value UX (PR #70)** are all merged, each
with a Completed row above. `main` @ `f5fd197` holds
**sixty-eight** migrations, newest
`20261029000000_offering_value_comment_precision.sql`. Slices 2,
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
outcome, automatic completion or fault finding follows from any of them, and the receiver may
still answer after the deadline
(PD-046 § 7.2, PD-057, PD-058, PD-062, PD-063). The one ordering rule PR #64 adds is precedence,
not judgment: a recorded report **removes** the ordinary exit (`PT423`), and a committed
cancellation **refuses** a later report (`PT409`).

**PR #66 added nothing to that list and removed nothing from it.** It is a behaviour-preserving
cleanup of the client modules the slices above left behind, ruled by the Founder as a gate on the
adjudication slice, and it is **discharged in full** — see the Completed row above and § Next
→ Session 7 for the five items. **The adjudication gate was CLEARED** (Founder ruling, and the
verdict of the Codebase re-audit of the cleanup branch — both **supplied**, and neither readable
by a shell-less reconciliation).

**PR #68 then built adjudication on that base, and PR #70 closed Session 7.** An obligation that is
Under Review can now reach a terminal outcome — **Fulfilled**, **Unfulfilled** or **Closed without
resolution** — but **only by a manual decision of an authorized operator**, through an RPC whose
`EXECUTE` is granted to `service_role` alone and which refuses a participant at four independent
layers. **No operator surface was built** (PD-068 ruling), so **nothing in the running product
calls it and no obligation can actually reach an outcome today** — verified as an absence by
searching `app/` and `lib/`. Agreement-level resolution is **derived for presentation and never
persisted** (PD-070), and there is no `Completed`, `Partially Fulfilled` or `Not Completed`
anywhere in the product — **now or ever**. And under PD-069 the product **stopped asking a provider
to price their own barter offer**: the estimated-value input and the `~$N value` badge are gone,
and `barter_offers.offering_value` is deprecated legacy data that no live surface reads. Two
sentences govern the whole surface, quoted from PD-069 rather than paraphrased: *"The Book
adjudicates performance, not value."* and *"The Book does not appraise the trade. It makes the
trade clear, mutual, and accountable."*

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
**Receiver-Response Window and Needs Attention** (**PR #62**, `26fb7fd`), **No-Show Reporting
with the Under Review Foundation** (**PR #64**, `23df39c`), the **pre-adjudication cleanup
gate** (**PR #66**, `0f2b93c`), **manual operator adjudication and the three terminal obligation
outcomes** (**PR #68**, `5c24e8f`) and the **derived agreement presentation with the dollar-value
removal** (**PR #70**, `f5fd197`), which is where
this document's anchor now sits. **PR #69 (`c04e5bd`) landed BEFORE #68**, not between #68 and
#70, and earns a documentation-artifact row rather than a capability row, for the reason given in
that row.
**PR #67 was the documentation-only reconciliation that followed PR #66** — commit subject
*"docs: reconcile project state against main after PR #66 (#67)"*, `fea27f9`, **read from a `git
log` excerpt supplied to this run rather than from `git` itself** — so it earns **no Completed
row**, the same treatment #57, #59, #63 and #65 receive.
**PR #65 (`1c0fe54`) sits between #64 and #66**: it is the
documentation-only reconciliation that followed PR #64, so it earns **no Completed row** — the same
treatment #57, #59 and #63 already receive. That ordering is readable from `.git/logs/HEAD`, which
records `main` moving `23df39c` → `1c0fe54` → `0f2b93c` with the branch
`refactor/barter-pre-adjudication-cleanup` cut from `1c0fe54`; the PR numbers themselves were
supplied. Three merges sit between #58 and #62: **#59** and **#61**
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
   PD-046, and the ledger now runs to **PD-070** ([PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md)),
   with the open-question ledger at **OQ-070**. **OQ-006 and OQ-007 remain Open** — deliberately,
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

### Session 7 — Barter beta readiness — **COMPLETE**

**Session 7 is complete.** Its last two slices closed the barter lifecycle engine, and both have
Completed rows above with their evidence: **PR #68** (`5c24e8f`) — manual operator adjudication and
the three terminal OBLIGATION outcomes (PD-064 … PD-067); and **PR #70** (`f5fd197`) — the derived
agreement presentation (PD-070) and the removal of the last live barter dollar-value UX (PD-069).

**Complete means the engine, not the product.** Four things follow from that and are stated here so
none of them is mistaken for unfinished Session 7 work, and none for finished work either.

**1. Nothing in the running product can resolve an obligation.** The adjudication path is secure,
tested and `service_role`-only, and **no operator surface exists** — verified as an absence by
searching `app/` and `lib/` for a caller and finding only the concurrency test harness. Under Review
is therefore a practical terminus today even though the schema no longer makes it one.
**Still true at `e5b9125`, and Session 8 narrowed it rather than closing it:** the queue those cases
land in now exists (PD-085), and **nothing calls its operator RPCs either**. A case can be created
and cannot be worked outside `psql`.

**2. The next activity is NOT a product session.** ~~Before Session 8 implementation begins, the
Founder / PM has chosen to run a **WHOLE-APP AUDIT ROUND 2**. It is a **planning and quality gate**,
not a feature slice: it delivers findings and sequencing, not code. **Session 8 does not begin until
it completes.**~~ **Overtaken by events: Session 8 began and merged (`e5b9125`, PR #76).** Three
correction slices landed between PR #71 and Session 8 — `6a3fb69`, `a125cd7` and `0781f49` — each
with a Completed row above. **Whether those slices WERE the whole-app audit round 2, or were
something else that happened instead of it, is not established by this repository**, and this
reconciliation will not infer it. See § WHOLE-APP AUDIT ROUND 2 below.

**3. What is PRE-BETA, and therefore required rather than optional:**

**Restated at `e5b9125`. Three of these four moved in Session 8, and the first moved only halfway —
which is the whole point of the row.**

| Pre-beta requirement | Status | Note |
|---|---|---|
| Minimal internal **Review Queue** / operator surface | **BUILT** (Session 8B, `c4afee5`) | **PD-068 is SATISFIED.** An allow-listed operator (`public.operators`) can see the queue, filter by type and status, open a case, read the immutable facts behind it, write an internal note, take the supported resolution action, and see a durable history — without a `psql` session. **The authority change is the part to know about:** `is_operator()` gained a third arm, because an operator opening a screen is `authenticated` and neither original arm admitted them. The allow-list has **no client privilege of any kind** — including SELECT — so operators can neither promote anyone nor enumerate each other, and making one is a `service_role` act. **There is still NO SLA** and the queue's order (oldest open first) is not configurable, because with no SLA the order is the only fairness guarantee a waiting person has. |
| **Blocking and reporting** | **BUILT** | PD-082 and PD-083, barter contract § 9. Blocking carries the live-transaction exception and `PT427`; reporting is one path into `public.reports` that opens an operator case, and `community_reports` is retired. |
| **Operator handling** of a reported provider | **BACKEND BUILT — SURFACE NOT BUILT** | The intake and the case model exist (PD-085); the triage, response and restriction path a human would use does not. `operator_set_provider_eligibility` exists and nothing calls it. |
| **Report intake bounds** | **BUILT** (Session 8C, `0b1f563`) | **PD-088**, locked 2026-09-09, required **before broad beta**. Every report now opens a case, so an ordinary account can create N live cases. The limits are decided and written down; none is implemented. **Assigned to Session 8C** (2026-09-10). |
| **Blocked users hidden from ordinary discovery / community** | **BUILT** (Session 8C, `0b1f563`) | **PD-089**, locked 2026-09-09. **Assigned to Session 8C** (2026-09-10); explicitly **not** Session 8 and **not** Session 8B. |
| Broader **safety and trust readiness** | **PARTIAL** | OQ-020 … OQ-026; address disclosure remains the highest-risk open surface, and is untouched by Session 8. |

**4. What is OPEN or FUTURE, and therefore exploratory — none of it is committed work, and
appearing in `FUTURE_PRODUCT_IDEAS.md` commits the product to nothing:**

| Exploratory item | Note |
|---|---|
| ~~**Needs Attention → Under Review escalation**~~ | **NO LONGER OPEN — closed by PD-072** (2026-09-09, Correction 3), by the narrow route this row required: a **deliverer-initiated explicit REQUEST**, not an automatic escalation, a second timer or an operator auto-escalation, none of which exist even now. It was resolved by a Founder decision and then implemented, in that order. See OQ-071. |
| Barter **trust / reliability consequences** | Explicitly absent today: an outcome carries no reputation effect (PD-065). |
| **Reciprocal matching**, a **Wants list**, **three-way matching** | Exploration only. Beta stays direct two-provider barter (PD-069). |
| Barter negotiation **UX simplification** | The model underneath is correct and stays; this is presentation. |
| **Trade history / tax / legal** | Unscoped. |
| **Payment protection architecture** | Belongs to the payments programme, not a session. |
| **Identity-verification vendor and integration** | Messaging is educational during beta (PD-004). |
| **Available Right Now** | Exploration only. |

**One deferral carried out of Session 7 rather than discharged by it:** the barter **feed card and
offer-responses screen** still render agreement-level state only and carry neither the
receiver-window state nor the terminal outcomes (`lib/tradeActivity.ts:824` onward —
`responderFeedState` calls `tradeRowState` without those facts). The copy stays TRUE, so nothing
there became false, but the surfaces disagree in completeness with Trade Activity and the trade
detail. **That belongs to the whole-app audit round 2.**

---

**Historical record, as written before the adjudication slice, and kept because it is the record of
how the gate was cleared:**

Agreement finalization is merged in PR #50, proposal timing / expiry enforcement in PR #52, the
obligations foundation in PR #54, obligation delivery / receiver confirmation in PR #56,
pre-delivery cancellation in PR #58, the receiver-response window and Needs Attention in PR #62,
no-show reporting with the Under Review foundation in PR #64, and the five-item pre-adjudication
cleanup gate in PR #66. ~~**Next work remains within Session 7, and the next feature is
adjudication.**~~ **That feature shipped as PR #68, and PR #70 closed the session — see above.
Session 7 is COMPLETE, and the next activity is the whole-app audit round 2, not a slice.**

~~Next work remains within **Session 7**.~~ Delivery, the receiver's one-time answer and the ordinary
pre-delivery exit now exist (PR #56, PR #58) — but they record events and acts, not outcomes.
The **7-day receiver-response window** and **Needs Attention** now exist too (PR #62, **PD-057**
and the Trade Activity half of **PD-059**), as DERIVED read state: the anchor is
`max(delivered_at, scheduled_at ?? due_at)`, the deadline is that plus 7 days, attention begins
at `server_now >= deadline` inclusive, and an unanswered elapsed window leaves the obligation
`delivered` — **it manufactures no outcome**, and the receiver may still answer. Trade Activity
now surfaces an unanswered delivered obligation as needing the right provider's attention.
**CARRY-FORWARD CODEBASE GATE — ALL FIVE ITEMS DISCHARGED, AND MERGED.** Raised by the Codebase
audits of
PR #62 and PR #64, ruled by the Founder on 2026-09-07 as a bounded, behaviour-preserving cleanup
that must land BEFORE the adjudication slice. Done in `refactor/barter-pre-adjudication-cleanup`
and **merged to `main` as PR #66 (`0f2b93c`)**, which earns the Completed row above:
**no migration, no new write path, no new lifecycle state, no product behaviour.** B5B was
1097/1097 and concurrency 129/129 before and after — identical, which is the evidence that
nothing server-side moved — with Jest rising 646 → 663 because tests were ADDED. The five items
below were **re-verified against merged `main` at `0f2b93c`**, file by file, and the text stands as
written.

1. **`obligationView`'s positional arguments — DISCHARGED.** Seven positional parameters ending
   in two adjacent, same-typed booleans became one `ObligationViewFacts` object; 56 call sites
   converted and no positional call site remains. Transposing `obligationUnderReview` and
   `canReportNoShow` now means writing different keys.
2. **The duplicated attention-chip mapping — DISCHARGED.** The label → tone decision is
   single-sourced as `attentionTone` / `ATTENTION_TONE`, keyed by an `AttentionLabel` union so a
   fourth state is a COMPILE error rather than a silent fallthrough; both `attention` fields are
   typed to that union. Each screen keeps its own palette, so no `lib/` module imports React
   Native styles. The six colour literals remain deliberately duplicated — there is no theme
   module and per-screen palettes are the repo convention — and the comments now say so rather
   than claiming an invariant two copies cannot enforce.
3. **`cancellationView`'s adjacent booleans — DISCHARGED.** Now one `CancellationViewFacts`
   object, and **both gates are REQUIRED**: `false` on either asserts the permissive fact and
   draws an irreversible control, so neither has a safe default. `cancellationState` still takes
   only the two acts.
4. **The duplicated reason composer — DISCHARGED.** Extracted to
   `components/ReasonComposer.tsx`, styles lifted verbatim, both call sites converted. Shared
   implementation, NOT shared meaning: a cancellation reason and a no-show reason remain
   different products. The PD-060/PD-062 disclosure-above-input rule is now asserted by a test
   rather than by two hand-authored copies.
5. **`underReview` naming two predicates — DISCHARGED, and this one went further than a rename.**
   The scope collision is split (`obligationUnderReview` per obligation,
   `TradeRowFacts.agreementUnderReview` for the display roll-up). More importantly the SEMANTIC
   divergence this item was actually written about is gone: the cancellation gate no longer reads
   the server's broader `under_review` (`report OR not_received`) but the report itself, so the
   client predicate and PD-063's `PT423` are now the SAME predicate. The coincidence that had
   kept them equal — `not_received` implies `delivered_at is not null`, so `anyDelivered` closed
   the exit anyway — is named in the code and pinned by a test, instead of holding by accident
   between two guards two migrations apart.

**THE ADJUDICATION GATE IS CLEARED.** Founder ruling, and the verdict of the Codebase re-audit of
the cleanup — both **supplied to this reconciliation**, which had no shell and no way to read
either, and neither is quoted here because neither was supplied as a quote. Adjudication may now
be built on this base. It must not reintroduce any of the five patterns:
no positional expansion of these view models, no second copy of the tone mapping, no optional
gate whose default grants a capability, no third hand-authored reason composer, and no reuse of
one name for two predicates.

**That was true when written; it is not true now.** The sentence here used to read *"Cleared is not
built. Adjudication and any operator decision path remain UNBUILT, as do terminal obligation
outcomes and terminal agreement outcomes."* **PR #68 built adjudication, the operator decision path
and the three terminal OBLIGATION outcomes**, and it built them without reintroducing any of the
five patterns above. **A terminal AGREEMENT outcome was NOT built and never will be** — PD-070 makes
that permanent. What remains unbuilt is the **operator SURFACE**, which is a pre-beta requirement
(PD-068) and not part of this gate. **Session 8 still has not started**, and the whole-app audit
round 2 comes before it.

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

- ~~**How a plain Needs Attention might later enter Under Review is UNRESOLVED and deliberately
  UNDECIDED.**~~ **CLOSED 2026-09-09 by PD-072**, in Correction 3 (`0781f49`, PR #74). The answer is
  a **deliverer-initiated, EXPLICIT act**: a provider who delivered and was never answered may ask
  The Book to review that obligation once the window has passed, and that request is the **third
  route into Under Review** (`20261039000000_barter_review_request.sql`, completed by
  `20261042000000`). **None of the four forbidden resolutions was used** — no second timer, no
  automatic escalation, no operator auto-escalation, and the participant act is a REQUEST, not an
  escalation. OQ-071 records the closure. **Asking is not being answered**: nothing processes these
  beyond queueing them, which Session 8's `operator_cases` intake now at least does.
  (`supabase/migrations/20261012000000_barter_no_show_under_review.sql:38-52` remains the record of
  the absence as it stood.)
- **A no-show conversation / in-thread notice is DEFERRED** (Founder ruling, 2026-09-07), to be
  decided with the later adjudication / review workflow. **That deferral now covers adjudication
  too, and Correction 3 and Session 8 did not lift it**: `public.pair_conversation_notice` is called
  only from `20261009000000`, `20261010000000` and `20261015000000` — all cancellation paths — and
  a sweep of all **97** migrations at `e5b9125` finds no fourth caller. So neither a no-show report,
  nor a review request, nor a terminal outcome writes anything into the pair's thread. Each is
  learned by opening the trade.

Still not built, and this list was **shortened by PR #68 and PR #70** rather than carried forward
unchanged. **Adjudication, the operator decision path and the three terminal OBLIGATION outcomes
are now BUILT** and have their own Completed row; **terminal AGREEMENT outcomes are permanently
ruled out** by PD-070 rather than pending (**PD-046** § 7.3–7.5, contract §§ 6–7 are satisfied at
the obligation level only). What genuinely remains: automatic fulfilment or completion; the
**operator SURFACE / minimal internal Review Queue**, which PD-068 makes a pre-beta requirement and
without which no obligation can be resolved in the running product;
**no push, device or email notification work** — which
is the half of **PD-059** that remains deliberately absent, and PR #58's cancellation notice is a
durable in-thread message, not a notification system; barter reviews and reputation;
the **Open to Trades** opt-in; the 3-post and 5-offers/day limits
as server rules; and the post-decline reverse-contact episode (**PD-048**). **Two items left this
list in Session 8 and are struck rather than quietly dropped:** ~~provider-eligibility gating of the
barter surface (PD-044's `is_approved` conjunct, whose seam is prepared but empty)~~ — **BUILT** as
the separate `caller_eligible_provider_id()` (PD-086, `20261048000000`), which gates the two INSERT
policies and nothing else; and ~~blocking and reporting (contract § 9)~~ — **BUILT** (PD-082,
PD-083). Barter completion, trade history, notifications and reputation are
recorded in the Slice 1 migration header as Session 6 scope.

**Two engineering obligations carried forward. Neither was discharged by PR #68 or PR #70, and
both still stand for whatever slice comes next:**

1. ~~**Consolidate the negotiation screen's write handlers first.**~~ **DISCHARGED** by the
   write-handler consolidation PR (PR #60).
   The requirement as supplied was: *"before the next Session 7 slice adds another
   negotiation-screen write action, the six write handlers in `app/community/negotiation/[id].tsx`
   must be consolidated into a shared behavior-preserving helper; no seventh hand-copied handler
   may be added."* The six — `onAccept`, `onOpen`, `onConfirm`, `runObligationWrite`,
   `onCancelTrade`, `onSend` — each repeated the same busy-guard → write → `barterWriteFailure` →
   alert → conditional reload shape and had already diverged. All six now route through
   `lib/negotiationWrite.ts` — re-read at `f5fd197`: still **six** handlers and **six** hand-copied
   `if (busy) return` guards, at `app/community/negotiation/[id].tsx:329`, `:343`, `:364`, `:395`,
   `:445` and `:471`, so **neither PR #68 nor PR #70 added a seventh** and the obligation is
   neither tripped nor discharged — **re-counted at `e5b9125`, where it is still 6 handlers and
   6 guards but every line number has moved; the current ones are in § Standing constraints and
   these are kept only as the record of the `f5fd197` reading** — which owns the
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

### WHOLE-APP AUDIT ROUND 2 — status UNESTABLISHED

The text below was written before Session 8 and said the audit came first. **Session 8 has since
merged, so either the audit ran or the plan changed, and this repository does not say which.**
Three correction slices did land in between — `6a3fb69` (unsupported beta claims removed),
`a125cd7` (Pre-Beta Correction 2, security and authorization) and `0781f49` / PR #74
(Pre-Session-8 Correction 3) — and each carries findings of exactly the kind an audit produces.
**That is a resemblance, not evidence**, and no document on `main` attributes any of the three to
the audit. **A human should record what actually happened**; a reconciliation may not infer it.

~~**This comes before Session 8 implementation begins.**~~ The Founder / PM had chosen to run a
second whole-app audit round as a **planning and quality gate** rather than a product session: it
produces findings and sequencing, **not code, not migrations and not decisions**. That was recorded
as supplied in an earlier reconciliation's invocation; **no scope, no duration and no output format
for it has ever been established in this repository.**

Two items were recorded as belonging to it and **neither is discharged**: the **barter feed card /
offer-responses surface-consistency** gap (§ Next → Session 7 above), and the
**`barter_agreements` identity-immutability** follow-up (§ "Recorded for Session 7 closeout /
cross-app audit" above).

### Session 8 — whole-app safety / trust / operator handling — **MERGED** (`e5b9125`, PR #76)

**Complete means what shipped, not what the session was named after.** What it delivered is in the
Completed row above and in [CURRENT_STATE.md](CURRENT_STATE.md) § Safety, trust and operator
handling; what it deliberately did not deliver is below. It addressed part of OQ-020 … OQ-026.
**Address disclosure for home-based and house-call services is untouched and remains the
highest-risk open surface in the product.**

The themes this section listed before the session ran, with what actually happened to each:

- **Block and report** (barter contract § 9) — **BUILT** (PD-082, PD-083).
- **Provider eligibility** — **BUILT**, and not the way the seam anticipated: PD-044's conjunct did
  not go into `caller_provider_id()`; a separate `caller_eligible_provider_id()` gates the two
  barter INSERT policies and nothing else, so a de-approved provider can still finish, cancel, read
  and clean up (PD-086).
- **Operator handling** — **BACKEND ONLY** (PD-085). Triage, response and restriction exist as RPCs
  nothing calls.
- **Active-agreement safety** — **partially, and as an exception rather than a feature**: the
  live-transaction carve-out in PD-082 is what stops a block stranding two people inside an
  obligation. Nothing else about a live trade turning unsafe was built.
- **Transaction safety** across booking and barter — **partially**; the block gates now reach the
  booking submit path and the conversation gates (`20261047000000`, `20261051000000`,
  `20261055000000`, `20261058000000`).
- **Trust / reliability consequences** — **NOT BUILT**, and still explicitly absent: PD-065 gives a
  terminal outcome no reputation effect, and nothing may change that by implementation.
- **Pre-beta placement of the minimal internal Review Queue** (PD-068) — **half-answered.** It
  landed inside Session 8 as a backend; the surface did not land at all.

### Session 8B — the operator surface — **MERGED** (`c4afee5`, 2026-09-10)

**The only thing that closes PD-068.** Named in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md):1011 as the session that must deliver an authorized
operator surface, and named again in PD-089 and OQ-074/OQ-075 as the session that is **not** their
home. PD-068's own minimum is unchanged and is the specification: on one surface an authorized
operator can view the agreement, view the obligation, view the historical participant facts already
recorded, choose exactly one terminal outcome, enter the required internal rationale, and submit
**through the already-secured path** — adding no new privileged path, no new grant and no
participant-reachable adjudication.

**NOT STARTED.** A local branch `feat/session-8b-operator-surface` exists and its ref reads
`e5b9125` — **`main`'s tip, with zero commits on it** — so it is a name, not work in flight. This
document does not move an item to *in progress* on a branch that contains nothing.

Two constraints it inherits rather than negotiates: **`adjudicate_barter_obligation` is the only
SUPPORTED writer of its table** — a direct privileged INSERT takes its FK key-share locks in the
reverse order of `cancel_barter_agreement` and can deadlock against it, so an operator tool must
call the RPC (§ Standing constraints); and if it adds a write action to the negotiation screen, the
**`busy`/re-entrancy guard must be centralized first** (§ Standing constraints, § Next → Session 7
item 1).

### Engineering task — a MECHANICAL check for stale ledger rows — **NOT STARTED**

**Recorded 2026-09-10. Bounded investigation, not a documentation framework.**

**The problem, stated as evidence rather than as a worry.** Three stale rows were found in the
supersession table of [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) within two days:

| Object | Ledger said | Actually was | What a copy-forward would have deleted |
|---|---|---|---|
| `public.my_barter_obligations` | `20261027000000` | `20261039000000` | PD-072's third route into Under Review |
| `public.adjudicate_barter_obligation` | `20261023000000` | `20261039000000` | the same route, in the only writer of a terminal outcome |
| `public.enforce_no_change_after_agreement` | `20260928000000` | `20260930000000` | the fail-closed proposal-id branch **and** `PT409` |

The first two were found by a person reading carefully at the moment they were about to rewrite
those bodies. **The third was found mechanically**, by a throwaway script, and nobody had been
looking for it.

**Why this is worth a task rather than more care.** That table is the repository's only defence
against `create or replace function` silently deleting a rule, and it has already failed with real
cost at least twice in this repo's history (`20261041000000`'s header, `20261042000000`'s header).
Its correctness currently depends on every author remembering to update a row in a 1750-line
document. **Three misses in two days is the measurement**, and the conclusion it supports is that
discipline is not the right mechanism for this.

**The check that found the third one, in full**, so this does not have to be re-derived: for every
`create [or replace] function|view public.<name>` across `supabase/migrations/*.sql`, take the
newest defining filename; find the ledger rows naming that object; and flag the object when no row
mentions that file's timestamp. It ran in under a second over 118 objects and reported two
candidates, one of which was a genuine defect. It needs no database.

**What to decide when this is picked up** — none of it is decided here:
- Whether it belongs in **CI** (a check that fails a PR) or in **B5B** (an assertion beside the
  other schema pins). CI is the better fit: this is a repository-consistency property, not a
  database one, and it needs no connection.
- How to handle the ~73 defined objects **not tracked in the table at all**. Most are deliberately
  untracked because they were defined once and never redefined; a check that demanded a row for
  every object would be noise. A defensible rule: **an object defined more than once MUST have a
  row**, since redefinition is precisely the hazard.
- Whether to also verify against the LIVE database (`pg_get_functiondef`) rather than the migration
  chain. Stronger, but needs a connection and would make the check unavailable to a contributor
  without one.
- Whether the same idea should cover **trigger firing order**, which failed the same way in Session
  8: `20261055000000` asserted in a comment that its triggers sorted last, and they sorted first.

**Explicitly out of scope:** rewriting the ledger's format, generating it from the schema, or
building any general documentation-verification framework. The task is one check, for one property,
that has now been wrong three times.

### Session 8C — safety hardening / enforcement cleanup — **MERGED** (`0b1f563`, 2026-09-10)

**Founder assignment, 2026-09-10.** PD-088 and PD-089 were locked on the finished Session 8 branch
with no session to land in; this is the one. The Steward that reconciled this document correctly
recorded them as having **no home assigned** and correctly declined to invent one — assigning a
session is planning, not bookkeeping. The Founder has now assigned it.

Planned scope, and nothing beyond it unless a real blocker is found:

- **Implement PD-088** — bounded report intake: one open case per reporter/target pair with later
  reports APPENDED to it, 5/hour and 20/day per reporter as a backstop, and **no standing
  requirement** (a bystander must be able to report what they saw). **Blocks broad beta.**
- **Implement PD-089** — a blocked person disappears from ordinary discovery, content and
  community surfaces, while the narrow access required for existing booking or barter history,
  logistics, cancellation, completion or review is preserved.
- **Verify the two compose with the existing live-transaction exceptions** rather than assuming
  they do. Hiding is a different mechanism from refusing: PD-089 must not hide a counterparty a
  pair is mid-obligation with, or it recreates the stranding that PD-082's exception exists to
  prevent.
- **Regression, security and concurrency tests** for both.

Two constraints carried forward from the decisions themselves. PD-089 makes discovery results
**viewer-dependent for the first time**, which interacts with **PD-073**'s content-neutrality rule
for the beta lanes. And it must **not** be implemented with a client-callable block predicate —
`20261055000000` established that as an oracle, and a discovery filter is exactly the shape that
would tempt someone to re-grant one.

### Physical-device / UX QA list — **OUTSTANDING, NOT OBSERVED**

Standing list. Nothing here has been run on a device; **no automated result may be read as having
observed any of it**, and none of it has been.

| Item | Why it is on this list | Status |
|---|---|---|
| `components/ReportSheet.tsx` on the smallest supported device, **with the keyboard open**, using the 9-reason provider taxonomy | The component exists because Android's `Alert.alert` silently drops buttons past the third — it once showed 3 of 9 reasons and **no Cancel**. It then nearly reproduced that by a different mechanism: React Native's Yoga defaults `flexShrink` to **0**, so a non-shrinking list pushed the notes field and the Submit button past the sheet's 85% cap, where a `View` clips them. Fixed and guarded by an arithmetic height-budget test plus a `flexShrink: 1` pin — **but jsdom does not run Yoga**, so nothing has measured a rendered layout. The failure mode is a report picker whose Submit control does not exist, which looks identical to the bug the component was built to fix. | **Outstanding.** Removed as a merge gate for PR #76 by Founder ruling, 2026-09-09, and moved here. |
| The operator queue and case detail on a small device | Session 8B's screens have unit and B5B coverage and no device pass. The case-detail screen renders a variable-length facts blob and a history list inside one scroll view. | **Outstanding**, never gated. |

**Why this is a list rather than a sentence.** An automated suite can prove a control EXISTS in the
tree; only a device can prove a person can REACH it. Those are different claims, and this repository
has already shipped one control that existed and could not be reached.

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
  are recreated in full. **Enumerate the implicit locks too:** an INSERT,
  or an UPDATE writing a foreign-key column, takes `for key share` on the parent row.
  **PR #68 and PR #70 moved six more, and three of the entries above with them.** Current live
  definitions, per the ledger's table: `public.adjudicate_barter_obligation` and
  `public.enforce_barter_adjudication_consistent` in `20261023000000_adjudication_hardening.sql`,
  **not** the `20261019000000` that created them — `20261023000000` added the in-RPC
  adjudicator-may-not-be-a-participant check that five documents already claimed existed, and
  narrowed a privileged predicate that admitted a no-`sub` `anon` request;
  `public.enforce_barter_adjudication_append_only` in
  `20261026000000_append_only_honest_privileged_predicate.sql`, **not** the `20261024000000` it
  supersedes — copying `20261024000000` forward reintroduces exactly the loose predicate
  `20261023000000` had already diagnosed as unsound, and the `prosrc` pin in
  `adjudication.test.sql` fails on it; `public.mark_barter_obligation_delivered`,
  `public.record_barter_obligation_receipt` and `public.report_barter_obligation_no_show` all in
  `20261022000000_obligation_resolved_sqlstate.sql` — **and two `PT412` raises remain in the
  no-show body and are correct, so do not sweep them**; **both read models in
  `20261027000000_suppression_computed_once.sql`**, which DROPPED and recreated them, so
  `public.my_barter_obligations` and `public.my_trade_activity` no longer live in `20261016000000`
  / `20261013000000` — and `security_invoker = true` on both is now pinned by B5B, because
  recreating either without it is a silent, total RLS read bypass; and
  `public.enforce_barter_offer_write` in `20261028000000_deprecate_barter_offering_value.sql`,
  where copying an older body forward silently restores a field The Book has ruled it will not
  collect (PD-069). **`adjudicate_barter_obligation` is also the only SUPPORTED writer of its
  table**: a direct privileged INSERT takes its FK key-share locks in constraint-declaration
  order, obligation-then-agreement, the reverse of `cancel_barter_agreement`, and can deadlock
  against it. A future operator tool must call the RPC.
- **The ledger's redefinition table is authoritative — and this reconciliation found ONE ROW OF IT
  STALE, which is exactly the failure mode the table exists to prevent.**
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) still names
  `20261027000000_suppression_computed_once.sql` as the current definition of **both** read models.
  That is correct for `public.my_trade_activity` and **wrong for `public.my_barter_obligations`**,
  whose live definition has been
  `20261039000000_barter_review_request.sql:317-362` since Correction 3 added the review-request
  disjunct to its `under_review` expression. Established here by sweeping every
  `create … view public.my_barter_obligations` in `supabase/migrations/`, not by reading the table.
  **Before recreating that view, read the file, not the row** — copying `20261027000000`'s body
  forward silently deletes PD-072's third route into Under Review. The ledger is not a Steward file;
  **correcting the row is someone else's change**, and this line is the notice, not the fix.
- **No seventh hand-copied write handler, and no seventh hand-copied `busy` guard, on the
  negotiation screen.** The consolidation this required is **done** — all six writes route through
  `lib/negotiationWrite.ts`. One thing remains before the next write action: **`runBarterWrite`
  sets `busy` but does not check it**, so the re-entrancy guard is still hand-copied at 6/6 call
  sites. Founder ruling, 2026-09-06 (PR #60): that was deliberately left alone in PR #60, and
  **before any next change adds a seventh negotiation-screen write handler, the
  busy/re-entrancy guard is to be centralized rather than copied again.** The `onOpen`/`onSend`
  re-read difference is **settled** — approved as it stands, not to be normalized. See § Next →
  Session 7 item 1.
  **PR #64 did not trip this constraint, and that is worth recording rather than assuming.** Its
  new no-show write is a **fourth `op` on the existing `runObligationWrite`**, not a seventh
  handler, so it reuses that handler's single `if (busy) return` and copies no new guard.
  **PR #66, PR #68 and PR #70 did not trip it either, and none discharged it.** PR #68 added
  **no** client write at all (its adjudication path is `service_role`-only and unreachable from the
  app), and PR #70 **removed** a form field rather than adding a write.
  **RE-COUNTED ON THIS TREE AT `e5b9125`, and the line numbers have moved — do not cite the old
  ones.** Still **six** handlers — `onAccept` (`:330`), `onOpen` (`:344`), `onConfirm` (`:365`),
  `runObligationWrite` (`:393`), `onCancelTrade` (`:458`) and `onSend` (`:484`) — and the guard is
  still hand-copied at **6/6** call sites, at `app/community/negotiation/[id].tsx:331`, `:345`,
  `:366`, `:402`, `:459` and `:485` (four written `if (!row || busy) return`, two `if (busy)
  return`; the variation is itself the argument for centralizing it). **Correction 3 did not trip
  it either:** PD-072's `requestObligationReview` is a **fifth `op` on the existing
  `runObligationWrite`** (`:422`), reusing that handler's single guard, exactly as PR #64's no-show
  write was a fourth. `lib/negotiationWrite.ts` still exposes `setBusy` and no `busy` check
  (`:48`), so the obligation stands unchanged for the next handler — **including Session 8B**, if
  the operator surface ever adds a write action to this screen.
- Agents 1–3 stay read-only; the Steward's writes stay inside its five-file allowlist.
- No session marks its own work complete — evidence on `main` does.
