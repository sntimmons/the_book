# Contributing to The Book

This project is being prepared for handoff to professional engineers. These rules
keep changes safe and reviewable. Read [README.md](README.md) and
[docs/README.md](docs/README.md) first.

## Workflow

- **Branch from `main`.** Never commit directly to `main`. Use a short,
  descriptive branch name.
- **Keep changes small and scoped.** One logical change per branch. Large,
  mixed diffs are hard to review and hard to revert.
- **Review the diff before merging.** Read the full `git diff` yourself (or have
  it reviewed) before merge. Do not merge unreviewed work.
- **Run `npm run check` before every commit** (`tsc --noEmit` + ESLint). The
  build must typecheck cleanly.

## Database and Supabase

- **No direct production SQL through application code.** The app talks to Supabase
  through the client and RLS. Do not embed schema-mutating or ad-hoc production
  SQL in application code paths.
- **Schema changes require migrations.** Do not edit the schema in the Supabase
  dashboard. Add a new, timestamped migration file under `supabase/migrations/`
  for every schema change so history is preserved.
- **The committed schema is not yet reconciled with production.** The baseline
  migration was reconstructed from code, so it is not guaranteed to reproduce the
  live database. See [docs/README.md](docs/README.md#open-items--pending-investigations).
  Until reconciliation (Batch F2) lands, treat migrations with caution.

## Changes that require explicit review

- **Security, RLS, authorization, or payment changes require explicit review.**
  These are trust boundaries. Booking authorization, RLS policies, storage
  policies, role resolution, rate limits, and anything money-adjacent must be
  reviewed deliberately, not slipped into an unrelated change.
- **Architecture changes require documentation / ADR consideration.** If a change
  alters a governing decision (backend choice, navigation model, one-account
  role model, review-reveal rules, data-fetching approach), record it: update the
  relevant doc and add or update an ADR under `docs/decisions/`.

## Code conventions

- **Do not silently introduce new domain vocabulary when a canonical term already
  exists.** Reuse the established terms and their source-of-truth modules. For
  example: booking status strings come from `lib/bookingStatus.ts`; a provider's
  row id (`providers.id`) is distinct from its owner's auth id
  (`providers.user_id`); role resolution lives in `lib/resolveUserRole.ts`. If you
  believe a new term is genuinely needed, raise it rather than coining it inline.
- Match the style, naming, and structure of the surrounding code.
- Application behavior, navigation, and Supabase policies are only changed
  deliberately and with review, never as a side effect of another task.

## What "authoritative" means

Documentation is categorized (authoritative / awaiting verification / planned /
historical) in [docs/README.md](docs/README.md). When a document conflicts with
the current source code, **the source code wins.** Keep authoritative docs in
sync when you change the behavior they describe.
