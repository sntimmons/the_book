# F5A - Canonical Baseline Review

Local repo construction of the canonical baseline candidate from the F4 live
snapshot. **No live DB mutations, no remote migration-history changes, no app
changes, nothing applied.**

Candidate: `supabase/migrations/20260829000000_canonical_live_baseline.sql`
Source of truth: `docs/audits/F4_LIVE_SCHEMA_SNAPSHOT.sql` (exact `pg_get_*`
capture of live `kxregomuawwcqvisuhtr`, post-S1B).

## 1. Proposed final migration layout

- **One canonical baseline** (`20260829000000_canonical_live_baseline.sql`)
  representing the current application-owned live state, INCLUDING S1B effects
  and known-bad security definitions (reproduce first, fix forward).
- **Forward migrations after it** for fixes/features (e.g. S2 security
  remediation of the F3 findings).
- **Historical/reconstructed migrations archived** (non-executable location),
  preserved in Git for audit. The active `supabase/migrations/` directory should
  eventually contain only the canonical baseline plus genuine future forward
  migrations.

For F5A the candidate is created; the existing migrations are **left untouched**
(the archive move is deferred until the layout is execution-validated in F5B -
see Sections 4 and 7).

## 2. Candidate baseline: object counts

| Object | Count | Notes |
|---|---:|---|
| Extensions | 2 | `pgcrypto`, `uuid-ossp` (app-relevant only) |
| Tables | 39 | exact live columns/types/nullability/defaults |
| Constraints (PK/UNIQUE/FK/CHECK) | 158 | via `pg_get_constraintdef` |
| Non-constraint indexes | 58 | via `pg_get_indexdef` |
| Views | 2 | `clients_public`, `clients_provider` (`security_invoker=false`) |
| Functions | 11 | via `pg_get_functiondef` (full bodies/security/search_path) |
| Triggers | 17 | via `pg_get_triggerdef` |
| RLS enable statements | 36 | + 3 RLS-DISABLED notes (`categories`, `shifts`, `shift_clients`) = 39 tables |
| Policies - public | 97 | reconstructed `CREATE POLICY` |
| Policies - storage.objects | 12 | reconstructed |
| Storage buckets | 4 | `insert ... on conflict do nothing` |
| clients revokes (S1B) | 2 | preserve exact live ACL |

File length: 1683 lines.

## 3. Static equivalence vs F4 (object-by-object)

| Object type | F4 live | Baseline | Difference | Classification |
|---|---:|---:|---|---|
| Tables | 39 | 39 | none | MATCH |
| Views | 2 | 2 | none | MATCH |
| Functions | 11 | 11 | none | MATCH |
| Triggers | 17 | 17 | none | MATCH |
| Constraints | 158 | 158 | none | MATCH |
| Non-constraint indexes | 58 | 58 | none | MATCH |
| Public policies | 97 | 97 | none | MATCH |
| Storage policies | 12 | 12 | none | MATCH |
| Storage buckets | 4 | 4 | comments -> inserts | MATCH (bootstrap form) |
| RLS state | 36 on / 3 off | 36 on / 3 off | none | MATCH |
| Extensions | 5 | 2 | -3 (`supabase_vault`, `pg_stat_statements`, `plpgsql`) | INTENTIONAL MANAGED-INFRA EXCLUSION |
| Grants | positive ACLs | positive grants + clients revokes | see below | ORDERING/BOOTSTRAP DIFFERENCE |

Every F4 application-owned object is accounted for. There are **no ERROR or
UNKNOWN differences**. The two explained differences:

- **Managed-infra exclusion (extensions):** `supabase_vault`,
  `pg_stat_statements` are Supabase-provisioned; `plpgsql` is a default. A fresh
  Supabase project already has them. Intentional.
