# F3 - Schema Truth Reconciliation (LIVE vs REPO vs APP)

Status: READ-ONLY INVESTIGATION. No live DB, migration, or app changes were made.
Live project: `kxregomuawwcqvisuhtr` (Postgres 17.6). Repo at `main` `923c2de`.
Method: read-only catalog queries via the Supabase Management API SQL endpoint
(SELECT-only against `pg_catalog` / `information_schema` / `storage`), plus repo
grep/read of `supabase/migrations/**`, loose SQL, Edge Functions, and app queries.
This report is the only file created by F3.

Finding IDs are `F3-Px-###`. F2 findings are referenced, not renumbered.

---

## 1. Executive summary

The live database is the source of truth and is materially larger and more
complex than the repo migrations can reproduce. The repo migrations are a
partial, partly-inaccurate reconstruction; the remote Supabase migration history
is empty. A fresh project built from the repo today would NOT match live.

- **Live public objects:** 39 base tables, 2 views (`clients_public`,
  `clients_provider`), 11 functions, 17 triggers, 97 RLS policies, 4 storage
  buckets, 12 `storage.objects` policies, 5 extensions.
- **Repo migrations define:** 30 base tables, the 2 S1B views, 6 functions
  (5 misnamed vs live), self-reference + count + updated-at triggers, RLS
  policies (baseline + S1B), 4 storage bucket rows, and **zero**
  `storage.objects` policies.
- **9 live-only tables**, **5 live-only functions**, **all 12 storage object
  policies**, and the live security triggers/policies are absent from repo.
- **S1B is correctly reflected live and in repo:** `clients` now has RLS + three
  self-only policies; `clients_public` / `clients_provider` exist and match.
  **F2-P0-001 remains closed.**
- The F2 security drift that is NOT clients-related still exists live: RLS-off +
  broad grants on `categories` / `shifts` / `shift_clients`; object-unbound
  storage policies for contracts and provider-media; bookings `NEW = NEW`
  tautology checks; providers dual UPDATE policy; unset `search_path` on a
  SECURITY DEFINER function; `debug_whoami()` present.
- **Correction to F2:** live `client_reviews` DOES contain the dimension columns
  (`showed_up`, `on_time`, `followed_policy`, `payment_completed`, `private_note`)
  plus `review_text` / `tags`. The F2 "app selects nonexistent columns" concern
  was based on a partial Q1 paste and is **refuted** - the app is compatible with
  live `client_reviews`. The real drift there is repo-behind-live.

Recommended reconstruction: **Option B** - snapshot live as a new canonical
baseline (from a service-role schema dump), preserve the reconstructed
migrations as historical, and mark the canonical baseline applied against the
empty remote history rather than pushing DDL. Do not implement in F3.

## 2. Evidence / method

- Live: `POST /v1/projects/kxregomuawwcqvisuhtr/database/query` (runs as
  `postgres`), SELECT-only against `pg_class`, `pg_attribute`, `pg_constraint`,
  `pg_indexes`, `pg_policies`, `pg_proc`, `pg_trigger`, `information_schema.*`,
  `storage.buckets`. No DDL/DML/writes; migration history untouched.
- Repo: `supabase/migrations/**` (6 files), `supabase/feature_interest*.sql`
  (loose), `supabase/functions/rate-limit`, and `grep` of `.from()/.rpc()/.storage`
  across `app/ lib/ hooks/ context/ components/`.
- Where read-only access cannot prove a fact (e.g. how analytics tables are
  populated, exact bodies of live-only functions), it is marked UNKNOWN.

## 3. Current live inventory

**Extensions (5):** `pg_stat_statements` 1.11, `pgcrypto` 1.3, `plpgsql` 1.0,
`supabase_vault` 0.3.1, `uuid-ossp` 1.1.

**Base tables (39):** all RLS-enabled EXCEPT `categories`, `shifts`,
`shift_clients` (RLS disabled). No table uses FORCE RLS. All owned by `postgres`.

**Views (2):** `clients_public` (id, name, avatar_url) and `clients_provider`
(id, name, created_at, neighborhood) - both `security_invoker=false`, owner
`postgres`, authenticated SELECT only (S1B).

**Functions (11):**

