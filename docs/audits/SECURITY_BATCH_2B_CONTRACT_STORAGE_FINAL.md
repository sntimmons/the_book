# Security Batch 2b — Contract Storage Scoping (FINAL / APPLIED)

**Result: PASS.** Contract-pdfs and contract-signatures reads are now bound to the
EXACT contract behind each object, using the SB2R non-recursive helper model. The
initial apply was marked FAIL for a privilege reason (anon retained EXECUTE on the
new helpers via Supabase default ACL); a corrective migration removed it.

## Migrations
- `20260829060000_security_batch_2b_contract_storage_scoping.sql` — object-bound
  read policies + two SECURITY DEFINER binding helpers + owner-folder UPDATE.
  Migration commit `43cc61cf586423545c654da39e24005f061495e6`.
- `20260829070000_security_batch_2b_revoke_anon_contract_helpers.sql` — corrective:
  revoke anon EXECUTE on the two helpers. Migration commit
  `11ab7e9b72e046280b23c63c567a11a4e622f53c`.
- Production target: `kxregomuawwcqvisuhtr`.

## Safety gate (both applies)
Linked ref = `kxregomuawwcqvisuhtr`; each dry-run showed exactly the one intended
pending migration; after each apply `migration list --linked` synced and dry-run
reported "Remote database is up to date."

## First apply result & why it was marked FAIL
`20260829060000` applied cleanly and the policies were correct, BUT the required
"no anon EXECUTE" model was not met: both helpers showed
`has_function_privilege('anon', …, 'execute') = true`.

### Supabase default-ACL root cause
`pg_default_acl` for functions in schema `public` (owned by postgres and
supabase_admin) grants EXECUTE to `anon, authenticated, service_role` at
`CREATE FUNCTION` time. The migration's `revoke all … from public` removed only
the PUBLIC grant, not the explicit anon grant, and `grant … to authenticated,
service_role` was redundant. So anon EXECUTE survived. Marked **FAIL**, stopped.

## Corrective migration & final privileges
`20260829070000` runs exactly:
```
revoke execute on function public.can_read_contract_pdf(text)       from anon;
revoke execute on function public.can_read_contract_signature(text) from anon;
```
Post-correction effective privileges (hard gate — PASS):

| function | anon | authenticated | service_role | PUBLIC |
|---|---|---|---|---|
| `can_read_contract_pdf(text)` | **false** | true | true | false |
| `can_read_contract_signature(text)` | **false** | true | true | false |

Raw ACL: `postgres=X | authenticated=X | service_role=X` (no anon, no PUBLIC).

## Migration history
All six local+remote: `…000000, …023000, …030000, …050000, …060000, …070000`.
`db push --linked --dry-run` → up to date.

## Helper verification
- `can_read_contract_pdf(text)`, `can_read_contract_signature(text)`: owner
  postgres, SECURITY DEFINER, STABLE, `search_path=''`, no dynamic SQL, correct
  exact-path bodies, PUBLIC revoked, **anon absent**, authenticated + service_role
  present.
- SB2R helpers `is_contract_owner`/`is_contract_signer` unchanged.

## Exact policy state
- **contract-pdfs**: `contract_pdfs_upload_own` (INSERT owner-folder, kept),
  `contract_pdfs_delete_own` (DELETE owner-folder, kept), `contract_pdfs_update_own`
  (UPDATE owner-folder USING+WITH CHECK, added), `contract_pdfs_read` (SELECT **to
  authenticated**, `bucket='contract-pdfs' AND can_read_contract_pdf(name)`,
  replaced). No broad SELECT remains.
- **contract-signatures**: `signatures_upload_own` (INSERT owner-folder, kept),
  `signatures_read_own_storage` (SELECT **to authenticated**, `bucket=
  'contract-signatures' AND can_read_contract_signature(name)`, replaced). No
  UPDATE, no DELETE (write-once). No broad SELECT remains.

## Object-binding
`split_part(split_part(<url>, '/<bucket>/', 2), '?', 1) = name` — exact equality
after extracting the path suffix (query stripped), mirroring the app's
`storagePathFromUrl`. No wildcard/LIKE. `pdf_url` is a full public URL containing
`/contract-pdfs/`; `signature_url` is analogous (populated when the signature
feature ships; currently null).

## Runtime tests (rolled-back fixtures — two distinct contracts A and B)
All fixtures (2 contracts, 2 signatures, 4 storage objects) seeded in a transaction
aborted via RAISE; nothing persisted.

