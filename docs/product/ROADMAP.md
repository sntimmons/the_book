# Roadmap — session-based

**Status:** Authoritative for sequencing. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `e7ccd87f766a5b30e66a60ccc1239955d129a090` (2026-09-03)

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
| Post-Session-3 state reconciliation (docs only; merged **after** #31) | [#30](https://github.com/sntimmons/the_book/pull/30) | `e7ccd87` (commit `0aab9b0`) | **modified by** #30: `CURRENT_STATE.md`, `ROADMAP.md`, `OPEN_QUESTIONS.md` (schema-normalised, OQ-070 added), `supabase/tests/README.md`, `supabase/README.md`, `CONTRIBUTING.md`, `docs/README.md` |

**This table lists session-level work, not every merged PR.** Smaller merges (e.g. #18, #23,
#25) are not rows here; `git log --merges main` is the complete record.

**Why #30 and #31 earn rows despite being small.** They change *this record itself* — the PM
document set and the schema governing it. A merge that alters what the roadmap claims has to
appear in the roadmap, or the table silently stops describing its own provenance. Size is not
the test; whether the merge moves the project record is.

**Evidence convention.** *Merge SHA* is the merge commit on `main`; where a single
implementation commit is more informative it is named in parentheses. Every row above was
verified against `gh pr list --state merged` and `git log --merges main` — no PR number or
SHA is inferred. A row that could not be tied to a specific PR would say so rather than
guess; none currently needs that.

**Existence is not evidence.** Where a row's artifact is a file that *pre-dates* its PR, the
row says "modified by" and is evidenced by that PR's diff — not by the file being present.
A path that existed before the work cannot prove the work happened.

---

## Current

**Nothing in flight.** Session 3 merged (PR #29, `2ae0fd0`), followed by two
documentation/governance merges — #31 (`f4e8d86`, the `Area` enum) and #30 (`e7ccd87`, this
reconciliation), in that order. **Session 4 has not started.**

---

## Next

### Session 4 — Existing barter audit (READ ONLY) — NOT STARTED
Barter is **already partially implemented** (PD-033). This session audits it and changes
nothing. It must establish: routes, components, data model, migrations, policies/RLS,
messaging integration, booking integration, reviews/completion integration, architecture
assumptions, security and trust risks, anti-gaming and reputation implications, what is
usable, what should be salvaged, what needs bounded rebuilding, and the minimum change
needed for the Houston beta. Answers OQ-007.

### Session 5 — Barter product decisions + bounded implementation plan
Resolve OQ-001 … OQ-006 into locked decisions. Produce a bounded plan. Begin only
approved fixes. No trade credits, wallets, multiparty swaps or valuation engines (PD-032).

### Sessions 6–7 — Barter / community beta readiness

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
- Agents 1–3 stay read-only; the Steward's writes stay inside its five-file allowlist.
- No session marks its own work complete — evidence on `main` does.
