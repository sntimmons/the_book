# B5B — executable DB / security regression harness

## What this is

Real assertions against a real Postgres database. Each case simulates an authenticated
caller and checks what the **database** allows, refuses, or reports — row-level security
policies, `BEFORE` triggers, `SECURITY DEFINER` functions, and role grants.

**This is deliberately not a unit test.** A test that mocks `supabase.rpc`, or that
regexes a `.sql` file, proves only that the application asked nicely. Two HIGH-severity
defects — an `anon` EXECUTE grant that Supabase's default privileges re-added at
`CREATE` time, and a `null auth.uid()` fall-through caused by PL/pgSQL three-valued
logic — both shipped past a fully green mocked suite and were caught only by running
against a database. Unit tests supplement this harness; they cannot replace it.

## Running it locally

```bash
supabase link --project-ref <NON-PROD-REF>   # once
node scripts/db-security-test.mjs
```

Or against an explicit target:

```bash
TEST_SUPABASE_DB_URL='postgresql://...' node scripts/db-security-test.mjs
```

Exit code is `0` only if every assertion passes.

## Safety

- **Non-production only.** The runner extracts the project ref from the target and
  refuses the production ref outright. A target whose ref it cannot positively identify
  is also refused — unknown is treated as unsafe, never as "probably fine".
- **Everything runs in one transaction that is always rolled back**, including on
  failure. Zero residue follows from that `ROLLBACK`, not from a post-run check — the
  harness performs no emptiness verification of its own. (`providers`, `bookings`,
  `messages` and `conversation` were confirmed empty of harness rows by a one-time
  manual query after a full run.)
- **No secrets are committed.** The connection string comes from the environment and is
  never printed — only the project ref, which is not a credential. CLI errors are
  scrubbed of the URL before being logged.
- Seeding runs as `service_role`; **assertions run as the `authenticated` role**, which
  is what makes RLS apply. Two fixture checks assert this explicitly, because a harness
  that only sets the JWT claim while remaining the table owner silently bypasses RLS and
  every policy assertion then passes vacuously.

## Layout

| File | Role |
|---|---|
| `_helpers.sql` | Assertion helpers (`chk`, `chk_blocked`, `chk_allowed`) and auth simulation (`act`, `act_service`) |
| `_fixtures.sql` | The shared cast — client, provider, outsider, one booking per review state, one conversation per request state — plus fixture-sanity and harness-integrity checks |
| `reviews.test.sql` | Reviews Phase 0/1 trust boundaries |
| `messaging.test.sql` | Pre-booking message-request trust boundaries |
| `_report.sql` | Aggregates results; the runner reads this and sets the exit code |
| `../../scripts/db-security-test.mjs` | Production guard, execution, reporting |

To add a suite: create `<name>.test.sql`, use the `pg_temp.chk*` helpers, and add it to
`SUITES` in the runner (before `_report.sql`).

## What it currently covers

**Reviews** — grant reachability (`anon` denied on `review_opportunity`,
`review_opportunities`, `review_eligible`; internal helpers denied to both roles);
null-`auth.uid()` fails closed in both directions; non-participant isolation and no
booking-existence oracle; direction binding; the full state matrix
(`eligible` / `already_submitted` / `window_closed` / `under_review` / `not_completed`)
in both directions; blindness (a counterpart's review is neither readable nor inferable
from the opportunity state); repeat-booking independence; `review_eligible` remaining the
write authority; the batch wrapper agreeing exactly with the per-id function, returning one
row per requested id, and staying `SECURITY INVOKER`; RLS confirmed enabled on every protected
table; a third party able to read a *revealed* review but not an unrevealed one (so a dropped
SELECT policy fails rather than passing); late submission, `under_review`, `no_show` and
forged-reviewer INSERTs
all blocked; an eligible submit **allowed** (so a deny-everything regression cannot look
like success); reveal on both-sides-submitted, reveal at the 7-day close, no reveal
one-sided inside the window, `under_review` holding reveal; `completed_at` server-stamped
and immutable; `completed → no_show` rejected while a never-completed booking can still be
marked `no_show`.

**Messaging** — conversation creation gating (a client-supplied `accepted` status is clamped
to `pending`, `request_opened_at` is server-stamped, a fabricated `booking_id` from another
pair is rejected, a validated `booking_id` cannot be reassigned); accept/decline restricted to
the provider, with the provider's accept asserted as allowed; one initial client message while
pending and the second blocked; provider
blocked until acceptance; declined closed to both sides; accepted opens both sides for
multiple messages; one live request per client/provider pair; participant authorization
(an outsider can neither post, impersonate the client, nor read the conversation or its
messages); `created_at` server-stamped so the pending-cycle boundary cannot be back-dated;
booking-linked conversations bypassing the pending gate; a participant CAN read their own
conversation (so a dropped SELECT policy fails rather than passing); and
`conversation.booking_id` having no column DEFAULT — the DDL invariant the entire request gate
keys on.

## Out of scope (deliberately)

Not every table is covered — this targets the highest-risk DB contracts rather than
attempting exhaustive coverage. Not covered today: storage bucket policies, contract
PDF/signature access, provider onboarding and field-integrity rules, payment/Stripe
state, categories/shifts, and the `reports` table. Those remain candidates for later
suites; add them as separate `*.test.sql` files rather than growing the existing two.

## CI

The `db-security` job in `.github/workflows/ci.yml` runs this harness. It is never
`continue-on-error`: wherever the secret is available, a failing assertion fails the build.
When the secret is absent the behaviour depends on the event:

| Event | Secret present | Secret absent |
|---|---|---|
| `push` to `main` | runs; failure fails the build | **job FAILS** — a green-empty job on main would prove nothing |
| same-repo `pull_request` | runs; failure fails the build | warns and skips |
| fork `pull_request` | n/a — GitHub withholds secrets from forks | warns and skips |

⚠️ **`TEST_SUPABASE_DB_URL` is not configured yet.** Until it is added, this job fails on
push to `main` and skips on pull requests, and the harness is effectively local-only.

### Required repository configuration

| Secret | Value |
|---|---|
| `TEST_SUPABASE_DB_URL` | Postgres connection string for the **non-production** project (Supabase → Project Settings → Database → Connection string). Must never be a production URL — the runner refuses the production ref. |

Until that secret is added, the job reports a skip notice and the harness is local-only.
