# F5B — Isolated Baseline Validation (FINAL, dump-derived baseline)

**Result: PASS.** The dump-derived canonical baseline applied cleanly to a fresh,
isolated Supabase project in a single transaction, and the resulting
application-owned schema is exactly equivalent to live production across every
validated dimension (definitions AND effective privileges).

This is the third F5B run. It does **not** overwrite the two prior failure
reports:
- `F5B_ISOLATED_BASELINE_VALIDATION.md` (run 1 — 42P01 sequence omission)
- `F5B_ISOLATED_BASELINE_VALIDATION_RETRY.md` (run 2 — 42830 FK ordering)

---

## 1. Baseline under test

- **Commit:** `1d307ac0fd3fd780fa748991f50b14f6f330dba8`
- **File:** `supabase/migrations/20260829000000_canonical_live_baseline.sql`
- **Integrity:** working-tree sha256 == committed-blob sha256
  (`a98a7ad18d449c0fc2ed42b226b4e9d559027c55e1a4958b76721082a535af35`).
- **Provenance:** regenerated from an authoritative `pg_dump --schema public` of
  live, produced read-only on CI (GitHub Actions run 33232611192), plus two
  hand-added pieces pg_dump cannot express under `--schema public`: the app
  extensions (`pgcrypto`, `uuid-ossp`) and the S1B anon lockdown on
  `clients` / `clients_public` / `clients_provider`; storage buckets + policies
  preserved from F4.
- **No other migration applied.** Historical migrations, S1B migrations, and
  migration repair were NOT run.

## 2. Target project

- **Disposable target (writes):** `zwahaxmaxwrhoucvdiij` (Postgres 17.6)
- **Production (read-only reference only):** `kxregomuawwcqvisuhtr` (Postgres 17.6)

## 3. Production-vs-target safety confirmation

- PRODUCTION `kxregomuawwcqvisuhtr` != TARGET `zwahaxmaxwrhoucvdiij` — **different**.
- The apply call was hard-guarded to the target ref and would abort if
  `target == prod`.
- Production received **zero writes**. Every production query in this run was
  read-only introspection (`SELECT` / `pg_get_*` / `has_*_privilege`); production
  is used solely as the equivalence reference.

## 4. Clean-target confirmation (pre-apply)

Before applying, the target's `public` schema was empty of application-owned
objects (residue of the two rolled-back prior attempts fully absent):

| Probe | Value |
|---|---|
| public tables | 0 |
| public views | 0 |
| public functions | 0 |
| public sequences | 0 |
| public policies | 0 |
| leftover named app tables | (none) |
| storage.objects app policies | 0 |
| app buckets | (none) |

## 5. Execution result

- Single POST to the Management API SQL endpoint on the target with the exact
  baseline text. **HTTP 201, no error object** (final statement result
  `[{"set_config":""}]`). The whole baseline executed and committed atomically.
- The prior FK-ordering (42830) and sequence (42P01) defects did **not** recur.

## 6. Object counts (required == prod == target)

| Object | Required | Prod | Target | OK |
|---|---|---|---|---|
| Tables | 39 | 39 | 39 | ✓ |
| Sequence | 1 | 1 | 1 | ✓ |
| Views | 2 | 2 | 2 | ✓ |
| Functions | 11 | 11 | 11 | ✓ |
| Triggers | 17 | 17 | 17 | ✓ |
| Constraints | 158 | 158 | 158 | ✓ |
| Non-constraint indexes | 58 | 58 | 58 | ✓ |
| Public policies | 97 | 97 | 97 | ✓ |
| storage.objects policies | 12 | 12 | 12 | ✓ |
| Storage buckets | 4 | 4 | 4 | ✓ |
| RLS enabled | 36 | 36 | 36 | ✓ |
| RLS disabled | 3 | 3 | 3 | ✓ |

## 7. F4 equivalence results (exact definitions, prod vs target)

Each category was introspected identically on prod and target and diffed as a
set of canonical definition strings. **Zero differences in every category.**

| Category | Basis of comparison | Prod rows | Target rows | Diff |
|---|---|---|---|---|
| columns | table, attnum, name, `format_type`, nullability, default expr | 364 | 364 | none |
| constraints | `pg_get_constraintdef` (PK/UNIQUE/FK/CHECK) | 158 | 158 | none |
| indexes | `pg_get_indexdef` (all indexes) | 114 | 114 | none |
| views | owner, reloptions, `pg_get_viewdef` | 2 | 2 | none |
| functions | identity args, DEFINER/INVOKER, `proconfig`, md5(`pg_get_functiondef`) | 11 | 11 | none |
| triggers | `pg_get_triggerdef` | 17 | 17 | none |
| public policies | cmd, roles, qual, with_check | 97 | 97 | none |
| storage policies | cmd, roles, qual, with_check | 12 | 12 | none |
| RLS state | `relrowsecurity` per table | 39 | 39 | none |
| buckets | id, name, public, size limit, mime list | 4 | 4 | none |
| sequence attrs | type/start/inc/min/max/cache/cycle | 1 | 1 | none |
| sequence owned-by | `pg_depend` auto dependency | 1 | 1 | none |

