# Security Batch 2R — Contracts / Contract Signatures RLS Recursion (INVESTIGATION / DESIGN ONLY)

Scope: `public.contracts` and `public.contract_signatures`. Read-only + design.
No migration, no production/app/migration change.

**Headline:** the two tables' SELECT policies subquery each other, creating a
mutual RLS recursion (SQLSTATE **42P17**). Any authenticated read of either table
errors. Both tables have **0 rows** (contract feature dormant), so the defect is
latent, but the feature is broken the moment it is used — and it **blocks SB2b**,
whose object-bound storage reads must query these tables. Fix is **policy + two
SECURITY DEFINER helper functions**; no schema or app change.

---

## 1. Live schema

### contracts (0 rows, RLS on, not forced)
| col | type | null | notes |
|---|---|---|---|
| id | uuid | no | PK `contracts_pkey` |
| provider_id | uuid | no | FK→providers.id ON DELETE CASCADE; **UNIQUE** (`contracts_provider_id_key`) — one contract per provider |
| user_id | uuid | no | FK→auth.users; **= the provider's auth uid (owner)** — see §5 |
| title, body | text | no | |
| is_active | bool | no | |
| contract_type | text | no | 'text' or 'pdf' |
| pdf_url, pdf_filename | text | yes | path of the PDF object when contract_type='pdf' |
| created_at, updated_at | timestamptz | no | |
- Indexes: pkey, `provider_id` unique. No triggers.
- Grants: anon / authenticated / service_role all have full CRUD (DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE).

### contract_signatures (0 rows, RLS on, not forced)
| col | type | null | notes |
|---|---|---|---|
| id | uuid | no | PK |
| contract_id | uuid | no | FK→contracts.id ON DELETE CASCADE |
| booking_id | uuid | no | FK→bookings.id ON DELETE CASCADE; **UNIQUE** — one signature per booking |
| client_user_id | uuid | no | FK→auth.users; **= the signing client's auth uid** |
| signature_url | text | yes | |
| signed_at | timestamptz | yes | |
| status | text | no | |
| created_at | timestamptz | no | |
- Indexes: pkey, `booking_id` unique. No triggers.
- Grants: anon / authenticated / service_role all full CRUD.

## 2. Recursion reproduced (read-only, role simulation)

