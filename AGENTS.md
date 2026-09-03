# The Book - Guidance for AI tools and contributors

## Read these first, in order

1. [README.md](README.md) - what the app is, the stack, how to run it, and the
   environment caveat.
2. [CONTRIBUTING.md](CONTRIBUTING.md) - how to make changes safely (branch from
   main, small scoped diffs, `npm run check`, migrations for schema changes,
   explicit review for security/RLS/payment, no new domain vocabulary).
3. [docs/README.md](docs/README.md) - the documentation index. It labels every
   document as authoritative, awaiting verification, planned, or historical, and
   lists the current open items.
4. The relevant authoritative documents for your task:
   - [docs/product/CURRENT_STATE.md](docs/product/CURRENT_STATE.md) - **start here**
     for what is actually true on `main` today. It links out to the owning document
     for each area rather than restating it.
   - [docs/product/PRODUCT_DECISIONS.md](docs/product/PRODUCT_DECISIONS.md) - locked
     decisions (PD-NNN), and
     [docs/product/OPEN_QUESTIONS.md](docs/product/OPEN_QUESTIONS.md) - what is
     deliberately undecided (OQ-NNN). Do not resolve an open question by
     implementing one answer.
   - [docs/architecture/NAVIGATION.md](docs/architecture/NAVIGATION.md) - the
     governing navigation model.
   - [supabase/README.md](supabase/README.md) - the Supabase entry point: which
     migrations are active, which historical files must never be applied, and where
     reconciliation authority lives
     ([docs/operations/MIGRATION_LEDGER.md](docs/operations/MIGRATION_LEDGER.md)).
   - [supabase/functions/README.md](supabase/functions/README.md) - the
     `rate-limit` Edge Function.

## Distinguish three kinds of information

Always know which one you are reading or writing, and never conflate them:

- **CURRENT IMPLEMENTATION** - what the code does today. Verifiable in `app/`,
  `lib/`, `supabase/`. This is the only evidence of actual behavior.
- **TARGET / PROPOSED ARCHITECTURE** - intended future state described in docs.
  Not yet built. Do not assume it exists.
- **HISTORICAL AUDITS** - dated snapshots under [docs/history/](docs/history/).
  Point-in-time and often stale.

**When any document conflicts with the current source code, the source code
wins.** Do not rely on a doc (or a historical audit) over what the code actually
does. When you change behavior a doc describes, update that doc.

## Platform note

Expo has changed. Read the exact versioned docs at
https://docs.expo.dev/versions/v54.0.0/ before writing Expo/React Native code.