### Sequence detail (`categories_id_seq`, target — matches prod)

- type **integer**, start **1**, increment **1**, min **1**,
  max **2147483647**, cache **1**, cycle **false (no cycle)**,
  **owned by `categories.id`**. (Current value ignored per spec.)

### Views detail

- `clients_public` and `clients_provider` present, owner **postgres**,
  reloptions **`security_invoker=false`**, view bodies identical to prod
  (columns and predicates match exactly).

### Functions detail

- All 11 identical (bodies by md5). SECURITY DEFINER count = 3, with search_path
  reproduced verbatim: `provider_review_revealed` = `''`,
  `recompute_provider_rating` = `'public'`,
  `prevent_provider_verification_self_update` = none.

## 8. ACL / grant results (PASS/FAIL gate — effective privileges, not text)

Compared via `has_table_privilege` / `has_sequence_privilege` for anon,
authenticated, service_role. The full 72-row table-privilege matrix and 9-row
sequence-privilege matrix are **identical between prod and target**.

### `clients` (base table) — effective privileges on target (== prod)

| Role | Effective privileges |
|---|---|
| anon | **(none)** |
| authenticated | SELECT, INSERT, UPDATE, **MAINTAIN** |
| service_role | ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) |

- anon has **no** privileges — the S1B anon lockdown is reproduced despite
  Supabase default privileges auto-granting anon on new tables.
- authenticated does **not** have DELETE/TRUNCATE/REFERENCES/TRIGGER, matching
  live's trimmed verb set. The PostgreSQL 17 **MAINTAIN** privilege is present
  for authenticated on target exactly as on live.

### `clients_public` / `clients_provider` (views) — effective (== prod)

| Role | Effective privileges |
|---|---|
| anon | **(none)** |
| authenticated | **SELECT only** |
| service_role | ALL |

### `categories_id_seq` — effective (== prod)

| Role | USAGE | SELECT | UPDATE |
|---|---|---|---|
| anon | ✓ | ✓ | ✓ |
| authenticated | ✓ | ✓ | ✓ |
| service_role | ✓ | ✓ | ✓ |

**ACL gate: PASS.**

## 9. Storage results

- 4 buckets present with identical configuration to live: `contract-pdfs`
  (private), `contract-signatures` (private), `posts-media` (public, 50MB,
  image/video mime allowlist), `provider-media` (public, 50MB, wildcard mime).
- 12 `storage.objects` policies present, definitions (cmd/roles/qual/with_check)
  identical to live.

## 10. Security-debt preservation (reproduced as-is; NOT fixed)

Confirmed the target reproduces current live debt (target == prod):

- **RLS OFF** on `categories`, `shift_clients`, `shifts`.
- **Known storage authorization weaknesses** preserved — all 12 object policies
  match live, including the non-object-bound `contract_pdfs_read` /
  `signatures_read_own_storage` and the non-ownership-bound `provider_media`
  delete/update.
- **Booking/provider write-integrity weaknesses** preserved — the full
  constraint set (158) and public policy set (97) match live exactly; no
  hardening was added.
- **SECURITY DEFINER / search_path behavior** preserved — 3 definer functions
  with search_path exactly as live (including the one with none set).
- **`debug_whoami`** present.
- **Redundant `provider_reviews` policies** preserved — 3 policies on
  `provider_reviews`, same as live.

None of these were fixed; forward remediation belongs to batch S2.

## 11. All differences

**None.** Every count matched required/prod/target, and every definition and
effective-privilege comparison between prod and target returned zero
differences.

## 12. PASS / FAIL

**PASS** — the dump-derived canonical baseline is a faithful, reproducible,
single-transaction representation of the current live application-owned schema,
including its ACLs and its known security debt.

## 13. F5C unblock status

**F5C can be unblocked.** The canonical baseline is now proven to reproduce live
exactly on a clean environment. The remaining migration-history reconciliation
work (a single baseline + `migration repair --status applied <version>`) has a
validated artifact to anchor on.

Explicitly NOT done in this run (per instruction): no `migration repair`, no
migration archiving, no production db push, no disposable-project deletion, no
removal of the temporary GitHub workflow, no security remediation.

---

### Method notes

- Introspection and the single DDL apply used the Supabase Management API SQL
  endpoint (`POST /v1/projects/{ref}/database/query`, runs as postgres). The
  access token was read from the local keychain per call and never printed.
- Equivalence was computed by diffing canonical `pg_catalog` / `information_schema`
  projections and `pg_get_*def` output between prod and target, plus behavioral
  `has_*_privilege` checks — not by text-comparing ACL strings.