| Function | Lang/Vol | Security | search_path | EXECUTE |
|---|---|---|---|---|
| `reject_self_provider_action()` | plpgsql/volatile | invoker | (none) | broad |
| `set_updated_at()` | plpgsql/volatile | invoker | (none) | broad |
| `update_post_like_count()` / `_save_count()` / `_comment_count()` | plpgsql | invoker | (none) | broad |
| `update_community_like_count()` / `_reply_count()` | plpgsql | invoker | (none) | broad |
| `recompute_provider_rating()` | plpgsql/volatile | **DEFINER** | `public` | broad (anon/auth/service) |
| `provider_review_revealed(uuid)` | sql/stable | **DEFINER** | `""` (safe) | anon/auth/service |
| `prevent_provider_verification_self_update()` | plpgsql/volatile | **DEFINER** | **unset** | broad |
| `debug_whoami()` | sql/stable | invoker | (none) | public/anon/auth/service |

`feature_interest_count(text)` is **absent** live.

**Triggers (17):** self-reference guards (`trg_no_self_*`) on `bookings`,
`conversation`, `provider_follows`, `provider_reviews`, `saved_providers` ->
`reject_self_provider_action`; count triggers on post/community likes/replies/
comments/saves -> `update_*_count`; `set_updated_at` BEFORE UPDATE on
`provider_availability`, `provider_booking_preferences`, `provider_services`,
`providers`, `reports`; `provider_reviews_recompute_rating` ->
`recompute_provider_rating`; `providers_verification_admin_only` ->
`prevent_provider_verification_self_update`.

**Storage buckets (4):** `contract-pdfs` (private), `contract-signatures`
(private), `posts-media` (public, 50MB, image/video MIME allowlist),
`provider-media` (public, 50MB, `image/*,video/*,mp4/*`).

**Storage.objects policies (12):** per-bucket upload/read/delete/update - see
Section 7 for the object-binding flaws.

Full column/constraint/index detail: 371 columns, 158 constraints, 114 indexes
captured; key tables in Section 5 and the Appendix.

## 4. Repo schema inventory

| Path | Purpose | Class | Applied live? | Live-confirmed? |
|---|---|---|---|---|
| `migrations/20240101000000_baseline_schema.sql` | Reconstructed baseline: 28+ tables, RLS, bucket rows, count/updated-at bits | **Reconstructed** | Never recorded (empty history); live built by hand | Partially - tables exist, but drift in columns/policies/function names |
| `migrations/20260821000000_provider_services_deposit.sql` | provider_services deposit cols | Reconstructed | Unknown (history empty) | Columns exist live |
| `migrations/20260825120000_self_reference_guards_and_is_mobile.sql` | self-ref trigger + is_mobile | Reconstructed | Present live (triggers exist) | Yes (triggers match) |
| `migrations/20260826000000_provider_policies_and_business_name.sql` | provider_policies + provider_booking_preferences + businessName | Reconstructed | Present live | Tables exist; column parity not fully diffed |
| `migrations/20260828000000_client_identity_surfaces.sql` | **S1B-1** views | **Authoritative** | **Yes (applied in S1B)** | Yes - views match exactly |
| `migrations/20260828120000_clients_rls_lockdown.sql` | **S1B-3** clients RLS lockdown | **Authoritative** | **Yes (applied in S1B)** | Yes - policies/grants match |
| `supabase/feature_interest.sql` (loose) | `feature_interest` table + RLS | Historical/loose | Table exists live | Table yes; not a migration |
| `supabase/feature_interest_count.sql` (loose) | `feature_interest_count` fn | Historical/loose | **NOT live** | Function absent live |
| `supabase/functions/rate-limit` | Edge fn; needs `rate_limit_log` | Authoritative (code) | `rate_limit_log` exists live | Table live-only (no migration) |
| `supabase/README.md` | States baseline is reconstructed | Authoritative (doc) | n/a | n/a |

Repo migration CREATE TABLE set (30): barter_interests, barter_offers, bookings,
care_reminders, categories, client_reviews, clients, community_bookmarks,
community_post_likes, community_posts, community_replies, community_reports,
contract_signatures, contracts, conversation, messages, post_comments,
post_likes, post_saves, posts, provider_availability, provider_blocked_dates,
provider_booking_preferences, provider_follows, provider_policies,
provider_reviews, provider_services, providers, reports, saved_providers.

