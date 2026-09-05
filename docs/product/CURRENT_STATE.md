# Current State — what is true on `main` today

**Status:** Authoritative (current-state). Maintained by the Project State Steward.
**Reconciled against:** `main` @ `feba568a900401e3e8dffc560ea5e214cb9be38c` (2026-09-04)
**Last edited by:** PR #40

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

**Migration ledger.** The repository holds **15 migration files** at `feba568` — counted from
`supabase/migrations/*.sql`, and that part is repository-provable. That the *remote non-prod
ledger* matches them (`local == remote`, no merged migration edited) was established by
`supabase migration list --linked` — 14 entries on 2026-09-02, and 15 after
`20260906000000` was applied to non-production on 2026-09-03 by an ordinary forward
`db push` (no repair; no drift existed). Neither **can be re-proved from repository state**;
a later change made outside this repo would not show up here. Process and the dated record:
**[docs/operations/MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)**.

**Latest recorded runs.** Rather than restate counts that change with ordinary PRs, this
records *which runs* to look at. Two different things are recorded, and they are not
interchangeable:

- **The last CI run this reconciliation could cite** is **33726878929** on `e7ccd87` —
  `check` and `db-security` both green, the B5B step logging `via TEST_SUPABASE_DB_URL`,
  88/88. At that run: Jest 22 suites / 251 tests, lint 0 errors within the frozen
  `--max-warnings` baseline in `package.json`, typecheck 0 errors. **No CI run for
  `feba568` is cited here**, because CI status is GitHub state and this reconciliation had
  no way to query it. Read the latest `check` and `db-security` runs directly.
- **The last recorded B5B execution** is the post-apply run logged against
  `20260906000000` in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md): **138/138 passed, 0 failed**,
  transaction rolled back. That was a local non-prod run, not a CI run.

The suite grew between them — `supabase/tests/barter.test.sql` was added by Slice 1 — which
is exactly why the count is read from a run rather than from this document. The
authoritative description of the harness lives in
[supabase/tests/README.md](../../supabase/tests/README.md).