- Query (as `authenticated` with a real provider's JWT sub): `select * from public.contracts limit 1;`
- Error: **`42P17: infinite recursion detected in policy for relation "contracts"`**
  (symmetrically, `select * from public.contract_signatures` → `42P17 ... "contract_signatures"`).
- Recursion begins at the first table's SELECT policy and never terminates.

### Exact recursion chain
1. Read `contracts` → policy `contracts_provider_read` USING evaluates
   `auth.uid() IN (SELECT cs.client_user_id FROM contract_signatures cs WHERE cs.contract_id = contracts.id)`.
2. That subquery reads `contract_signatures` under RLS → policy `signatures_read_own` USING evaluates
   `auth.uid() IN (SELECT c.user_id FROM contracts c WHERE c.id = contract_signatures.contract_id)`.
3. That subquery reads `contracts` under RLS → back to `contracts_provider_read` (step 1).
4. → infinite loop → 42P17. (Same cycle if the read starts on `contract_signatures`.)

The cycle is **`contracts_provider_read` ⇄ `signatures_read_own`**, each subquerying
the other RLS-protected table.

## 3. Complete policy inventory

### contracts
| policy | cmd | roles | USING | WITH CHECK | refs |
|---|---|---|---|---|---|
| `contracts_provider_read` | SELECT | public | `auth.uid()=user_id OR auth.uid() IN (SELECT cs.client_user_id FROM contract_signatures cs WHERE cs.contract_id=contracts.id)` | – | **contract_signatures** (recursion) |
| `contracts_provider_insert` | INSERT | authenticated | – | `auth.uid()=user_id AND auth.uid() IN (SELECT user_id FROM providers)` | providers (non-recursive) |
| `contracts_provider_update` | UPDATE | public | `auth.uid()=user_id` | – | self only |
| `contracts_provider_delete` | DELETE | authenticated | `auth.uid()=user_id` | – | self only |

### contract_signatures
| policy | cmd | roles | USING | WITH CHECK | refs |
|---|---|---|---|---|---|
| `signatures_read_own` | SELECT | public | `auth.uid()=client_user_id OR auth.uid() IN (SELECT contracts.user_id FROM contracts WHERE contracts.id=contract_signatures.contract_id)` | – | **contracts** (recursion) |
| `signatures_client_insert` | INSERT | authenticated | – | `auth.uid()=client_user_id` | self only |
| `signatures_client_update` | UPDATE | public | `auth.uid()=client_user_id` | – | self only |

**Other hidden recursion risks:** none. No other table's policy references
`contracts`/`contract_signatures` (checked). The `providers` subquery in
`contracts_provider_insert` is safe — `providers` policies (`providers_public_read`
USING true, `providers_insert_own`, `providers_update_own`) reference only
`providers`/`auth`, no back-reference. Only the two SELECT policies above recurse.

## 4. App usage map

Single anon-key client. All contract reads are authenticated and currently error.

| file | operation | actor | relationship | depends on RLS |
|---|---|---|---|---|
| `app/(tabs)/business/contract.tsx:99` | `contracts.upsert(...)` | provider | own contract (user_id=auth.uid()) | write policies (work) |
| `lib/contracts.ts:118` `fetchProviderContract` | `contracts` SELECT `.eq(provider_id,…)` | provider | own | **read policy (recurses)** |
| `lib/contracts.ts:222` `getSignedContract` | `contracts` SELECT `.eq(id,…)` | provider/client viewer | party | **read policy (recurses)** |
| `app/book/payment.tsx:172` | `contract_signatures.insert({…})` | client | own signature (client_user_id=auth.uid()) | insert policy (works) |
| `lib/contracts.ts:136,156,211` | `contract_signatures` SELECT | provider/client | party | **read policy (recurses)** |

Writes (provider upsert of contract; client insert of signature) do **not**
recurse and work today. **Reads of both tables error** — the contract feature is
non-functional for authenticated reads (latent because 0 rows exist yet).

## 5. Intended authorization model (actual relationships)

- **Provider (contract owner):** `auth.uid() = contracts.user_id`
  (and `contracts.provider_id → providers.id`, `providers.user_id = auth.uid()`).
  `contracts.user_id` holds the **provider's** auth uid — confirmed by
  `contracts_provider_insert` (`auth.uid()=user_id AND auth.uid() IN providers`) and
  the app (provider upserts their own contract; one contract per provider).
- **Signing client:** `auth.uid() = contract_signatures.client_user_id`.
- **Signature → contract:** `contract_signatures.contract_id → contracts.id`.
- **Cross-visibility (legitimate, and the source of the cycle):**
  - a **client who signed** a contract may read that contract
    (`contracts_provider_read` second branch);
  - the **contract's provider** may read the signatures on it
    (`signatures_read_own` second branch).

Both cross-table checks are legitimate; they simply must not re-enter RLS.

## 6. Design options

### A. Direct-column / one-way joins only (no helper)
Drop the cross-table branches so each policy references only its own columns:
`contracts` readable only by owner; `contract_signatures` readable only by signer.
- Recursion: eliminated.
- Security: over-restrictive — a signing client could not read the contract text
  they must sign, and a provider could not see who signed. **Breaks the feature's
  intent.** Rejected.

### B. SECURITY DEFINER helper functions (recommended)
Move each cross-table lookup into a `SECURITY DEFINER` function owned by a
BYPASSRLS role (postgres), so the lookup does not re-invoke the other table's RLS:
- `public.is_contract_owner(p_contract_id uuid) returns boolean` — `SECURITY DEFINER
  STABLE`, `set search_path = public`: `select exists(select 1 from contracts
  where id = p_contract_id and user_id = auth.uid())`.
- `public.is_contract_signer(p_contract_id uuid) returns boolean` — same modifiers:
  `select exists(select 1 from contract_signatures where contract_id = p_contract_id
  and client_user_id = auth.uid())`.
Then rewrite ONLY the two SELECT policies:
- `contracts_provider_read`: `auth.uid() = user_id OR public.is_contract_signer(id)`.
- `signatures_read_own`: `auth.uid() = client_user_id OR public.is_contract_owner(contract_id)`.
- Recursion: eliminated (definer functions bypass RLS on the queried table, so no
  policy re-entry). `auth.uid()` still reflects the caller inside a definer.
- Security: functions are narrow (single parameterized EXISTS filtered by
  `auth.uid()`), STABLE, pinned `search_path`, owned by postgres; they expose only
  a boolean, no row data. This is the standard Supabase pattern for this exact
  problem.
- Maintainability: good; intent is explicit and centralized.
- Performance: one indexed EXISTS per row (contracts.pkey / contract_signatures FK;
  an index on `contract_signatures(contract_id)` would help at volume — none today,
  0 rows). Fine.
- Compatibility: no schema change, no app change; **fixes** currently-broken reads.

### C. Schema denormalization (e.g. add provider_user_id to contract_signatures)
Avoids cross-table entirely.
- Recursion: eliminated.
- Cost: schema change + backfill + app must maintain the duplicated column;
  higher risk/maintenance. Unnecessary given Option B. Rejected (overkill).

**Chosen: Option B.**

## 7. Recommended exact policy model

Functions (new): `is_contract_owner(uuid)`, `is_contract_signer(uuid)` — SECURITY
DEFINER, STABLE, `set search_path=public`, owner postgres, `grant execute` to
anon, authenticated (harmless; they self-filter by `auth.uid()`).

### contracts
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| provider (owner, user_id=uid) | ALLOW | ALLOW (own) | ALLOW | ALLOW |
| client who signed | ALLOW (via `is_contract_signer`) | DENY | DENY | DENY |
| unrelated authenticated | DENY | DENY (not owner / not provider) | DENY | DENY |
| anon | DENY | DENY | DENY | DENY |
| service_role | ALLOW | ALLOW | ALLOW | ALLOW |

Rewrite `contracts_provider_read` USING → `auth.uid() = user_id OR
public.is_contract_signer(id)`. Keep insert/update/delete policies as-is.

### contract_signatures
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| signer (client, client_user_id=uid) | ALLOW (own) | ALLOW (own) | ALLOW (own) | DENY (no policy) |
| contract provider | ALLOW (via `is_contract_owner`) | DENY | DENY | DENY |
| contract client | = signer row (same as signer) | – | – | – |
| unrelated authenticated | DENY | DENY | DENY | DENY |
| anon | DENY | DENY | DENY | DENY |
| service_role | ALLOW | ALLOW | ALLOW | ALLOW |

Rewrite `signatures_read_own` USING → `auth.uid() = client_user_id OR
public.is_contract_owner(contract_id)`. Keep insert/update as-is; no delete policy.

**Companion hardening (recommended, defense-in-depth):** the read/update policies
are currently `TO public`; scope them `TO authenticated` and revoke the anon table
grants (anon has full CRUD today, gated only by policies). Optional but matches the
SB1 pattern; can be included in the same migration or deferred.

## 8. Compatibility analysis

| app operation | verdict |
|---|---|
| provider `contracts.upsert` (write) | **WILL CONTINUE WORKING** (write policies unchanged) |
| `fetchProviderContract` / `getSignedContract` (contracts SELECT) | **WILL CONTINUE WORKING — and is FIXED** (recursion removed) |
| client `contract_signatures.insert` (write) | **WILL CONTINUE WORKING** |
| `fetchContractSignature` etc. (contract_signatures SELECT) | **WILL CONTINUE WORKING — and is FIXED** |

Nothing WOULD BREAK; SB2R only removes recursion (net improvement) and, with the
optional companion, tightens anon. **No app change required.**

## 9. SB2b dependency

SB2b's object-bound storage reads (`contract_pdfs_read`,
`signatures_read_own_storage`) subquery `contracts` / `contract_signatures`. While
those tables recurse, any authenticated `storage.objects` scan that evaluates those
policies also errors (as seen in SB2a). Therefore **SB2R MUST be implemented before
SB2b** — SB2b cannot be validated (or function) until the table-level recursion is
fixed. (SB2b's rewritten storage policies should also route cross-table checks
through the same SECURITY DEFINER helpers.)