Repo CREATE FUNCTION set (6): `bump_post_like_count`, `bump_post_save_count`,
`bump_post_comment_count`, `bump_community_like_count`,
`bump_community_reply_count`, `reject_self_provider_action`. Note the `bump_*`
names - live uses `update_*` (drift, Section 5).

Repo has **no** `storage.objects` CREATE POLICY (only bucket-row inserts).

Filename timestamp order is NOT real production history (history is empty); do
not treat it as authoritative sequence.

## 5. Live vs repo reconciliation

Counts by class:

| Object type | MATCH | LIVE-ONLY | REPO-ONLY | DRIFT | UNKNOWN |
|---|---|---:|---:|---:|---:|
| Base tables | 30 | 9 | 0 | (col drift on several) | 0 |
| Views | 2 | 0 | 0 | 0 | 0 |
| Functions | 1 | 5 | 5 (`bump_*`) | 5 (name: `bump_*` vs `update_*`) | 0 |
| Triggers | ~5 (self-ref) | ~8 | 0 | ~5 (count fn name) | 0 |
| Storage buckets | 4 | 0 | 0 | 0 | 0 |
| Storage object policies | 0 | 12 | 0 | 0 | 0 |
| RLS policies | (many) | (7 live-only tables + extras) | 0 | providers/bookings/reviews | some |
| Extensions | 5 | 0 | 0 | 0 | repo-declared? UNKNOWN |

**LIVE-ONLY tables (9, category B):** `booking_events`, `feature_interest`,
`post_views`, `provider_booking_clicks`, `provider_metrics_daily`,
`provider_profile_views`, `rate_limit_log`, `shift_clients`, `shifts`.

**LIVE-ONLY functions (5):** `set_updated_at`, `recompute_provider_rating`,
`provider_review_revealed`, `prevent_provider_verification_self_update`,
`debug_whoami`.

**REPO-ONLY functions (5, category C):** `bump_post_like_count`,
`bump_post_save_count`, `bump_post_comment_count`, `bump_community_like_count`,
`bump_community_reply_count` - live uses `update_*` equivalents. Functionally
similar, names differ -> DRIFT for the count trigger wiring.

**Column DRIFT (repo behind live), category D:**
- `contracts` - live `provider_id`, `user_id`, `body` are NOT NULL, `title` NOT
  NULL default `'Service Agreement'`, `body` NOT NULL (no default); baseline has
  nullable FKs and `body default ''`. Also live has NO FK `id -> auth.users`.
- `bookings` - live has 38 columns (full payment/dispute/safety/stripe surface);
  baseline defines a much smaller subset.
- `client_reviews` - live has 13 columns incl `review_text`, `tags`,
  `showed_up`, `on_time`, `followed_policy`, `payment_completed`, `private_note`;
  baseline lacks `review_text` and `tags`.
- `provider_booking_preferences` - live has 14 columns; baseline/reconstruction
  assumed fewer.
- `categories` - live has `slug text NOT NULL` + `UNIQUE(slug)`; historically
  absent from the reconstruction.

**Policy DRIFT (D) / LIVE-ONLY (B):**
- `providers` - live has `providers_public_read USING(true)` +
  `providers_update_own` + `providers_update_safe_columns_only` (the latter with
  `col = col` `NEW=NEW` tautology checks). Two permissive UPDATE policies.
- `bookings` - live has split `clients_cancel_own_bookings` (forces
  `status='cancelled'` + tautology pins) and `providers_manage_own_bookings`
  (ownership + `payment_amount = payment_amount`). Baseline had a single
  permissive participant UPDATE policy.
- `provider_reviews` - live has TWO SELECT policies (`provider_reviews_read` via
  `provider_review_revealed`, and `provider_reviews_read_revealed` inline).
- Policies for the 7 non-clients live-only tables are entirely live-only.

**MATCH:** the 30 repo tables all exist live; the 2 S1B views match exactly;
self-reference triggers/functions match; community/post count triggers match in
shape (function-name drift); S1B clients RLS/policies match.

## 6. Live vs app dependency reconciliation