**Why this document's anchor is now `feba568`.** The previous anchor was `e7ccd87`, and it
held while the merges after it (#32 … #37) changed nothing *this document* asserts. Slice 1
(PR #38, merge `feba568`) did: it added the fifteenth migration, replaced six barter write
policies, added five triggers and two indexes, added a B5B suite, and changed two community
screens. Those are facts asserted above, so the anchor moves to the commit at which they
were verified.

[ROADMAP.md](ROADMAP.md) remains authoritative for **which** merge delivered **which**
capability — it carries a Completed row per delivered capability, each citing its merge,
under its own anchor. This document deliberately does not restate that; a second copy would
drift. An anchor is per-document: it moves when that document's own asserted facts move, not
whenever `main` does, which is why this file and `ROADMAP.md` can carry different anchors.

**Two sessions preceding Slice 1 left no artifact in this repository.** The Slice 1 migration
header cites a "Session 4 audit" and a "Session 5 agent review" (line 9) and a plan clause
"E-3" (line 36), and the defect IDs it closes (`SEC-AUTHZ-001`, `SEC-DATA-009`, …) appear
nowhere else on `main`. Session 4 was a read-only audit and Session 5 produced a product
contract and implementation plan; **neither is committed here**, so the only in-repo record of
either is the migration comment that cites them. That is recorded as a fact about the
repository, not as a criticism of the work — but it means a cold reader cannot reconstruct
why each defect was ranked as it was, and `ROADMAP.md` carries no Completed row for either
session, because a row needs an artifact on `main`.

---

## Barter — existing surface, integrity-hardened (Slice 1)

**Barter is not a blank slate.** [BETA_SCOPE.md](BETA_SCOPE.md) classifies the community /
barter *surface* as **REAL (beta)** — offers, interests and the community screens work. What
is **not** established is the barter *product model*: how a trade binds to bookings,
messaging, reviews and completion. That gap is why it had to be **audited read-only before any
redesign** (PD-033), not a claim that the surface was broken.

**Slice 1 snapshot (`feba568`), NOT current truth.** The table and notes below record barter as
it stood after Slice 1. Four slices have merged since — see the index further down for what each
changed and which document owns it. Read this section as history:

| Surface | Evidence |
|---|---|
| Data model | `barter_offers`, `barter_interests` tables |
| RLS — reads | `barter_offers_provider_read`, `barter_interests_offer_owner_read`. Both are **unchanged by Slice 1**, deliberately: the migration header (lines 40–48) records that gating the board on provider eligibility is a separate decision, and that gating the responses read on it would be actively wrong — a de-approved provider would lose sight of responses already sent to them. |
| RLS — writes | Replaced by Slice 1: `barter_offers_provider_insert`, `barter_offers_owner_update`, `barter_offers_owner_delete`, `barter_interests_provider_insert`, `barter_interests_owner_update`, `barter_interests_own_delete` |
| Constraints (baseline) | `barter_offers_offering_service_check`, `_seeking_service_check`, `_notes_check`; `barter_interests_status_check`, `_message_check`; unique `(offer_id, interested_provider_id)` |
| Client library | `lib/barter.ts` — `BarterOffer`, `BarterInterest`, `BarterOfferWithProvider`, `fetchBarterFeed()`, `fetchMyInterests()`, `fetchOfferInterests()` |
| Screens | `app/community/barter-compose.tsx`, `app/community/barter-interests.tsx`, referenced from `app/community/index.tsx` |
| Origin | `supabase/migrations/20260829000000_canonical_live_baseline.sql` |

**Slice 1 — integrity hardening of that existing surface** (PR #38, merge `feba568`).
Migration `supabase/migrations/20260906000000_barter_integrity_slice1.sql` is authoritative
for exactly what it does and, in its own header, for what it deliberately did not do; this
is an orientation summary, not a second copy of it. Enforced **server-side**:

- **Write identity is bound to the caller.** One named predicate, `caller_provider_id()`,
  takes no argument and derives the provider from `auth.uid()`, so nothing client-supplied
  enters the comparison. It backs the three write-identity policies — offers insert, offers
  update, interests insert (§§ 1–3).
- **An offer owner may change exactly one column on a counterparty's response:** `status`.
  Enforced by a trigger with an **allow-list**, so a column added later is immutable by
  default (§ 5). Legal transitions are `pending → accepted | declined` only.
- **Counterparty history survives one participant.** Deleting an offer that has responses is
  refused; the owner closes it instead (`is_active = false`, `app/community/index.tsx:398`).
  An accepted or declined response cannot be erased by either side (§ 4).
- **`created_at` is server-stamped** on both tables, and **at most one accepted response per
  offer** is enforced by a partial unique index rather than a read-then-write check (§§ 5–7).
- **Interest writes are rate-limited in the write path** (15 per 24h, § 9), counted from
  `rate_limit_log` so delete-and-resend cannot reset the window.
- **`anon` holds nothing** on either barter table (§ 10).

Regression coverage: `supabase/tests/barter.test.sql`, registered in the B5B runner at
`scripts/db-security-test.mjs:47`.

**Still true after Slice 1**, and recorded so it is not mistaken for closed:

- **Offer creation is still limited only by the client-invoked edge function**, which fails
  open (`lib/rateLimit.ts:50-65`, called at `app/community/barter-compose.tsx:55`). A caller
  that omits the call is unlimited on offers. The migration header records this as a
  partial closure, not a closure.
- ~~**Accept is a client-orchestrated sequence, not one atomic step.**~~ **SUPERSEDED** — see
  the Slice 2 note below. Accept is now one RPC.
- **Offer terms stay editable by their author after responses exist** — OQ-008, **closed
  2026-09-04**: the post stays editable and any agreement must snapshot its terms. See
  `PRODUCT_DECISIONS.md` PD-047.
- Slice 1 created **no** agreement or obligation schema and touched neither `bookings` nor
  the reviews surface.

**Slices 2, 2B, 3a-0, 3a-0b and 3a-0c ARE now on `main`** (as of `27756bb`, twenty-three
migrations, the newest `20260914000000`). This section above describes `main` at `feba568` and is **kept as a
Slice 1 record, not as current truth**. What changed since, in one line each — the owning
document is authoritative for all of it:

| Slice | Migration | What it changed | Owner |
|---|---|---|---|
| 2 | `20260907000000` | Accept became **one atomic RPC** (`accept_barter_interest`), not a client sequence | `MIGRATION_LEDGER.md` |
| 2B | `20260908000000` | One canonical conversation per provider pair, enforced in the DB | `MIGRATION_LEDGER.md` |
| 3a-0 | `20260909000000` | `released` status: a dead negotiation frees the post's slot | PD-049 |
| 3a-0b | `20260910000000`, `20260911000000` | Server-authored release notice (`sender_id IS NULL`); message authorship pinned | PD-049, `BARTER_BETA_CONTRACT.md` § 3.2 |
| 3a-0c | `20260912000000`–`20260914000000` | **Trade Activity** (`/community/trade-activity`), durable negotiation access; a closed post cannot select a new response | PD-050 |

**Not yet on `main`:** the closed-post-terminal cleanup (PD-051, PD-052 — closing is one-way and
a closed post's responses cannot be answered at all) is in flight on
`chore/barter-closed-post-terminal` (PR #47), with migrations `20260915000000` and
`20260916000000`. Do not read PD-051 or PD-052 as describing `main` until that merges.

> **This barter section is due a full Project State Steward reconciliation.** It was written
> for Slice 1 and has been corrected in place rather than rewritten, because a reconciliation
> pass is the Steward's scope and this is not it. Treat the table above as the index, and the
> owning documents as the truth.

Open barter questions: OQ-001 … OQ-008 in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md). None of
them is closed by Slice 1: a migration is an implementation, not an approval.

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
