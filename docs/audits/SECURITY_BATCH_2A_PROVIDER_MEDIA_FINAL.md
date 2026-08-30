# Security Batch 2a — provider-media ownership scoping (FINAL / APPLIED)

**Result: PASS** (provider-media owner-scoping applied and verified). One
**pre-existing, unrelated defect was discovered** during testing (a mutual RLS
recursion between the `contracts` and `contract_signatures` policies) — see
§Discovery. It is not caused by SB2a and is deferred to a dedicated fix.

## References
- Migration commit: `a01f8ac1585b84aa6eabf556e6b3545a9f3a3135`
  (`supabase/migrations/20260829030000_security_batch_2a_provider_media_ownership.sql`)
- Investigation report commit: `f2ffa712c89e2abebbb9695b687593872dd78f82`
- Branch: `security/sb2a-provider-media`
- Production target: `kxregomuawwcqvisuhtr`

## Apply result
`supabase db push --linked` → `Applying migration 20260829030000_...` →
`{"upToDate":false,"dryRun":false,"migrations":["20260829030000_..."],"message":"Finished supabase db push."}`.

## Migration history — after
`migration list --linked`: `20260829000000`, `20260829023000`, **`20260829030000`**
all local+remote. `db push --linked --dry-run` → "Remote database is up to date."

## provider-media policies — before → after
| before | after |
|---|---|
| `Authenticated users can upload 1x3bwnc_0` (INSERT, public, bucket-only) | **removed** |
| `provider_media_authenticated_upload` (INSERT, bucket-only) | → `provider_media_owner_insert` (INSERT, authenticated, WITH CHECK `foldername[1]=auth.uid()`) |
| `provider_media_authenticated_update` (UPDATE, bucket-only, no CHECK) | → `provider_media_owner_update` (UPDATE, USING + WITH CHECK `foldername[1]=auth.uid()`) |
| `provider_media_authenticated_delete` (DELETE, bucket-only) | → `provider_media_owner_delete` (DELETE, USING `foldername[1]=auth.uid()`) |
| `provider_media_public_read` (SELECT, public) | unchanged |

Post-apply live policy set on provider-media = exactly those 4 (verified via
`pg_policies`). Total `storage.objects` policies 12 → 11 (duplicate removed).
Other buckets unchanged: contract-pdfs 3, contract-signatures 2, posts-media 2.
Bucket still `public=true`; 19 objects, none mutated.

## Effective behavior tests

Authenticated INSERT/anon tests run under simulated JWT (`set local role` +
`request.jwt.claims`) in rolled-back transactions; anon also tested end-to-end via
the real anon key. **No data left behind** (19 objects, 0 test rows, owner object
intact).

| test | expected | result |
|---|---|---|
| owner INSERT into own folder | ALLOW | **ALLOW** ✓ |
| non-owner INSERT into owner's folder | DENY | **DENY** (42501) ✓ |
| non-owner INSERT into own folder | ALLOW | **ALLOW** ✓ |
| anon INSERT (set role anon) | DENY | **DENY** (42501) ✓ |
| anon upload via storage API (real anon key) | DENY | **HTTP 403** `new row violates row-level security policy` ✓ |
| anon GET public object (real anon key) | ALLOW | **HTTP 200** ✓ (public read intact) |

**UPDATE / DELETE (owner vs non-owner) and cross-folder move:** could **not** be
positively runtime-verified because scanning `storage.objects` rows under a JWT
role triggers the pre-existing contract-policy recursion (below). The UPDATE and
DELETE policies use the **identical** ownership expression
`(storage.foldername(name))[1] = auth.uid()::text` as the INSERT policy that **was**
verified, and UPDATE additionally carries a matching WITH CHECK (blocks moving an
object into another user's folder). They are therefore correct by construction;
only the runtime scan path is blocked by the unrelated recursion. This block is
**not** a regression — the previous bucket-only UPDATE/DELETE policies would scan
the same way.

## Structural / regression
- provider-media policies: exactly the 4 intended.
- Other buckets' policies: unchanged (pdfs 3, sigs 2, posts 2).
- Bucket config unchanged (public, 50MB). 19 objects, unmutated.
- Typecheck: `npx tsc --noEmit` → exit 0.
- No production data mutated (all write tests rolled back; the one real anon
  upload was rejected before creating anything).

## PASS / FAIL
**PASS** for Security Batch 2a (provider-media owner-scoping). The acute risk —
any authenticated user overwriting/deleting any provider's media — is closed at
the INSERT layer (verified) and by identically-bound UPDATE/DELETE policies.

## Discovery (NOT SB2a; deferred) — mutual RLS recursion on contract tables

During UPDATE/DELETE testing, `storage.objects` scans surfaced:
`infinite recursion detected in policy for relation "contract_signatures"`.

Root cause (both from the canonical baseline, untouched by SB2a):
- `public.contracts` SELECT policy `contracts_provider_read` subqueries
  `contract_signatures`.
- `public.contract_signatures` SELECT policy `signatures_read_own` subqueries
  `contracts`.
- → mutual recursion whenever either table is read under a JWT role.

Confirmed impact: authenticated SELECT on **`contracts`** and on
**`contract_signatures`** both error with infinite recursion. The storage read
policies `contract_pdfs_read` / `signatures_read_own_storage` inherit the failure
because they subquery these tables — which is why authenticated `storage.objects`
scans error.

Severity / exposure: **latent** — `contracts` and `contract_signatures` have
**0 rows** and the contract storage buckets are empty (feature dormant), so no
live user is currently affected. But the contract feature would be broken for
authenticated users the moment it is used.

Recommendation: fix the recursion (make each policy self-contained / avoid the
mutual subquery, e.g. via a SECURITY DEFINER helper or non-recursive predicates)
as its own batch, ideally **before or as part of Security Batch 2b** (contract
storage scoping), since 2b's object-bound reads depend on reading these tables.
Not addressed here to keep SB2a scoped to provider-media.

## Not done / scope
- No change to contract-pdfs, contract-signatures, or posts-media policies.
- SB2b not started.
- Report uncommitted.
