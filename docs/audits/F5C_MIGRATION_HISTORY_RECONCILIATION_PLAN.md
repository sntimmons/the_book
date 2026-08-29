# F5C — Production Migration-History Reconciliation (PLAN / REVIEW ONLY)

**Mode: read-only production inspection + local repo planning only.** Nothing in
this document has been executed. No migration repair, no `db push`, no archival,
no production change, no workflow/secret/project cleanup.

## Context recap

- F5B final result: **PASS**. The canonical baseline
  (`supabase/migrations/20260829000000_canonical_live_baseline.sql`, commit
  `1d307ac0fd3fd780fa748991f50b14f6f330dba8`) applied cleanly to a disposable
  project and reproduced production exactly (validation report commit
  `54af29025ad3e1e00e48de9f761a798120c5afaa`).
- Production project: `kxregomuawwcqvisuhtr`.
- **Goal of F5C:** make migration *tracking* consistent with the proven canonical
  baseline **without executing the baseline SQL against production** (production
  already contains that schema).

---

## Phase 1 — Current local migration inventory

Seven `.sql` files are currently active under `supabase/migrations/`:

| # | File | Classification |
|---|------|----------------|
| 1 | `20240101000000_baseline_schema.sql` | reconstructed pre-canonical historical |
| 2 | `20260821000000_provider_services_deposit.sql` | reconstructed pre-canonical historical |
| 3 | `20260825120000_self_reference_guards_and_is_mobile.sql` | reconstructed pre-canonical historical |
| 4 | `20260826000000_provider_policies_and_business_name.sql` | reconstructed pre-canonical historical |
| 5 | `20260828000000_client_identity_surfaces.sql` | S1B historical (S1B-impl-1) |
| 6 | `20260828120000_clients_rls_lockdown.sql` | S1B historical (S1B-impl-3) |
| 7 | `20260829000000_canonical_live_baseline.sql` | **canonical active baseline (KEEP active)** |

### The exact six files that should become non-executable history

1. `20240101000000_baseline_schema.sql`
2. `20260821000000_provider_services_deposit.sql`
3. `20260825120000_self_reference_guards_and_is_mobile.sql`
4. `20260826000000_provider_policies_and_business_name.sql`
5. `20260828000000_client_identity_surfaces.sql`
6. `20260828120000_clients_rls_lockdown.sql`

Their combined effects are fully contained in the canonical baseline (proven by
F5B). **Not moved yet.**

## Phase 2 — Current remote history verification (read-only)

Queried production via the Management API SQL endpoint (read-only `SELECT` /
`to_regclass`):

- `to_regclass('supabase_migrations.schema_migrations')` → **null**. The migration
  *tracking table does not exist yet* on production. This is a stronger form of
  "empty history": there are zero applied versions **and** no history table.
- Therefore **no migration version is currently marked applied**.
- Production schema already reflects the canonical baseline: 39 public tables,
  2 views, 11 functions, `public.clients_public` present, `public.categories_id_seq`
  present.

Nothing was repaired. (Note: the first `supabase migration repair` or
`db push` will lazily create the `supabase_migrations` schema + table; that is
Supabase-managed bookkeeping, not application schema.)

## Phase 3 — Proposed final repo layout

```
supabase/migrations/
  20260829000000_canonical_live_baseline.sql        # the ONLY active migration

supabase/migrations_history/pre_canonical/
  20240101000000_baseline_schema.sql
  20260821000000_provider_services_deposit.sql
  20260825120000_self_reference_guards_and_is_mobile.sql
  20260826000000_provider_policies_and_business_name.sql
  20260828000000_client_identity_surfaces.sql
  20260828120000_clients_rls_lockdown.sql
  README.md
```

### Exact moves (source → destination)