App DB objects referenced (distinct `.from()` targets, plus `.rpc`, storage):

| Object | Files (representative) | Ops | Live compatible? |
|---|---|---|---|
| `providers` (42) | discovery, profile, business, auth resolve | select/insert/update | Yes |
| `bookings` (41) | booking flow, dashboards, notifications | select/insert/update | Yes |
| `clients_provider` (13) | provider business + messaging reads | select | Yes (S1B) |
| `clients` (9) | me/edit, personal-info, ClientMe, onboarding, resolveUserRole, booking-detail self | select/upsert | Yes - self/own-row only (S1B) |
| `clients_public` (2) | lib/reviews.ts, reels comment authors | select | Yes (S1B) |
| `provider_services`, `provider_availability`, `provider_blocked_dates`, `provider_booking_preferences`, `provider_policies`, `provider_follows` | onboarding, availability, booking | mixed | Yes |
| `posts`, `post_likes`, `post_saves`, `post_comments` | reels/feed/portfolio | mixed | Yes |
| `conversation`, `messages` | messaging | mixed | Yes |
| `community_*`, `barter_*` | community hub | mixed | Yes |
| `contracts`, `contract_signatures` | lib/contracts.ts, contract screens | select/upsert/insert | Yes (payload satisfies live NOT NULL) |
| `provider_reviews`, `client_reviews`, `care_reminders`, `saved_providers`, `reports`, `categories` | reviews, care, discovery | mixed | Yes |
| `feature_interest` (2) | components/ComingSoonInterest.tsx | insert/select | Table live (live-only vs migrations) |
| `feature_interest_count` (RPC) | components/ComingSoonInterest.tsx | rpc | **NO - function absent live** |
| `rate_limit_log` | supabase/functions/rate-limit | insert/select | Table live (live-only vs migrations) |
| storage `contract-pdfs`, `provider-media`, `posts-media`, `contract-signatures` | lib/contracts.ts, lib/storage.ts | upload/read | Yes for upload; read has object-binding flaws (Section 7) |

App does NOT reference (no `.from`): `booking_events`, `post_views`,
`provider_booking_clicks`, `provider_metrics_daily`, `provider_profile_views`,
`shifts`, `shift_clients`. None are written by any of the 17 triggers.

Explicit F2 re-checks:
- **`client_reviews`:** live has all columns the app selects (`review_text`,
  `tags`, `showed_up`, `on_time`, `followed_policy`, `payment_completed`). App
  compatible. F2's "selects dimensions that do not exist" is **refuted** (partial
  F2 paste). Drift is repo-behind-live (baseline lacks `review_text`/`tags`).
- **`contracts`:** live `provider_id`/`user_id`/`body` NOT NULL; app save payload
  (`app/(tabs)/business/contract.tsx`) always sends non-null values -> compatible.
  Repo baseline drift (nullable). Storage read flaw is separate (Section 7).
- **`feature_interest_count`:** app still calls `.rpc('feature_interest_count')`
  ([components/ComingSoonInterest.tsx](../../components/ComingSoonInterest.tsx));
  function is **absent live**. Fails soft by component design. (ref F2-P2-014.)
- **`providers`:** live table/policies recorded; `providers_public_read USING
  (true)`, two UPDATE policies, verification trigger. Not remediated in F3.
- **`bookings`:** 38-col shape, CHECK vocab (payment_status/refund_status/status/
  cancellation_actor), tautology UPDATE checks recorded. Not fixed in F3.
- **`clients`:** post-S1B live state is authoritative and repo represents it
  (views + lockdown migrations). Confirmed.

## 7. Security-relevant drift (live, persisting; not remediated in F3)

- **F3-P1-002 - RLS-disabled tables with broad grants (ref F2-P2-010).**
  `categories`, `shifts`, `shift_clients` have RLS OFF and grant
  `SELECT/INSERT/UPDATE/DELETE/...` to BOTH `anon` and `authenticated`. With the
  public anon key, anyone can read/write these. `categories` is app-critical
  reference data (vandalism/integrity risk); `shifts`/`shift_clients` are
  live-only with unknown contents. Authority: LIVE fix.
