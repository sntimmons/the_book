# Pre-canonical migration history (audit artifacts — NOT active migrations)

The `.sql` files in this directory are **historical / audit artifacts**. They are
**no longer active migrations** and are intentionally kept outside
`supabase/migrations/` so the Supabase CLI never treats them as part of migration
tracking.

## What these files are

Reconstructed pre-canonical historical migrations plus the S1B security
migrations:

- `20240101000000_baseline_schema.sql` — reconstructed baseline schema capture
- `20260821000000_provider_services_deposit.sql`
- `20260825120000_self_reference_guards_and_is_mobile.sql`
- `20260826000000_provider_policies_and_business_name.sql`
- `20260828000000_client_identity_surfaces.sql` — S1B-impl-1 (client identity views)
- `20260828120000_clients_rls_lockdown.sql` — S1B-impl-3 (base `clients` RLS lockdown)

## Why they are here and not in `supabase/migrations/`

Their combined effects are **already represented in the canonical baseline**,
`supabase/migrations/20260829000000_canonical_live_baseline.sql`, which was
regenerated from an authoritative `pg_dump` of production and proven — on a clean,
isolated Supabase project — to reproduce production exactly (see
`docs/audits/F5B_ISOLATED_BASELINE_VALIDATION_FINAL.md`).

The active migration set is now a single canonical baseline, with production
migration history marked so that version `20260829000000` is `applied` (see
`docs/audits/F5C_MIGRATION_HISTORY_RECONCILIATION_PLAN.md`).

## Do not move these back

**Do not move any of these files back into `supabase/migrations/`.** The CLI
derives the active migration set from that directory alone; a file placed there
but not recorded as applied in remote history is treated as *pending*, and a
`supabase db push` could then attempt to re-run its DDL against production. Their
effects are already in the canonical baseline, so re-running them is both
unnecessary and unsafe.

## Provenance is preserved

The full history of these changes — including the S1B security work — is
preserved through Git history, the pull requests that introduced them, and the
audit reports under `docs/audits/`. Keeping the files here retains their exact
text for reference without making them executable migrations.
