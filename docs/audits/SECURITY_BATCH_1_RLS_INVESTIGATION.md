# Security Batch 1 — RLS Investigation & Design (READ-ONLY / DESIGN ONLY)

Scope: `public.categories`, `public.shifts`, `public.shift_clients` — the three
tables with RLS **disabled** (known P1 debt from F3). No migration written, no RLS
enabled, no production/app/migration change. This is investigation + design only.

**Headline findings**
- `categories` is **global, read-only reference data** used widely across the app
  (SELECT only; no writes anywhere).
- `shifts` and `shift_clients` are **orphaned** — no app code reads or writes them
  (confirms the F4 UNKNOWN classification). `shifts` has **no owner column**, so no
  provider/client ownership chain exists for it.
- All three currently grant **full CRUD to `anon`** with RLS off → any holder of
  the public anon key can read/insert/update/delete/truncate them today.

---

## 1. Live schema (read-only)

### categories (~20 rows)
| col | type | null | default |
|---|---|---|---|
| id | integer | no | `nextval('categories_id_seq')` |
| name | text | no | |
| slug | text | no | |

- PK `categories_pkey(id)`; UNIQUE `categories_slug_key(slug)`. No FKs, no CHECK, no triggers.
- Indexes: pkey, slug unique.
- Grants (anon / authenticated / service_role): **all three = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE**.
- RLS: **disabled** (not forced). Policy present but **inert**: `categories_public_read` — SELECT, role `public`, `USING (true)`.

### shifts (~3 rows)
| col | type | null | default |
|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` |
| venue | text | no | |
| shift_date | date | no | |
| expected | numeric | no | |
| actual | numeric | no | |
| created_at | timestamptz | yes | `now()` |

- PK `shifts_pkey(id)`. **No FKs. No owner column (no provider_id / user_id).** No CHECK, no triggers, no extra indexes.
- Grants: same full-CRUD to anon / authenticated / service_role.
- RLS: **disabled**. **No policies.**

### shift_clients (~1 row)
| col | type | null | default |
|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` |
| shift_id | uuid | yes | |
| client_id | uuid | yes | |
| created_at | timestamptz | yes | `now()` |
| spend | numeric | yes | `0` |

- PK `shift_clients_pkey(id)`.
- FKs: `shift_id → shifts(id) ON DELETE CASCADE`; `client_id → clients(id) ON DELETE CASCADE`.
- No CHECK, no triggers, **no index on shift_id or client_id** (only the pkey).
- Grants: same full-CRUD to anon / authenticated / service_role.
- RLS: **disabled**. **No policies.**

## 2. App usage map

Single anon-key supabase client (`lib/supabase.ts`); the app is a React Native
(Expo) client — **no server-side API routes** (`app/api` absent); one Edge Function
(`supabase/functions/rate-limit`) which does **not** touch these tables.

### categories — READ ONLY (client-side, often pre-auth)
| File | Op | Context | Ownership used |
|---|---|---|---|
| `hooks/useProviders.ts:272,323,415` (`useCategories` + provider joins) | SELECT | public/any | none |
| `app/(tabs)/reels.tsx:101` | SELECT `id,name` | public discovery (pre-auth) | none |
| `app/(tabs)/business/_layout.tsx:128` | SELECT | authenticated provider | none |
| `app/bookings/[id].tsx:155`, `app/reviews/all/[id].tsx:69`, `app/post-booking/{declined,accepted}.tsx`, `components/ProviderMe.tsx:120`, `lib/community.ts:128` | SELECT | mixed | none |
| `app/care/index.tsx:101` (`providers(...categories(name))`) | SELECT (embedded join) | public | none |

- **Zero** INSERT/UPDATE/DELETE/upsert of `categories` anywhere in app code. Seeding is via migrations/service role, not the app.
- Reads occur in public discovery surfaces (reels/care/search/top-rated/nearby) reachable **before login** → `anon` SELECT is required.

### shifts — NOT USED
- Only textual hit is a comment in `app/book/datetime.tsx:74` ("timezone shifts"). No `.from('shifts')`, no RPC, no reference.

### shift_clients — NOT USED
- Zero occurrences anywhere (app, hooks, lib, Edge Functions).

## 3. Product meaning

- **categories:** global, admin/service-managed **taxonomy** of service categories
  (id/name/slug, seeded, ~20 rows), **publicly readable**. Not provider-managed
  (no app write path; `providers.category_id` merely references it).
- **shifts:** semantics **UNKNOWN / dormant**. Shape (venue, date, expected,
  actual numeric) suggests venue work-shift financial tracking, but nothing in the
  app creates, reads, owns, or modifies shifts, and there is **no owner column**.
  Who creates/owns/reads/modifies: **undetermined and currently no one (via the app).**
- **shift_clients:** a link of a shift to a client with a `spend` amount — a
  per-client spend line for a shift. Also **dormant**: no app path creates the
  link, reads it, or removes it.

## 4. Authorization relationship trace (actual, from live schema + usage)

- **categories:** no ownership dimension — global reference data. Chain: none.
- **shifts:** **no ownership chain exists.** There is no `provider_id`/`user_id`
  column and no FK to `providers`, so `auth.uid() → providers.user_id → shifts.*`
  is **not possible** with the current schema. (The example chains in the brief do
  not hold here.)
- **shift_clients:** the only real chain is **client self**:
  `auth.uid() = clients.id = shift_clients.client_id` (S1B established a client's
  `id` IS their `auth.uid()`). A **provider** chain would require
  `shift_clients.shift_id → shifts.provider_id → providers.user_id = auth.uid()`,
  but `shifts.provider_id` **does not exist**, so provider-scoping is impossible
  today.

## 5. Proposed RLS model (least privilege)