| Source | Destination |
|--------|-------------|
| `supabase/migrations/20240101000000_baseline_schema.sql` | `supabase/migrations_history/pre_canonical/20240101000000_baseline_schema.sql` |
| `supabase/migrations/20260821000000_provider_services_deposit.sql` | `supabase/migrations_history/pre_canonical/20260821000000_provider_services_deposit.sql` |
| `supabase/migrations/20260825120000_self_reference_guards_and_is_mobile.sql` | `supabase/migrations_history/pre_canonical/20260825120000_self_reference_guards_and_is_mobile.sql` |
| `supabase/migrations/20260826000000_provider_policies_and_business_name.sql` | `supabase/migrations_history/pre_canonical/20260826000000_provider_policies_and_business_name.sql` |
| `supabase/migrations/20260828000000_client_identity_surfaces.sql` | `supabase/migrations_history/pre_canonical/20260828000000_client_identity_surfaces.sql` |
| `supabase/migrations/20260828120000_clients_rls_lockdown.sql` | `supabase/migrations_history/pre_canonical/20260828120000_clients_rls_lockdown.sql` |
| `supabase/migrations/20260829000000_canonical_live_baseline.sql` | **stays in place (active)** |

Moves must use `git mv` to preserve history. **Not performed yet.**

### `supabase/migrations_history/pre_canonical/README.md` (proposed content)

The README must state:
- These files are **historical / audit artifacts**, retained for provenance.
- They are **NOT** part of active migration tracking and are intentionally
  outside `supabase/migrations/` so the Supabase CLI never considers them.
- Their effects are **already included** in
  `supabase/migrations/20260829000000_canonical_live_baseline.sql` (proven by
  F5B, report `F5B_ISOLATED_BASELINE_VALIDATION_FINAL.md`).
- **Do not move them back** into `supabase/migrations/`; doing so would make the
  CLI treat them as pending and a `db push` could attempt to re-run their DDL
  against production.

The critical reason they live *outside* `supabase/migrations/`: the CLI derives
the local migration set from that directory alone. Anything left there but not
marked applied remotely is treated as pending.

## Phase 4 — Proposed migration-history repair (FOR REVIEW ONLY — DO NOT RUN)

```
supabase migration repair --status applied 20260829000000
```

**What it changes:** inserts a single bookkeeping row into
`supabase_migrations.schema_migrations` on the linked remote (creating that
schema/table if it does not yet exist) recording version `20260829000000` as
`applied`. Purely a history-table write.

**What it does NOT change:** it executes **no** SQL from
`20260829000000_canonical_live_baseline.sql`. It does not create/alter/drop any
table, view, function, trigger, policy, grant, sequence, bucket, or row in the
`public`/`storage` schemas. It does not touch production data. It does not modify
any local file.

**Why it will not execute baseline DDL:** `migration repair` is a metadata-only
operation. Unlike `db push` (which runs pending migration files) or `db reset`
(which rebuilds), `repair --status applied` only records that a version is
considered already applied. The baseline body is never read for execution.

**Why only this single canonical version should be marked applied:** after
archival, the only file in `supabase/migrations/` is `20260829000000`. The remote
history must mark exactly the versions in the active local set that are already
present in the database. Production already contains the canonical schema, so
`20260829000000` is "already applied" in substance — recording it makes local and
remote consistent, and a subsequent `db push` becomes a no-op.

**Why the six archived files should NOT be marked applied:** they are being
removed from `supabase/migrations/`, so they are not part of the active tracking
set. Marking archived versions applied would add history rows for files the CLI
no longer sees, cluttering history with no benefit and creating confusion if one
were ever restored. Their effects are already inside the canonical baseline, so
there is nothing they would contribute. The clean model is: **one active
migration ⇄ one applied remote version.**

## Phase 5 — Before/after `migration list` expectations

`supabase migration list` prints a Local column and a Remote column of versions.

### BEFORE archival, BEFORE repair (current state)
- **Local (active `supabase/migrations/`):** `20240101000000`, `20260821000000`,
  `20260825120000`, `20260826000000`, `20260828000000`, `20260828120000`,
  `20260829000000` (7 versions).
- **Remote:** empty (no history table).
- `migration list` would show all 7 local versions with **no** remote counterpart
  (all appear local-only / pending).

### AFTER archival, BEFORE repair
- **Local (active):** `20260829000000` only.
- **Remote:** empty.
- `migration list` shows `20260829000000` local-only (pending). The 6 archived
  versions no longer appear (they are outside `supabase/migrations/`).

### AFTER repair
- **Local (active):** `20260829000000` only.
- **Remote:** `20260829000000` marked applied.
- `migration list` shows `20260829000000` present in **both** Local and Remote —
  fully synced, nothing pending.

## Phase 6 — Future `db push` behavior

