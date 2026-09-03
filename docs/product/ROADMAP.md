# Roadmap — session-based

**Status:** Authoritative for sequencing. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `b3756d9db8651fe7347f8a1bc392651dbd755839` (2026-09-03)

> **This is an estimate based on current project pace, not a deadline commitment.**
> Work is sequenced by **session**, not by calendar date, deliberately. Sessions vary in
> size, findings reorder priorities, and a review that surfaces a real defect is worth
> more than hitting a date. Nothing here is a promise to anyone.

Sessions may merge, split, or reorder. A session is "complete" only when its work is
**merged to `main`** with evidence — not when a summary says so.

---

## Completed

| Session / work | Evidence |
|---|---|
| Messaging foundation — pre-booking request model | `20260901000000_prebooking_message_requests.sql` |
| Messaging concurrency hardening — row lock closing the one-message race | `20260901010000_prebooking_message_concurrency.sql` |
| Agent framework — Agents 1–3, versioned specs + adapters | `.agents/`, `.claude/agents/` |
| Reviews Phase 0 — server-authoritative eligibility, reveal, `completed_at` | `20260902000000`, PR #24 |
| Reviews Phase 1 — UX consumes the Phase 0 contract | `20260903000000`, `20260904000000`, PR #26 (`06bff77`) |
| Session 2 — foundation cleanup | PR #27 (`af2429b`, `40f5764`), merged at `257dd5b` |
| ├ review-entry authority (no live-status gating) | `20260905000000` batch RPC |
| ├ permanent B5B DB/security coverage — 88 assertions | `supabase/tests/`, `scripts/db-security-test.mjs` |
| └ migration-ledger reconciliation | `docs/operations/MIGRATION_LEDGER.md` |
| Repo `tmp/` hygiene | PR #28, merged at `b3756d9` |

---

## Current

### Session 3 — Project State Steward, durable PM docs, Houston Beta Strategy
Documentation and agent infrastructure only. No application behaviour, migrations, RLS
or CI changes.

- Project State Steward agent (`.agents/project-state-steward/`)
- `CURRENT_STATE.md`, `ROADMAP.md`, `OPEN_QUESTIONS.md`, `PRODUCT_DECISIONS.md`
- `HOUSTON_BETA_STRATEGY.md`

---

## Next

### Session 4 — Existing barter audit (READ ONLY)
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
