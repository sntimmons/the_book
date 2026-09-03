# Project State Steward — Sources & Context Loading

Deterministic loading. Never dump the whole repo into a reconciliation.

## Always load (small, fixed)

- `AGENTS.md` — authority hierarchy, information classes, vocabulary
- `docs/README.md` — the documentation index and status legend
- `docs/product/CURRENT_STATE.md` — the previous reconciliation's output
- `docs/product/PRODUCT_DECISIONS.md` and `docs/product/OPEN_QUESTIONS.md`
- `docs/product/ROADMAP.md`

## Verification sources (load by claim, not wholesale)

| Claim area | Where the evidence lives |
|---|---|
| Navigation | `docs/architecture/NAVIGATION.md`, `app/(tabs)/_layout.tsx` |
| Product surface truth | `docs/product/BETA_SCOPE.md` |
| Journeys | `docs/product/USER_JOURNEYS.md` |
| Reviews | `docs/product/REVIEWS_MODEL.md`, `supabase/migrations/2026090*`, `lib/reviews.ts` |
| Messaging | `supabase/migrations/20260901*`, `hooks/useMessaging`, `app/messages/` |
| Barter | `lib/barter.ts`, `app/community/`, barter tables in the canonical baseline |
| DB/security coverage | `supabase/tests/README.md`, `supabase/tests/*.test.sql`, `scripts/db-security-test.mjs` |
| CI | `.github/workflows/ci.yml` |
| Migration ledger | `docs/operations/MIGRATION_LEDGER.md` |
| Merged work | `git log --oneline --merges`, `gh pr view <n>` when available |

## Anchoring information the INVOKER must supply

The Steward has **no `Bash` tool** and cannot run these itself. Whoever invokes it should
supply the output, or the Steward records the gap under `COULD NOT VERIFY`:

```bash
git rev-parse HEAD                       # anchor SHA
git log --oneline --merges -10           # what merged
git log --oneline <lastSHA>..HEAD        # since last reconciliation
```

The migration inventory *is* readable with `Glob` (`supabase/migrations/*.sql`), as is every
other file-based source below.

## Evidence the Steward CANNOT gather (must disclose)

- Whether the app behaves correctly at runtime (no device/simulator)
- Whether tests currently pass (does not run them; cite the last recorded run instead)
- Live database state, grants, or policies as deployed
- CI status, unless `gh` is available and the invoker asked for it
- Anything about production — explicitly out of scope

## Historical (reference only, never authoritative)

`docs/history/**`, `docs/audits/**` — dated snapshots. Useful for how the product got
here; never cite as current state.