**anon should have NO write on any of the three, and NO access at all to
shifts/shift_clients. anon keeps SELECT on categories only.**

### categories — public read, no client writes
| Op | Role | USING | WITH CHECK | Reason |
|---|---|---|---|---|
| SELECT | anon, authenticated (`public`) | `true` | – | Global reference data read across public + auth surfaces (the existing inert `categories_public_read` policy activates once RLS is on). |
| INSERT/UPDATE/DELETE | (none) | – | – | No app write path; taxonomy is service/admin-managed. `service_role` bypasses RLS for seeds/admin. |

Plus grant cleanup: `REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON categories FROM anon, authenticated;` (keep SELECT). service_role untouched.

### shifts — deny all (orphaned, no owner)
| Op | Role | Policy | Reason |
|---|---|---|---|
| ALL | anon, authenticated | **no policy → denied** | Dormant table, no owner column, no app usage. Nothing legitimately reads/writes it via the app. |

Plus `REVOKE ALL ON shifts FROM anon, authenticated;`. `service_role` (bypasses RLS) retains access for any future server/admin use.

### shift_clients — deny all now (client-self reserved for later)
| Op | Role | Policy | Reason |
|---|---|---|---|
| ALL | anon, authenticated | **no policy → denied** | Dormant; no app usage. |

Plus `REVOKE ALL ON shift_clients FROM anon, authenticated;`. service_role retained.

> Deferred (NOT in this batch): if the shifts feature is revived, add
> `shift_clients` SELECT `USING (client_id = auth.uid())` for client self-view, and
> — only after adding `shifts.provider_id` — provider-scoped policies on both
> tables. Would also need an index on `shift_clients.client_id`.

## 6. Compatibility analysis (hard gate)

| App usage | Verdict | Note |
|---|---|---|
| All `categories` SELECT reads (incl. embedded `categories(name)` joins) | **WILL CONTINUE WORKING** | Public SELECT policy `USING(true)` covers anon + authenticated; embedded joins read category rows fine. |
| `categories` writes | **N/A** | None exist in app; revoking write grants breaks nothing. |
| `shifts` usage | **WILL CONTINUE WORKING (vacuous)** | No app usage; deny-all affects nothing. |
| `shift_clients` usage | **WILL CONTINUE WORKING (vacuous)** | No app usage; deny-all affects nothing. |
| Server/Edge (`rate-limit`) | **WILL CONTINUE WORKING** | Does not touch these tables; service_role bypasses RLS regardless. |

**No app change required. Nothing in the WOULD BREAK or UNCERTAIN column.**

## 7. Security risks

- **Current exposure (RLS off + anon full CRUD):** anyone with the public anon key
  can SELECT/INSERT/UPDATE/DELETE/TRUNCATE all three tables via PostgREST.
  - `categories`: taxonomy can be deleted/tampered → integrity/availability hit
    across discovery, search, provider categorization.
  - `shifts` / `shift_clients`: **anon can read venue financials** (`expected`,
    `actual`, `spend`) and write/delete them — a data-confidentiality + integrity
    IDOR on business/financial data.
- The `categories_public_read` policy is currently **inert** (RLS off), so it
  provides no protection today.
- **Privilege escalation / IDOR:** direct table access with no row scoping is a
  textbook IDOR; enabling RLS closes it.
- **Do broad grants still matter after RLS?** Writes have no policy, so RLS denies
  them even with the grant; but least-privilege says revoke the write grants
  anyway (defense in depth, and to remove anon INSERT/DELETE reachability). SELECT
  grant on `categories` is retained by design.
- **Recursion risk:** none — proposed policies are constant (`true`) or a simple
  `client_id = auth.uid()` (deferred); no policy references a table whose policy
  references back.
- **Performance/index:** `categories` read `USING(true)` is trivial. Deny-all on
  shifts/shift_clients needs no index. (Future `client_id = auth.uid()` would want
  an index on `shift_clients.client_id`.)

## 8. Security test matrix (ALLOW / DENY)

Legend: A = allowed, D = denied. `service_role` bypasses RLS (server-only).

### categories
| Actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | A | D | D | D |
| authenticated (any) | A | D | D | D |
| owning/non-owning provider | A | D | D | D |
| owning/non-related client | A | D | D | D |
| service_role | A | A | A | A |

### shifts
| Actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | D | D | D | D |
| authenticated (any) | D | D | D | D |
| provider (owning/non-owning) | D | D | D | D |
| client (related/unrelated) | D | D | D | D |
| service_role | A | A | A | A |

### shift_clients
| Actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | D | D | D | D |
| authenticated (any) | D | D | D | D |
| provider (owning/non-owning) | D | D | D | D |
| owning client (`client_id = uid`) | D (deferred → A later) | D | D | D |
| non-related client | D | D | D | D |
| service_role | A | A | A | A |

(“Owning provider” rows are D because no provider↔shift relationship exists in the
schema; they cannot be expressed today.)

## 9. Recommendation

**A. SAFE TO IMPLEMENT AS ONE FORWARD MIGRATION.**

All app usage is read-only `categories` (public) and dormant shifts/shift_clients;
enabling RLS with the matrix above breaks nothing and closes an anon read/write
IDOR on financial data. One additive forward migration (RLS enable + the
categories public-read policy + grant revokes) suffices; no app change first.

Proposed migration filename (NOT created): `supabase/migrations/20260830000000_security_batch_1_rls_categories_shifts.sql`

## 10. Status

- Report: `docs/audits/SECURITY_BATCH_1_RLS_INVESTIGATION.md` (uncommitted).
- No migration created; no RLS enabled; no grants changed; production, app code,
  and migration history unchanged. Production access was read-only introspection.
