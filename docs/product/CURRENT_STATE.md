# Current State — what is true on `main` today

**Status:** Authoritative (current-state). Maintained by the Project State Steward.
> **⚠️ THIS DOCUMENT IS THREE MERGES STALE, AND THE GAP IS NAMED RATHER THAN PAPERED OVER.**
> It is anchored at `0f2b93c`. Since then `main` has taken **PR #69** (`c04e5bd`, docs only),
> **PR #68** (`5c24e8f`, manual adjudication and the three terminal OBLIGATION outcomes,
> PD-064 … PD-069) and the derived-agreement-presentation slice (PD-070). **The § Barter absence
> claims below were true at `0f2b93c` and several are now FALSE**; the ones that matter are
> corrected inline and marked, but **every line citation in § Barter is unverified at the current
> tip** and this file has not been re-read against it. A full Project State Steward
> reconciliation is owed and is the immediate next task after this slice merges. Until it runs,
> treat [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) and
> [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) as the authority for barter, and the source
> code over both.

**Reconciled against:** `main` @ `0f2b93c` (2026-09-07) — squash-merge of PR #66, "refactor: the
five-item pre-adjudication cleanup gate". **STALE — see the warning above.** That PR added **no** migration and changed **no**
database object, but it reshaped the client modules this document describes and moved nearly every
line citation in § Barter, so the anchor moves and those citations were re-read at `0f2b93c`. The
SHA, the PR number, the prior base `1c0fe54` (PR #65), the post-merge CI run and the
migration-list state were **supplied to this reconciliation**, which had no shell; it confirmed
independently only what a file can prove — `.git/HEAD` resolves to `refs/heads/main`, both
`.git/refs/heads/main` and `.git/refs/remotes/origin/main` read `0f2b93c5839e970592dac747544eea862610cb3d`,
and `supabase/migrations/*.sql` held **57** files, newest `20261018000000`, at that anchor. **It now holds 68, newest `20261029000000`** — see the staleness warning above.
**Last edited by:** PR #65 (previous edit: PR #64). PR #65 was the reconciliation that followed
PR #64; **PR #66 did not touch this file**, which is why its § Barter line citations were stale on
arrival. This reconciliation was **not given its own PR number**, so this field names the last
mutation whose number is known.

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

**Migration ledger.** The repository holds **57 migration files** — counted from
`supabase/migrations/*.sql`, newest
`20261018000000_no_show_created_at_server_stamped.sql` — and
that part is repository-provable. Ten files, `20260917000000` … `20260926000000`, are Slice 3a
(PR #49); four files, `20260927000000` … `20260930000000`, are Agreement Finalization (PR #50);
two files, `20261001000000` … `20261002000000`, are Proposal Timing Extension (PR #52);
`20261003000000` is the Barter Obligations Foundation (PR #54); `20261004000000` is
Obligation Delivery and Receiver Confirmation (PR #56); **six files,
`20261005000000` … `20261010000000`, are Pre-Delivery Cancellation (PR #58)**;
**`20261011000000` is the Receiver-Response Window and Needs Attention (PR #62)** — one file,
which creates no column, table, trigger, RPC or job; and **seven files,
`20261012000000` … `20261018000000`, are No-Show Reporting and the Under Review Foundation
(PR #64)**, of which `20261012000000` is the slice and the other six are forward corrections
and the two PD-062 / PD-063 halves. **PR #66 added none**: the count is still 57 and the newest
file is still `20261018000000`, counted from `supabase/migrations/*.sql` on `0f2b93c`, so
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) needs **no new entry** for that merge —
confirmed as an absence rather than assumed.
The ledger's § Prevention records why these features landed as forward correction chains:
after a migration is applied to non-production, fixes go into a new migration rather than an
edited historical file. Process and the dated record:
**[docs/operations/MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)**.

> **Read the ledger before redefining `public.cancel_barter_agreement`.** It was replaced **five
> times** inside PR #58 — `20261005000000`, `20261006000000`, `20261007000000`, `20261008000000`,
> `20261009000000`, then `20261010000000` — and **PR #64 replaced it a sixth time, so its current
> live definition is now
> `20261015000000_under_review_precedes_cancellation.sql`**, which adds the PD-063 `PT423`
> refusal. An author who redefines it from any
> earlier file would silently delete the PD-063 refusal, the in-thread signal, and restore the
> "Both providers agreed to cancel" wording that `20261010000000` was written to remove. This is
> not hypothetical:
> `20261008000000` exists precisely because `20261007000000`'s body was written from a
> **superseded** definition of `release_barter_interest` and dropped four of its properties,
> including the isolation that stops a notice failure from vetoing the cancellation. The ledger's
> § "Functions redefined across migrations" now carries rows for `cancel_barter_agreement`,
> the new one-writer helper `public.pair_conversation_notice`, the two obligation RPCs
> `20261005000000` redefined, and — added by PR #62 —
> **`public.enforce_barter_obligations_immutable`, whose live definition is now
> `20261011000000_barter_receiver_window_needs_attention.sql`, not the `20261004000000` that
> first narrowed it.** Copying the older body forward would silently re-open a `service_role`
> rewrite of the agreed trade.
>
> **PR #64 added four more live-definition hazards of the same shape**, each recorded in the
> ledger's table and each verifiable from the files: `public.report_barter_obligation_no_show`
> lives in `20261014000000_no_show_lock_order.sql`, **not** the `20261012000000` that created it —
> and `20261012000000` § 6 states a lock-order contract that is **false** and must not be copied
> forward; `public.enforce_barter_cancellation_consistent` lives in
> `20261017000000_restore_cancellation_actor_binding.sql`, which exists **because**
> `20261015000000` wrote that trigger from `20261005000000` instead of its live `20261006000000`
> and silently reverted the actor binding and the server-stamped `created_at`;
> `public.enforce_barter_no_show_consistent` lives in
> `20261018000000_no_show_created_at_server_stamped.sql`; and both read models are recreated in
> full, so `public.my_barter_obligations` lives in `20261016000000_no_show_reason_read_model.sql`
> and `public.my_trade_activity` in `20261013000000_no_show_eligibility_single_source.sql`.

**Applied where.** All six PR #58 migrations were applied to the **linked non-production project
only** (`wcoyjeklscuqsumpjpfo`), confirmed with `supabase migration list`: local and remote match
through `20261010000000`, with no orphan in either direction. **PR #62's `20261011000000` was
applied to the same non-production project on 2026-09-06 and confirmed on 2026-09-07** — local and
remote agree on all **50** versions, no gap and no drift, and the applied body was checked against
the live catalog rather than the file
([MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md), § `20261011000000`). The apply was
first recorded in the ledger and has since been **re-verified directly**: `supabase migration
list` against the linked non-production project returns 50 versions with local == remote and no
drift, newest `20261011000000`.
**PR #64's seven migrations, `20261012000000` … `20261018000000`, were applied to the same
non-production project on 2026-09-07** and are dated per-migration in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) (§ `20261012000000` + `20261013000000` +
`20261014000000`, and § `20261015000000` … `20261018000000`). The state is **57 versions, local == remote, no drift** — **verified** with
`supabase migration list --linked` after the reconciliation that first recorded it, along with
`git diff 1c0fe54 --stat -- supabase/` returning empty, which is what proves PR #66 added no
database change.
**Production was never touched and was never queried**, and remains out of scope. Every harness
that reaches a database refuses the production ref outright (`scripts/prodRef.mjs`).

**Latest recorded runs.** Rather than restate counts that change with ordinary PRs, this
records *which runs* to look at. Two different things are recorded, and they are not
interchangeable:

- **The latest `main` CI run recorded here** is **34007334683** on `46c0bef` — `check` and
  `db-security` both green, confirmed with `gh run view` after PR #56 merged. The `check` job ran
  typecheck, lint and unit tests; the `db-security` job ran the non-production B5B harness.
  The latest run recorded here is **34019463222** on `5b1a7a9` — `check` and `db-security` both
  green, confirmed with `gh run view` after PR #58 merged. **No CI run number is recorded anywhere
  in this repository for PR #62 / `26fb7fd`**, and the reconciliation that wrote that sentence had
  no shell with which to fetch one; **it is superseded** — the post-merge run for `26fb7fd` is
  34155130832, **success** (see the verification note at the foot of this document). **The latest
  `main` CI run recorded here is now 34165346538 on `23df39c`, conclusion `success`**, the
  post-merge run for PR #64. **Superseded in turn: the latest `main` CI run recorded here is now
  34181613351 on `0f2b93c`, conclusion `success`**, the post-merge run for PR #66. Both run numbers are
  **verified** with `gh run list --branch main`. Read the current status from the latest
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
  **For PR #62 the post-apply figures are recorded against `20261011000000`** in the ledger:
  **B5B 985/985 passed, 0 failed**, of which **113** are `receiver_window` — the three anchor
  cases, the inclusive boundary at one microsecond before / exactly at / one microsecond after, a
  DST-straddling determinism check, and the full `service_role` freeze matrix — and
  **concurrency 102/102**, re-run because § 3b replaced a live trigger body every delivery,
  receipt and cancellation race passes through. Zero residue on both.
  **For PR #64 the post-apply figures are recorded against `20261015000000` … `20261018000000`**
  in the ledger, and they supersede the intermediate snapshot taken at `20261014000000`
  (1074/1074, concurrency 124/124): **B5B 1097/1097 passed, 0 failed** and **concurrency 129/129
  passed, 0 failed**, zero residue on both, against **57** applied versions with local == remote
  and no drift. The concurrency harness's race #20 is where the PD-063 outcome is proven rather
  than argued — and it is the assertion that caught a real `40P01` deadlock before
  `20261014000000` fixed the lock order.
  **For PR #66 the figures are the SAME figures, and that identity is the evidence rather than a
  coincidence**: **B5B 1097/1097 and concurrency 129/129 before and after**, with **Jest 663/663**,
  `tsc --noEmit` clean and `lint:ci` **0 errors**. A refactor that added no migration and changed no
  database object should move no database assertion, and none moved; `git diff 1c0fe54 -- supabase/`
  was empty. All of those figures were **supplied to this reconciliation**, which ran nothing.
  **That the files exist does not establish that they pass**; this document does not run tests,
  and every figure above is a run recorded elsewhere rather than one observed here.

The suite grew enormously across these slices — 88 → 1097 assertions as the barter work landed,
per the runs recorded in [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) —
which is exactly why the count is read from a run rather than from this document. The
authoritative description of the harness lives in
[supabase/tests/README.md](../../supabase/tests/README.md).

**Why this document's anchor is now `0f2b93c`.** The anchor before it was `23df39c` (PR #64), and
one merge sits between them: **PR #65** (`1c0fe54`), the documentation-only reconciliation that
followed PR #64. That one moved no anchor, because it asserted no new repository fact. **PR #66
does**, and the reason is narrower than usual and worth stating plainly: it delivered **no product
behaviour, no migration, no database object and no new lifecycle state**, so nothing in the server
half of this document changed — but it reshaped the **client modules § Barter describes** and moved
almost every line citation in that section. A citation is a repository fact, and a stale one sends
the next reader to the wrong lines. So the anchor moves, and every § Barter citation below was
re-read on `0f2b93c` rather than carried forward. What PR #66 changed is recorded in
[ROADMAP.md](ROADMAP.md) § Completed and § Next; this document records only its effect on what is
true here.

The reasoning for the earlier moves is kept below, because it is the record of why the anchor sits
where each step left it. The anchor before `23df39c` was `26fb7fd` (PR #62).
**PR #64 changed facts *this document* asserts**, so the anchor moves again: the migration chain
went from 50 files to **57**, a **tenth barter table** appeared
(`barter_obligation_no_show_reports`), a fourth obligation RPC appeared
(`report_barter_obligation_no_show`), a second derived read state appeared (**Under Review**), and
the **live definitions of four objects moved** — `cancel_barter_agreement`,
`enforce_barter_cancellation_consistent`, `enforce_barter_no_show_consistent` and both read
models. **Like the PR #62 move, `23df39c` was supplied to a shell-less reconciliation and then
VERIFIED**: `gh pr view 64` (MERGED, squash, base `ddcb229`), `git rev-parse` (local `main` ==
`origin/main`, tree clean), `gh run list` (post-merge run 34165346538, success) and
`supabase migration list --linked` (57 versions, local == remote, no drift). B5B 1097/1097 and
concurrency 129/129 were re-run against merged `main`.

The anchor before `26fb7fd` was `5b1a7a9` (PR #58),
which had itself moved from `46c0bef` (PR #56) because PR #58 took the migration chain from 43
files to 49, added a ninth barter table, gave an official agreement an ordinary pre-delivery exit
and renamed the Trade Activity grouping. **PR #62 changed facts *this document* asserts** in the
same way: the chain went from 49 files to 50, two new read surfaces appeared
(`my_barter_obligations`, and four columns on `my_trade_activity`), a derived receiver-response
window and Needs Attention became real, and the live body of
`enforce_barter_obligations_immutable` changed so the obligation's contract fields are frozen
against `service_role` too. So the anchor moves to PR #62's squash-merge commit, `26fb7fd`.
That SHA was supplied to a shell-less reconciliation and then **verified** — `gh pr view 62`
(MERGED, squash, `26fb7fd`), `git rev-parse` (local `main` == `origin/main`) and
`gh run list` (post-merge run 34155130832, success).

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
authoritative for it; the decisions behind it are **PD-030 … PD-063** in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md). Neither is restated here.

This section records **what is built on `main`** and **what is not**.

### What is built

Verified by reading the files on `main` @ `0f2b93c` — **57 migrations**, newest
`supabase/migrations/20261018000000_no_show_created_at_server_stamped.sql`. **Every SERVER row in
the table below is unchanged by PR #66**, which added no migration; the client citations in it were
re-read at `0f2b93c` because that PR moved them.

| Capability | What is actually enforced | Where |
|---|---|---|
| Data model | **Ten barter tables.** `barter_offers` and `barter_interests` (the post and its responses), Slice 3a's `barter_proposals`, `barter_proposal_versions`, `barter_proposal_terms` and `barter_version_acceptances` (the negotiated terms), PR #50's `barter_agreements` for the finalized trade, PR #54's `barter_obligations` — which PR #56 extended **in place** with a three-column delivery / receipt lifecycle rather than by adding a table — and PR #58's `barter_agreement_cancellations`. **No adjudication, terminal-obligation-outcome or terminal-agreement-outcome table or column exists, and there is no Needs Attention or Under Review column either** — the tenth table, `barter_obligation_no_show_reports`, records a receiver's REPORT and nothing else; Under Review is derived from it — PR #62's Needs Attention is **derived per read** from timestamps already stored and persists nothing (see the receiver-window paragraph below; `20261011000000` § 7 states the absence directly). | Origin: `20260829000000_canonical_live_baseline.sql`; proposal tables in `20260917000000_barter_proposal_versions.sql` §§ 1–4, narrowed by `20260925000000_negotiation_directed_terms.sql` § 1; agreement table in `20260927000000_barter_agreement_finalization.sql`; obligation table in `20261003000000_barter_obligations_foundation.sql`; lifecycle columns in `20261004000000_barter_obligation_delivery.sql`; cancellation table in `20261005000000_barter_pre_delivery_cancellation.sql:35-50` |
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
| Obligation immutability, narrowed | `enforce_barter_obligations_immutable` was redefined from a blanket refusal into a **transition-aware, deny-by-default** guard: the whole row **minus** the three lifecycle keys must be identical, a write needs a transaction-local marker carrying that obligation's own id, and only `pending → delivered` and `delivered → received \| not_received` are legal. Both stamps are write-once. `DELETE` stays absolute (PD-043). A new **BEFORE INSERT** trigger, `enforce_barter_obligation_starts_pending`, keeps every obligation entering the lifecycle at `pending` — with **no `service_role` bypass**, so a backfill cannot invent a delivery either. **The guard's live body is no longer this file:** PR #62 replaced it again (next-but-one row, and the ledger's redefinition table). | `20261004000000` lines 87–160 (the guard as first narrowed, and its trigger), 168–192 (starts-pending trigger); **current definition `20261011000000_barter_receiver_window_needs_attention.sql:252-321`** |
| Pre-delivery cancellation | **The ordinary exit from an official agreement now exists.** Either participant may cancel while **no obligation has been delivered**; the counterparty's permission is not required. One RPC, `cancel_barter_agreement(uuid, text)`, is the only writer — `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` on the table and there is no write policy. The **first valid act immediately stops ordinary performance**: `mark_barter_obligation_delivered` and `record_barter_obligation_receipt` both re-check for a cancellation **after** taking the obligation row lock and refuse with SQLSTATE `PT409`. Once **any** obligation has been delivered, cancellation is refused permanently (`object_not_in_prerequisite_state`) — and because the check reads `delivered_at`, a later "didn't receive" does **not** bring the exit back. **Idempotent per participant**: a repeat call returns the existing classification and re-stamps neither the time nor the reason. | `20261005000000_barter_pre_delivery_cancellation.sql:189-289` (RPC, lock order and grants), `:291-356` and `:358-435` (the two post-lock guards); refusal copy in `lib/barterErrors.ts:539-566` |
| Cancellation is two acts, never an inference | One row per participant per agreement (`unique (agreement_id, actor_user_id)`), and the classification is **derived from the row count and stored nowhere**: one act is `cancelled_by_participant`, two is `mutually_cancelled`. **"Mutually Cancelled" therefore requires two explicit participant acts** — it is never produced by silence, a timeout or inactivity, neither of which exists in the schema at all. The actor is bound to `auth.uid()` by trigger, so a privileged insert cannot fabricate the counterparty's assent, and `created_at` is server-stamped on every insert path rather than merely defaulted. | `20261005000000:35-47`, `:263-284`; actor-is-caller and server-stamp corrections in `20261006000000_barter_cancellation_hardening.sql:34-104`; client classification in `lib/tradeCancellation.ts:43-55` |
| Append-only; nothing is deleted | A cancellation cannot be edited or withdrawn (`enforce_barter_cancellation_append_only`, `before update or delete`), and the cancellation **destroys nothing**: the agreement, both obligations, every proposal version, its terms and the acceptances all survive unchanged and stay readable by both participants. PD-043 is untouched. | `20261005000000:78-105`, header `:31-33` |
| The optional reason is shared | Free text, **1–200 characters**, optional, immutable, and safe to repeat (a second call overwrites neither it nor the timestamp). It is **shared with the other provider** and surfaced to both in trade details as two per-viewer columns, `my_cancel_reason` / `their_cancel_reason`. It is **context, not a verdict** — not a reliability judgment, a no-show determination, adjudication or proof of fault, none of which exist — and it is deliberately **absent from the conversation notice**. The composer discloses the sharing **above** the input, before the writer commits. | `20261005000000:45-46` (bound), `20261007000000_barter_cancellation_signal.sql:159-237` (view columns and the column comment); client attribution in `lib/tradeCancellation.ts:295-311`, disclosure copy at `:246-258` |
| Cancellation notices in the pair thread | Cancelling writes a **durable, best-effort system message** (`sender_id is null`) into the pair's **existing canonical provider-pair conversation**, addressed to the participant who did **not** act. **These are not push, device or email notifications** — PD-059 is unchanged. First act: `The trade for "X" for "Y" was cancelled by one provider.` Second act, deliberately neutral: `Both providers cancelled the trade for "X" for "Y".` — because two acts prove each provider cancelled, **not** that either assented to the other's decision. **Exactly one notice per transition** (the idempotent branch returns before the insert), **no conversation is ever created**, and a notice failure **cannot veto the cancellation**: the insert is wrapped in its own `exception when others then null` handler. | `20261009000000_pair_conversation_notice.sql:35-111` (the one writer, revoked from every client role) and `:113-222`; live copy in `20261010000000_cancellation_notice_neutral_copy.sql:121-133`, rationale `:11-23`; the `"X" for "Y"` label is `barter_terms_label` (`20260914000000_trade_activity_corrections.sql:148-157`) |
| Cancelled trades stay visible | A cancelled trade remains in Trade Activity under the broader **"Trades"** grouping — **renamed from "Confirmed trades"**, because the group now holds a mixed set and a heading is read before the rows beneath it. The per-row note carries the state instead (`Trade cancelled…`), and the row offers **no** cancellation control: the act is taken on the negotiation screen, the one place that can check the delivery precondition. | `lib/tradeActivity.ts:192-226` (section copy and the rename rationale), `:286-299` (the per-row note, total over the cancellation vocabulary), `:488-523` (the confirmed row's action, badge and deadline); row facts assembled in `app/community/trade-activity.tsx:242-246` |
| What cancellation does **not** mean | Cancellation is an **agreement-level** event. It decides nothing about whether either obligation was fulfilled, writes **no** obligation outcome, and implies **no** no-show, unfulfilled finding, dispute, adjudication or reliability verdict — none of which exist. B5B asserts the **absence** of the whole vocabulary rather than assuming it. | `20261005000000:25-29`; absence assertions in `supabase/tests/cancellation.test.sql:700-713`; client rule in `lib/tradeCancellation.ts:1-13` |
| No-show reporting (PD-062) | Only an obligation's **receiver** may report that a **scheduled** service did not happen, and only **at or after `scheduled_at`**. **Server time is authoritative**: the RPC has no `p_as_of` parameter and compares `now()` — the transaction clock — to `scheduled_at`, so no client-supplied time reaches the comparison. `scheduled_at is null` means there is no appointment to miss and the report is refused. The report is **immutable participant-reported history**: append-only by trigger, at most one per obligation, `created_at` **stamped by the trigger on every insert path** rather than merely defaulted, and a repeat call **returns the original timestamp** without re-stamping or merging a second reason. `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` and there is no write policy — the one `SECURITY DEFINER` RPC is the only writer. Delivery neither blocks a report nor is erased by one. | `20261012000000_barter_no_show_under_review.sql:64-108` (table, one-per-obligation, reason bound), `:110-139` (append-only), `:141-214` (the consistency trigger, superseded by `20261018000000:34-89` which adds the server stamp), `:237-240` (no write grant); **live RPC body `20261014000000_no_show_lock_order.sql:56-176`**, server-time comparison at `:129`; `supabase/tests/no_show_under_review.test.sql` |
| Under Review — derived, and not a finding of fault | **Under Review is derived per read, not stored**: `barter_obligation_under_review(status, a report exists, cancelled)` is `(report exists) OR (status = 'not_received')`, minus cancelled. **No status value, no column, no case table and nothing on a timer** — the four-value `status` vocabulary is unchanged. It means **a human must look**, never that anyone is at fault, and it is not Fulfilled, Unfulfilled, Completed, Closed Without Resolution or any terminal outcome, none of which exist. **A no-show does not produce Needs Attention** either — that is a separate route, and PD-062 states the absence directly. The receiver's controls stay live beneath it. Exposed as `under_review` / `no_show_reported_at` / `no_show_reason` / `can_report_no_show` on `my_barter_obligations`, and role-relative plus an `agreement_under_review` **display roll-up** on `my_trade_activity`. | `20261012000000:242-287` (the rule), `:419-473` and `20261013000000:79-122`, `20261016000000:27-87` (the read models); `20261013000000:34-76` (`barter_can_report_no_show`, the one place the offer rule is written); client copy in `lib/obligationState.ts:335-390` (`obligationView`, and the precedence at `:357-382`), `:513` (`UNDER_REVIEW_LABEL`) and `:580-587` (`UNDER_REVIEW_NOTE`), list copy in `lib/tradeActivity.ts:364-380`, `:463-475`, `:508-521` |
| Under Review outranks the ordinary exit (PD-063) | Once **any** no-show report exists on the agreement, `cancel_barter_agreement` refuses with the **new SQLSTATE `PT423`**, and `enforce_barter_cancellation_consistent` carries the same rule as defence in depth; the client stops drawing the control. In the other direction, a cancellation that commits first refuses a later report with **`PT409`**. A race resolves to **exactly one** state because **both writers take the `barter_agreements` row lock first** — `20261014000000` moved the no-show RPC onto that order after a real `40P01` deadlock was reproduced. Refusing cancellation removes one exit and **decides nothing**. | `20261015000000_under_review_precedes_cancellation.sql` (the RPC, and the live body of `cancel_barter_agreement`); `20261017000000_restore_cancellation_actor_binding.sql` (the live body of the trigger); `PT409` refusal at `20261014000000:116-120`; `PT423` constant `lib/barterErrors.ts:160`; **client gate `lib/tradeCancellation.ts:143-201` — since PR #66 it reads the REPORT itself (`noShowReported`, `:157-177`, applied at `:193` and `:200`), which is the same predicate `PT423` evaluates, rather than the server's broader `under_review`**; the screen derives it at `app/community/negotiation/[id].tsx:232-247`; race in `scripts/negotiation-concurrency.mjs` |
| The no-show reason is shared context | Optional free text, **1–200 characters**, no taxonomy, immutable, and **not merged on a repeat call**. It is **visible to both participants** — the reports table's participant-read policy admits the deliverer as well as the reporter, and `my_barter_obligations.no_show_reason` is the route to it through `security_invoker`, so no policy was widened. The UI attributes it as the **reporting participant's statement**, never a platform finding, and the sharing is disclosed **above** the input before the writer commits (the PD-060 precedent). It is deliberately **absent from `my_trade_activity`**: a list row is the wrong place for someone's account of what happened. | `20261012000000:75-79`, `:216-240` (policy); `20261016000000:1-25` (the ruling and why no policy changed), `:70-91`; `lib/obligationState.ts:431-459` (`NO_SHOW_REASON_NOTE`, validation, payload), `:500-510` (`noShowStatement`); since PR #66 the disclosure is rendered above the input by the shared `components/ReasonComposer.tsx:52-54`, mounted for the no-show reason at `app/community/negotiation/[id].tsx:684-695`, with the statement at `:700-704` |

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
`lib/barterErrors.ts` interprets the server's refusals. Since PR #66 there is also **one shared
presentational component**, `components/ReasonComposer.tsx` — disclosure above the input, input,
submit — used by **both** free-text reason blocks on the negotiation screen. It owns the SHAPE
only: it validates nothing, shapes no payload and decides no visibility, so a cancellation reason
and a no-show reason stay different products with different copy, bounds and readership supplied by
the caller (`components/ReasonComposer.tsx:3-38`). Screens: `app/community/index.tsx`
(feed), `barter-compose.tsx`, `barter-interests.tsx` (an offer's responses) and
`trade-activity.tsx`. Interest counts are shown to the **offer owner only**
(`app/community/index.tsx`, the `isOwner` branch), which is what
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 10 requires.

For the negotiation itself: `lib/negotiation.ts` is the data layer (reads come from
`my_barter_proposals`, the proposal tables and, after agreement finalization, the **view**
`my_barter_obligations` rather than the `barter_obligations` table — `lib/negotiation.ts:326-334`,
so the PD-057 window, the derived Under Review state, `can_report_no_show` and the reason all
arrive already decided server-side and none is recomputed here; every write
is one of the three negotiation RPCs, the finalization RPC,
**one of the four obligation RPCs** — `lib/negotiation.ts:472-537`, the first three sending the
obligation id and nothing else and the fourth, `reportObligationNoShow` (`:527-537`), sending the
obligation id and an optional reason — or the cancellation RPC, `cancelTrade` at
`lib/negotiation.ts:552-562`, which
sends the agreement id and an optional reason and cannot name the actor, the time or the outcome),
`lib/negotiationState.ts` holds the pure state and copy rules (`negotiationView`,
`validateDraft`, `draftPayload`), `lib/obligationState.ts` holds the per-obligation role, state
and copy rules (`obligationRole`, `obligationView`, `obligationTimeline`, plus `anyDelivered` —
the PD-046 precondition, kept out of JSX so it can be tested) with no I/O,
`lib/obligationState.ts` also owns the client half of the PD-057 receiver window and of PD-062's
Under Review (`ReceiverWindowState`; the total role × window copy table at `:254-293`;
`NEEDS_ATTENTION_LABEL` at `:218` and `ACTION_NEEDED_LABEL` at `:229`, the latter **moved here from
`lib/tradeActivity.ts`**, which now re-exports it (`lib/tradeActivity.ts:331`), so one label reads
identically on the list and
on the trade's own screen; `UNDER_REVIEW_LABEL` at `:513` and the per-role `UNDER_REVIEW_NOTE` at
`:580-587`, both of which **outrank** the window labels while cancellation outranks all of them,
`:357-382`) — the SERVER decides the state and this module only words it.
**Since PR #66 it also owns the one label → tone mapping**, `ATTENTION_TONE` / `attentionTone`
(`:541-569`), keyed by an `AttentionLabel` union of the three exported label constants (`:544-547`)
so a fourth attention state is a **compile error** rather than a silent fallthrough; both
`ObligationView.attention` (`:117`) and `TradeRowState.attention` (`lib/tradeActivity.ts:169`) are
typed to that union. It names the **meaning**, not the colour: each screen keeps its own palette
and maps a tone to its own `StyleSheet` (`app/community/negotiation/[id].tsx:1147-1154`,
`app/community/trade-activity.tsx:551-555`), so no `lib/` module imports React Native styles and
the six colour literals stay deliberately per-screen. Also since PR #66,
`obligationView` takes **one `ObligationViewFacts` object** rather than seven positional arguments
(`:310-333`, consumed at `:335-344`); no positional call site remains, and its two same-typed
booleans are now `obligationUnderReview` (per obligation) and `canReportNoShow`, which cannot be
transposed without writing different keys.

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
gated by the server-derived role and status; since PR #62 an attention chip and a
response deadline above them; and since PR #64 a **separate** no-show block — disclosure, optional
reason input, **Report no-show** — offered only when the server's `can_report_no_show` says so, and
the reporter's own words rendered beneath (`app/community/negotiation/[id].tsx:564-707`, the whole
`renderObligation`; both obligations are rendered at `:831-832`). Since PR #66 that no-show block is
the shared `ReasonComposer` (`:684-695`) rather than hand-authored JSX. **`noShowReportedAt` is
still not RENDERED, but it is no longer merely retained.** `lib/negotiation.ts:122` and `:379`
carry it and `obligationTimeline` is not given it, so no timestamp for the report appears on the
card — and since PR #66 the screen READS it to decide whether the ordinary exit is drawn
(`app/community/negotiation/[id].tsx:237`, feeding `cancellationView`'s `noShowReported` at
`:246`). The **Founder ruling supplied with the previous reconciliation** still holds and is quoted
as given: *"`noShowReportedAt` is RETAINED for future review/adjudication history and is
deliberately NOT currently rendered … it must not be documented as dead code or as a defect."* It
is recorded here so a later reader does not delete it as unused — and the field now has a live
consumer as well as a documented reason. The **AGREEMENT reads "Trade
confirmed" until it is cancelled, and gained no
terminal outcome** (`lib/negotiationState.ts:181-194`) — it stays that way for the whole life of
the trade while its obligations progress. On a cancelled trade the page headline becomes "Trade
cancelled", the terms card is retitled "The terms that were agreed", both obligation controls
are frozen and their what-happens-next notes are dropped, and the cancellation is said **once**,
above both obligations (`lib/negotiationState.ts:169-180`, `lib/obligationState.ts:24-27` and
`:363-382`, `app/community/negotiation/[id].tsx:813-827`). `lib/barterErrors.ts` interprets the
refusals PR #56, PR #58 and PR #64 introduced, including `PT412` for an answer already recorded
(constant at `:154`), `PT409` read as
"this trade was cancelled" for the obligation operations (`:132-145`), and **`PT423` for a trade
already under review** (`:160`), whose comment records why a new code was minted rather than
reusing `object_not_in_prerequisite_state`.

**The receiver-response window and Needs Attention now exist** (PD-057, PD-059), as DERIVED read
state. `public.barter_confirmation_anchor` returns
`max(delivered_at, coalesce(scheduled_at, due_at))` and NULL before delivery;
`public.barter_confirmation_deadline` is that plus 7 days and is the only place the interval is
written; `public.barter_receiver_window` returns `none | awaiting_receiver | needs_attention` and
begins attention at `server_now >= deadline`, **inclusive**. `public.my_barter_obligations`
(security_invoker, scoped by the existing participant policy) exposes the anchor, the deadline,
the state and `server_now`; `my_trade_activity` gained role-relative `my_response_state` /
`their_response_state`. **No column, trigger, background job or scheduler was added** — nothing
flips a row at a deadline, so there is no persisted transition to disagree with the timestamps.
An elapsed window leaves the row `delivered`: the four-value `status` vocabulary is unchanged and
**Needs Attention is not a status value**, not an outcome, and not Fulfilled, Unfulfilled,
Completed, Under Review, Disputed, a no-show or an adjudication. **The receiver may still answer
after the deadline** — no RPC consults it, asserted over `prosrc` — and an explicit answer clears
the condition however long ago the window closed (PD-058). Cancelled trades never enter the flow.
**Agreement-level and obligation-level attention are different SCOPES** (Founder ruling
2026-09-07). Trade Activity's row badge is the agreement-level headline and may read
"Needs attention" because the counterparty's window elapsed (`lib/tradeActivity.ts:416-426`,
`:488-523`); that never suppresses this viewer's own live obligation. On the list, the viewer's own
deadline is keyed off **their own** window state rather than off the badge (`:428-450`, applied at
`:513-521`) and the
mixed case states both facts (`:342-355`). On the trade detail the viewer's own unanswered
obligation keeps its **Action needed** label, its **deadline**, and both **Confirm received** /
**Didn't receive** controls (`lib/obligationState.ts:270-292`, rendered at
`app/community/negotiation/[id].tsx:610-642` and `:656-677`). `obligationView` is
per-obligation and is never passed the counterparty's state, so the isolation is structural
rather than a rule that could be forgotten. **PR #64 extended the same ruling to Under Review**,
which is the stronger headline and therefore needs it more: the mixed case keeps both the
viewer's instruction and their deadline, and the deadline is suppressed only when the viewer's
**own** obligation is the one under review (`lib/tradeActivity.ts:367-380`, `:463-475`,
`:513-521`). The **feed card and offer-responses screen are
deliberately deferred**: `responderFeedState` calls `tradeRowState` without either window fact
(`lib/tradeActivity.ts:711` onward), so they show "Trade confirmed. The agreed terms can no longer
change.", which stays true — nothing there became false. That deferral is recorded for Session 7
closeout in [ROADMAP.md](ROADMAP.md) § Next.

The same migration also **froze the obligation's contract fields against every writer, including
`service_role`** (Founder ruling 2026-09-06): agreement, participants, source term, description,
`due_at` and `scheduled_at` can no longer be rewritten after the agreement exists, because they
are now the read-scoping keys and the deadline anchor. Privileged DELETE is deliberately still
permitted, so account-erasure cascades still work. **The same principle is now ruled to extend to
core `barter_agreements` identity** (Founder, 2026-09-07), but is **not yet enforced there**:
`enforce_barter_agreement_immutable` refuses ordinary callers absolutely while giving
`service_role` and the no-JWT path an unconditional early return. That is a recorded bounded
follow-up with live-catalog evidence in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md), not work done in PR #62.
(`supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql`,
`lib/obligationState.ts`, `lib/tradeActivity.ts`.)

**Nothing sends the receiver a push, device or email notification.** PD-059's push half is
unchanged: no such path exists anywhere in the chain. What PR #58 added is narrower and only for
cancellation — a durable in-thread system message, written best-effort into the pair's existing
conversation (`20261009000000_pair_conversation_notice.sql`). **A delivery still PUSHES nothing**:
`20261004000000_barter_obligation_delivery.sql` creates no notification path and this slice added
none, so nothing reaches a provider who does not open the app. What changed is where a delivery is
VISIBLE once they do: it is no longer only the negotiation screen
(`app/community/negotiation/[id].tsx:171-177` loads it, `:179-183` refreshes it on focus) —
`lib/tradeActivity.ts` now
reads the two role-relative response states, so an unanswered delivery surfaces on Trade Activity
as **Action needed** or **Needs attention** (above). The Trade Activity attention UX that PD-059
required before beta **is now built**; the **push** half of PD-059 remains a known, scheduled gap
rather than an oversight.

**PR #64 added no notification either, and its in-thread notice is DEFERRED.** A no-show report
writes **nothing** into the pair's conversation: `public.pair_conversation_notice` is called only
from `20261009000000`, `20261010000000` and `20261015000000` — every one of them a cancellation
path — and none of `20261012000000` … `20261018000000` calls it. The deliverer learns of a report
by opening the trade, where `UNDER_REVIEW_NOTE` tells them the other provider reported a problem
and that nothing has been decided (`lib/obligationState.ts:580-587`). That is a **Founder ruling
supplied with the reconciliation that followed PR #64**: a no-show conversation / in-thread notice
is deferred, to be decided with the later adjudication / review workflow. It is an absence by
decision, not an oversight, and PR #66 did not disturb it.

**PR #66 changed how this client code is SHAPED and nothing about what it does.** It added no
migration (57 before and after), no database object, no write path, no lifecycle state and no
product behaviour; the whole of its diff is in `lib/`, `components/`, `app/community/` and
`__tests__/`. What it did change is recorded in the paragraphs above and itemised in
[ROADMAP.md](ROADMAP.md) § Next: shaped inputs for `obligationView` and `cancellationView`, one
label → tone mapping, one shared reason composer, and the split of the two things previously both
called `underReview`. The last of those is the only one with a semantic consequence, and it is a
narrowing rather than a change of outcome: the client's cancellation gate now evaluates the **same
predicate as `PT423`** (a no-show report exists) instead of the server's broader `under_review`
(`report OR not_received`). The two agreed before only because `not_received` implies
`delivered_at is not null`, so `anyDelivered` had already closed the exit — a coincidence between
two guards two migrations apart, now replaced by the direct predicate and pinned by a test
(`lib/tradeCancellation.ts:157-177`, `app/community/negotiation/[id].tsx:232-247`,
`__tests__/lib/obligationViewShape.test.ts:216-244`). **PD-062 and PD-063 are unchanged by it**,
and so is every server rule above.

Regression coverage: `supabase/tests/barter.test.sql`, `supabase/tests/negotiation.test.sql`,
`supabase/tests/agreement.test.sql`, `supabase/tests/obligation.test.sql`,
`supabase/tests/cancellation.test.sql`, `supabase/tests/receiver_window.test.sql` and
`supabase/tests/no_show_under_review.test.sql`, all
registered in the B5B runner at `scripts/db-security-test.mjs` (lines 45–53), plus
`__tests__/lib/tradeActivity.test.ts`, `__tests__/lib/negotiationState.test.ts`,
`__tests__/lib/obligationState.test.ts` and `__tests__/lib/tradeCancellation.test.ts` for the
pure client rules, `__tests__/lib/negotiationWrite.test.ts` for the shared write sequence,
`__tests__/lib/receiverWindow.test.ts` for the PD-057 window's client half (that it consumes the
server's state rather than deriving one, with a word-boundary vocabulary sweep over the whole
role x status x window x cancelled matrix), `__tests__/lib/underReview.test.ts` for PD-062's
client half (that Under Review outranks the window labels while cancellation outranks it, that the
no-show control is offered only to a receiver the SERVER has cleared, and that the reason is
attributed as a statement), **`__tests__/lib/obligationViewShape.test.ts` for PR #66's structural
invariants** — the full 192-combination `obligationView` matrix, the label → tone mapping over every
label BOTH view models can emit, and the two `cancellationView` gates asserted independently — and
**`__tests__/components/ReasonComposer.test.tsx`**, which asserts the PD-060/PD-062 rule that the
disclosure is rendered BEFORE the input by comparing their positions in the serialised tree, rather
than leaving it to two hand-authored copies and a reviewer's eye. That shape file deliberately pins
**no copy**; the evidence that no wording moved is that `obligationState.test.ts`,
`receiverWindow.test.ts` and `underReview.test.ts` — which do pin exact strings — were converted to
the new call shape and still assert the same strings
(`__tests__/lib/obligationViewShape.test.ts:1-12`). And
`__tests__/app/negotiationWriteHandlers.test.tsx` — the first suite here that RENDERS a screen —
which drives the negotiation write controls and pins, per control, the RPC called, the exact
payload, the refusal copy, whether the screen re-reads and whether that re-read blocks. Those
tests distinguish
ready-to-confirm from confirmed, and pin that confirmed trade copy does not promise booking,
completion, fulfilment, delivery or a guarantee. B5B pins the derived obligation pair,
participant read, direct-write refusal, immutable content/timing and no-write grant posture,
and now also who may mark delivered, who may answer, the one-answer rule, the CHECK constraints
where no trigger stands in front of them, and the starts-pending insert guard.
`supabase/tests/cancellation.test.sql` pins the cancellation invariants and the posture of every
object PR #58 created or redefined, and asserts the continuing **absence** of any no-show,
timeout, review or terminal-outcome **column** (`:697-706`). **Its function-absence assertion was
corrected in PR #64 and is worth reading rather than paraphrasing** (`:707-722`): it was a
**name** list naming `report_barter_no_show`, a spelling that never existed, so it passed
vacuously and would not have noticed the real `report_barter_obligation_no_show`. It is now a
**pattern sweep** over `no_show|adjudicat|under_review|complete_barter|expire_barter|escalate_
barter|resolve_barter|fulfil|reputation` with the **five** ruled objects exempted by name — so a
sixth fails the suite. `supabase/tests/receiver_window.test.sql` pins the three anchor
cases (§ 1), the exact 7-day interval (§ 2), the inclusive boundary before / at / after (§ 3),
what is **not** an attention state (§ 4), that an explicit answer settles it at every instant
(§ 5), that "didn't receive" still works after the deadline (§ 7), that cancelled trades never
enter the flow (§ 8), the role-relative Trade Activity columns (§ 9), participant scoping and the
`anon` revoke (§ 11), that the view is not a write path (§ 12), zero residue — nothing this slice
must not have created (§ 14), the `service_role` freeze matrix including that privileged DELETE
still works (§ 14b), the invariant that the obligation and cancellation read scopes cannot
diverge (§ 14c), and that the receiver RPCs were not touched (§ 15).
`supabase/tests/no_show_under_review.test.sql` pins authority, timing and eligibility, that a
report cannot be filed before the scheduled time, that a de-approved participant keeps authority on
an existing agreement, that `not_received` qualifies for Under Review on its own, that an
explicitly `received` obligation cannot be reported, that delivery neither blocks a report nor is
erased by one, that a cancelled agreement never enters Under Review, that **both** participants
read the review state and nobody else does, the object posture, the eligibility column asserted
positive and asserted to flip, **both directions of the PD-063 precedence**, that the reason is
participant-visible context, that a no-show creates **no** Needs Attention and **no** terminal
outcome, that the reports table is in no realtime publication, that the report time is
**trigger**-stamped rather than merely defaulted, and that the lock order is pinned
**structurally** rather than only behaviourally. Races a single-transaction
harness cannot stage are covered by `scripts/negotiation-concurrency.mjs`, a non-B5B script, which
now carries cancellation cases and the no-show / cancellation race. Executions **are** recorded for
each slice, in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) rather than here — see
§ Foundation & security above for what is and is not established about test runs. **This document
runs nothing**; it cites those records.

### What is not built

**[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 12 is the authoritative gap list** and is
not copied here. Two gaps matter most to anyone reading this document cold:

- **There is a delivery, receipt and cancellation record, but no fulfilment verdict.** PR #54
  added the immutable, server-derived `barter_obligations` pair; PR #56 added the two participant
  actions and the four-value `status` that records **what happened**; PR #58 added the ordinary
  pre-delivery exit; PR #62 added the PD-057 response window and **Needs Attention**. That last
  one is the distinction this bullet turns on: Needs Attention is an **unresolved operational
  state, derived per read**, and it is precisely NOT an outcome. Everything that would turn these
  events into an outcome remains unbuilt, and is asserted absent rather than assumed: **no 7-day
  timeout TRANSITION (the window creates no status change — an elapsed window leaves the row
  `delivered` and the receiver may still answer), no automatic fulfilment, no automatic
  completion, no reviews-on-barter, no reputation and no push notifications.**

  > **⚠️ CORRECTED 2026-09-08.** This bullet used to also assert "no adjudication, no operator
  > decision path, no terminal obligation outcome (Fulfilled / Unfulfilled / Closed Without
  > Resolution), no terminal agreement outcome." **The first three are now FALSE** and were made
  > so by PR #68 (`5c24e8f`, PD-064 … PD-067): an authorized operator — and nobody else, never a
  > participant — can resolve an obligation that is **Under Review** as **Fulfilled**,
  > **Unfulfilled** or **Closed without resolution**, through `adjudicate_barter_obligation`,
  > whose `EXECUTE` is granted to `service_role` alone. The record is immutable.
  > **NO OPERATOR SURFACE IS SHIPPED**, so nothing in the running product calls it — a minimal
  > internal Review Queue is a **pre-beta requirement** (PD-068), and no resolution SLA is
  > promised to anyone.
  >
  > **"No terminal agreement outcome" REMAINS TRUE and is now permanent** rather than pending:
  > PD-070 rules that agreement-level resolution is **derived** from the immutable obligation
  > facts and never stored. There is no `Completed`, `Partially Fulfilled` or `Not Completed`
  > column, status or verdict, and none is coming.
  >
  > **Also changed since this anchor:** the barter **estimated-value** field is gone from the
  > live product (PD-069) — no composer input, no `~$N value` board badge, no live read of
  > `offering_value`, which is now deprecated legacy data the server refuses to write.

  **NO-SHOW AND UNDER REVIEW ARE THE EXCEPTIONS, AND THEY ARE NOT OUTCOMES EITHER.** A receiver
  may now report that a SCHEDULED service did not happen, and that report — or a plain
  `not_received` answer — puts the obligation into **Under Review**, meaning a human must look.
  Under Review is derived per read like Needs Attention: no status value, no column, no case
  table, and nothing moves on a timer. It decides no fault and produces no outcome, and the
  receiver's controls stay live beneath it.
  **Under Review OUTRANKS the ordinary exit** (PD-063): once a report exists,
  `cancel_barter_agreement` refuses with `PT423` and the control is no longer offered — a trade
  cannot be cancelled out of review, and a cancellation can never erase or hide a recorded
  report. Cancel-first refuses a later report (`PT409`); a race resolves to exactly one state,
  because both writers take the agreement row lock first. **The reason is participant-visible
  context** (PD-062): both participants read it, non-participants and anon cannot, and the UI
  attributes it as the reporting participant's STATEMENT with the sharing disclosed above the
  input. Reporting is **receiver-only**, only for an obligation with a non-null `scheduled_at`,
  only **at or after** it, and only against **server time** — the RPC has no `p_as_of` and no
  client value reaches the comparison. The report itself is **immutable participant-reported
  history**: append-only, one per obligation, server-stamped on every insert path, and a repeat
  returns the original timestamp. **A no-show does NOT automatically mean Needs Attention,
  Unfulfilled, a reliability impact, a reputation impact or any terminal outcome** — asserted
  directly rather than assumed.
  **Needs Attention is a separate, unchanged route** — it does not enter Under Review, and
  **how it might later remains UNRESOLVED and deliberately so**: no second timer, no automatic
  escalation, no participant escalation action and no operator auto-escalation exists, and the
  question is filed for the adjudication / review workflow (recorded in
  [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) § Closed — index, and in the migration's own header,
  `20261012000000:38-52`).
  (`supabase/migrations/20261012000000_barter_no_show_under_review.sql` through
  `20261018000000_no_show_created_at_server_stamped.sql` — **seven** files;
  `supabase/tests/no_show_under_review.test.sql`; PD-062, PD-063.) PD-046 § 7.3–7.5 and § 7 of the
  contract are **partly** implemented by that work — the routes exist, the outcomes do not; PD-057
  is now **implemented** and
  its expiry still never means Fulfilled or Completed — asserted directly, not assumed
  (`supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql`;
  `supabase/tests/receiver_window.test.sql` §§ 4, 14;
  `supabase/tests/cancellation.test.sql:697-722`). **Cancelling implies none of them**: it is an
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

**The PR #62 revision was verified to a WEAKER standard, and says so rather than borrowing the
two above.** Every source claim in § Barter was read from files on this tree — the migration, the
five client modules, the two screens, `supabase/tests/receiver_window.test.sql` and its
registration line in `scripts/db-security-test.mjs`. The reconciliation that wrote it had **no
shell** and recorded the merge provenance as attested; **each of those gaps has since been closed
with the command it named**, on 2026-09-07:

- `gh pr view 62` — **MERGED into `main` 2026-09-07T19:19:18Z**, squash, merge commit `26fb7fd`;
  `main` locally equals `origin/main` and the working tree is clean.
- `gh run list --branch main` — post-merge CI for `26fb7fd` is
  [run 34155130832](https://github.com/sntimmons/the_book/actions/runs/34155130832), **success**.
- `supabase migration list` — **50** versions, local == remote, no drift.
- B5B **985/985** and concurrency **102/102** were **re-run against merged `main`**, alongside
  `tsc --noEmit` clean, `lint:ci` 0 errors and Jest **605/605**.

**The PR #64 revision is verified to the WEAKER standard, and says so rather than borrowing the
three above.** Every source claim in § Barter was read from files on this tree — the seven
migrations `20261012000000` … `20261018000000`, `lib/obligationState.ts`, `lib/tradeActivity.ts`,
`lib/tradeCancellation.ts`, `lib/negotiation.ts`, `lib/barter.ts`, `lib/barterErrors.ts`,
`app/community/negotiation/[id].tsx`, `supabase/tests/no_show_under_review.test.sql`,
`__tests__/lib/underReview.test.ts` and the registration line at `scripts/db-security-test.mjs:53`.
This reconciliation had **no shell**, so the following are **attested as supplied in the
invocation and not independently confirmed**: that `main` is `23df39c`, that it equals
`origin/main` with a clean tree, that PR #64 was squash-merged onto base `ddcb229` (PR #63), that
post-merge CI on `main` is [run 34165346538](https://github.com/sntimmons/the_book/actions/runs/34165346538)
with conclusion **success**, and that `supabase migration list` reports 57 versions with local ==
remote and no drift. The B5B and concurrency figures are read from
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md), not re-run here. Closing those gaps takes
`gh pr view 64`, `git rev-parse`, `gh run view 34165346538` and `supabase migration list`.

**The PR #66 revision is verified to the WEAKEST standard of the four, and says so.** Every source
claim in § Barter was **re-read from files on this tree at `0f2b93c`** — `lib/obligationState.ts`,
`lib/tradeCancellation.ts`, `lib/tradeActivity.ts`, `lib/negotiation.ts`, `lib/negotiationState.ts`,
`lib/barterErrors.ts`, the new `components/ReasonComposer.tsx`, both community screens,
`__tests__/lib/obligationViewShape.test.ts`, `__tests__/components/ReasonComposer.test.tsx` and the
migration inventory — and every line citation in that section was re-derived rather than carried
forward. This reconciliation had **no shell**, so it verified provenance only from files: `.git/HEAD`,
`.git/refs/heads/main` and `.git/refs/remotes/origin/main` (all `0f2b93c…`, local `main` ==
`origin/main`) and `.git/logs/HEAD`, which shows `main` moving `23df39c` → `1c0fe54` →
`0f2b93c` and the branch `refactor/barter-pre-adjudication-cleanup` cut from `1c0fe54`. The
following are **attested as supplied in the invocation and not independently confirmed**: that
PR #66 was squash-merged, that PR #65 is `1c0fe54`, that the working tree is clean, that post-merge
CI on `main` is [run 34181613351](https://github.com/sntimmons/the_book/actions/runs/34181613351)
(**success**), that `supabase migration list` reports 57 versions with local == remote and no
drift, that `git diff 1c0fe54 -- supabase/` was empty, and the figures **B5B 1097/1097**,
**concurrency 129/129**, **Jest 663/663**, typecheck clean and lint 0 errors. `gh pr view 66`,
`git rev-parse`, `gh run view 34181613351`, `git diff 1c0fe54 -- supabase/` and
`supabase migration list` close that gap in five commands.

What that still does **not** establish: runtime behaviour on a device, live database contents
beyond the migration list, or anything about production — which remains out of scope and was
never queried.
