# F4 - Canonical Baseline Plan

Companion to `F4_LIVE_SCHEMA_SNAPSHOT.sql`. Explains which parts of the captured
live schema should become the future canonical migration baseline, which should
not, and how the migration history should later be reconciled. **F4 does not
implement any of this.** No live DB, migration, or app changes were made.

## What the snapshot is (and is not)

`F4_LIVE_SCHEMA_SNAPSHOT.sql` is an exact, read-only capture of the live `public`
schema (plus storage config) via `pg_get_*` catalog functions. It is a
**reference artifact**, not a migration, and must not be executed. It captures
current live state verbatim, including known-bad security definitions, so that a
canonical baseline can later be authored from truth rather than guesswork.

## What SHOULD become the canonical baseline

The baseline should reproduce the current live `public` app schema exactly:

- **App-relevant extensions:** `pgcrypto` (used by `gen_random_uuid()` defaults),
  `uuid-ossp`. Emit as `create extension if not exists`.
- **All 39 base tables** with exact columns/types/nullability/defaults.
- **All constraints** (PK, UNIQUE, FK, CHECK) via the captured
  `pg_get_constraintdef`.
- **All non-constraint indexes** via `pg_get_indexdef` (58; PK/UNIQUE indexes are
  created by their constraints).
- **The 2 S1B views** (`clients_public`, `clients_provider`) with
  `security_invoker=false` and their grants.
- **All 11 functions** via `pg_get_functiondef` (the live `update_*` count
  functions, `set_updated_at`, `reject_self_provider_action`,
  `recompute_provider_rating`, `provider_review_revealed`,
  `prevent_provider_verification_self_update`, and yes, `debug_whoami` - see
  "known-bad" below).
- **All 17 triggers** via `pg_get_triggerdef`.
- **RLS enable** on the 36 RLS-on tables; leave `categories`, `shifts`,
  `shift_clients` as-is (RLS off) to mirror live.
- **All 97 policies** reconstructed as `CREATE POLICY`.
- **Table/view grants** for anon/authenticated/service_role. (No genuine
  column-level grants exist - `pg_attribute.attacl` returned 0 rows - so none are
  needed.)
- **Storage config:** the 4 `storage.buckets` rows and the 12 `storage.objects`
  policies.
- The **9 live-only tables** (`booking_events`, `feature_interest`, `post_views`,
  `provider_booking_clicks`, `provider_metrics_daily`, `provider_profile_views`,
  `rate_limit_log`, `shift_clients`, `shifts`). They exist live, so the baseline
  must include them to be reproducible, each annotated with its F3 classification.

## What should NOT go into the canonical baseline

- **Supabase-managed extensions/infra:** `supabase_vault`, `pg_stat_statements`,
  and `plpgsql` (default). These are provisioned by the platform; do not recreate
  them.
- **Supabase-managed schemas:** do not attempt to recreate `auth`, `storage`,
  `vault`, `extensions`, `graphql`, etc. The baseline references `storage.buckets`
  rows and `storage.objects` policies (which are app-owned config) but does NOT
  recreate the `storage` schema/tables themselves.
- **Row data**, `auth.users` data, and any secrets/credentials/tokens.
- **The reconstructed `bump_*` functions** from the current repo baseline - live
  uses `update_*`; the `bump_*` names are historical and wrong.
- **`feature_interest_count()`** - it does not exist live, so the baseline (which
  mirrors live) must not include it. The app's `.rpc('feature_interest_count')`
  call is a separate app-fix decision (create the function or remove the call).

## Known-bad objects: capture as-is, fix forward

The baseline's job is reproducibility, not remediation. It should therefore
include the current (flawed) live definitions verbatim, each tagged with a
comment pointing at the F3 finding, and the security fixes should be **separate
forward migrations** (batch S2) layered on top:

- RLS-off + broad grants on `categories`/`shifts`/`shift_clients` (F3-P1-002).
- Object-unbound storage policies `contract_pdfs_read`,
  `signatures_read_own_storage`, `provider_media_authenticated_delete/update`
  (F3-P1-003).
- `bookings` `NEW = NEW` tautology UPDATE checks and the providers dual-UPDATE
  policy (F3-P1-004).
