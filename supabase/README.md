# The Book — Supabase

**Status:** current entry point for the Supabase side of the repo. Short by design — it
routes you to the authoritative document for each question rather than restating it.

## Where the schema actually lives

The **active schema history is `supabase/migrations/`**, applied in filename order. It
begins at the canonical baseline:

```
supabase/migrations/20260829000000_canonical_live_baseline.sql
```

That baseline was derived from the live database and verified to reproduce on a fresh
non-production project (Batches F3–F5 / 6AB). Every change since is a separate timestamped
migration. **Add a new migration for every schema change — never edit the schema in the
Supabase dashboard, and never edit a migration that has already merged.**

## Historical material — reference only, do not apply

`supabase/migrations_history/pre_canonical/` holds the pre-canonical files, including
`20240101000000_baseline_schema.sql`. That file was a **reconstruction from code analysis**,
not a real migration history, and it is **not** the deployment source.

> **Do not paste it into the SQL Editor and do not run it.** It predates the canonical
> baseline and the security batches, so applying it would roll schema and RLS backwards.
> Earlier revisions of this README instructed exactly that; those instructions are
> withdrawn.

Everything under `migrations_history/` exists so the history is readable, nothing more.

## Which migrations are applied where

**[docs/operations/MIGRATION_LEDGER.md](../docs/operations/MIGRATION_LEDGER.md)** is
authoritative for reconciliation, and for the rule that a migration is only marked applied
after its deployed objects are compared against the file — never because a name matches.

That ledger is **non-production only**. The repo is ahead of production: "reconciled"
refers to the canonical baseline, and the migrations added since are recorded against the
non-production project. The last recorded production state is **8 migrations** (Batches
6AB / 6D). **Never assume a migration in this directory exists in production.**

## Barter trigger ordering

PostgreSQL fires `BEFORE` triggers in name order. The barter write triggers use that ordering
deliberately: `write_integrity` owns transition validity and must sort first; later `zx`, `zy`
and `zz` triggers add narrower lifecycle/rate-limit rules whose names carry semantic meaning.
For example, "confirmed trade" must beat a more general closed-post refusal, while an illegal
transition still belongs to write integrity. `supabase/tests/barter.test.sql` pins the order.

## Setup and contribution

- Install, run, environment configuration → **[README.md](../README.md)**
- How to change things safely (branching, migrations, review gates) →
  **[CONTRIBUTING.md](../CONTRIBUTING.md)**
- What is true today across the product → **[docs/product/CURRENT_STATE.md](../docs/product/CURRENT_STATE.md)**
- Documentation index and status legend → **[docs/README.md](../docs/README.md)**
- Seeding a **non-production** project → `scripts/seed-nonprod.mjs` (reserved test identities;
  refuses the production project ref)

## What else is in this directory

| Path | What it is |
|---|---|
| `migrations/` | **Active** schema history — the deployment source |
| `migrations_history/pre_canonical/` | Superseded files, reference only — never apply |
| `functions/rate-limit/` | The `rate-limit` Edge Function — see [its README](functions/README.md) |
| `tests/` | The B5B executable DB/security harness — see [its README](tests/README.md) |
| `feature_interest.sql`, `feature_interest_count.sql` | Loose, **non-migration** SQL — see below |

### Two loose SQL files (not part of the migration chain)

`feature_interest.sql` and `feature_interest_count.sql` sit outside `migrations/` and carry
instructions to run them in the SQL Editor. They pre-date the migration rule above.

- `feature_interest.sql` is **superseded** — the `feature_interest` table is now in the
  canonical baseline. Do not run it.
- `feature_interest_count()` is **defined in no migration**, yet the app calls it
  (`components/ComingSoonInterest.tsx`), and the canonical baseline notes it as absent live.

Whether that function should be folded into a forward migration, retired, or kept as a
documented exception is **an open schema question, not settled here** — recorded as **OQ-070**
in [docs/product/OPEN_QUESTIONS.md](../docs/product/OPEN_QUESTIONS.md). Flagged so the gap is
visible rather than implied away by "migrations/ is the deployment source".

## A note on the security posture

Earlier revisions of this file described RLS as "the *intended* baseline, not a dump of
production… recommendations to reconcile, not ground truth", and listed booking
write-integrity and storage policies as unfinished. **Those caveats are superseded**, and
each by a specific migration you can read:

| Old caveat | Closed by |
|---|---|
| "RLS policies are the *intended* baseline, not a dump of production" | `20260829000000_canonical_live_baseline.sql` — production-derived, 109 policies |
| "Booking write-integrity is not fully locked" | `20260830010000_security_batch_3b_booking_write_integrity.sql` (extended by `20260902000000`, `20260904000000`) |
| "Storage bucket policies are not included" | `20260829030000_security_batch_2a_provider_media_ownership.sql`, `20260829060000_security_batch_2b_contract_storage_scoping.sql` |

Do not use the old wording to justify treating current policies as provisional — each was
closed by a migration you can read above.

Be precise about what is *regression-tested*, though: the B5B harness in `tests/` asserts the
**review and pre-booking-messaging** boundaries against a real database, including
`enforce_booking_write_integrity`. Since Pre-Beta Correction 2 it **also** asserts the provider
public column surface, contract ownership binding, the prospective-client contract read,
`posts-media` object ownership and the default-privilege posture
(`tests/authorization_boundaries.test.sql`). It still does **not** cover contract PDF/signature
storage access or payments — see [tests/README.md](tests/README.md) § "Out of scope".
Closed-by-migration and asserted-by-harness are different guarantees; only the second catches a
regression.

### The privilege layer, after Pre-Beta Correction 2

Four things are now true of `public` that were not, each reproduced at runtime before being fixed
and pinned by the harness afterwards:

| | Before | After |
|---|---|---|
| `providers` columns readable by `anon` | all 49, incl. `verification_notes`, `stripe_account_id`, `no_show_count` | 28 public columns; **21 to `service_role` alone** |
| `anon` write privileges in `public` | INSERT/UPDATE on 32 tables, DELETE and TRUNCATE on 33 | **none, on any table** |
| `authenticated` TRUNCATE | held on 33 tables | **none** — no policy can constrain TRUNCATE |
| default privileges for new objects | `anon` + `authenticated` got `arwdDxtm` on every future table and EXECUTE on every future function | neither role gets anything; grants must be explicit |

**Two consequences for anyone writing the next migration.** A new table or RPC now grants nothing
by default, so it must carry its own `grant` — which every migration since `20260906000000`
already does; forgetting produces a loud permission error rather than a silent over-exposure. And
**`anon` keeps SELECT** where a deliberate public-read policy exists (`categories`,
`provider_availability`, `provider_blocked_dates`, `provider_policies`, revealed
`provider_reviews`), because signed-out discovery is a beta posture, not an oversight — the
harness pins that as a floor so a later sweep cannot quietly take it away.