- **Grants bootstrap difference:** the candidate reproduces live's positive
  GRANTs and adds the explicit S1B `clients` revokes, but it does NOT encode the
  full REVOKE set that would counter a fresh Supabase project's default table
  privileges (which auto-grant anon/authenticated on new public tables). For
  RLS-enabled tables this does not change effective access (RLS enforces rows
  regardless of a residual grant), and for `clients` the explicit revokes match
  live exactly. Precise ACL fidelity for every table should come from a
  service-role `pg_dump --schema-only` (which emits exact GRANT/REVOKE) and is
  proven in F5B execution validation. Classified bootstrap, not error.

Note on provenance: the candidate is **catalog-derived** (`pg_get_*`), which is
faithful for DDL and object membership. The production baseline should ideally be
**regenerated from a service-role `pg_dump --schema-only`** for guaranteed
execution ordering and exact ACLs; this candidate proves the complete object set
and is the review target, with execution fidelity validated in F5B.

## 4. Dependency / order assessment

Section order: extensions -> tables -> constraints -> indexes -> views ->
functions -> triggers -> RLS enable -> policies -> grants -> clients revokes ->
storage. Checks performed:

- All 39 tables are created before any constraint (FKs added after all tables
  exist). 21 FKs reference `auth.users` - present on a fresh Supabase project
  (prerequisite). No other `auth.*` targets.
- No column default or CHECK references a custom function (defaults are
  `gen_random_uuid()` / `now()` / literals), so no table-before-function
  forward reference.
- Functions precede triggers (triggers `EXECUTE` them) and precede policies
  (`provider_reviews_read` calls `provider_review_revealed`).
- Views precede nothing they depend on (they reference only tables + `auth.uid()`).
- Storage bucket inserts precede storage.objects policies.

No object depends on something created later in the file. Order is sound for a
fresh apply, subject to F5B confirmation.

## 5. Managed-infrastructure exclusions (intentional)

Not created by the baseline (Supabase-managed prerequisites): `plpgsql`,
`supabase_vault`, `pg_stat_statements`; schemas `auth`, `storage`, `extensions`,
`vault`, `graphql`, etc.; roles `anon`/`authenticated`/`service_role`/`postgres`;
`auth.users`. The baseline references `storage.buckets` rows and
`storage.objects` policies (application-owned config) but does not recreate the
`storage` schema.

## 6. Existing migration archive recommendation

Because execution validation is not yet done (Section 7), the six existing files
are **left in place** for F5A. The future archive operation (F5B/after):

- Create `supabase/migrations_history/pre_canonical/` (non-executable).
- `git mv` these into it (preserve history):
  `20240101000000_baseline_schema.sql`, `20260821000000_provider_services_deposit.sql`,
  `20260825120000_self_reference_guards_and_is_mobile.sql`,
  `20260826000000_provider_policies_and_business_name.sql`,
  `20260828000000_client_identity_surfaces.sql` (S1B-1),
  `20260828120000_clients_rls_lockdown.sql` (S1B-3).
- Leave `supabase/migrations/20260829000000_canonical_live_baseline.sql` as the
  sole active migration.
- Add a `migrations_history/README.md` noting these are historical/non-authoritative
  and that the S1B files' effects are folded into the canonical baseline (their
  review history is preserved in Git and in `docs/audits/`).

S1B auditability is preserved: the two S1B migration commits, PR #2, and the
S1B review docs remain in Git history; only the executable files relocate.

## 7. Reproducibility / execution validation

**Execution validation was NOT possible locally.** No Docker, no `psql`, no local
Postgres, and no isolated fresh Supabase project are available; installing
system tooling or creating cloud resources is out of scope without permission.
Therefore **execution validation is PENDING (F5B)** and this candidate has passed
**static review only**. Migration-history repair MUST remain blocked until F5B
applies the baseline to an isolated fresh environment and proves equivalence.

### Exact F5B procedure (to run later, in isolation)

1. Provision an **isolated** target: either a throwaway Supabase project, or a
   local Postgres 17 via Docker (`supabase start` local stack), never the linked
   project.
