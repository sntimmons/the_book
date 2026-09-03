# Current State — what is true on `main` today

**Status:** Authoritative (current-state). Maintained by the Project State Steward.
**Reconciled against:** `main` @ `e7ccd87f766a5b30e66a60ccc1239955d129a090` (2026-09-03)
**Last edited by:** PR #36

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

**Migration ledger.** The repository holds **14 migration files** at `e7ccd87` — that part is
repository-provable. That the *remote non-prod ledger* matches them (`local == remote`, no
merged migration edited) was established by `supabase migration list --linked` on 2026-09-02
and **cannot be re-proved from repository state**; a later change made outside this repo would
not show up here. Process and the dated record:
**[docs/operations/MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)**.

**Latest recorded gate run.** Rather than restate counts that change with ordinary PRs,
this records *which run* to look at: CI run **33726878929** on `e7ccd87` — `check` and
`db-security` both green, with the B5B step logging `via TEST_SUPABASE_DB_URL`. The
authoritative assertion count lives with the harness in
[supabase/tests/README.md](../../supabase/tests/README.md), not here.

At that run: Jest 22 suites / 251 tests, lint 0 errors within the frozen `--max-warnings`
baseline in `package.json`, typecheck 0 errors, B5B all assertions passing. Exact counts
move; check the run, not this sentence.

`main` is healthy following **Session 3** (PR #29, merge `2ae0fd0`), which added the Project
State Steward and this durable PM document set. Several documentation and governance
follow-ups have merged since — #31 (the Steward's `Area` enum, merged **first**, so the new
open question's area was already declared when it arrived), then #30, #32, #33 and #34.

None of them changed application behaviour, migrations, RLS, CI, or agent tool grants. That is
the whole of the claim; it does **not** mean none of them changed a repository fact. #31 and
#33 delivered governance capability — a declared `Area` value and the Steward's reconciliation
contract — which is why each earns a ROADMAP row and why ROADMAP's anchor advances to the
merge that delivered the artifact it cites.

**This document's** anchor stays at `e7ccd87` because nothing it asserts changed after that
commit: the 14 migration files, the agent grant and allowlist, the reviews and messaging
surfaces, and every code path cited below are unchanged. An anchor is per-document — it moves
when *that document's* asserted facts move, not whenever `main` does.

---

## Barter — already partially implemented

**Barter is not a blank slate.** [BETA_SCOPE.md](BETA_SCOPE.md) classifies the community /
barter *surface* as **REAL (beta)** — offers, interests and the community screens work. What
is **not** established is the barter *product model*: how a trade binds to bookings,
messaging, reviews and completion. That gap is why it must be **audited read-only before any
redesign** (PD-033), not a claim that the surface is broken.

What is present on `main`:

| Surface | Evidence |
|---|---|
| Data model | `barter_offers`, `barter_interests` tables |
| RLS | `barter_offers_provider_read/insert`, `barter_offers_owner_update/delete`, `barter_interests_offer_owner_read`, `barter_interests_provider_insert`, `barter_interests_owner_update`, `barter_interests_own_delete` |
| Constraints | `barter_offers_offering_service_check`, `_seeking_service_check`, `_notes_check`; `barter_interests_status_check`, `_message_check`; unique `(offer_id, interested_provider_id)` |
| Client library | `lib/barter.ts` — `BarterOffer`, `BarterInterest`, `BarterOfferWithProvider`, `fetchBarterFeed()`, `fetchMyInterests()`, `fetchOfferInterests()` |
| Screens | `app/community/barter-compose.tsx`, `app/community/barter-interests.tsx`, referenced from `app/community/index.tsx` |
| Origin | `supabase/migrations/20260829000000_canonical_live_baseline.sql` |

**Not yet established** (this is what the Session 4 audit must determine, not assume):
how offers relate to bookings, whether barter touches messaging or reviews/completion at
all, what architecture assumptions it encodes, its security and anti-gaming posture, what
is usable as-is, what should be salvaged, what needs bounded rebuilding, and the minimum
change needed for the Houston beta.

Open barter questions: OQ-001 … OQ-007 in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

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
