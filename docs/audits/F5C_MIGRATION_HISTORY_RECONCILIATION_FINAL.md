# F5C — Production Migration-History Reconciliation (FINAL / EXECUTED)

**Result: PASS. F5C status: CLOSED.**

Production migration tracking is now consistent with the proven canonical
baseline. Only migration-history *metadata* and repo *file placement* changed;
**production schema and row data were not modified.**

This is the executed record; it does not overwrite the plan
(`F5C_MIGRATION_HISTORY_RECONCILIATION_PLAN.md`).

## Canonical baseline

- **Version:** `20260829000000`
- **File:** `supabase/migrations/20260829000000_canonical_live_baseline.sql`
- **Baseline commit SHA:** `1d307ac0fd3fd780fa748991f50b14f6f330dba8`
- **Production project:** `kxregomuawwcqvisuhtr`

## 1. `supabase migration list --linked` — BEFORE repair

```
{"migrations":[{"local":"20260829000000","remote":"","time":"2026-08-29 00:00:00"}]}
```

- LOCAL = `20260829000000`
- REMOTE = (blank)

## 2. Repair command (exact)

```
supabase migration repair --status applied 20260829000000 --linked
```

Output:

```
Repaired migration history: [20260829000000] => applied
{"versions":["20260829000000"],"status":"applied","repairAll":false,"message":"Migration history repaired"}
```

Metadata-only. No `db push`. No baseline SQL executed.

## 3. `supabase migration list --linked` — AFTER repair

```
{"migrations":[{"local":"20260829000000","remote":"20260829000000","time":"2026-08-29 00:00:00"}]}
```

- LOCAL = `20260829000000`
- REMOTE = `20260829000000`  → **exact sync**

## 4. Remote history row

`supabase_migrations.schema_migrations` now contains exactly one row:

| version | name |
|---|---|
| `20260829000000` | `canonical_live_baseline` |

## 5. Production schema verification (unchanged; matches F4 truth)

| Object | Count |
|---|---|
| tables | 39 |
| sequence | 1 |
| views | 2 |
| functions | 11 |
| triggers | 17 |
| constraints | 158 |
| public policies | 97 |
| storage.objects policies | 12 |
| storage buckets | 4 |
| RLS disabled | 3 |

Identical to the F4/F5B-validated counts — the repair changed no schema object.

## 6. `supabase db push --linked --dry-run`

```
DRY RUN: migrations will *not* be pushed to the database.
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}
```

No pending migrations. The canonical baseline is not re-proposed; no historical
migration is proposed; no unexpected SQL.

## 7. Active migration directory contents

```
supabase/migrations/
  20260829000000_canonical_live_baseline.sql   (the only active migration)
```

## 8. Archived migration contents

```
supabase/migrations_history/pre_canonical/
  20240101000000_baseline_schema.sql
  20260821000000_provider_services_deposit.sql
  20260825120000_self_reference_guards_and_is_mobile.sql
  20260826000000_provider_policies_and_business_name.sql
  20260828000000_client_identity_surfaces.sql
  20260828120000_clients_rls_lockdown.sql
  README.md
```

## 9. Archival commit

- **Commit SHA:** `c6ec442742efa8f4f5e00beae77b649fcdea14bb`
  (`db: archive pre-canonical migration history` — 6 renames + README, no
  content change to the migrations).

## 10. Confirmation: production schema/data unchanged

The only production write was a single bookkeeping row in
`supabase_migrations.schema_migrations`. All `public`/`storage` object counts are
unchanged and match F4/F5B truth. No table, view, function, trigger, policy,
grant, sequence, bucket, or application row was created, altered, or dropped.

## 11. PASS / FAIL

**PASS.**

## 12. F5C status

**CLOSED.**

### Not started

Security remediation (batch S2) has **not** begun. Post-closeout cleanup
(disposable project deletion, temporary workflow removal, secret removal) is
tracked separately and gated on branch/PR closeout.