2. Apply the candidate baseline to that target only (e.g. run the file in the
   throwaway project's SQL editor, or `psql -f` against the local instance).
   Confirm zero errors and correct ordering.
3. Re-run the F4 capture queries (the same `pg_get_*` catalog queries) against
   the fresh target and diff the result against `F4_LIVE_SCHEMA_SNAPSHOT.sql`:
   tables/columns/constraints/indexes/views/functions/triggers/RLS/policies/
   grants/storage must match object-for-object. Investigate any diff (expected
   only in grant ACLs -> tighten baseline REVOKEs from a service-role dump).
4. If it does not match, correct the baseline (preferably regenerate from a
   service-role `pg_dump --schema-only`) and repeat.
5. Only after a clean diff, proceed to the F5 repair (Section 8) on the linked
   project. Never `db reset`/`db push`/`migration repair` against the linked
   project during validation.

## 8. Migration-history repair plan (DESIGN ONLY - DO NOT RUN)

After F5B passes:

- **Baseline version to mark applied:** `20260829000000`.
- **Active migrations dir at repair time:** must contain ONLY
  `20260829000000_canonical_live_baseline.sql` (the six existing files archived
  per Section 6).
- **Historical migrations no longer active:** the six listed above.
- **`supabase migration list` before repair** (remote history is empty): local
  shows `20260829000000`, remote column empty (local-only, nothing applied).
- **`supabase migration list` after repair:** `20260829000000` appears in BOTH
  local and remote columns (synced/applied).
- **Command (FOR REVIEW ONLY, DO NOT RUN):**
  `supabase migration repair --status applied 20260829000000`
- **Why a future `db push` will not recreate existing live objects:** the
  baseline version is recorded in the remote migration-tracking table, so
  `db push` treats it as already applied and skips it; only migrations authored
  AFTER `20260829000000` (e.g. S2 fixes) are pushed.
- **How already-live S1B cannot be reapplied:** the S1B DDL is already live and
  its effect is included in the canonical baseline; the S1B migration files are
  archived (not in the active dir), so they are never candidates for `db push`
  and cannot double-apply. Do NOT mark the archived files applied; only the
  single canonical baseline version is repaired.

Do NOT mark every existing repo migration applied - most are being archived. The
repair set is exactly `{20260829000000}`, derived from the final one-baseline
layout.

## 9. Security debt preservation check (reproduce-as-is confirmed)

The candidate faithfully reproduces the current live (known-bad) security state
and does NOT remediate:

- **F3-P1-002:** `categories`, `shifts`, `shift_clients` are emitted with RLS
  left DISABLED (three RLS-DISABLED notes; no `enable row level security` for
  them) and their broad anon/authenticated grants preserved.
- **F3-P1-003:** storage policies `contract_pdfs_read`,
  `signatures_read_own_storage`, `provider_media_authenticated_delete/update`
  are reproduced verbatim (object-unbound), with an inline SECURITY comment.
- **F3-P1-004:** the `bookings` `clients_cancel_own_bookings` /
  `providers_manage_own_bookings` `NEW = NEW` tautology WITH CHECK clauses and
  the providers dual-UPDATE (`providers_update_own` +
  `providers_update_safe_columns_only`) are reproduced verbatim.
- **SECURITY DEFINER / search_path:** `prevent_provider_verification_self_update`
  (unset search_path) and `recompute_provider_rating` (`search_path=public`) are
  reproduced from `pg_get_functiondef` unchanged.
- **`debug_whoami()`** is included unchanged.
- **Redundant `provider_reviews` SELECT policies** (`provider_reviews_read` +
  `provider_reviews_read_revealed`) are both reproduced.

These are intentionally preserved; forward-remediation is batch S2, after the
baseline is validated and history is reconciled.

## 10. Summary

Static review PASSES: the candidate baseline accounts for every F4
application-owned object with only intentional managed-infra exclusions and a
documented grant-bootstrap difference. Execution validation is PENDING F5B.
Migration-history repair stays blocked until F5B passes.
