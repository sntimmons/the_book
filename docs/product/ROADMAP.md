# Roadmap — session-based

**Status:** Authoritative for sequencing. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `feba568a900401e3e8dffc560ea5e214cb9be38c` (2026-09-04)
**Last edited by:** branch `chore/post-slice1-state-reconcile` — PR number not assigned at
authoring time; replace this with `PR #NN` when the PR is opened.

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

**One row is evidenced differently, and says so.** The **Slice 1** row's merge SHA `feba568`
was read from `.git/refs/heads/main` and `.git/refs/remotes/origin/main`, and its artifacts
were verified in the working tree — but its **PR number, #38, was supplied by the
reconciliation invocation and not independently confirmed**, because that run had no shell and
so could not call `gh`. The capability and the SHA are proven; the PR number is attested. Any
row that cannot be tied to a PR must say which part is attested rather than present the whole
row as verified.

**Existence is not evidence.** Where a row's artifact is a file that *pre-dates* its PR, the
row says "modified by" and is evidenced by that PR's diff — not by the file being present.
A path that existed before the work cannot prove the work happened.

**Why Sessions 4 and 5 have no rows.** Both were performed — the Slice 1 migration header
cites a "Session 4 audit" and a "Session 5 agent review" (line 9), a plan clause "E-3"
(line 36), and a beta working limit attributed to "E" (line 475). But **neither session's
output is committed to this repository**: there is no barter audit document and no barter
product contract or implementation plan on `main`. A Completed row requires a verified
artifact on `main`, so neither session gets one, and this note stands in its place rather
than a row with nothing behind it. If those documents are meant to live in the repository,
committing them is a separate, ordinary change — not something a reconciliation can do.

---

## Current

**Barter Slice 2 — accept → conversation handoff. In flight, NOT merged.** The work is on
branch `feature/barter-slice2-handoff`, open as **PR #39**. **Nothing from it is on `main`:**
`main` holds fifteen migrations, the newest being `20260906000000_barter_integrity_slice1.sql`,
and there is no Slice 2 migration among them. Until it merges, the accept path on `main` is
the client-orchestrated sequence described in
[CURRENT_STATE.md](CURRENT_STATE.md) § Barter. It earns no row here and no anchor movement.

Preceding this: Session 3 merged (PR #29, `2ae0fd0`), then documentation and governance
merges — #31 (`f4e8d86`, the `Area` enum) first, then #30 (`e7ccd87`), #32 (`f83bea2`),
#33 (`ad95855`, which introduced this convention), #34 (`dbe5dd7`), #35 (`395495e`, the
tiebreak that resolved it), #36 and #37. Per the row inclusion rule above, #31,
#33 and #35 earned Completed rows; #30, #32, #34, #36 and #37 did not. Then the barter work:
Sessions 4 and 5 (no in-repo artifact — see the note above) and Slice 1 (**PR #38**,
`feba568`), which did earn a row and moved this document's anchor.

### Outstanding from Sessions 4 and 5 — a bookkeeping gap, not an engineering one

Both sessions ran; neither committed its output here (see the note above). Two things they
were scoped to produce are still absent from `main`:

1. **OQ-001 … OQ-007 are all still Open** in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), and
   [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) contains no barter `PD-NNN` beyond
   PD-030 … PD-033. Session 5 was scoped to "resolve OQ-001 … OQ-006 into locked
   decisions"; whatever it concluded is not in the decision ledger.
2. **The Slice 1 migration acts on rulings the ledger does not hold** — a quoted Founder
   ruling at lines 258–259, a plan clause "E-3" at line 36, and a beta working limit
   attributed to "E" at line 475. Code now enforces them; the ledger does not record them.

Neither is something a reconciliation may fix: transcribing a decision requires the approval,
not the implementation that followed it. **A migration is an implementation, not an
approval.** Until they are recorded, a reader of the decision ledger cannot tell that these
rules were decided at all.

---

## Next

### Sessions 6–7 — Barter / community beta readiness
Slice 1 (PR #38) hardened the existing surface. Slice 2 (accept → conversation handoff) is in
flight as PR #39 and is **not** on `main`. The Slice 1 migration header names what it
deliberately left for a later slice — provider-eligibility gating of the barter surface,
`updated_at` / status-transition timestamps, and offer-term immutability once a response
exists (OQ-008). Barter completion, trade history, notifications, blocking and reputation are
recorded there as Session 6 scope.

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