- **F3-P1-003 - storage object-authorization flaws (ref F2-P1-004/005/006).**
  `contract_pdfs_read` allows `foldername = uid` OR `uid IN (any signer of any
  PDF contract)` - not bound to the object -> any client who signed any PDF
  contract can read every provider's contract PDFs. `signatures_read_own_storage`
  allows `foldername = uid` OR `uid IN (SELECT user_id FROM providers)` -> any
  provider can read any signature object. `provider_media_authenticated_delete`
  / `_update` check only `bucket_id='provider-media'` -> any authenticated user
  can delete/replace any provider's media. None of these policies exist in repo.
  Authority: LIVE fix.
- **F3-P1-004 - booking/provider write-integrity via tautologies (ref F2-P1-003,
  F2-P2-009).** `bookings` UPDATE `WITH CHECK` uses `payment_amount =
  payment_amount`, `no_show_flag = no_show_flag`, etc. RLS has no OLD row, so
  these are `NEW = NEW` no-ops: they do not pin values. `clients_cancel_own` is
  still constrained by `status='cancelled'`, but payment/no_show/dispute are
  mutable by the row owner; `providers_manage_own` only checks ownership.
  `providers` has two permissive UPDATE policies, so
  `providers_update_safe_columns_only` is bypassed by `providers_update_own`;
  privileged-column protection depends on the `providers_verification_admin_only`
  trigger, not RLS. Authority: LIVE fix (needs OLD-vs-NEW trigger or column
  grants).
- **F3-P2-008 - SECURITY DEFINER search_path (ref F2-P2-011, F2-P3-017).**
  `prevent_provider_verification_self_update()` is DEFINER with **unset**
  `search_path`; `recompute_provider_rating()` is DEFINER `search_path=public`
  with EXECUTE granted to anon/authenticated (unnecessary for a trigger fn).
  `provider_review_revealed()` is correctly `search_path=""`.
- **F3-P2-009 - redundant provider_reviews SELECT policies (ref F2-P3-015).** Two
  permissive SELECT policies express the same reveal rule; privacy intact,
  cleanup only. Possible `<` vs `<=` boundary nuance (helper body not dumped).
- **F3-P3-010 - `debug_whoami()` present in production (ref F2-P3-016).**
  Low-sensitivity info function; should not ship.

None of the storage object policies, the verification trigger, the reveal helper,
or the recompute trigger exist in repo migrations -> they are invisible to any
repo-based reproduction (Section 8) and to a human reading the repo.

## 8. Reproducibility assessment

If a fresh empty Supabase project were created and the repo migrations applied in
order today:

1. **Match live? No.**
2. **Missing live objects:** 9 tables (`booking_events`, `feature_interest`,
   `post_views`, `provider_booking_clicks`, `provider_metrics_daily`,
   `provider_profile_views`, `rate_limit_log`, `shift_clients`, `shifts`);
   5 functions (`set_updated_at`, `recompute_provider_rating`,
   `provider_review_revealed`, `prevent_provider_verification_self_update`,
   `debug_whoami`); all 12 `storage.objects` policies; the
   `providers_verification_admin_only` and `provider_reviews_recompute_rating`
   triggers; and many columns (`bookings` payment/dispute/safety,
   `client_reviews` `review_text`/`tags`, `contracts` NOT NULLs,
   `categories.slug`).
3. **Repo objects wrong:** `bump_*` count functions (live `update_*`);
   `contracts` nullable (live NOT NULL); `client_reviews` missing columns;
   `bookings` missing columns; providers/bookings policies differ from live.
4. **Migrations that would fail:** none hard-fail on a fresh DB (creates use
   `IF NOT EXISTS`; S1B drops use `IF EXISTS`). But the S1B lockdown leaves the
   baseline `clients_rw_self` policy in place alongside the new self policies
   (redundant), and the result still diverges from live.
5. **Security rules differ:** fresh gets baseline RLS (older, looser bookings
   policy; no `safe_columns` policy; no verification trigger; no storage object
   policies) - a different, in places weaker, in places non-functional posture.
6. **Storage config missing:** bucket rows exist but with NO object policies ->
   private `contract-pdfs`/`contract-signatures` are inaccessible; uploads fail.
7. **Functions/triggers absent:** ratings recompute, review reveal, verification
   immutability, and `updated_at` maintenance would be missing.