## 10. Security test matrix (ALLOW / DENY)

`service_role` bypasses RLS (ALLOW), omitted below. **All authenticated SELECT rows
double as recursion-gone proof** — they must return a result set instead of 42P17.

### contracts
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | DENY | DENY | DENY | DENY |
| contract provider (owner) | ALLOW (no recursion) | ALLOW (own) | ALLOW | ALLOW |
| contract client (signed) | ALLOW (no recursion) | DENY | DENY | DENY |
| unrelated provider | DENY | DENY | DENY | DENY |
| unrelated client | DENY | DENY | DENY | DENY |

### contract_signatures
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | DENY | DENY | DENY | DENY |
| signer (client) | ALLOW own (no recursion) | ALLOW own | ALLOW own | DENY |
| contract provider | ALLOW (no recursion) | DENY | DENY | DENY |
| contract client | ALLOW (own signature) | ALLOW own | ALLOW own | DENY |
| unrelated authenticated | DENY | DENY | DENY | DENY |

Explicit recursion-gone tests: authenticated `select * from contracts` and
`select * from contract_signatures` must succeed (return rows / empty set), not
42P17; and a cross-visibility positive (provider reads a signature on their
contract; client reads the contract they signed) must return the row.

## 11. Recommendation

**B. NEEDS HELPER FUNCTION(S).** A policy-only migration that adds two SECURITY
DEFINER helper functions and rewrites the two recursive SELECT policies (optionally
plus anon-grant/`TO authenticated` hardening). No schema change, no app change.
**Must land before SB2b.**

Proposed migration filename (NOT created):
`supabase/migrations/20260830000000_security_batch_2r_contract_rls_recursion_fix.sql`

## 12. Status

- Report: `docs/audits/SECURITY_BATCH_2R_CONTRACT_RLS_RECURSION_INVESTIGATION.md` (uncommitted).
- No migration created; no production/app/migration change. Production access was
  read-only introspection + rolled-back role simulation.