### contract-pdfs — object A
| test | expected | result |
|---|---|---|
| provider owner reads A | ALLOW | **1 (ALLOW)** ✓ |
| signing client reads A | ALLOW | **1 (ALLOW)** ✓ |
| unrelated provider (B) reads A | DENY | **0** ✓ |
| unrelated client (B) reads A | DENY | **0** ✓ |
| anon reads A | DENY | **0** ✓ |
| owner INSERT own folder | ALLOW | **ALLOW** ✓ |
| client INSERT into provider folder | DENY | **DENY (42501 RLS)** ✓ |
| owner UPDATE own object | ALLOW | **ALLOW** ✓ |
| client UPDATE contract object | DENY | **DENY (0 rows)** ✓ |
| owner cross-folder move (→ other folder) | DENY | **DENY (42501 WITH CHECK)** ✓ |
| owner DELETE own object | ALLOW (policy) | direct-SQL blocked by Supabase `protect_objects_delete` trigger — see note |
| unrelated DELETE | DENY | **DENY** ✓ |

### contract-signatures — object sigA
| test | expected | result |
|---|---|---|
| signer reads own | ALLOW | **1 (ALLOW)** ✓ |
| contract provider reads it | ALLOW | **1 (ALLOW)** ✓ |
| unrelated client reads | DENY | **0** ✓ |
| anon reads | DENY | **0** ✓ |
| signer INSERT own folder | ALLOW | **ALLOW** ✓ |
| signer UPDATE own object | DENY (write-once) | **DENY** ✓ |
| signer DELETE own object | DENY (write-once) | **DENY** ✓ |

**Note on DELETE:** direct SQL `DELETE` on `storage.objects` by the `authenticated`
role is blocked by the Supabase-managed `protect_objects_delete` trigger (raises
42501 even for a zero-row delete), so owner-delete cannot be positively proven via
direct SQL. Real deletes flow through the Storage API, which the RLS DELETE policy
governs. `contract_pdfs_delete_own` uses the identical owner-folder binding proven
for INSERT/UPDATE, so it is correct by construction. Non-owner/unrelated deletes
are denied by both the trigger and RLS. (Same limitation seen in SB2a.)

## Exact-object / cross-contract hard gate — PASS
- **Client A cannot read Client B's PDF**: `pdf_cross_clientA_readsB = 0` ✓
- **Provider A cannot read Provider B's signature**: `sig_cross_provA_readsB = 0` ✓
- **Provider A cannot read Contract B's PDF**: `pdf_cross_provA_readsB = 0` ✓
- Participation in one contract grants no access to another object; only the exact
  object→row→participant binding grants SELECT.

## Recursion regression — PASS
Authenticated full scans of both contract buckets (with objects present) returned
OK — **no SQLSTATE 42P17**. Storage policies call SECURITY DEFINER helpers that
read contracts/contract_signatures without RLS, so no re-entry. SB2R helper
behavior intact.

## Cleanup verification — PASS
After testing: contracts = 0, contract_signatures = 0, contract-pdfs objects = 0,
contract-signatures objects = 0. No temporary rows or objects remain.

## Structural regression
| object | value | note |
|---|---|---|
| tables | 39 | unchanged |
| sequence | 1 | unchanged |
| views | 2 | unchanged |
| functions | **15** | +2 (can_read_contract_pdf/signature) vs the 13 after SB2R |
| triggers | 17 | unchanged |
| constraints | 158 | unchanged |
| non-constraint indexes | 58 | unchanged |
| buckets | 4 | unchanged |
| **storage policies** | 11 → **12** | +1 net: added `contract_pdfs_update_own`; the two SELECT replacements are net-0 |

SB1 (categories RLS on, 1 policy), SB2a (3 `provider_media_owner_*` policies), and
SB2R (2 helpers + 2 fixed contract SELECT policies) all intact.

## Storage policy count before/after (delta explained)
Before SB2b: 11. After: 12. Delta +1 = added `contract_pdfs_update_own`. The two
broad SELECT policies were replaced in place (drop+create → net 0); no policy was
net-removed.

## Typecheck
`npx tsc --noEmit` → exit 0.

## PASS / FAIL
**PASS** (after the corrective migration). Anon EXECUTE removed; reads are exactly
object-bound; cross-contract isolation proven; no recursion; least-privilege met.

## Remaining dependencies / findings
- **contract-signatures reads depend on `signature_url` being populated.** Today
  the app inserts signatures with `signature_url = null` ("until the real canvas
  ships"). Until the signature-upload feature sets `signature_url` (same
  `/contract-signatures/<path>` format), no signature object read will resolve.
  The signer INSERT policy (owner-folder) is ready; the read model is forward-safe.
- Owner DELETE authorization is enforced through the Storage API (guarded by the
  `protect_objects_delete` trigger + the RLS DELETE policy); not exercisable via
  direct SQL.
- No unintended production data/object changes (all fixtures rolled back; contract
  tables and buckets remain empty).