8. **App journeys that would break on a fresh repo build:** interest capture
   (`feature_interest_count` missing), rate limiting (`rate_limit_log` missing),
   contract PDF upload/view (no storage object policies), review reveal + ratings
   (recompute/reveal missing), and any reliance on the richer `bookings` columns.

Conclusion: the repo is **not** a reproducible description of the backend
(F3-P0-001).

## 9. Historical / active classification (LIVE-ONLY and DRIFT objects)

| Object | Classification | Evidence |
|---|---|---|
| `rate_limit_log` | ACTIVE BACKEND SUPPORT | Written by the `rate-limit` Edge Function; documented in `supabase/functions/README.md`. |
| `feature_interest` (table) | ACTIVE AND APP-REFERENCED | `components/ComingSoonInterest.tsx` insert/select; loose SQL in repo. |
| `feature_interest_count` (fn) | ACTIVE APP DEP, ABSENT LIVE | App `.rpc` call; not live -> broken (fails soft). |
| `provider_review_revealed`, `recompute_provider_rating`, `prevent_provider_verification_self_update` | SECURITY-CRITICAL / ACTIVE BACKEND | Referenced by live policies/triggers; drive review reveal, ratings, verification immutability. |
| `set_updated_at` | ACTIVE BACKEND SUPPORT | 5 updated-at triggers. |
| `booking_events` | UNKNOWN (probably legacy/audit) | No app `.from`, no trigger writer found. Population mechanism UNKNOWN. |
| `provider_metrics_daily` | ANALYTICS/INTERNAL (probably inactive) | No app `.from`, no trigger writer. Likely rollup never wired. UNKNOWN populator. |
| `post_views`, `provider_profile_views`, `provider_booking_clicks` | ANALYTICS/INTERNAL | No app `.from`, no trigger writer. Tracking tables, likely unwired. UNKNOWN. |
| `shifts`, `shift_clients` | PROBABLY LEGACY + SECURITY-RELEVANT | No app `.from`, no trigger, RLS OFF + broad grants. Likely an abandoned feature; still writable by anon. |
| `debug_whoami` | LEGACY/DEBUG | Should not ship. |
| `bump_*` functions (repo) | REPO-ONLY / SUPERSEDED | Live uses `update_*`. |

Per instruction, no deletion is recommended solely from a missing `.from()`
reference; `booking_events` and the analytics tables need product/history input
before any decision.

## 10. Remaining unknowns

- **Population + purpose of** `booking_events`, `provider_metrics_daily`,
  `post_views`, `provider_profile_views`, `provider_booking_clicks`, `shifts`,
  `shift_clients` - no writer found in app/triggers/Edge Functions. UNKNOWN.
- **Exact bodies** of the 5 live-only functions (signatures/security captured;
  bodies not dumped) - required inputs for a canonical baseline.
- **Full per-column parity** for all 39 tables (key tables diffed; a complete
  column-by-column diff needs the canonical dump).
- **`provider_booking_preferences`** exact repo-migration columns vs the 14 live.
- Whether the repo is expected to **declare extensions** explicitly (UNKNOWN).
- The `<` vs `<=` boundary in `provider_review_revealed` (helper body not dumped).
- Whether any **out-of-band dashboard changes** post-date this capture (there is
  no migration history to diff against).

## 11. Recommended canonical reconstruction strategy

Two candidates:

- **Option A - retrofit/repair the reconstructed migrations.** Edit baseline +
  later files to add the 9 tables, 5 functions, storage policies, columns, and
  correct policies/function names. Rejected: high effort, high error rate,
  perpetuates a fiction of history, and can never be proven equal to live without
  a dump anyway.
- **Option B (RECOMMENDED) - snapshot live as a new canonical baseline;
  preserve reconstructed files as historical.** Take a service-role,
  schema-only dump of live (via `supabase db dump` with Docker, or a one-off
  `pg_dump --schema-only` using the DB password), commit it as a single new
  canonical baseline migration (timestamped AFTER the S1B files), move the
  existing reconstructed migrations into `supabase/migrations/legacy/` (or a
  documented historical folder) so history is preserved, and reconcile the empty
  remote migration history by marking the canonical baseline (and the real S1B
  files) **applied** via `supabase migration repair --status applied` - never by
  pushing DDL to the live DB.