- `prevent_provider_verification_self_update` unset `search_path` (F3-P2-008).
- Redundant `provider_reviews` SELECT policies; note the boundary nuance now
  resolved by the capture: the helper `provider_review_revealed` uses
  `completed_at <= now() - 7 days`, while `provider_reviews_read_revealed` uses
  `<` (a one-instant difference, not a leak) (F3-P2-009).
- `debug_whoami()` present (F3-P3-010).

Keeping these in the baseline (with comments) means a fresh DB reproduces live
faithfully; the S2 forward migrations then bring both live and fresh to the fixed
state through the same auditable path.

## Phase 11 - migration structure answers

1. **Move reconstructed pre-S1B migrations to historical/archive?** Yes. The
   baseline, provider_services_deposit, self_reference_guards_and_is_mobile, and
   provider_policies_and_business_name are reconstructions that do not reproduce
   live and are superseded. Move them to `supabase/migrations/legacy/` (or an
   `archive/` doc area), preserved not deleted, with a README noting they are
   historical and non-authoritative.

2. **One canonical baseline for current live?** Yes. A single new timestamped
   baseline migration that reproduces current live (post-S1B) exactly, authored
   from a service-role schema dump validated against this snapshot.

3. **How to represent the two S1B migrations if their effects are already in the
   baseline?** The only accurate snapshot is current live, which already includes
   the S1B effects; there is no correct pre-S1B baseline to layer them onto
   (the pre-S1B reconstruction was itself wrong). So fold the S1B effects INTO
   the canonical baseline (baseline = current live incl S1B) and archive the two
   S1B migration files alongside the reconstructed ones. Their review history is
   preserved in git; their result is in the baseline. Do NOT keep them as
   separate forward migrations after the baseline (that would double-apply on a
   fresh DB).

4. **Which migrations marked applied remotely?** Only the single canonical
   baseline version. Once the active `supabase/migrations/` directory contains
   just the canonical baseline (everything else archived), `migration repair
   --status applied <baseline_version>` records that one. Do NOT mark every
   existing repo migration applied - most are being archived. The repair set is
   derived from the final structure (one baseline), not from the current files.

5. **Ensure a future `db push` will not re-run already-live DDL?** After F5
   marks the baseline applied, remote history contains the baseline version, so
   `db push` skips it and only applies genuinely new migrations authored after it
   (e.g. the S2 security fixes). As defense in depth, author the baseline with
   `create ... if not exists` / `create or replace` where practical, but it
   should never execute against live because it is marked applied.

6. **How to validate the baseline on an isolated fresh database before touching
   remote history?** Apply the canonical baseline to a THROWAWAY fresh Supabase
   project (or a local Postgres 17 instance), then re-run the exact F4 capture
   queries against it and diff the result against `F4_LIVE_SCHEMA_SNAPSHOT.sql`.
   It must match object-for-object. Only after a clean diff do the F5 repair on
   the linked project. Never `db reset`/`db push`/`migration repair` against the
   linked production project during validation.

## Prerequisite and constraints

- Authoring the canonical baseline needs a **service-role schema dump** as input
  (`supabase db dump --linked` via Docker, or `pg_dump --schema-only` with the
  DB password). This snapshot proves the target; the dump provides
  execution-ready DDL with correct ordering/ownership. Neither Docker, `psql`,
  nor the DB password is available in the current environment, so acquisition is
  the first step of the implementation batch (F4-impl / F5), not F4.
- Do NOT run `migration repair`, `db push`, `db pull`, or `db reset` as part of
  authoring or validating. Remote migration history stays empty until F5.

## Recommended sequence (future, not now)

- **F4-impl:** obtain the service-role dump; author the single canonical baseline
  from it, validated against this snapshot; archive the reconstructed + S1B
  migrations to `legacy/`; write `docs/architecture/DATA_MODEL.md` from the
  baseline.
- **F5:** on an isolated fresh DB, validate; then on the linked project,
  `migration repair --status applied <baseline_version>` only. No DDL push.
- **S2:** forward security-fix migrations for the F3 findings, applied
  deliberately and reviewed.
- **Product decision:** disposition of `shifts`/`shift_clients`/`booking_events`/
  analytics tables before they are cleaned (not before the baseline, which must
  mirror live).