Once (a) only `20260829000000` is active locally and (b) remote history marks
`20260829000000` applied:

- `supabase db push` computes the set difference *local versions − remote-applied
  versions*. That difference is **empty**, so push has nothing to do and will
  **not** re-run the baseline or recreate production. (Even though the baseline
  contains `CREATE TABLE`/etc., push never reaches it because the version is
  already recorded applied.)
- **Future migrations:** a new file with a version string greater than
  `20260829000000` (e.g. `20260901000000_s2_security_fixes.sql`) is seen as
  present locally but absent from remote history → treated as **pending** →
  applied in ascending version order on the next `db push`, and then recorded in
  the history table. Normal forward-migration flow resumes from the canonical
  baseline as the anchor.

## Phase 7 — Recovery / rollback plan (history-repair only; DO NOT execute)

All recovery uses `supabase migration repair` (metadata only) and/or local git;
none touches schema/data.

- **A. Wrong version accidentally marked applied.**
  `supabase migration repair --status reverted <wrong_version>` removes that
  history row, then
  `supabase migration repair --status applied 20260829000000` records the correct
  one. Schema is never affected.

- **B. `migration list` looks unexpected.** Do not `db push` to "fix" it.
  Diagnose by comparing the files in `supabase/migrations/` against the Remote
  column. Reconcile purely with `repair --status applied|reverted` until the list
  matches the intended state (active local set ⇄ same versions applied remotely).

- **C. Remote history updated but repo archival is wrong.** The remote history
  table and the repo are independent. Fix the repo with `git mv` (restore the
  intended `pre_canonical/` layout) without touching remote. If the corrected
  active set differs from what is marked applied remotely, adjust remote with
  `repair` (`reverted` for versions that should not be active, `applied` for the
  canonical one).

- **D. Future `db push` proposes unexpected OLD migrations.** STOP; do not
  confirm the push. This means an archived file re-entered `supabase/migrations/`
  or a version is unmarked remotely. Fix by re-archiving the stray file (`git mv`
  back to `pre_canonical/`) or, if it legitimately belongs, by recording it with
  `repair --status applied <version>`. Never let push execute historical DDL
  against production.

## Phase 8 — Cleanup plan after successful F5C (design only; DO NOT execute)

- **Disposable project `zwahaxmaxwrhoucvdiij`:** delete **only after** the F5C
  repair is executed and verified (`migration list` shows `20260829000000` in
  both columns and a dry `db push` is a no-op). Keep it until then as a
  re-validation environment in case the plan needs another isolated test.
- **Temporary workflow `.github/workflows/f5b-schema-dump.yml`:** remove after
  all schema-dump needs are complete (i.e., after F5C repair verified and no
  further production schema dump is anticipated). It exists on `main` (merged via
  PR #3) and on the F5 working branches; removal is a small follow-up PR to
  `main` plus deletion on the working branch.
- **GitHub secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`:** remove from
  the repository **after** the workflow is deleted (they are consumed only by
  that workflow). Note: `SUPABASE_DB_PASSWORD` is the production DB password;
  deleting the secret does not rotate it. Rotating the production DB password is
  a reasonable later hygiene step but is **out of scope here** and must not be
  done as part of cleanup without explicit authorization.
- **F5B reports:** **retain all three** (`F5B_ISOLATED_BASELINE_VALIDATION.md`,
  `..._RETRY.md`, `..._FINAL.md`) — they document the failure-to-success path and
  are audit evidence.
- **Audit-history preservation:** keep `docs/audits/*` intact and keep the six
  historical migrations under `supabase/migrations_history/pre_canonical/` with
  the explanatory README, so provenance survives even though those files are no
  longer executable.

---

## Execution order when F5C is later authorized (for reference; not done now)

1. `git mv` the six files into `supabase/migrations_history/pre_canonical/` and
   add the README (repo-only; reviewable as a PR).
2. Verify `supabase migration list` shows only `20260829000000` locally.
3. Run `supabase migration repair --status applied 20260829000000` against the
   linked production project.
4. Verify `supabase migration list` shows `20260829000000` in both columns and
   that `supabase db push` reports nothing to apply.
5. Only then proceed to Phase 8 cleanup.

Each step is a separate, individually-authorized action.