Why B:
- **Auditability:** one file that provably equals production (diffable against a
  fresh dump), plus the reconstructed files retained as historical context.
- **Risk to live DB:** zero - the dump is read-only; nothing is pushed; history
  is only marked, not applied.
- **Reproducibility:** a fresh project restored from the canonical baseline
  matches live exactly (including live-only tables, functions, storage policies,
  triggers).
- **Handoff:** a new engineer reads one authoritative schema, not a partial
  reconstruction contradicted by the code.
- **Empty remote history:** `migration repair --status applied` records the
  baseline + S1B as already-applied so future `supabase db push` only applies
  genuinely new migrations, and never re-runs production DDL.
- **S1B representation:** the two S1B migrations stay as real, authoritative
  migration files (they are already true and applied); the canonical baseline is
  written to be consistent with them (or dated before them so they layer
  cleanly).
- **Avoiding accidental prod DDL reapply:** because the baseline is marked
  applied (not pushed) and destructive baseline sections (RLS drops, etc.) are
  never executed against live.

Prerequisite (does not exist locally yet): a service-role schema dump. Currently
blocked - no Docker, no `psql`, no DB password in this environment. Acquiring it
is the first step of the implementation batch, not F3.

Do NOT implement in F3.

## 12. Proposed next batches

- **F4 - Canonical baseline capture (read-only dump + commit).** Obtain the
  service-role schema dump, add it as the canonical baseline, relocate
  reconstructed migrations to historical, write `DATA_MODEL.md` from the dump.
  No live change.
- **F5 - Migration-history reconciliation.** `supabase migration repair
  --status applied` for the canonical baseline + S1B; verify `migration list`
  shows a clean state. Carefully gated; no DDL push.
- **S2 - Live security remediation** (separate from schema truth): storage
  object-binding (F3-P1-003), RLS-off tables (F3-P1-002), booking/provider
  write-integrity (F3-P1-004), SECURITY DEFINER search_path (F3-P2-008),
  drop `debug_whoami` (F3-P3-010). Each a reviewed migration, applied
  deliberately.
- **App reconciliation** (small): resolve `feature_interest_count` (create the
  function or remove the call) and fold `feature_interest` / `rate_limit_log`
  into migrations. Not urgent.
- **Product decision:** disposition of `shifts`/`shift_clients`/`booking_events`/
  analytics tables (keep/build/remove) before they enter the canonical baseline
  or a cleanup.

## 13. Appendix - object matrix (summary)

Tables (39): 30 in repo (MATCH by existence, several with column DRIFT) + 9
LIVE-ONLY (`booking_events`, `feature_interest`, `post_views`,
`provider_booking_clicks`, `provider_metrics_daily`, `provider_profile_views`,
`rate_limit_log`, `shift_clients`, `shifts`). 0 REPO-ONLY.

Views (2): `clients_public`, `clients_provider` - MATCH.

Functions (11 live): `reject_self_provider_action` MATCH; `update_*` count x5 vs
repo `bump_*` x5 DRIFT/REPO-ONLY; `set_updated_at`, `recompute_provider_rating`,
`provider_review_revealed`, `prevent_provider_verification_self_update`,
`debug_whoami` LIVE-ONLY.

Storage: 4 buckets MATCH (repo inserts rows); 12 `storage.objects` policies
LIVE-ONLY (3 with authorization flaws).

RLS: enabled on 36/39 tables; OFF on `categories`, `shifts`, `shift_clients`
(security). `clients` = 3 self policies (S1B). 97 policies total; providers/
bookings/provider_reviews carry the security-relevant drift above.

Extensions (5): assumed MATCH; repo-declaration UNKNOWN.

Finding index: F3-P0-001 (reproducibility), F3-P1-002 (RLS-off tables),
F3-P1-003 (storage object binding), F3-P1-004 (booking/provider write-integrity),
F3-P2-006 (function-name + missing-function drift), F3-P2-007 (column drift),
F3-P2-008 (definer search_path), F3-P2-009 (redundant review policies),
F3-P3-010 (`debug_whoami`), F3-P3-011 (unreferenced live-only tables).
