# Current State — what is true on `main` today

**Status:** Authoritative (current-state). Maintained by the Project State Steward.
**Reconciled against:** `main` @ `5b1a7a9` (2026-09-06) — squash-merge of PR #58, confirmed with
`git rev-parse` against `origin/main`
**Last edited by:** PR #60 (previous edit: PR #59)

> **`Reconciled against:` is not the tip of `main`.** It is the last commit at which the
> repository facts asserted in this document were verified. A documentation-only merge that
> changes no repository, product, runtime or security fact does **not** advance it — so this
> anchor may legitimately sit behind `main`. `Last edited by:` records the documentation
> mutation separately, as a PR number, because a PR number exists before merge and a merge
> SHA does not: a document can never truthfully cite the commit that lands it.

This answers one question: *what is actually true about The Book today?* It is written for
someone joining cold — a new PM or engineer should be able to read this and orient without
reading old chat logs.

Where another document is authoritative, this one **links rather than restates**. A copied
rules section becomes a second source of truth and drifts.

---

## Product

The Book is a **two-sided marketplace for independent service providers and clients**.
A single account can participate as **both** — the same person may book a barber on Tuesday
and take clients as a photographer on Wednesday. **Houston-first.**

The core marketplace loop:

> Discover → Profile → Trust → Book → Pay → Message → Complete → Review → Rebook

**Payments are not live.** This is deliberate: the beta exists to prove the marketplace and
community loop *before* payments (PD-042). See
[HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md).

Product-surface truth — what is REAL vs PARTIAL vs PLACEHOLDER vs DEFERRED vs UNDECIDED —
is authoritative in **[BETA_SCOPE.md](BETA_SCOPE.md)**. Canonical journeys and their
expected end states are authoritative in **[USER_JOURNEYS.md](USER_JOURNEYS.md)**.

---

## Navigation

Authoritative: **[docs/architecture/NAVIGATION.md](../architecture/NAVIGATION.md)**.

Five shared tabs: **Discover · Reels · Bookings · Messages · Me** (`app/(tabs)/`).

There is **no client/provider mode architecture** — no global `currentMode`. Role follows
the domain relationship and capability, not a UI toggle (PD-010). Provider tools live under
**Business** (`app/(tabs)/business/`), not as a parallel tab set (PD-012).

---

## Messaging — pre-booking message requests

Authoritative: **[BETA_SCOPE.md](BETA_SCOPE.md)** § Messaging — it owns the full rules,
including beta specifics this summary does not repeat (a declined request is soft-closed
with non-punitive copy, and the client may send another request later; no cooldown in beta).

Merged and enforced **server-side**, not just in the UI:

- A client may send **one initial message** to a provider they have no booking with.
- The provider **Accepts** or **Declines**.
- While `pending`, further client messages are **blocked**; the provider cannot message until they accept.
- `accepted` opens a normal unified thread for both sides.
- A **booking supersedes** a pending/declined request and reuses the same conversation.
- **Duplicate simultaneous pending** requests for the same pair are prevented by a unique index.
- **One conversation per client/provider pair.**
- `messages.created_at` is **server-stamped**, because it is the pending-cycle boundary — a client cannot back-date to defeat the one-message rule.

Evidence: `supabase/migrations/20260901000000_prebooking_message_requests.sql`,
`20260901010000_prebooking_message_concurrency.sql` (adds a row lock closing a
read-then-insert race on the one-message rule). Regression coverage:
`supabase/tests/messaging.test.sql`.

---

## Reviews — Phase 0 and Phase 1 complete

Full rules are authoritative in **[REVIEWS_MODEL.md](REVIEWS_MODEL.md)**; the locked
decisions behind them are PD-020 … PD-028 in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md). This section deliberately does **not**
restate them — a third hand-maintained copy would drift, and the qualifiers matter.

Orientation: reviews come only from completed Book bookings, run in **both directions**,
are **1–5 stars with optional text** (a star-only review is valid), have a **7-day
submission window** from the server-authoritative `completed_at`, and stay **blind** until
both sides submit or that window closes. Repeat bookings are independently reviewable;
`under_review` blocks submission and holds reveal; a `no_show` produces no service-quality
review. Structured signals are **Phase 2 — not started**.

> **Read the qualifiers in the source before building on them.** For example, `completed →
> no_show` is rejected *for authenticated writers going forward* — it is a `BEFORE` trigger
> on new writes, `service_role` bypasses it, and pre-existing rows are not remediated.
> `REVIEWS_MODEL.md` states this precisely; a flattened "it can never happen" reading is
> what would justify adding a live-status test to `review_eligible()` and reintroducing the
> suppression vector SEC-DATA-101 closed.

Eligibility is decided by the **server**, not by UI status: `review_opportunity(booking_id,
direction)` and its batch form `review_opportunities(booking_ids[], direction)`. Presentation
grouping (which tab a booking sits in) never decides reviewability.

Migrations: `20260902000000` (Phase 0 foundation), `20260903000000` (opportunity RPC),
`20260904000000` (completed→no_show guard), `20260905000000` (batch RPC).

---

## Foundation & security

