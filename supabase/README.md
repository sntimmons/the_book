# The Book — Supabase Schema

## What this is

`migrations/20240101000000_baseline_schema.sql` is a **baseline capture** of the
database schema — **not** a real migration history.

The database was originally built by hand in the Supabase dashboard, so no
migration files ever existed. This baseline was reconstructed from **code
analysis** (every `supabase.from()` / `.select()` / `.insert()` / `.update()`
call in the app) plus a set of **live REST probes** run during the security /
hardening session. It is a starting point for schema version control, not an
authoritative record of how production was built.

## How the schema was derived (confidence levels)

| Source | Tables | Confidence |
|---|---|---|
| Live REST probe (full column list observed) | `providers`, `bookings`, `clients` | **High** — columns and names confirmed |
| Code usage (insert/select/update object keys) | all other 25 tables | **Medium** — column *names* are real (the code uses them) but *types*, defaults, nullability, and any columns the code never touches are **inferred** |

28 tables total (matches the tables the app queries).

## How to apply it

### Fresh Supabase project (primary use)
1. Create a new Supabase project.
2. Open the SQL Editor.
3. Paste the contents of `migrations/20240101000000_baseline_schema.sql` and run it.
4. This creates all tables, storage buckets, count triggers, and a hardened RLS
   baseline. You now have a working approximation of production to develop against.
5. Point a dev `.env` / `lib/supabase.ts` at the new project and run the app.

### Existing / production database — ⚠️ READ THIS FIRST
- The **CREATE TABLE** statements all use `IF NOT EXISTS`, so they are safe no-ops
  on tables that already exist. **They will NOT add missing columns** to an
  existing table (Postgres skips the whole statement if the table exists).
- The **RLS section is destructive on an existing DB.** It uses
  `DROP POLICY IF EXISTS` + `CREATE POLICY`, which **replaces** whatever policies
  are currently live with this file's version. If production already has correct
  (or different) policies, running the RLS section will overwrite them.
- **Do not run this whole file against production.** If you want to adopt the
  hardened policies, review the section 12 (RLS) block, diff it against what's
  actually live (`select * from pg_policies;`), and apply the parts you want
  deliberately.

## What this baseline intentionally hardens

The RLS section encodes the fixes from the security audit, not necessarily what
is live today:
- **Community is provider-gated in RLS** (not just the UI) — a non-provider JWT
  cannot read `community_posts` / `community_replies`.
- **Provider privilege columns are column-`REVOKE`d** from `authenticated`
  (`is_approved`, `is_featured`, `verification_status`, `identity_verified`,
  `stripe_*_enabled`, `rating`, `review_count`, …) so a provider cannot
  self-verify / self-feature / inflate stats via a direct API update.
- **`clients` and `care_reminders` are strictly self-scoped** (`id = auth.uid()`).
- **Messaging is participant-scoped** (`conversation` singular table).

## Known gaps (do not assume this is complete)

1. **Types are best-effort.** Money is `numeric`, ids are `uuid`, counts are
   `integer`, timestamps are `timestamptz` — but exact precision/scale,
   enums vs `text`, and check constraints are **not** captured.
2. **Columns the code never touches are missing.** Only `providers`, `bookings`,
   and `clients` have their full production column list (from live probes).
   Every other table only has the columns the app reads or writes. Production
   almost certainly has more (audit fields, internal flags, etc.).
3. **RLS policies are the *intended* baseline, not a dump of production.** They
   were never read from the live DB (the anon key cannot read `pg_policies`).
   Treat them as recommendations to reconcile, not ground truth.
4. **Booking write-integrity is not fully locked.** The baseline scopes bookings
   to participants but does **not** yet stop a client from setting
   `status='completed'` / `no_show_flag` / `payment_*`. That needs per-role
   column grants or a trigger (audit critical #3) — still owed.
5. **Storage bucket policies are not included** — only the bucket rows
   (public/private). The per-bucket object RLS (who can upload/download) must be
   configured separately, especially for the private `contract-pdfs` /
   `contract-signatures` buckets.
6. **No seed data.** `categories` is created empty; production seeds it. Add a
   separate seed file if needed.
7. **Triggers assume the count columns exist and start at 0.** If production
   maintained counts differently, reconcile before enabling.

## For the engineer taking this over

The highest-value next step is to make this baseline *true*:
1. With **service-role** access, dump the real schema:
   `pg_dump --schema-only` (or Supabase CLI `supabase db pull`) and diff it
   against this file. Replace this baseline with the real dump when you have it.
2. Dump `select * from pg_policies;` and reconcile section 12 against reality.
3. Confirm the four storage buckets exist with the right public/private setting
   and object-level policies.
4. From here on, **stop editing the schema in the dashboard.** Add a new,
   timestamped migration file for every change so history is preserved.

This file exists so the next person is not staring at 28 undocumented tables.
It is a floor, not a ceiling.
