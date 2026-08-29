# Security Batch 1 — RLS Lockdown (FINAL / APPLIED)

**Result: PASS.** RLS is enabled on `categories`, `shifts`, and `shift_clients`
in production, with least-privilege grants and policies. The prior P1 exposure
(anon full CRUD on all three with RLS off) is closed. No unintended production
data changed.

## References

- **Investigation report commit:** `ca7fa1191348659eb098dd31338999808c87ac77`
- **Migration commit:** `9d4a0b37d298c8191a10dfd2655909aff6a23d8e`
  (`supabase/migrations/20260829023000_security_batch_1_rls_categories_shifts.sql`)
- **Branch:** `security/sb1-rls`
- **Production target:** `kxregomuawwcqvisuhtr`

## Safety gate (pre-apply)

- Linked ref = `kxregomuawwcqvisuhtr` ✓
- Local active migrations = `20260829000000_canonical_live_baseline.sql`,
  `20260829023000_security_batch_1_rls_categories_shifts.sql` ✓
- `migration list --linked`: `20260829000000` local+remote; `20260829023000` local-only ✓
- `db push --linked --dry-run`: exactly one pending — `20260829023000` ✓

## Apply result

`supabase db push --linked` → `Applying migration 20260829023000_...` →
`{"upToDate":false,"dryRun":false,"migrations":["20260829023000_..."],"message":"Finished supabase db push."}`.
Single pending migration applied. No `migration repair`, no unrelated SQL.

## Migration history — before / after

| | before | after |
|---|---|---|
| `20260829000000` | local+remote | local+remote |
| `20260829023000` | local only | **local+remote** |

`db push --linked --dry-run` after apply → `{"upToDate":true,...,"Remote database is up to date."}`.

## RLS state — before / after

| table | RLS before | RLS after | forced |
|---|---|---|---|
| categories | disabled | **enabled** | no |
| shifts | disabled | **enabled** | no |
| shift_clients | disabled | **enabled** | no |

Application-owned tables with RLS disabled: **3 → 0.**

## Policies — before / after

Before: only `categories_public_read` (SELECT, roles `{public}`, `USING true`);
shifts/shift_clients had none.

After:

| table | policy | cmd | roles | USING | WITH CHECK |
|---|---|---|---|---|---|
| categories | `categories_public_read` | SELECT | `{anon, authenticated}` | `true` | – |
| shifts | (none) | – | – | – | – |
| shift_clients | (none) | – | – | – | – |

No INSERT/UPDATE/DELETE policies for anon/authenticated on any of the three.

## Grants — before / after

Before (all three tables): anon, authenticated, service_role each had
`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`.

After:

| table | anon | authenticated | service_role |
|---|---|---|---|
| categories | `SELECT` | `SELECT` | full (unchanged) |
| shifts | (none) | (none) | full (unchanged) |
| shift_clients | (none) | (none) | full (unchanged) |

## Effective privileges (has_table_privilege — actual, not just policy text)

| table | role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| categories | anon | ALLOW | DENY | DENY | DENY |
| categories | authenticated | ALLOW | DENY | DENY | DENY |
| categories | service_role | ALLOW | ALLOW | ALLOW | ALLOW |
| shifts | anon | DENY | DENY | DENY | DENY |
| shifts | authenticated | DENY | DENY | DENY | DENY |
| shifts | service_role | ALLOW | ALLOW | ALLOW | ALLOW |
| shift_clients | anon | DENY | DENY | DENY | DENY |
| shift_clients | authenticated | DENY | DENY | DENY | DENY |
| shift_clients | service_role | ALLOW | ALLOW | ALLOW | ALLOW |

Matches the intended model exactly. service_role administrative behavior preserved.

## Functional smoke tests (real anon key via PostgREST)

| test | expected | result |
|---|---|---|
| anon `GET /categories?select=id,name` | 200 + rows | **HTTP 200, 3 rows** ✓ |
| anon `GET /shifts?select=id` | denied | **HTTP 401** `42501 permission denied for table shifts` ✓ |
| anon `GET /shift_clients?select=id` | denied | **HTTP 401** `42501 permission denied for table shift_clients` ✓ |
| anon `POST /categories` (insert) | denied, no row left | **HTTP 401** `42501 permission denied for table categories`; categories row count still 20, zero `__sb1_test__` rows ✓ |

- Public/pre-auth category reads continue to work.
- Authenticated category read: confirmed allowed by both grant
  (`has_table_privilege(authenticated,...,SELECT)=true`) and policy (roles include
  `authenticated`, `USING true`). No JWT minted (avoids creating auth artifacts).
- No production data mutated: the only write attempted (anon insert) was rejected
  at the permission layer, leaving nothing behind.

## Structural regression — before / after

| object | before | after |
|---|---|---|
| tables | 39 | 39 |
| sequence | 1 | 1 |
| views | 2 | 2 |
| functions | 11 | 11 |
| triggers | 17 | 17 |
| constraints | 158 | 158 |
| non-constraint indexes | 58 | 58 |
| storage buckets | 4 | 4 |
| storage policies | 12 | 12 |
| **public policies** | **97** | **97** |

Public policy count unchanged: `categories_public_read` was normalized in place
(role set changed `{public}` → `{anon, authenticated}`), not added or removed.

## Differences (intended, from this migration only)

1. RLS enabled on the three tables (3 → 0 disabled).
2. `categories_public_read` role set normalized `{public}` → `{anon, authenticated}`.
3. Grants reduced to least privilege (categories → SELECT for app roles;
   shifts/shift_clients → service_role only).

No other differences.

## Typecheck

`npx tsc --noEmit` → exit 0.

## PASS / FAIL

**PASS.**

## Remaining Security Batch 1 risks / follow-ups

- **`shifts` has no ownership column and `shift_clients` no owner-scoped read.**
  These remain deny-all (correct while dormant). If the feature is revived, add
  `shifts.provider_id`, provider-scoped policies on both tables, a
  `shift_clients` client-self SELECT (`client_id = auth.uid()`), and an index on
  `shift_clients.client_id`. Tracked, not in this batch.
- `service_role` retains full CRUD on all three (by design; server-only key).
- Scope was strictly these three tables; other RLS/policy debt (if any) is out of
  scope for Batch 1.