**B5B — permanent executable DB/security regression harness.**

- Asserts real Postgres enforcement — RLS, triggers, grants and `SECURITY DEFINER` behaviour, exercised as the `authenticated` role. The **count changes whenever a suite grows**, so read it from the latest CI run rather than from any document; at run 33726878929 (`e7ccd87`) it was 88/88.
- **Non-production only.** A production-ref guard refuses the production project, the Transaction pooler (port 6543), an `sslmode` that would disable TLS, and any target whose ref cannot be positively identified.
- One transaction, **always rolled back** — zero residue follows from that rollback, not from a per-run emptiness check (the harness performs none; see its README).
- **CI is wired to execute it** via the `db-security` job, which expects the `TEST_SUPABASE_DB_URL` secret. On `push` to `main` a missing secret **fails** the job rather than skipping — a green-and-empty required check proves nothing. On pull requests (including forks, which GitHub withholds secrets from) a missing secret **warns and skips**. Whether the secret is configured *right now* is GitHub state, not repository state — read it from the latest `db-security` run, not from this document.
- The **Session pooler / psql path is verified on `main`**: run 33726878929 on `e7ccd87` logged `via TEST_SUPABASE_DB_URL` and `88/88 passed, 0 failed`.

Docs: **[supabase/tests/README.md](../../supabase/tests/README.md)**.

