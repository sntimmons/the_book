# Security Batch 2R — Contract RLS Recursion Fix (FINAL / APPLIED)

**Result: PASS.** The mutual RLS recursion (42P17) between `contracts` and
`contract_signatures` is eliminated. Authenticated reads of both tables now
succeed; cross-visibility (signer↔contract, provider↔signature) works and
unrelated users are denied. **SB2b is now unblocked.**

## References
- Investigation commit: `4f4cafaf48fbc2f20e4faed10f7bdbee801c7ccc`
- Migration commit: `6e173b3e0431a065dd33eff3c975ac4817e910e7`
  (`supabase/migrations/20260829050000_security_batch_2r_contract_rls_recursion_fix.sql`)
- Branch: `security/sb2r-contract-recursion`
- Production target: `kxregomuawwcqvisuhtr`

## Safety gate
- Linked ref = `kxregomuawwcqvisuhtr` ✓
- Local migrations = baseline + SB1 + SB2a + SB2R (4) ✓
- `migration list --linked`: first 3 local+remote, `20260829050000` local-only ✓
- Dry-run: exactly one pending (`20260829050000`) ✓

## Apply result
`supabase db push --linked` → `Applying migration 20260829050000_...` →
`{"upToDate":false,"dryRun":false,"migrations":["20260829050000_..."],"message":"Finished supabase db push."}`.

## Migration history — before / after
| version | before | after |
|---|---|---|
| 20260829000000 / 023000 / 030000 | local+remote | local+remote |
| **20260829050000** | local only | **local+remote** |

`db push --linked --dry-run` after apply → "Remote database is up to date."

## Helper functions (verified live)
Both `language sql`, **STABLE**, **SECURITY DEFINER**, `SET search_path TO ''`,
**owner postgres**, no dynamic SQL. ACL = `postgres`, `anon`, `authenticated`,
`service_role` each `=X` (**EXECUTE**); **no PUBLIC execute** (revoked).
- `public.is_contract_owner(p_contract_id uuid)`:
  `select exists(select 1 from public.contracts c where c.id = p_contract_id and c.user_id = auth.uid())` — queries **only** contracts.
- `public.is_contract_signer(p_contract_id uuid)`:
  `select exists(select 1 from public.contract_signatures cs where cs.contract_id = p_contract_id and cs.client_user_id = auth.uid())` — queries **only** contract_signatures.

## Policy state — before / after (SELECT only; others unchanged)
| policy | before (recursive) | after (live) |
|---|---|---|
| `contracts.contracts_provider_read` | `auth.uid()=user_id OR auth.uid() IN (SELECT cs.client_user_id FROM contract_signatures cs WHERE cs.contract_id=contracts.id)` | `((auth.uid() = user_id) OR is_contract_signer(id))` |
| `contract_signatures.signatures_read_own` | `auth.uid()=client_user_id OR auth.uid() IN (SELECT contracts.user_id FROM contracts WHERE contracts.id=contract_signatures.contract_id)` | `((auth.uid() = client_user_id) OR is_contract_owner(contract_id))` |

Role scope (`public`) and command (SELECT) preserved. INSERT/UPDATE/DELETE
policies on both tables unchanged (`contracts_provider_insert/update/delete`,
`signatures_client_insert/update`).

## 42P17 — before vs after
- **Before:** authenticated `SELECT * FROM contracts` and `... contract_signatures`
  both returned `42P17: infinite recursion detected in policy` (reproduced in the
  investigation and again in SB2a testing).
- **After:** authenticated full-scan of both tables returns rows/empty with **no
  42P17** (recursion full-scan checks: `OK rows=1` for both, against the rolled-back
  fixture).

## Cross-visibility test results (rolled-back fixtures; no rows left behind)
One contract (provider owner) + one signature (signer client) seeded, read under
simulated JWTs, then rolled back.

### contracts SELECT
| actor | expected | result |
|---|---|---|
| provider owner | ALLOW | **1 (ALLOW)** ✓ |
| signing client (cross-read) | ALLOW | **1 (ALLOW)** ✓ |
| unrelated authenticated | DENY | **0 (DENY)** ✓ |
| anon | DENY | **0 (DENY)** ✓ |

### contract_signatures SELECT
| actor | expected | result |
|---|---|---|
| signer/client | ALLOW | **1 (ALLOW)** ✓ |
| contract provider (cross-read) | ALLOW | **1 (ALLOW)** ✓ |
| unrelated authenticated | DENY | **0 (DENY)** ✓ |
| anon | DENY | **0 (DENY)** ✓ |

`service_role` bypasses RLS (unchanged). Critical cross-reads confirmed: signer
reads their contract; provider reads the signature on their contract; unrelated
users read neither.

## Structural regression — before / after
| object | before | after |
|---|---|---|
| tables | 39 | 39 |
| sequence | 1 | 1 |
| views | 2 | 2 |
| **functions** | 11 | **13** (+2 helpers, intended) |
| triggers | 17 | 17 |
| constraints | 158 | 158 |
| non-constraint indexes | 58 | 58 |
| buckets | 4 | 4 |
| storage policies | 11 | 11 |
| public policies | 97 | 97 (two rewritten in place) |

- **SB1 intact:** RLS on categories / shifts / shift_clients = true; categories has 1 policy.
- **SB2a intact:** provider-media has exactly the 4 owner-scoped policies
  (`provider_media_owner_insert/update/delete`, `provider_media_public_read`).

## Differences (intended, this migration only)
1. Two new SECURITY DEFINER helper functions (`is_contract_owner`, `is_contract_signer`).
2. The two recursive SELECT policies rewritten to call the helpers.
Nothing else changed.

## Typecheck
`npx tsc --noEmit` → exit 0.

## PASS / FAIL
**PASS.** Recursion eliminated; authorization semantics preserved and verified.

## SB2b unblocked?
**Yes.** With `contracts` / `contract_signatures` reads no longer recursing, SB2b's
object-bound storage read policies (which subquery these tables — ideally via the
same definer helpers) can be implemented and validated.

## No unintended production data changes
All cross-visibility fixtures were seeded inside a transaction that was aborted
(RAISE), leaving `contracts` and `contract_signatures` at **0 rows** (verified
before and after). No rows, sequences, or objects were persisted by testing.