**Migration ledger.** The repository holds **49 migration files** — counted from
`supabase/migrations/*.sql`, newest `20261010000000_cancellation_notice_neutral_copy.sql` — and
that part is repository-provable. Ten files, `20260917000000` … `20260926000000`, are Slice 3a
(PR #49); four files, `20260927000000` … `20260930000000`, are Agreement Finalization (PR #50);
two files, `20261001000000` … `20261002000000`, are Proposal Timing Extension (PR #52);
`20261003000000` is the Barter Obligations Foundation (PR #54); `20261004000000` is
Obligation Delivery and Receiver Confirmation (PR #56); and **six files,
`20261005000000` … `20261010000000`, are Pre-Delivery Cancellation (PR #58)**.
The ledger's § Prevention records why these features landed as forward correction chains:
after a migration is applied to non-production, fixes go into a new migration rather than an
edited historical file. Process and the dated record:
**[docs/operations/MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)**.

> **Read the ledger before redefining `public.cancel_barter_agreement`.** It was replaced **five
> times** inside PR #58 — `20261005000000`, `20261006000000`, `20261007000000`, `20261008000000`,
> `20261009000000` — and its **current live definition is
> `20261010000000_cancellation_notice_neutral_copy.sql`**. An author who redefines it from any
> earlier file would silently delete the in-thread signal and restore the "Both providers agreed
> to cancel" wording that `20261010000000` was written to remove. This is not hypothetical:
> `20261008000000` exists precisely because `20261007000000`'s body was written from a
> **superseded** definition of `release_barter_interest` and dropped four of its properties,
> including the isolation that stops a notice failure from vetoing the cancellation. The ledger's
> § "Functions redefined across migrations" now carries rows for `cancel_barter_agreement`,
> the new one-writer helper `public.pair_conversation_notice`, and the two obligation RPCs
> `20261005000000` redefined.

**Applied where.** All six migrations were applied to the **linked non-production project only**
(`wcoyjeklscuqsumpjpfo`), confirmed with `supabase migration list`: local and remote match
through `20261010000000`, with no orphan in either direction. **Production was never touched and
was never queried**, and remains out of scope. Every harness that reaches a database refuses the
production ref outright (`scripts/prodRef.mjs`).

**Latest recorded runs.** Rather than restate counts that change with ordinary PRs, this
records *which runs* to look at. Two different things are recorded, and they are not
interchangeable:

- **The latest `main` CI run recorded here** is **34007334683** on `46c0bef` — `check` and
  `db-security` both green, confirmed with `gh run view` after PR #56 merged. The `check` job ran
  typecheck, lint and unit tests; the `db-security` job ran the non-production B5B harness.
  The latest run is **34019463222** on `5b1a7a9` — `check` and `db-security` both green,
  confirmed with `gh run view` after PR #58 merged. Read the current status from the latest
  `db-security` run rather than from this document.
- **The last recorded local B5B execution** is still the post-apply run logged against
  `20261004000000` in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) (2026-09-05): **730/730 passed,
  0 failed**, zero residue, with the **non-B5B concurrency proof**,
  `scripts/negotiation-concurrency.mjs`, at **67/67**.   For PR #58 the post-apply figures are recorded against `20261010000000` in the ledger:
  **B5B 872/872**, **concurrency 102/102**, both with zero residue. The coverage itself is
  repository-provable:
  `supabase/tests/cancellation.test.sql` exists and is registered in the B5B runner
  (`scripts/db-security-test.mjs:51`), `scripts/negotiation-concurrency.mjs` carries
  cancellation cases, and `__tests__/lib/tradeCancellation.test.ts` covers the pure client rules.
  **That the files exist does not establish that they pass**; this document does not run tests.

The suite grew enormously across these slices — 88 → 730 assertions as the barter work landed —
which is exactly why the count is read from a run rather than from this document. The
authoritative description of the harness lives in
[supabase/tests/README.md](../../supabase/tests/README.md).

**Why this document's anchor is now `5b1a7a9`.** The previous anchor was `46c0bef` (PR #56).
PR #58 changed facts *this document* asserts: the migration chain went from 43 files to 49, a
ninth barter table appeared, an official agreement gained an ordinary pre-delivery exit, and the
Trade Activity grouping was renamed. Those are facts asserted above, so the anchor moves to
PR #58's squash-merge commit, `5b1a7a9`. The SHA, the PR number and the merge were confirmed with
`git` and `gh` against `origin/main` before this document was written.

[ROADMAP.md](ROADMAP.md) remains authoritative for **which** merge delivered **which**
capability — it carries a Completed row per delivered capability, each citing its merge,
under its own anchor. This document deliberately does not restate that; a second copy would
drift. An anchor is per-document: it moves when that document's own asserted facts move, not
whenever `main` does, which is why this file and `ROADMAP.md` can carry different anchors.

**The Session 4 audit still has no artifact in this repository; Session 5's now does.** The
Slice 1 migration header cites a "Session 4 audit + Session 5 agent review"
(`20260906000000_barter_integrity_slice1.sql:9`) and a plan clause "E-3" (line 36), and the
defect IDs it closes (`SEC-AUTHZ-001`, `SEC-DATA-009`, …) appear nowhere else on `main`. The
**Session 5 output is now committed**: its approved barter clauses are
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md), and the rulings behind them are PD-043 …
PD-048 (PD-044 records E-3 explicitly). The **Session 4 read-only audit is still not
committed**, so the only in-repo record of it is the migration comment citing it — which means
a cold reader cannot reconstruct why each defect was ranked as it was. That is recorded as a
fact about the repository, not as a criticism of the work.

---

## Barter — the provider-to-provider trade surface

**Barter is not a blank slate.** [BETA_SCOPE.md](BETA_SCOPE.md) classifies the community /
barter surface as **REAL (beta)** (line 57) — offers, interests and the community screens work.
What was undecided when that classification was written was the barter **product model**: how a
trade binds to bookings, messaging, reviews and completion. For the first Houston closed beta
that model is now locked in **[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md)**, which is
authoritative for it; the decisions behind it are **PD-030 … PD-059** in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md). Neither is restated here.

This section records **what is built on `main`** and **what is not**.

### What is built

Verified against the migration chain in the working tree — **49 migrations**, newest
`supabase/migrations/20261010000000_cancellation_notice_neutral_copy.sql`.

| Capability | What is actually enforced | Where |
|---|---|---|
| Data model | **Nine barter tables.** `barter_offers` and `barter_interests` (the post and its responses), Slice 3a's `barter_proposals`, `barter_proposal_versions`, `barter_proposal_terms` and `barter_version_acceptances` (the negotiated terms), PR #50's `barter_agreements` for the finalized trade, PR #54's `barter_obligations` — which PR #56 extended **in place** with a three-column delivery / receipt lifecycle rather than by adding a table — and PR #58's `barter_agreement_cancellations`. **No no-show, adjudication, Needs Attention, Under Review, terminal-obligation-outcome or terminal-agreement-outcome table or column exists.** | Origin: `20260829000000_canonical_live_baseline.sql`; proposal tables in `20260917000000_barter_proposal_versions.sql` §§ 1–4, narrowed by `20260925000000_negotiation_directed_terms.sql` § 1; agreement table in `20260927000000_barter_agreement_finalization.sql`; obligation table in `20261003000000_barter_obligations_foundation.sql`; lifecycle columns in `20261004000000_barter_obligation_delivery.sql`; cancellation table in `20261005000000_barter_pre_delivery_cancellation.sql:35-50` |
| Response vocabulary | `pending → accepted \| declined \| released`, with `released_at`, `released_by` and `release_reason` required together and null together. | `20260909000000_barter_interest_release.sql` (status + completeness check constraints) |
| Write identity | `caller_provider_id()` derives the provider from `auth.uid()`; nothing client-supplied enters the comparison. Foreign-field writes are governed by an **allow-list** trigger, `created_at` is server-stamped, delete guards preserve counterparty history (PD-043), and `anon` holds nothing on either table. | `20260906000000_barter_integrity_slice1.sql` §§ 1–7, 10 |
| Interest rate limit | 15 new interests per provider per rolling 24h, counted from `rate_limit_log` so delete-and-resend cannot reset the window (PD-045). | `20260906000000` § 9 (`enforce_barter_interest_rate_limit`) |
| One negotiation per post | At most one `accepted` response per offer, enforced by a partial unique index and by the accept RPC locking the **offer** row (PD-049). | `20260906000000` § 7; `20260907000000_barter_accept_handoff.sql` |
| Accept | **One atomic RPC**, `accept_barter_interest`: it accepts the response, opens or reuses the pair's conversation and posts the handoff message in a single transaction. Body redefined once, to route the composed message through the sanitiser. | `20260907000000`; redefined by `20260915000000_barter_closed_post_terminal.sql` § 3 |
| Conversation identity | One canonical conversation per provider pair, enforced in the database rather than by client convention. | `20260908000000_canonical_provider_pair.sql` |
| Ending a dead negotiation | `release_barter_interest` moves `accepted → released` and **derives the reason from the caller** (`responder_withdrew` / `owner_ended_negotiation`), so neither party can characterise the other's exit. The counterparty is told by a **server-authored** notice, and message authorship is pinned at the write boundary. | `20260909000000`; `20260910000000_barter_release_signal.sql`; `20260911000000_message_authorship_pin.sql` |
| Durable access | The `my_trade_activity` view (`security_invoker`, `select` to `authenticated` only, revoked from `anon`) backs the route `/community/trade-activity`, so an accepted negotiation stays reachable after its post closes or ages out of the newest-50 discovery feed. | `20260912000000_trade_activity.sql`, hardened by `20260913000000` and `20260914000000` |
| Closed post is terminal | `is_active` is **one-way** for authenticated writers (`enforce_barter_offer_active_one_way`, trigger `barter_offers_zy_active_one_way`), and a closed post's pending responses can be **neither accepted nor declined** (`enforce_barter_answer_open_offer`, trigger `barter_interests_zy_answer_open_offer`). Both raise SQLSTATE `55000`; both exempt `service_role` and the null-`auth.uid()` (no-JWT) path. `released` stays permitted, because a negotiation outlives its post. PD-051, PD-052. | `20260915000000` §§ 1–2, bodies refreshed by `20260916000000` |
| Proposal | **One proposal per accepted interest** (`barter_proposals.interest_id` is `unique`), and it may be opened **only** on an interest whose status is `accepted` — pending, declined and released are refused (SQLSTATE `55000`). No cold proposals. The proposal row is the negotiation's durable identity; it has no `status` column of its own — liveness is read from `barter_interests.status`, so `release_barter_interest` remains the one way to end a negotiation (PD-049, PD-053). | `20260917000000` § 1; current `create_barter_proposal` signature is from `20261001000000_proposal_term_timing.sql` |
| Versioned terms | Every proposal or counter is a **new immutable version** (`barter_proposal_versions`, unique `(proposal_id, version_no)`). Versions, terms and acceptances are **append-only by trigger** (`enforce_barter_negotiation_append_only`); the only mutable field on a proposal is `current_version_no`, which may only advance (`enforce_barter_proposal_immutable`). Each version carries a `post_snapshot` of the public post as it stood when authored — historical context, never authority for the terms (PD-047). Terms now include a required `due_at` and optional `scheduled_at` for each directed side. Timing belongs to the immutable proposal version, so changing timing requires a **new version**. Counters are capped at **20 versions per participant, per negotiation, per rolling 24 h** (SQLSTATE `54000`); the cap is not applied to the opening proposal, which is bounded by the one-per-interest constraint instead. | `20260917000000` §§ 2, 5, 7; `20260920000000_negotiation_budget_code.sql`; `20261001000000_proposal_term_timing.sql` |
| Exactly two directed terms | A version holds **exactly two terms, one per fixed side** — `offer_owner` and `responder` — enforced by a unique index on `(version_id, provided_by)` plus a statement-level guard (`enforce_barter_terms_written_once`) that refuses any count other than two, a missing side, or a second write to a version. **Participant identity is server-derived**: the client submits only the two descriptions and timing fields; `write_barter_proposal_terms(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)` derives each side's `provider_id` / `provider_user_id` from the accepted interest, and the guard asserts they match the offer and interest rows. **No value field** — `estimated_value` was dropped. Terms can be written only from inside a negotiation RPC (a transaction-local marker checked by `enforce_barter_terms_write`), and the helper's EXECUTE is revoked from `authenticated`. PD-053, PD-056. | `20260925000000` §§ 1–3; `20260921000000_negotiation_write_boundary.sql`; `20260924000000_negotiation_written_once.sql`; `20261001000000_proposal_term_timing.sql` |
| Timing validity | For both directed terms, `due_at` must be future-valid and `scheduled_at` must be either null or future-valid when the version is authored, when a participant accepts that version, and when the official agreement is finalized. Expired timing raises SQLSTATE `PT410` and does not mutate or extend the historical version; participants must send a new proposal version with updated timing. | Author-time validation in `20261001000000`; acceptance/finalization-time guards in `20261002000000_proposal_timing_expiry_guards.sql`; client stale handling in `lib/barterErrors.ts` and `lib/negotiationState.ts` |
| Version acceptance | `accept_barter_version(uuid)` records **one acceptance per participant per version** (`unique (version_id, participant_user_id)`, so a repeat is idempotent). It refuses a non-participant (`42501`), a dead negotiation (`55000`), a version that is no longer current (`40001`, "these terms have been replaced"), and a current version whose timing has expired (`PT410`). Advancing to a new version does **not** delete earlier acceptances; they stop counting. **Authoring is not acceptance; countering is not acceptance** (PD-053, PD-056). | `20260917000000` §§ 4, 10; `20260919000000_negotiation_stale_terms_code.sql`; current body is `20260921000000`'s per the ledger's redefinition table; expiry trigger in `20261002000000` |
| Both accepted — ready to confirm | `my_barter_proposals.both_accepted` is **derived** in the view from acceptance rows on the *current* version and stored nowhere. It is a readiness fact. `finalize_barter_agreement(uuid)` turns that fact into one immutable `barter_agreements` row, makes the accepted version authoritative, and closes the sourcing post permanently, but only if the accepted version's timing is still future-valid. PD-054, PD-056. | `20260917000000` § 11; `20260927000000_barter_agreement_finalization.sql`; SQLSTATE correction in `20260930000000_confirmed_trade_sqlstate.sql`; expiry trigger in `20261002000000` |
| Obligations foundation | Every official agreement now gets **exactly two directed obligations**, one for each accepted proposal term: `offer_owner` means the offer owner delivers to the responder, and `responder` means the responder delivers to the offer owner. Obligations are derived server-side from the agreement's `accepted_version_id` and the two authoritative proposal terms. The client does **not** supply deliverer, receiver, side, source term, description, `due_at` or `scheduled_at`. `agreed_description`, `due_at` and `scheduled_at` are immutable copies from the accepted version; both agreement participants can read both obligations. The delivery / receipt lifecycle those rows now carry is the next row; **cancellation, no-show, adjudication, terminal obligation outcome and terminal agreement outcome remain unbuilt**. | `20261003000000_barter_obligations_foundation.sql`; read surface in `lib/negotiation.ts` and `app/community/negotiation/[id].tsx`; B5B assertions in `supabase/tests/agreement.test.sql` |
| Delivery and receiver confirmation | Each obligation carries `status` (`pending` / `delivered` / `received` / `not_received`), `delivered_at` and `receipt_responded_at`, bound to each other by **four CHECK constraints**. The obligation's **deliverer** may mark **that** obligation delivered (`mark_barter_obligation_delivered`); `delivered_at` is **server-stamped, never client-supplied**, immutable once set, and a duplicate mark is a **safe no-op that does not re-stamp it**. Its **receiver** may then answer **exactly once** — `confirm_barter_obligation_received` or `report_barter_obligation_not_received` — both routing through the internal `record_barter_obligation_receipt`, which **no client role may execute**. An answer before delivery is refused (`55000`), the deliverer and non-participants are refused, and neither answer can flip to the other (`PT412`). `received` / `not_received` are **events / receiver statements, explicitly not final adjudicated fulfilment verdicts** (PD-058). | `20261004000000_barter_obligation_delivery.sql` — columns and constraints at lines 31–64, the two receiver wrappers at 365–401, `record_barter_obligation_receipt` and its revoke at 283–363 |
| Obligation immutability, narrowed | `enforce_barter_obligations_immutable` was redefined from a blanket refusal into a **transition-aware, deny-by-default** guard: the whole row **minus** the three lifecycle keys must be identical, a write needs a transaction-local marker carrying that obligation's own id, and only `pending → delivered` and `delivered → received \| not_received` are legal. Both stamps are write-once. `DELETE` stays absolute (PD-043). A new **BEFORE INSERT** trigger, `enforce_barter_obligation_starts_pending`, keeps every obligation entering the lifecycle at `pending` — with **no `service_role` bypass**, so a backfill cannot invent a delivery either. | `20261004000000` lines 87–160 (guard and trigger), 168–192 (starts-pending trigger) |
| Pre-delivery cancellation | **The ordinary exit from an official agreement now exists.** Either participant may cancel while **no obligation has been delivered**; the counterparty's permission is not required. One RPC, `cancel_barter_agreement(uuid, text)`, is the only writer — `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` on the table and there is no write policy. The **first valid act immediately stops ordinary performance**: `mark_barter_obligation_delivered` and `record_barter_obligation_receipt` both re-check for a cancellation **after** taking the obligation row lock and refuse with SQLSTATE `PT409`. Once **any** obligation has been delivered, cancellation is refused permanently (`object_not_in_prerequisite_state`) — and because the check reads `delivered_at`, a later "didn't receive" does **not** bring the exit back. **Idempotent per participant**: a repeat call returns the existing classification and re-stamps neither the time nor the reason. | `20261005000000_barter_pre_delivery_cancellation.sql:189-289` (RPC, lock order and grants), `:291-356` and `:358-435` (the two post-lock guards); refusal copy in `lib/barterErrors.ts:539-566` |
| Cancellation is two acts, never an inference | One row per participant per agreement (`unique (agreement_id, actor_user_id)`), and the classification is **derived from the row count and stored nowhere**: one act is `cancelled_by_participant`, two is `mutually_cancelled`. **"Mutually Cancelled" therefore requires two explicit participant acts** — it is never produced by silence, a timeout or inactivity, neither of which exists in the schema at all. The actor is bound to `auth.uid()` by trigger, so a privileged insert cannot fabricate the counterparty's assent, and `created_at` is server-stamped on every insert path rather than merely defaulted. | `20261005000000:35-47`, `:263-284`; actor-is-caller and server-stamp corrections in `20261006000000_barter_cancellation_hardening.sql:34-104`; client classification in `lib/tradeCancellation.ts:43-55` |
| Append-only; nothing is deleted | A cancellation cannot be edited or withdrawn (`enforce_barter_cancellation_append_only`, `before update or delete`), and the cancellation **destroys nothing**: the agreement, both obligations, every proposal version, its terms and the acceptances all survive unchanged and stay readable by both participants. PD-043 is untouched. | `20261005000000:78-105`, header `:31-33` |
| The optional reason is shared | Free text, **1–200 characters**, optional, immutable, and safe to repeat (a second call overwrites neither it nor the timestamp). It is **shared with the other provider** and surfaced to both in trade details as two per-viewer columns, `my_cancel_reason` / `their_cancel_reason`. It is **context, not a verdict** — not a reliability judgment, a no-show determination, adjudication or proof of fault, none of which exist — and it is deliberately **absent from the conversation notice**. The composer discloses the sharing **above** the input, before the writer commits. | `20261005000000:45-46` (bound), `20261007000000_barter_cancellation_signal.sql:159-237` (view columns and the column comment); client attribution in `lib/tradeCancellation.ts:245-261`, disclosure copy at `:196-208` |
| Cancellation notices in the pair thread | Cancelling writes a **durable, best-effort system message** (`sender_id is null`) into the pair's **existing canonical provider-pair conversation**, addressed to the participant who did **not** act. **These are not push, device or email notifications** — PD-059 is unchanged. First act: `The trade for "X" for "Y" was cancelled by one provider.` Second act, deliberately neutral: `Both providers cancelled the trade for "X" for "Y".` — because two acts prove each provider cancelled, **not** that either assented to the other's decision. **Exactly one notice per transition** (the idempotent branch returns before the insert), **no conversation is ever created**, and a notice failure **cannot veto the cancellation**: the insert is wrapped in its own `exception when others then null` handler. | `20261009000000_pair_conversation_notice.sql:35-111` (the one writer, revoked from every client role) and `:113-222`; live copy in `20261010000000_cancellation_notice_neutral_copy.sql:121-133`, rationale `:11-23`; the `"X" for "Y"` label is `barter_terms_label` (`20260914000000_trade_activity_corrections.sql:148-157`) |
| Cancelled trades stay visible | A cancelled trade remains in Trade Activity under the broader **"Trades"** grouping — **renamed from "Confirmed trades"**, because the group now holds a mixed set and a heading is read before the rows beneath it. The per-row note carries the state instead (`Trade cancelled…`), and the row offers **no** cancellation control: the act is taken on the negotiation screen, the one place that can check the delivery precondition. | `lib/tradeActivity.ts:111-124` (section copy and the rename rationale), `:192-205` (per-row note), `:217-228`; row facts in `app/community/trade-activity.tsx:160-168` |
| What cancellation does **not** mean | Cancellation is an **agreement-level** event. It decides nothing about whether either obligation was fulfilled, writes **no** obligation outcome, and implies **no** no-show, unfulfilled finding, dispute, adjudication or reliability verdict — none of which exist. B5B asserts the **absence** of the whole vocabulary rather than assuming it. | `20261005000000:25-29`; absence assertions in `supabase/tests/cancellation.test.sql:700-713`; client rule in `lib/tradeCancellation.ts:1-13` |

**The RLS policies on `barter_offers` and `barter_interests` are still the Slice 1 set.**
`barter_offers_provider_read` and `barter_interests_offer_owner_read` on reads;
`barter_offers_provider_insert`, `barter_offers_owner_update`, `barter_offers_owner_delete`,
`barter_interests_provider_insert`, `barter_interests_owner_update`,
`barter_interests_own_delete` on writes. No migration after `20260906000000` creates or drops a
policy on either table — every rule added since is a trigger or an RPC, which is why a
policy-level reading of this surface is incomplete on its own. The **four Slice 3a tables**
carry **participant-read policies only** (`*_participant_read`, `select` to `authenticated`) and
**no write policy at all**; at the grant layer `authenticated` holds `SELECT` and nothing else,
so every write goes through one of the three `SECURITY DEFINER` RPCs
(`20260917000000` § 6, with the `authenticated` revoke completed by
`20260918000000_negotiation_grant_tighten.sql`). `barter_obligations` follows the same
participant-read / no-write-policy posture, with ordinary creation handled by the
agreement insert trigger rather than by a client-executable RPC (`20261003000000`).
**PR #56 did not change that posture:** it added no write policy, `authenticated` still holds
no `INSERT`, `UPDATE` or `DELETE` on the table, and the two participant actions are
`SECURITY DEFINER` RPCs running as `postgres`
(`20261004000000_barter_obligation_delivery.sql:403-405`, grants at lines 269–271 and 380–401).
**PR #58's `barter_agreement_cancellations` was built to the same posture**: a
participant-read policy only, `revoke all … from public, anon, authenticated` followed by
`grant select` alone, and no write policy — so the single `SECURITY DEFINER` RPC is the only
writer (`20261005000000_barter_pre_delivery_cancellation.sql:538-560`).

**Client surfaces.** `lib/barter.ts` is the data layer; `lib/tradeActivity.ts` holds the
per-row capability and copy rules (`tradeRowState`) that **both** barter surfaces consume,
`lib/tradeCancellation.ts` holds the pure cancellation state, copy and reason rules
(`cancellationState`, `cancellationView`, `cancellationReasons`) with no I/O, and
`lib/barterErrors.ts` interprets the server's refusals. Screens: `app/community/index.tsx`
(feed), `barter-compose.tsx`, `barter-interests.tsx` (an offer's responses) and
`trade-activity.tsx`. Interest counts are shown to the **offer owner only**
(`app/community/index.tsx`, the `isOwner` branch), which is what
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 10 requires.

For the negotiation itself: `lib/negotiation.ts` is the data layer (reads come from
`my_barter_proposals`, the proposal tables and, after agreement finalization,
`barter_obligations`; every write is one of the three negotiation RPCs, the finalization RPC,
one of the three obligation RPCs — `lib/negotiation.ts:387-432`, each sending the obligation id
and nothing else — or the cancellation RPC, `lib/negotiation.ts:434-457`, which sends the
agreement id and an optional reason and cannot name the actor, the time or the outcome),
`lib/negotiationState.ts` holds the pure state and copy rules (`negotiationView`,
`validateDraft`, `draftPayload`), `lib/obligationState.ts` holds the per-obligation role, state
and copy rules (`obligationRole`, `obligationView`, `obligationTimeline`, plus `anyDelivered` —
the PD-046 precondition, kept out of JSX so it can be tested) with no I/O,
`lib/negotiationWrite.ts` owns the write-operation sequence every one of those writes shares —
busy on, write, busy off in a `finally`, interpret the refusal via `lib/barterErrors.ts`, say it
once, decide whether the screen is stale, re-read authoritative state — with the per-operation
differences declared as options at the call site rather than hand-spelled six times, and the
screen is `app/community/negotiation/[id].tsx`,
keyed on the **interest** id and reached from an active row in Trade Activity
(`app/community/trade-activity.tsx`, the `/community/negotiation/` push). The viewer's side is
server-derived — `my_role` on `my_barter_proposals`, or on `my_trade_activity` before any terms
exist; the route's `role` param is a last-resort label only.

**The confirmed-trade detail** on that screen shows **both** obligations with **Mark
delivered**, **Confirm received** and **Didn't receive** and both timestamps, each control
gated by the server-derived role and status (`app/community/negotiation/[id].tsx:510-576`,
`:697-711`). The **AGREEMENT reads "Trade confirmed" until it is cancelled, and gained no
terminal outcome** (`lib/negotiationState.ts:181-194`) — it stays that way for the whole life of
the trade while its obligations progress. On a cancelled trade the page headline becomes "Trade
cancelled", the terms card is retitled "The terms that were agreed", both obligation controls
are frozen and their what-happens-next notes are dropped, and the cancellation is said **once**,
above both obligations (`lib/negotiationState.ts:169-180`, `lib/obligationState.ts:147-165`,
`app/community/negotiation/[id].tsx:682-696`). `lib/barterErrors.ts` interprets the new
refusals, including `PT412` for an answer already recorded (`:142-145`) and `PT409` read as
"this trade was cancelled" for the three obligation operations (`:124-136`).

**Nothing sends the receiver a push, device or email notification.** PD-059 is unchanged: no
such path exists anywhere in the chain. What PR #58 added is narrower and only for
cancellation — a durable in-thread system message, written best-effort into the pair's existing
conversation (`20261009000000_pair_conversation_notice.sql`). **A delivery still produces no
signal of any kind**: `20261004000000_barter_obligation_delivery.sql` creates no notification
path and `lib/tradeActivity.ts` has no obligation awareness, so a delivery is visible **only** on
the negotiation screen, which refreshes on focus (`app/community/negotiation/[id].tsx:170-175`).
PD-059 records that as a known gap belonging to later Session 7 attention / timeout UX, not as an
oversight.

Regression coverage: `supabase/tests/barter.test.sql`, `supabase/tests/negotiation.test.sql`,
`supabase/tests/agreement.test.sql`, `supabase/tests/obligation.test.sql` and
`supabase/tests/cancellation.test.sql`, all registered in
the B5B runner at `scripts/db-security-test.mjs` (lines 47–51), plus
`__tests__/lib/tradeActivity.test.ts`, `__tests__/lib/negotiationState.test.ts`,
`__tests__/lib/obligationState.test.ts` and `__tests__/lib/tradeCancellation.test.ts` for the
pure client rules, `__tests__/lib/negotiationWrite.test.ts` for the shared write sequence, and
`__tests__/app/negotiationWriteHandlers.test.tsx` — the first suite here that RENDERS a screen —
which drives all six negotiation write controls and pins, per control, the RPC called, the exact
payload, the refusal copy, whether the screen re-reads and whether that re-read blocks. Those
tests distinguish
ready-to-confirm from confirmed, and pin that confirmed trade copy does not promise booking,
completion, fulfilment, delivery or a guarantee. B5B pins the derived obligation pair,
participant read, direct-write refusal, immutable content/timing and no-write grant posture,
and now also who may mark delivered, who may answer, the one-answer rule, the CHECK constraints
where no trigger stands in front of them, and the starts-pending insert guard.
`supabase/tests/cancellation.test.sql` pins the cancellation invariants and the posture of every
object PR #58 created or redefined, and asserts the continuing **absence** of any no-show,
timeout, review or terminal-outcome column and of any no-show, adjudication, completion or
timeout function (`:700-713`). Races a single-transaction harness cannot stage
are covered by `scripts/negotiation-concurrency.mjs`, a non-B5B script, which now carries
cancellation cases. **No recorded execution exists for the cancellation slice** — see
§ Foundation & security above for what is and is not established about test runs.

### What is not built

**[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 12 is the authoritative gap list** and is
not copied here. Two gaps matter most to anyone reading this document cold:

- **There is a delivery, receipt and cancellation record, but no fulfilment verdict.** PR #54
  added the immutable, server-derived `barter_obligations` pair; PR #56 added the two participant
  actions and the four-value `status` that records **what happened**; PR #58 added the ordinary
  pre-delivery exit. Everything that would turn those events into an **outcome** remains
  unbuilt, and is asserted absent rather than assumed: **no 7-day timeout transition, no
  automatic fulfilment, no automatic completion, no no-show, no Needs Attention, no Under
  Review, no adjudication, no terminal obligation outcome (Fulfilled / Unfulfilled / Closed
  Without Resolution), no terminal agreement outcome, no reviews-on-barter, no reputation and no
  push notifications.** PD-046 § 7.3–7.5 and § 7 of the contract still describe that work with no
  schema behind it; PD-057 records the **future** window anchor and that its expiry must never
  mean Fulfilled or Completed
  (`supabase/migrations/20261004000000_barter_obligation_delivery.sql:15-26`;
  `supabase/tests/cancellation.test.sql:700-713`). **Cancelling implies none of them**: it is an
  agreement-level act that decides nothing about fulfilment and carries no reliability verdict
  (`supabase/migrations/20261005000000_barter_pre_delivery_cancellation.sql:25-29`).
- **Offer creation is not server-limited.** The interest cap is server-authoritative; the
  offers-per-day cap is client-side only and its check fails open
  ([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 10, `lib/rateLimit.ts`).

Also unbuilt: the `is_approved` **eligibility conjunct** (PD-044 — `caller_provider_id()`
deliberately carries the seam without the condition, `20260906000000:145`), the **Open to
Trades** opt-in, and the post-decline reverse-contact episode (PD-048).

**Which merge delivered which capability is [ROADMAP.md](ROADMAP.md)'s record**, not this
document's — it carries a Completed row per delivered capability, each citing its evidence.

Open barter questions: **OQ-006** (collusion / reciprocal-rating gaming) and **OQ-007** (what in
the pre-existing implementation is salvageable) remain **Open**. OQ-001 … OQ-005 and OQ-008 are
closed, each citing the decision that closed it, in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md). A migration is an implementation, not an approval, and
none of the work above closes a question by itself.

---

## Agents

Four agents, defined in `.agents/` with thin Claude Code adapters in `.claude/agents/`:

| # | Agent | Access |
|---|---|---|
| 1 | QA / Journey Reviewer | read-only |
| 2 | Security Reviewer | read-only |
| 3 | Codebase Auditor | read-only |
| 4 | **Project State Steward** | read + writes limited to 5 PM docs |

---

## What is deliberately NOT built

Recorded so absence is not mistaken for oversight:

- **Payments** — PLACEHOLDER/FUTURE; after the beta (PD-042).
- **Reviews Phase 2** — structured signals, reliability/conduct reputation, no-show scoring.
- **Delayed-deliverable reviews** — `delivered_at`, category-specific windows.
- **Safety operations** — masked comms, check-in/out, escalation, evidence preservation.
- **Identity verification enforcement** — messaging is educational during beta (PD-004).

---

## What this document cannot tell you

Written from repository state at rest. It does **not** establish: runtime behaviour on a
device, whether the app currently builds for release, live production state (explicitly out
of scope), or anything about real user behaviour. Where a claim needed a run to confirm, it
cites the recorded run rather than asserting it fresh.

**How this revision was verified, to the same standard as the last one.** The
PR #56 revision was written without a shell but its provenance was then **confirmed with `git`
and `gh` in the same session** — `main` at `46c0befe09cef016e881254a94d530442a975fbb`, squashed
from `09fc8b1` on base `88670d1`, CI run 34007334683 green on both jobs, and
`supabase migration list --linked` reporting 43 entries through `20261004000000`.

**The PR #58 revision was confirmed the same way.** The merge SHA `5b1a7a9`, the PR number, the
squash merge and `local main == origin/main` were checked with `git` and `gh`; the applied
migration list was checked with `supabase migration list` against the linked non-production
project; and the post-merge `main` CI run **34019463222** was read with `gh run view` (`check`
and `db-security` both green). The source claims themselves were read from files, as always.

What that still does **not** establish: runtime behaviour on a device, live database contents
beyond the migration list, or anything about production — which remains out of scope and was
never queried.
