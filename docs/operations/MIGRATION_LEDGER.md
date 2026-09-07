# Migration ledger — reconciling non-production

**Status:** authoritative operational note. Non-production only.

## The drift

Supabase tracks applied migrations in `supabase_migrations.schema_migrations`. Applying
SQL by hand — pasting into the dashboard SQL editor, or `supabase db query --file` —
changes the database but **writes nothing to that ledger**. The schema is then correct
while `supabase migration list` reports the migration as unapplied.

This happened on non-prod for `20260901010000`, `20260902000000` and `20260903000000`
(and subsequently `20260904000000`, `20260905000000`). Every object existed and matched
its migration; only the ledger was behind.

Why it matters: `supabase migration up` and `db push` decide what to run from the ledger.
With entries missing, they would attempt to re-run migrations that are already applied.
These particular ones are `create or replace` + `drop policy if exists` and would have
been survivable, but that is luck, not a guarantee — a future migration containing
`create table`, `alter table ... add column`, or a data backfill would fail or double-apply.

## Rule

**Never mark a migration applied because an object with a matching name exists.** Compare
the deployed definition against the migration first.

For each migration, classify:

| Class | Meaning | Action |
|---|---|---|
| A | Deployed state is semantically identical to the migration | Safe to repair the ledger |
| B | Partially matches | **Stop.** Report the exact difference |
| C | Does not match | **Stop.** Report the exact difference |
| D | Should not be marked applied at all | **Stop.** Report |

Only Class A may be repaired. Never edit a merged migration file to make history look
clean, and never rewrite history to hide a mismatch — if the database genuinely diverges,
the fix is a new forward corrective migration, proposed and reviewed on its own merits.

## Verification method

Compare the deployed body against the repository source, normalising whitespace and
comments — not just checking that the name exists:

```sql
-- function bodies
select proname, prosrc from pg_proc
where pronamespace = 'public'::regnamespace and proname in (...);

-- policies, triggers, grants
select tablename, policyname, cmd from pg_policies where tablename in (...);
select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;
select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p where ...;
```

Expect a later migration to supersede an earlier one — e.g.
`enforce_booking_write_integrity` differs from `20260902000000` because `20260904000000`
replaced it. That is a match against the *composite* of applied migrations, not a
mismatch; confirm the deployed body equals the **latest** migration that defines it.

### DDL is part of "semantically identical"

Executable objects are not enough. Columns, column DEFAULTs, CHECK constraints and indexes
are what a later `db push` would try to create, and a missed one is invisible to a
function/policy comparison:

```sql
-- column DEFAULTs (a stale default can silently change behaviour)
select a.attname, pg_get_expr(d.adbin, d.adrelid)
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.<table>'::regclass and a.attnum > 0;

select column_name, data_type, is_nullable from information_schema.columns where table_name = '<table>';
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.<table>'::regclass;
select indexname, indexdef from pg_indexes where tablename = '<table>';
```

`supabase db diff --linked --schema public` is the thorough check, but it builds a shadow
database and therefore **requires Docker**; where Docker is unavailable, run the targeted
catalog queries above for the DDL each migration actually contains and record what was
compared.

## Repair

Ledger-only, runs no schema SQL:

```bash
supabase migration repair --status applied <version> --linked
```

Confirm the target is non-production first (`supabase projects list` — the linked project
must not be the production ref; `lib/supabaseTarget.ts` holds the canonical constant).

## Proof after repair

1. `supabase migration list --linked` — every row shows `local == remote`.
2. No duplicate objects or unintended overloads were created.
3. No destructive statement ran (repair touches only the ledger table).
4. Object definitions are unchanged — repair alters no schema behaviour.
5. Re-run the B5B harness (`node scripts/db-security-test.mjs`) to confirm enforcement
   still behaves as expected.

## Record — 2026-09-02 reconciliation (non-prod `wcoy…jpfo`)

| Version | Class | Compared | Action |
|---|---|---|---|
| `20260901010000` | A | `enforce_prebooking_message_rules` body normalised and byte-identical; `FOR UPDATE` lock, `clock_timestamp()` stamp, declined/provider-send/one-message branches all present | repaired |
| `20260902000000` | A | `review_window_closed`, `review_eligible`, `provider_review_revealed`, `client_review_revealed`, all three `recompute_provider_rating*` bodies identical; 3 policies present and the superseded `provider_reviews_read_revealed` absent; `client_reviews_recompute_provider_rating` trigger present; EXECUTE grants match. `enforce_booking_write_integrity` differs — **expected**, superseded by `20260904000000`, against which it matches | repaired |
| `20260903000000` | A | `review_opportunity` body identical; grants `authenticated`-only, `anon` revoked | repaired |
| `20260904000000` | A | `enforce_booking_write_integrity` identical to this migration (the latest definer) | repaired |
| `20260905000000` | A | `review_opportunities` body identical; `SECURITY INVOKER`; `anon` revoked | repaired |

DDL verified alongside the objects: `conversation.booking_id` has **no** DEFAULT (the
invariant the pre-booking request gate keys on), `request_status` / `request_opened_at`
columns present, `conversation_request_status_check` present,
`conversation_one_pending_prebooking` index present, `bookings.completed_at` /
`under_review` / `no_show_flag` present, and the four `client_reviews` dimension columns
present. A full `supabase db diff` was **not** run — Docker was unavailable — so the DDL
check was targeted rather than exhaustive; re-run `db diff` when Docker is available.

Ledger before: 9 entries, ending `20260901000000`. After: 14 entries, `local == remote`
for every row. No merged migration file was edited. No schema statement was executed by the
repair. Production untouched.

## 2026-09-03 — `20260906000000` applied to non-production (ordinary apply, no repair)

Barter Slice 1 integrity hardening. Applied to the non-production project
`wcoyjeklscuqsumpjpfo` via `supabase db push --linked` — an ordinary forward apply, **not** a
repair: the ledger showed `20260906000000` as local-only with `remote` empty, so no drift
existed and nothing was reconciled.

The migration's own section-0 prechecks were run **read-only first**, before the apply, and all
returned zero: no offer with more than one accepted response, no duplicate `(offer, user)` pair,
and no row whose provider identity is not owned by its author. Both barter tables were empty
(0 offers, 0 interests), so the two identity-forgery routes the migration closes were never
exploited on this project and no data remediation was required.

Ledger before: 14 entries, ending `20260905000000`. After: **15 entries**, `local == remote`
for every row. No merged migration file was edited. Production untouched.

Post-apply B5B: **138/138 passed, 0 failed**, transaction rolled back, zero residue verified by
re-reading `barter_offers`, `barter_interests` and the barter rows of `rate_limit_log` (all 0).

## 2026-09-04 — `20260907000000`…`20260913000000` applied to non-production (recorded retrospectively)

**Recorded retrospectively, and flagged as such.** These seven migrations — Slice 2 (accept
handoff), Slice 2B (canonical provider pair), Slice 3a-0 (release), Slice 3a-0b (release signal,
authorship pin) and Slice 3a-0c (Trade Activity and its hardening) — were applied to the
non-production project `wcoyjeklscuqsumpjpfo` via `supabase db push --linked` as each slice was
built, but **no apply record was written at the time**. That is a lapse against the Prevention
rule below: the ledger silently skipped seven versions, so "what is live on non-prod" was not
answerable from this document.

Verified 2026-09-04 by `supabase migration list --linked`: `local == remote` for all
**22 entries**, ending `20260913000000` at the time of the check. Post-apply B5B at that point:
**339/339 passed, 0 failed**, transaction rolled back, zero residue re-verified by reading
`barter_offers` (0), `barter_interests` (0) and null-sender `messages` (0).

This record exists because `20260914000000` rests on the claim that `20260913000000` was already
applied — that claim is the whole reason the corrections went into a forward file rather than an
edit — and a reviewer could not previously check it here.

## 2026-09-04 — `20260914000000` applied to non-production (ordinary apply, no repair)

Slice 3a-0c corrections: restores the pending-cycle row lock deleted by `20260913000000`, closes
the quote-breakout in the release notice, and adds the closed-post accept guard
(`barter_interests_zy_accept_open_offer`). Applied via `supabase db push --linked` — an ordinary
forward apply, **not** a repair.

Forward-only rather than an edit to `20260913000000`, because that migration was already applied
(above) and an applied migration does not re-run: editing it in place would have left file and
database disagreeing, which is the drift this document exists to prevent.

Ledger after: **23 entries**, `local == remote` for every row. No merged migration file was
edited. Production untouched, and never queried.

Post-apply B5B: **343/343 passed, 0 failed**, transaction rolled back, zero residue verified
(`barter_offers` 0, `barter_interests` 0, null-sender `messages` 0, `conversation` unchanged at
its pre-existing 43).

Additionally, a **runtime badge proof** was run against the same non-production project using the
existing dev accounts (14/14), because the B5B harness runs in a single transaction and cannot
exercise PostgREST request composition. It confirms that two chained `.or()` calls are emitted as
two `or=` parameters and ANDed by PostgREST — a claim `hooks/useMessaging.ts` and
`hooks/useNotifications.ts` both now depend on. Every row it wrote was deleted and the residue
re-asserted at zero.

## 2026-09-04 — `20260915000000` applied to non-production (ordinary apply, no repair)

Closed barter posts made terminal (PD-051, PD-052), plus the accept-handoff sanitiser fix.
Applied to `wcoyjeklscuqsumpjpfo` via `supabase db push --linked` — an ordinary forward apply.

Two of the three sections are **additive triggers** rather than redefinitions, deliberately:
`create or replace function` replaces a whole body, and this repo has already lost a row lock
that way. The one redefinition — `accept_barter_interest` — was taken from the definition this
ledger names as current (`20260907000000`, never previously redefined) and diffed before commit
to prove exactly two lines changed.

Ledger after: **24 entries**, `local == remote` for every row. No merged migration file was
edited. Production untouched, and never queried.

Post-apply B5B: **356/356 passed, 0 failed**, transaction rolled back, zero residue verified
(`barter_offers` 0, `barter_interests` 0, null-sender `messages` 0, `conversation` unchanged at
its pre-existing 43).

## 2026-09-04 — `20260916000000` applied to non-production (ordinary apply, no repair)

Restores the null-`auth.uid()` escape on the two guards added by `20260915000000`, matching the
sibling convention on the same tables. Forward-only, because `20260915000000` was already
applied. Each body carries exactly one changed clause.

Ledger after: **25 entries**, `local == remote` for every row. Production untouched.

Post-apply B5B: **368/368 passed, 0 failed**, transaction rolled back, zero residue verified.
The suite now also PINS both guards by `prosrc` and asserts the BEFORE INSERT/UPDATE trigger
firing order on `barter_interests` and `barter_offers` — the ordering decides which SQLSTATE a
provider's write returns, and it had been governed only by a naming convention documented in
three migration headers and asserted nowhere.

## 2026-09-05 — `20260917000000`…`20260920000000` applied to non-production

Slice 3a, the proposal / versioning foundation. Four files, applied in order via
`supabase db push --linked`. New objects only — no existing function was redefined except the
two this slice itself created.

- `20260917000000_barter_proposal_versions.sql` — four tables (`barter_proposals`,
  `barter_proposal_versions`, `barter_proposal_terms`, `barter_version_acceptances`), the
  append-only and proposal-immutability triggers, RLS, grants, three RPCs
  (`create_barter_proposal`, `submit_barter_counter`, `accept_barter_version`) and the
  `my_barter_proposals` view.
- `20260918000000_negotiation_grant_tighten.sql` — the four tables shipped with `authenticated`
  still holding INSERT/UPDATE/DELETE. `20260917000000` revoked from `public, anon` but not from
  `authenticated`, and Supabase's `ALTER DEFAULT PRIVILEGES` grants ALL to that role too. Not a
  hole (no write policy exists, so a direct write was filtered to zero rows) but the design
  intends grants and RLS as two independent refusals and only one was there.
- `20260919000000_negotiation_stale_terms_code.sql` — `accept_barter_version` raised `55000`
  for both "this negotiation ended" and "these terms were replaced". Those need opposite
  advice: one is terminal, the other means read the new terms and accept again. The second is
  now `40001`.
- `20260920000000_negotiation_budget_code.sql` — `assert_barter_version_budget` raised `23514`,
  the same code as a malformed proposal, and both are reachable from one button. The cap is now
  `54000`.

**PROCESS NOTE, recorded because it cost three extra files.** `20260917000000` was applied
before its ERROR CONTRACT was settled. Everything after it is a forward correction to a
migration that could no longer be edited. The schema was right; what was not yet worked out was
which refusals a client must be able to tell apart — which is a design question, not an
implementation detail, and is cheapest to answer before the first apply.

Ledger after: **29 entries**, `local == remote` for every row. Production untouched, and never
queried.

Post-apply B5B: **450/450 passed, 0 failed**, transaction rolled back, zero residue verified
(`barter_proposals`, `barter_proposal_versions`, `barter_proposal_terms`,
`barter_version_acceptances`, `barter_offers`, `barter_interests` all 0).

**Non-B5B concurrency proof: `scripts/negotiation-concurrency.mjs`, 17/17.** B5B runs the whole
suite in ONE transaction and therefore cannot race anything; calling a sequential case a
concurrency proof would misstate what was tested. That script opens genuinely parallel sessions
and proves: two simultaneous counters both succeed with distinct consecutive version numbers
(without the `for update` lock they collide on the unique index); two simultaneous opens on one
accepted response leave exactly one negotiation; and an acceptance racing a counter either lands
while its version is current or is refused `40001`, never counting as agreement to replaced
terms. Everything it writes is deleted and residue re-asserted at zero.

## 2026-09-05 — `20260921000000`…`20260923000000` applied to non-production (security corrections)

Three forward migrations closing what a security review of PR #49 found, plus the two
error-contract splits both reviews found independently.

**`20260921000000` closes a BLOCKER.** `write_barter_proposal_terms` is `SECURITY DEFINER`,
owned by `postgres`, and performs **no authorization at all** — no `auth.uid()` read, no
participant check, no interest-status check. It was revoked only `from public, anon`, leaving
intact the EXECUTE that `ALTER DEFAULT PRIVILEGES` grants `authenticated`. Any signed-in user
could append terms to any version they could read.

The consequence was worse than an unauthorized write. Appending rows is neither an UPDATE nor a
DELETE, so the append-only trigger never fired; the current-version pointer did not move, so
nothing was superseded; no acceptance row was touched, so `both_accepted` kept reporting **true**
over changed content. One participant could rewrite the terms the other had already accepted,
with the server still asserting mutual agreement, and the victim would see the injected terms
attributed to themselves.

**This is the same trap `20260918000000` documented and fixed three migrations earlier — for the
TABLES.** That fix named four tables and none of the five functions in the same migration. The
lesson, recorded here because it has now cost two findings: **`revoke ... from public, anon` is
never the complete form on this platform, for any object kind.** A survey found the same gap on
every `enforce_*` trigger function in the repo, including pre-existing ones outside barter;
those are trigger functions and not usefully callable over PostgREST, but the pattern is wrong
and is flagged for a follow-up sweep.

Closed by three layers for the reachable attacker: the EXECUTE grant is removed, the table has
no INSERT grant and no INSERT policy, and a write guard requires a transaction-local marker that
only the negotiation RPCs publish (the `app.barter_handoff` shape from `20260907000000`),
carrying the version id so a marker for one version cannot write terms onto another.

**CORRECTED CLAIM.** An earlier version of this entry, and `20260921000000`'s header, said the
grant and the guard were two independent boundaries, "neither load-bearing alone". That is true
for an authenticated PostgREST caller — each refuses on its own — and it was NOT true for an
in-database caller: `set_config` is callable from any SQL session, so the marker is
self-issuable, and the write-once unique index only bit because the RPC happens to number terms
from zero. `20260924000000` replaces that with a statement-level trigger using a transition
table, which is what can express "this version already had terms before this statement" — a
per-row count trips on the second row of its own insert, and an index can only approximate it.
The independence claim is now true for both profiles rather than softened. `supabase/tests/negotiation.test.sql`
now pins `has_function_privilege` for **every** function this slice created — the class, not the
instance — and proves the guard refuses even with grants bypassed.

`20260921000000` also: corrected the lock order to offer-then-interest in all three RPCs (the
slice claimed "interest → offer → proposal in every RPC", but the pre-existing
`release_barter_interest` and `accept_barter_interest` take the offer first, so
`create_barter_proposal` could deadlock against a concurrent release); removed a budget call that
sat after the proposal insert and could only ever count zero; added `not found` branches so the
liveness gate fails closed structurally rather than by arrangement; and changed the four
`auth.users` foreign keys from `ON DELETE RESTRICT` to `CASCADE`, because `barter_interests`
already cascades and the RESTRICT silently made account erasure impossible for any provider who
had negotiated.

`20260922000000` splits the last two overloaded SQLSTATEs on the propose path. `20260923000000`
replaces the write-once count with a unique index, because a per-row count cannot tell a second
call from the second row of the first — the guard blocked the legitimate write it was written to
protect.

Ledger after: **32 entries**, `local == remote` for every row. Production untouched, and never
queried.

Post-apply B5B: **487/487 passed, 0 failed**, zero residue. Non-B5B concurrency proof
**19/19**, with fixture-scoped residue checks and, for ALL THREE scenarios, an assertion that
the two sessions genuinely overlapped — without which each would pass on a sequential run and
prove nothing.

`20260924000000` also corrected a lock-order comment left inside `submit_barter_counter`'s body
saying "interest, then offer" — the exact claim `20260921000000`'s own header identifies as
false and as the cause of the deadlock. Comments in a function body land in `prosrc`, so that
was the text the next author would read.

Two B5B pins added in this round were themselves wrong on first writing, both in the same way —
they reported the wrong thing as verified. The `for update` pin used `substring`, which returns
the FIRST `barter_proposals` read (the unlocked one); and the lock-ORDER pin compared
`position('barter_offers')`, whose first match is the DECLARE block, so it passed whichever
order the locks were taken in. Both now compare the lock statements themselves.

## 2026-09-05 — `20260925000000` applied to non-production (Founder rulings on terms)

Three rulings, all narrowing what a client may assert. `estimated_value` and `sort_order` are
dropped from `barter_proposal_terms`; a version holds **exactly two directed terms**, one per
fixed side (`offer_owner` / `responder`), enforced by a one-per-side unique index plus the
statement-level guard; and each term carries `provider_id` / `provider_user_id` **derived by
`write_barter_proposal_terms` from the accepted interest** and asserted by the statement guard
against the offer and interest rows. The RPC signatures change to
`(uuid, text, text)` — content for the two sides — and the old `(uuid, jsonb)` signatures are
**dropped**, not left as overloads: an overload that still accepted client-asserted sides would
be exactly the path this closes. Safe as straight alters because the table has never held a row
on any environment this was applied to, and has never been on `main`.

Ledger after: **33 entries**, `local == remote` for every row. Production untouched.

Post-apply B5B: **500/500 passed, 0 failed**, zero residue. Concurrency proof **19/19**, all
three scenarios with overlap proven.

## 2026-09-05 — `20260926000000` applied to non-production

Comment-only refresh of `enforce_barter_terms_write`, whose live body cited an index that
`20260925000000` had dropped. Function-body comments land in `prosrc`. B5B now also pins that
no `(uuid, jsonb)` overload of the three changed functions exists — a re-apply of a superseded
file would resurrect a granted one silently. Ledger after: **34 entries**.

**Stale comment, recorded here because it is outside `prosrc`:** `20260917000000:266-267`, above
`barter_negotiation_role` (never redefined, so that file IS its current source), still says the
lock order is "interest → offer → proposal in every RPC". `20260921000000` corrected the order to
offer → interest → proposal and B5B pins it; the file comment is wrong and was not reachable by
the comment-refresh migrations, which only touch function bodies.

## 2026-09-05 — `20260927000000` through `20260930000000` applied to non-production (Agreement Finalization)

`20260927000000` creates `barter_agreements` (one per proposal / accepted version / offer /
interest, immutable, participant-read RLS, SELECT-only grants), the finalization RPC
`finalize_barter_agreement(uuid)`, three additive post-agreement guards (no new version, no new
acceptance, no release once an agreement exists — triggers, not rewrites of the three RPCs they
constrain), and extends `my_barter_proposals` / `my_trade_activity` with `agreement_id` plus a
new `my_barter_agreements` view. Finalization closes the sourcing post in the same transaction.

The migration's grants were self-audited BEFORE apply — every function revoked from
`authenticated` except the one public RPC, every view `security_invoker`, the table SELECT-only
— the lesson of the Slice 3a BLOCKER applied as a gate rather than a review finding.

`20260928000000` fixes a runtime defect the audit could not see: the post-agreement guard read
`new.version_id` in a CASE branch for a different table, which PL/pgSQL rejects for the other
table's rows at evaluation time. It blocked every version insert. B5B found it on the first run.

`20260929000000` closes the final regression findings: the post-agreement guard now fails
closed with `internal_error` if it cannot resolve a proposal id, `barter_agreements` ownership
is re-pinned to `postgres`, and authenticated `INSERT` / `UPDATE` / `DELETE` privileges are
explicitly revoked from the three agreement-facing read models.

`20260930000000` separates the confirmed-trade refusal from ordinary dead-negotiation
refusals: post-agreement accept / counter / release now raise SQLSTATE `PT409`, leaving
`55000` for pending / declined / released / closed-post prerequisite failures so client copy
can distinguish "already confirmed" from "ended".

**Ledger count, corrected.** The running counts in the entries above had drifted by one (the
`20260924000000` apply was recorded inside the `20260921`–`20260923` entry without incrementing
the total). Verified 2026-09-05 by `supabase migration list --linked`: **39 entries**,
`local == remote` for every row, equal to the 39 files in `supabase/migrations/`.

Production untouched, and never queried.

Post-apply B5B: **574/574 passed, 0 failed**, zero residue. Concurrency proof **30/30** —
three agreement scenarios (finalize × finalize, finalize vs counter, finalize vs release) now
capture per-session start/end timestamps immediately around the RPC call and prove interval
intersection before claiming genuine overlap.

## 2026-09-05 — `20261001000000`…`20261002000000` applied to non-production

Proposal timing extension for barter negotiations.

`20261001000000` adds `created_at`, required `due_at` and optional `scheduled_at` to each
directed proposal term. It replaces the proposal creation/counter RPC signatures so clients
send only content + timing for the two fixed sides; provider ids, participant ids, side labels
and version numbers remain server-derived. Authored-time validation is server-side:
`due_at > clock_timestamp()`, `scheduled_at is null or scheduled_at > clock_timestamp()`, and
`scheduled_at is null or scheduled_at <= due_at`.

`20261002000000` adds an explicit expiry guard without rewriting the existing high-value
accept/finalize RPCs. A shared helper,
`assert_barter_proposal_version_timing_current(uuid)`, is called by additive `BEFORE INSERT`
triggers on `barter_version_acceptances` and `barter_agreements`. If either directed term's
`due_at` or `scheduled_at` has expired at acceptance/finalization time, the write raises
SQLSTATE `PT410` with: "These trade terms have expired. Update the timing before continuing."
The expired historical proposal version is not mutated or auto-extended; participants must
author a new version with future-valid timing.

Ledger after: **41 entries**, `local == remote` for every row. Production untouched, and never
queried.

Post-apply B5B: **608/608 passed, 0 failed**, zero residue. Concurrency proof: **30/30
passed, 0 failed**, zero residue.

## 2026-09-05 — `20261003000000` applied to non-production

Barter obligations foundation for official agreements.

`20261003000000` adds `barter_obligations`, with exactly two directed rows per
`barter_agreements` row: the `offer_owner` term is delivered by the offer owner to the
responder, and the `responder` term is delivered by the responder to the offer owner.
Obligations are derived server-side from the agreement's `accepted_version_id` and the two
authoritative `barter_proposal_terms`; the client does not provide direction, participant
identity, source term, description, `due_at` or `scheduled_at`. Timing is copied exactly from
the accepted proposal terms.

The implementation is additive: an `AFTER INSERT` trigger on `barter_agreements` calls the
internal `create_barter_obligation_pair(uuid)` helper in the same transaction as agreement
finalization, without rewriting `finalize_barter_agreement(uuid)`. The helper is idempotent
for existing agreements that already have the complete pair, and the insert guard rejects
forged direct writes whose side, source term, participant identities, description or timing do
not match the accepted version. Participant read is SELECT-only; no fulfilment, delivery,
receipt, cancellation, no-show, adjudication, reviews, reputation or lifecycle status schema
was added.

The obligation table's foreign keys cascade with the existing agreement graph and account
erasure behaviour. This migration does not introduce a new retention policy.

Ledger after: **42 entries**, `local == remote` for every row through `20261003000000`.
Production untouched, and never queried.

Post-apply B5B: **637/637 passed, 0 failed**, zero residue. Concurrency proof: **37/37
passed, 0 failed**, including concurrent idempotent obligation-pair creation and zero
residue for obligations.

## 2026-09-05 — `20261004000000` applied to non-production

Obligation delivery and receiver confirmation, on top of the obligations foundation.

`20261004000000` adds three lifecycle columns to `barter_obligations` — `status`
(`pending` / `delivered` / `received` / `not_received`), `delivered_at` and
`receipt_responded_at` — bound to each other by four CHECK constraints, and two participant
actions: the obligation's **deliverer** may mark that obligation delivered
(`mark_barter_obligation_delivered`), and its **receiver** may then answer, either
`confirm_barter_obligation_received` or `report_barter_obligation_not_received`. Both answers
route through one internal helper, `record_barter_obligation_receipt`, which is granted to no
client role, so the receiver's vocabulary is closed by the API surface itself rather than by a
validated parameter.

`status` records **events, not verdicts**. `received` is deliberately not `fulfilled` and
`not_received` is deliberately not `unfulfilled`, `disputed` or `needs_attention`: those are
adjudicated outcomes under PD-046 and no adjudication exists. **Nothing terminal was added** —
no 7-day timeout transition, automatic fulfilment or completion, cancellation, mutual
cancellation, no-show, Needs Attention, Under Review, adjudication, obligation outcome or
agreement outcome. The absence of each is *asserted* in the harness, not assumed. The future
7-day receiver window derives from `delivered_at`, so no redundant deadline column is stored.

The client supplies only an obligation id. Direction, both participant identities and every
timestamp are read from the row; `delivered_at` and `receipt_responded_at` are server-stamped
and write-once, so a duplicate mark or a repeated answer is a safe no-op that cannot move
either clock, and neither `received` nor `not_received` can flip to the other. A
non-participant and a non-existent obligation are refused identically, so neither RPC is an
existence oracle, and authorization is decided on an unlocked read so a stranger never
contends for a row they have no right to.

`enforce_barter_obligations_immutable` was **redefined**, from the blanket refusal
`20261003000000` created to a transition-aware guard. Content, timing, direction and
participant identity remain frozen — now **denied by default**, by comparing the whole row
minus the three lifecycle keys, so a column added later is frozen automatically rather than
becoming mutable in silence. Lifecycle writes are accepted only from inside a delivery RPC,
proven by a transaction-local marker carrying that obligation's id (the `app.barter_terms_write`
shape from `20260923000000`), and only along the two legal transitions. A new
`enforce_barter_obligation_starts_pending` BEFORE INSERT trigger, with no `service_role`
bypass, keeps every obligation entering the lifecycle at the beginning. `authenticated` gains
no INSERT, UPDATE or DELETE and no write policy was added; the table stays participant
SELECT-only.

Ledger after: **43 entries**, `local == remote` for every row through `20261004000000`.
Production untouched, and never queried.

Post-apply B5B: **730/730 passed, 0 failed**, zero residue. Concurrency proof: **67/67
passed, 0 failed**, including concurrent double mark-delivered (twice, proving `delivered_at`
is not re-stamped under contention), deliverer versus an unauthorized caller, the two opposing
receiver answers racing each other, the same answer twice at once, and both sides of one
agreement delivering simultaneously — with zero residue for obligations.

## 2026-09-06 — `20261005000000`…`20261010000000` applied to non-production (Pre-Delivery Cancellation, PR #58)

Six migrations, applied in order over the course of PR #58. Five of them redefine
`public.cancel_barter_agreement`; **read the Functions-redefined table below before touching
it.**

`20261005000000` creates the feature. `barter_agreement_cancellations` is an **append-only act
table**, one row per participant per agreement (`unique (agreement_id, actor_user_id)`), and the
classification is **derived from the row count and stored nowhere** — no `cancelled` flag, no
`cancelled_at` column, no `mutual` boolean, so a derived answer cannot disagree with the rows it
comes from. One act is *Cancelled by Participant*; two are *Mutually Cancelled*, and that second
act must be **explicit** — it is never inferred from silence, a timeout or inactivity. The one
writer is `cancel_barter_agreement(uuid, text)`. The client supplies only an agreement id and an
optional reason; caller, participant role, provider identity, delivery state, prior-act state and
classification are all derived server-side. There is **no `providers.is_approved` gate**: a
de-approved participant must still be able to leave a trade they are already in. The first act
closes delivery and receipt — `mark_barter_obligation_delivered` and
`record_barter_obligation_receipt` were redefined to re-check for a cancellation **after** taking
the obligation row lock and refuse with `PT409`. Conversely, once any obligation has
`delivered_at` the ordinary exit is gone **permanently**, and a later `not_received` does not
restore it. **Nothing is deleted**: the agreement, both obligations, the proposal, its versions,
their terms and the acceptances all survive and stay readable by both participants.

The delivery/cancel race is decided by lock order, not by hope. Cancel locks the agreement, then
**all** its obligations `order by o.id for update`, and only then reads `delivered_at`; it refuses
outright if it did not lock exactly two rows, so the decision is never made on an unlocked read.
`mark_barter_obligation_delivered` takes the same obligation lock before checking for a
cancellation. Neither side reads its decision variable until it holds the lock the other must take
to change it, so exactly one wins.

`20261006000000` hardens it after review. The RPC did not re-check `FOUND` after its locking
re-read, so an agreement erased between the authorization read and the lock produced
`internal_error` — surfaced to a provider as "contact support" about a trade that had simply
ceased to exist. `enforce_barter_cancellation_consistent` validated that the actor pair was **one
of** the agreement's two participants but never that it was **the caller**, so a privileged insert
could attribute an act to the counterparty and fabricate a mutual cancellation — a false record of
someone else's assent. And `created_at` was documented as server-stamped but was only a column
DEFAULT, which an explicit insert overrides; it is now stamped in the trigger on every insert
path, before any later slice measures a deadline from it.

`20261007000000` implements two Founder rulings: the counterparty is told (a durable in-thread
notice), and the optional reason is **participant-visible context**, exposed per viewer as
`my_cancel_reason` / `their_cancel_reason` on `my_barter_proposals`. The reason is shared with the
other provider and shown to both in trade details; it is **not** a private note, a reliability
verdict, a no-show determination, adjudication or proof of fault, and none of those exist.

`20261008000000` fixes what `20261007000000` got wrong, and the failure is the one this document
exists to prevent: **its body was written from `20260910000000` — a superseded definition of
`release_barter_interest` — rather than from the live `20260913000000`**, so four properties were
silently dropped. The worst was best-effort isolation. The message insert sat bare inside the
cancellation transaction with no handler covering it, and `enforce_prebooking_message_rules` raises
`check_violation` for a `pending` or `declined` thread (SECURITY DEFINER does not change
`auth.role()`, so that trigger does fire). Any such failure aborted the RPC and rolled the
cancellation act back with it, while `lib/barterErrors.ts` reported "That trade is no longer
available" — false, since the trade existed and was uncancelled. A provider could be denied
PD-046's **only** ordinary exit, and told a lie about why, by a condition on a messaging row they
cannot see or fix. The same omission produced a second defect: a PL/pgSQL block with an `EXCEPTION`
clause is a subtransaction, so a `unique_violation` from the message write would have rolled back
the act and still returned a success classification. The restored inner handler contains those
failures so they can never reach the outer one. Also restored: the open-conversation predicate,
the provider-identity re-check, and `system_recipient_id` — left null it means "addressed to
both", so the provider who cancelled was being badged and in-app-notified about their own act.

`20261009000000` fixes the cause rather than the symptoms. Hand-copying the shape of a mechanism
is not reuse, and that was the **fifth** live copy of "resolve the pair thread, then post to it" —
the first that diverged. `public.pair_conversation_notice(uuid, uuid, uuid, uuid, text, uuid)` is
now the **one writer** for platform notices into a provider pair's thread: it resolves the
canonical thread, re-checks provider identity, skips a thread that cannot take a message,
addresses the notice, and is best-effort by construction. It **creates no conversation** and is
**callable by no client role** — a client that could call it could author a message nobody wrote.
`cancel_barter_agreement` now calls it, and derives its classification once so the sentence the
counterparty reads cannot disagree with the answer the caller got.

`20261010000000` is a **copy-only** correction, on a Founder ruling. The second notice read "Both
providers agreed to cancel…", which is true of one sequence — A cancels, B reads it and taps
*Agree to cancel* — and **false** of the other the server allows: A and B cancelling concurrently,
neither having seen the other's act. Both reach two acts, so both reached that sentence. Recording
in a durable thread message that two providers *agreed*, when neither assented, attributes a
meeting of minds that never happened. The function body was diffed against `20261009000000` before
commit: **the only executable difference is that string literal.** The classification is unchanged
and still `mutually_cancelled`; *"Agree to cancel"* remains the UI action for a counterparty
responding to an existing cancellation, where the viewer **has** seen the other act and the word is
accurate.

The live notice copy is therefore:

- first act — `The trade for "X" for "Y" was cancelled by one provider.`
- second act — `Both providers cancelled the trade for "X" for "Y".`

`"X" for "Y"` is rendered by `barter_terms_label`: server-derived, quoted, control-stripped and
capped at 40 characters per side, and the sentence closes with the platform's own words so there
is no trailing position for owner-authored text to pose as ours. The free-text reason is
deliberately **not** in either notice.

**Nothing terminal was added.** No 7-day timeout, Needs Attention, Under Review, no-show,
adjudication, terminal obligation outcome, terminal agreement outcome, barter review, reputation
or push notification exists. The absence of each is *asserted* in the harness — as both columns
and functions — not assumed. Cancellation is an agreement-level event that decides nothing about
whether either side fulfilled anything.

The act table's foreign keys cascade with the existing agreement graph and account-erasure
behaviour. **This migration set introduces no new retention policy.** Note for a later slice: this
is the first per-participant conduct record in the barter graph, so whether an anonymised trace
must survive erasure for PD-046's future reliability model is an open product question — flagged
in `20261005000000`, deliberately not decided there.

Ledger after: **49 entries**, `local == remote` for every row through `20261010000000`, confirmed
with `supabase migration list`. Production untouched, and never queried.

Post-apply B5B: **872/872 passed, 0 failed**, zero residue. Concurrency proof: **102/102 passed,
0 failed**, including both participants cancelling simultaneously, the same participant cancelling
twice at once, cancel racing the deliverer's own mark-delivered, cancel racing the counterparty's
delivery, and cancel racing an unauthorized caller — with zero residue for cancellations, messages
and conversations. The concurrency harness asserts that a contended notice is **never duplicated**
and that whatever is written is correctly addressed; it deliberately does **not** assert delivery,
because the notice is best-effort by construction and that scenario forces contention on purpose.
Exactly-once *delivery* is proven in B5B, sequentially and uncontended, where it can be asserted
honestly.

## Prevention

**Do not apply a slice to non-production before its security review and Founder rulings have
landed.** Slice 3a took ten migration files for one feature: `20260917000000` was applied with
its schema right but its error contract, write boundary and term shape all still open, and every
one of those was then a forward correction to a file that could no longer be edited.

Apply migrations through `supabase migration up` / `db push` so the ledger records them, **and
write the apply record in the same sitting** — the seven-migration gap above is what happens
otherwise.
Hand-applied SQL requires a `migration repair` in the same sitting, or the drift returns.

## Production

Out of scope for this note. Production has never been reconciled by this process and must
not be, without a separate, explicitly approved change.

## 2026-09-06 — `20261011000000` **APPLIED to non-production 2026-09-06** (Receiver Window + Needs Attention, PR #62)

> **APPLICATION STATUS: APPLIED to non-production (`wcoyjeklscuqsumpjpfo`) on 2026-09-06;
> CONFIRMED 2026-09-07.** This entry was first written as AUTHORED-BUT-NOT-APPLIED, because the
> authoring session had no database access. That banner asked its successor for three things —
> the apply date, the `supabase migration list` confirmation and the real B5B counts — and all
> three are now recorded, so the claims below are **observed database behaviour**, not static
> reading.
>
> * `supabase migration list --linked`: local and remote agree on all **50** versions, no gap and
>   no drift; `20261011000000` is present on both sides.
> * The APPLIED body is the CORRECTED one, verified against the live catalog rather than the file:
>   `barter_confirmation_anchor` is `provolatile = 'i'`, `barter_confirmation_deadline` and
>   `barter_receiver_window` are `'s'`, the deadline carries `proconfig` `TimeZone=UTC`, and
>   `enforce_barter_obligations_immutable` contains the § 3b contract-field diff.
> * **B5B: 985/985 passed, 0 failed**, of which **113** are `receiver_window` — including the
>   three anchor cases, the inclusive boundary at one microsecond before / exactly at / one
>   microsecond after, a DST-straddling determinism check, and the full `service_role` freeze
>   matrix. Transaction rolled back; no residue.
> * **Concurrency: 102/102 passed** (`scripts/negotiation-concurrency.mjs`). Re-run deliberately
>   even though this slice adds no write, because § 3b replaced a live trigger body that the
>   delivery / receipt / cancellation races all pass through.
>
> **The migration is therefore APPLIED HISTORY and must not be edited.** A correction needs a
> forward migration. Production (`kxregomuawwcqvisuhtr`) was never targeted and never queried.

**One migration, and it is the smallest kind this repo has added to the barter chain: it creates
no column, no table, no trigger, no RPC, no job and no write path.** Everything it exposes is
DERIVED from timestamps already stored, plus the server's clock. There is therefore no persisted
transition that can fall out of step with the facts it was derived from, and no background job
flipping rows at a deadline.

**PD-057, spelled once.** `public.barter_confirmation_anchor(delivered_at, scheduled_at, due_at)`
returns `max(delivered_at, coalesce(scheduled_at, due_at))` and NULL before delivery;
`public.barter_confirmation_deadline(...)` is that plus 7 days and is the **only place the 7-day
interval is written**; `public.barter_receiver_window(status, delivered_at, scheduled_at, due_at,
trade_cancelled, as_of)` returns `none | awaiting_receiver | needs_attention`. **Volatility is
not uniform, and the difference is deliberate:** the anchor is genuinely `IMMUTABLE` (`case`,
`greatest` and `coalesce` over `timestamptz` only), while the deadline and the window are
`STABLE`. `timestamptz + interval` is `timestamptz_pl_interval`, which is STABLE because it
resolves the calendar component in the session's `TimeZone`; PostgreSQL does not verify a
volatility claim at `CREATE FUNCTION`, so marking those two IMMUTABLE would have been a silent
false promise to the planner. The window is STABLE because it calls the deadline, and a function
may not claim stricter volatility than what it calls. Neither is used in an index or a generated
column, so STABLE costs nothing. The deadline additionally pins `timezone = 'UTC'`, which is the
half that protects the product: without it the boundary would be timezone-RELATIVE while `now()`
is absolute, so two sessions straddling a DST transition could disagree by an hour about whether
one trade needs attention. All three are invoker-rights (not definer), `search_path` pinned, read
no table and take no id — so none is an existence oracle. `EXECUTE` is granted to `authenticated` and revoked from `anon` and
`public`; the grant to `authenticated` is **required**, not incidental, because both consuming
views are `security_invoker` and therefore run these functions as the caller.

**A COMMENT IS SUPERSEDED, AND THE APPLIED MIGRATION IS NOT EDITED.**
`20261004000000_barter_obligation_delivery.sql` line 25 says *"`delivered_at` is the only fact the
future 7-day window needs, so the deadline is DERIVED from it and no redundant deadline column is
stored."* Half of that is right and is honoured exactly: the deadline **is** derived and **no
deadline column exists**. The other half is **narrower than PD-057**, which anchors on the LATER
of delivery and the agreed time and therefore also needs `due_at` and `scheduled_at`. That file is
applied and is **not edited** (forward-only); the correction lives in `20261011000000`'s header and
here. PD-057 flagged this divergence on 2026-09-05 and left it for a code owner — this is that
reconciliation. **No schema consequence followed**, because `due_at` and `scheduled_at` have been
immutable columns on `barter_obligations` since `20261003000000`.

**Why the later of the two.** Anchoring on `delivered_at` alone would let a deliverer who marks
delivered a month early expire the receiver's window before the service was even due to happen —
putting the receiver in Needs Attention for not confirming something they had not been given.

**Needs Attention is not an outcome.** It is an unresolved operational state. The four-value
`status` vocabulary is UNCHANGED and Needs Attention is deliberately **not** a status value: no
Fulfilled, Unfulfilled, Completed, Closed Without Resolution, Under Review, no-show or
adjudication exists, and elapsed time creates none of them. Asserted directly in B5B.

**The receiver can still answer after the deadline** (Founder ruling). The three obligation RPCs
are **untouched by this migration** and none of them consults a deadline — pinned by a B5B
assertion over `prosrc`, so a later edit that added an expiry guard would fail the suite rather
than silently closing the door.

**Two views redefined.** `public.my_barter_obligations` is new: `security_invoker = true`, adding
no `WHERE` clause of its own precisely so it cannot become a second, weaker copy of
`barter_obligations_participant_read`. It uses `now()` (transaction_timestamp), **not**
`clock_timestamp()`, so every row in one read is judged against the same instant and a caller
cannot see a self-inconsistent pair; `server_now` is returned so a client renders against the
clock that decided the state. `public.my_trade_activity` is **recreated in full** — its live
definition was `20261005000000` — and the body was diffed against that file before writing: the
only changes are four added columns and two `left join lateral`s. It reads
`my_barter_obligations` rather than the table, so the window rule is applied in exactly one place.
Both views are postgres-owned, `select`-only to `authenticated`, revoked from `anon` and `public`,
and have `insert, update, delete` explicitly revoked — a simple view is auto-updatable, and
neither may become a write path. B5B proves all four refusals plus the table's own.

**Trade Activity is role-relative.** Each agreement has exactly two obligations and each
participant is the deliverer of exactly one and the receiver of the other, so `my_response_*` (the
one they receive — their action) and `their_response_*` (the one they deliver) are **scalar reads,
not aggregates**. No display-priority rule is encoded in SQL; that is a copy decision and lives in
`lib/tradeActivity.ts`.

**Concurrency.** No new race scenario was added to the concurrency harness, and this is a
statement rather than an omission: **this migration adds no write**, so there is no new
contended path to stage. The one interleaving that matters — a receiver answering around the
deadline — is proven instead by showing the state is a pure function of the row: an answered
obligation returns `none` at **every** instant from ten days before the deadline to ten days
after, so no ordering of "answer commits" against "another session reads" can produce a row that
is simultaneously answered and needing attention.

**How B5B reaches a past deadline.** `due_at` must be in the future when a proposal is written, so
a naturally elapsed window cannot occur inside the harness's single transaction. The suite AGES a
trade **without touching a contract field**, because § 3b below freezes those against
`service_role` too. `pg_temp.rw_age_terms` moves the ACCEPTED TERM's timing (`created_at`,
`due_at`, `scheduled_at` together, so the row stays inside its own CHECK constraints), deletes
the derived obligations — privileged DELETE is deliberately still permitted — and RE-DERIVES the
pair through the real `public.create_barter_obligation_pair`. The resulting rows are produced by
production code from a real term. The one synthetic step left is `pg_temp.rw_backdate_delivery`,
which moves `delivered_at` only: a LIFECYCLE column, over which privileged maintenance keeps its
existing latitude, not a contract field. Every CHECK constraint still applies throughout. This is
what lets all three boundaries — just before, exactly at, just after — be proven against the
**real view**, not only against the calculator.

**§ 3b — THE AGREED TRADE IS FROZEN AGAINST EVERY WRITER** (Founder ruling, 2026-09-06). This
migration replaces the body of `public.enforce_barter_obligations_immutable` so the obligation's
contract fields — `agreement_id`, `source_term_id`, `side`, the four deliverer/receiver identity
columns, `agreed_description`, `due_at` and `scheduled_at` — can no longer be rewritten by ANY
writer, `service_role` and the no-JWT maintenance path included. The previous unconditional
privileged early return is SPLIT: the contract-field diff now runs before the privileged branch,
while privileged DELETE is unchanged (every `auth.users` and `barter_agreements` FK here is
`ON DELETE CASCADE`, so account erasure depends on it) and the three lifecycle columns keep their
prior privileged latitude. It is denied by default rather than by allowlist — the whole row minus
the three lifecycle keys must be identical — so a column added later is frozen unless deliberately
subtracted. **Nothing gains a write it did not have; this is a narrowing only.** It lands in this
migration because this migration is what makes those columns load-bearing: the identity columns
become the scoping keys of a second read surface, and `due_at`/`scheduled_at` become the PD-057
anchor that decides Needs Attention for both participants. The message and SQLSTATE are unchanged.
An operator-correction workflow is **not** built here and would need its own Founder approval.

**The boundary is inclusive:** Needs Attention begins at `server_now >= confirmation_deadline`,
per Founder ruling, spelled once in `barter_receiver_window`.

**TWO COMMENTS INSIDE THE APPLIED FILE ARE SUPERSEDED BY THIS ENTRY.** Both were found by the
2026-09-07 security review. `20261011000000` is applied history and **was not edited**; neither
correction changes behaviour, so neither warrants a forward migration on its own. Fold the
`comment on` refresh into the next migration that opens these objects for a reason of its own.

1. **§ 6's grant rationale says "All three are IMMUTABLE".** Two of the three are STABLE — the
   same file argues for exactly that twice, and the B5B suite asserts `'i'`, `'s'`, `'s'` per
   function. The load-bearing half of that sentence ("read no table, take no id, hold no
   authority") is true and is what actually justifies the `authenticated` grant. **Do not treat
   the deadline or the window as IMMUTABLE** — in particular, never place either in an index
   predicate or a generated column, which is the one context where the false claim would become
   a real correctness defect.
2. **§ 3b's closing note overstates the participant-set pin.** It says the obligation's and the
   agreement's participant columns "are frozen against EVERY writer including `service_role`".
   Only the **obligation** side is. `enforce_barter_agreement_immutable`
   (`20260927000000:56-61`) still has an unconditional privileged early return, so
   `barter_agreements.owner_user_id` / `responder_user_id` remain rewritable by `service_role`
   and by a no-JWT session. Consequence if one were ever rewritten: the obligation keeps the old
   (now frozen) ids, so a participant could read the obligation while losing read on the
   agreement's cancellation acts, and the view would report a live or attention window on a
   **cancelled** trade — a false demand, not a disclosure, and reachable only with privileged
   access the product already trusts. **FOUNDER RULING 2026-09-07 — no longer an open question.**
   The same contract-integrity principle DOES apply to core `barter_agreements` identity:
   participants, offer identity, interest identity, proposal identity, `accepted_version_id` and
   equivalent authoritative source/participant references must not be silently rewritten by
   ordinary `service_role` maintenance once the agreement is official, and any operational
   correction must be explicit, separately approved and auditable.

   **It is NOT enforced today.** Evidence, read from the LIVE catalog on the linked
   non-production project rather than from a file — `pg_proc.prosrc` for
   `public.enforce_barter_agreement_immutable` is, in full:

   ```
   begin
     if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
       return coalesce(new, old);
     end if;
     raise exception 'An agreement cannot be edited or deleted.' using errcode = 'check_violation';
   end;
   ```

   So an ordinary authenticated caller is refused ABSOLUTELY on both UPDATE and DELETE, and there
   is no client-reachable bypass. But the privileged branch is an unconditional early return with
   **no contract-field diff** — the shape § 3b replaced on the obligation trigger — so
   `service_role` and the no-JWT path can still rewrite every agreement column.

   **BOUNDED FOLLOW-UP, deliberately NOT done in PR #62** (Founder: do not broaden this PR into
   agreement hardening). The work is: give `enforce_barter_agreement_immutable` the same
   deny-by-default `to_jsonb(new) - <mutable keys>` treatment § 3b gave the obligation trigger,
   preserving privileged DELETE so account-erasure and post cascades keep working. It is a
   forward migration on a function this slice does not touch, and it needs its own review. Until
   then, what stands between the two read policies drifting apart is the cross-table data
   invariant asserted in `supabase/tests/receiver_window.test.sql` § 14c, which fails CI on drift.

Ledger after apply: **50 entries** — **VERIFIED 2026-09-07** by `supabase migration list`
against the linked non-production project (`wcoyjeklscuqsumpjpfo`); local and remote agree on all
50 versions with no gap and no drift, and `20261011000000` is recorded with the corrected body
(the applied statements contain § 3b and the timezone pin). Production untouched, never targeted
and never queried; no credential for it was read, and the only Supabase values present in the
environment were the non-production `TEST_SUPABASE_*` keys.

## 2026-09-07 — `20261012000000` + `20261013000000` + `20261014000000` **APPLIED to non-production 2026-09-07** (No-show + Under Review foundation, PR TBD)

> **APPLICATION STATUS: APPLIED to non-production (`wcoyjeklscuqsumpjpfo`) on 2026-09-07.**
> `supabase migration list --linked`: local and remote agree on all **53** versions, no gap and
> no drift. **B5B: 1074/1074 passed, 0 failed**, of which the new `no_show` suite is
> `supabase/tests/no_show_under_review.test.sql`. **Concurrency: 124/124 passed**
> (`scripts/negotiation-concurrency.mjs`), including four new no-show races. Both harnesses
> report zero residue, and the concurrency harness now counts the new table in its residue
> sweep. Production (`kxregomuawwcqvisuhtr`) was never targeted and never queried.

**THREE migrations, and the second and third each correct the first.** `20261012000000` is the slice.
`20261013000000` is a **forward correction** applied minutes later, because `20261012000000`
computed no-show eligibility as an INLINE PREDICATE inside `my_trade_activity` and did not
expose it on `my_barter_obligations` at all. That was wrong twice: the rule had no single home,
and the surface that actually renders the button (the trade detail) reads the obligations view
and would have had to re-derive the answer from `scheduled_at` on the client — exactly what
PD-057 established must not happen. `20261012000000` was **not edited**; the rule now lives in
`public.barter_can_report_no_show` and `my_trade_activity` reads the column rather than
recomputing it.

**ONE NEW FACT, ONE DERIVED STATE.** `public.barter_obligation_no_show_reports` is append-only
with `unique (obligation_id)` — one row is not an arbitrary cap, because only the obligation's
RECEIVER may report and an obligation has exactly one receiver, so a second row could only be
the same person filing twice. That constraint is what makes a repeat call idempotent rather than
a second event.

**UNDER REVIEW IS DERIVED, AND THERE IS DELIBERATELY NO `barter_review_cases` TABLE.** It is
`(a report exists) OR (status = 'not_received')`, minus cancelled. With adjudication out of
scope a case row would carry no assignee, no decision, no resolution and no closure — nothing
the predicate does not already determine — while adding a second place for the answer to be
wrong. "One authoritative review per obligation" holds BY CONSTRUCTION: a derived predicate
cannot have two values. Same precedent as PD-057's window and as cancelled-by-one versus
mutually-cancelled, which `20261005000000` says is "DERIVED from the row count, never stored".
**When an operator can take, annotate or resolve a review there is real state to hold, and a
case table becomes right — that is the adjudication slice, which this does not begin.**

**AUTHORITY.** Receiver only, enforced in the RPC AND re-derived independently in the BEFORE
INSERT trigger, which reads every identity from the obligation rather than trusting the row. A
non-participant gets the same message and SQLSTATE as a caller naming an id that does not exist,
so neither learns which it was. **No `is_approved` check, deliberately:** a participant who was
approved when the agreement was made keeps authority over it, and losing approval must not strip
someone of the ability to report what happened on a trade they are already in.

**TIMING is `scheduled_at`, NOT `due_at`.** A receiver does not wait out the delivery window to
say a booking was missed. The comparison is against `now()` inside the RPC; there is no `p_as_of`
parameter at all, so no client value can reach it. The B5B fixture deliberately produces a trade
whose APPOINTMENT has passed while its DUE DATE has not, so a `due_at`-based implementation
would fail rather than pass by accident.

**LOCK ORDER — the first version of this paragraph was WRONG, and the correction is
`20261014000000`.** It claimed `report_barter_obligation_no_show` "takes the OBLIGATION row lock
and nothing else, exactly as `record_barter_obligation_receipt` and
`mark_barter_obligation_delivered` do ... so the pair cannot deadlock", and told future writers to
preserve that property. Both halves were false.

The function DOES lock `barter_agreements`, just not with a visible `for update`: its INSERT
carries an FK to that table, and PostgreSQL enforces an FK on INSERT by taking `for key share` on
the parent row, which conflicts with `for update`. So the real order was **obligation, then
agreement** — the reverse of `cancel_barter_agreement`. The parity claim failed for the same
reason: the other two obligation RPCs only UPDATE lifecycle columns, and PostgreSQL skips the FK
re-check when the referencing columns are unchanged, so those genuinely take no agreement lock.
This was the FIRST obligation-scoped writer to INSERT a row referencing `barter_agreements` while
holding the obligation lock, and it inherited a contract written for functions doing something
else.

**The deadlock was REPRODUCED, not merely reasoned about.** With race #20's assertions
strengthened to fail on `40P01` rather than absorb it, `scripts/negotiation-concurrency.mjs`
reported `FAIL neither act deadlocked` on the pre-fix schema — a receiver reporting a no-show
while either participant cancelled, which is exactly the "they did not show up" versus "I am
cancelling this" moment.

`20261014000000` replaces the function body so the AGREEMENT lock is taken FIRST, matching
`cancel_barter_agreement`. The order across the barter graph is now total: **agreement before
obligation, obligations in id order.** Every authority check, refusal SQLSTATE, the idempotent
branch and the return value are unchanged, so no client copy and no test expectation moved; a
terminal `unique_violation` handler was added so that "unreachable" is not load-bearing, matching
`cancel_barter_agreement`'s own precedent.

**RULE FOR FUTURE WRITERS, restated because the old one was wrong in a way that was easy to
believe: ENUMERATE THE IMPLICIT LOCKS TOO.** An INSERT, or an UPDATE that writes a foreign-key
column, takes `for key share` on the parent row. One that touches only non-key columns does not.
"I wrote no `for update` on that table" is not the same as "I take no lock on it".

**A REPORT DOES NOT REWRITE HISTORY.** `delivered_at` is never erased and no prior row is
changed. A receiver may report a no-show even after the deliverer marked it delivered — "they
marked it delivered" is precisely the claim a receiver may need to contradict — and the two
facts simply stand beside each other. `not_received` qualifies for review on its own, so nobody
is forced to file a second complaint to be heard.

**WHAT IS NOT BUILT, AND ONE OPEN QUESTION.** No adjudication, no operator decision path, no
reviewer identity, no resolution, no closure, no appeal, and no terminal outcome of any kind. No
reputation signal, no notification, no scheduler — nothing moves a row on a timer. The
obligation `status` vocabulary is unchanged at four values and Under Review is **not** one of
them. **OPEN FOUNDER QUESTION:** whether an unresolved Needs Attention should be escalatable
into Under Review. Automatic escalation would be a SECOND TIMER beyond PD-057's seven days,
which no PD defines; manual escalation would need an actor and terms no authoritative document
defines. Neither was invented — Needs Attention still resolves only by the receiver answering.

**One existing assertion was amended, and this is recorded rather than buried.**
`receiver_window.test.sql`'s zero-residue sweep forbade any function matching `%no_show%` or
`%under_review%`. That was correct for that slice and is now false by ruling, so the sweep
EXEMPTS exactly five named objects rather than dropping the patterns — a sixth would still fail
there. Everything else in that sweep (adjudication, fulfilment, expiry, timeout, dispute)
remains forbidden.

## 2026-09-07 — `20261015000000` … `20261017000000` **APPLIED to non-production 2026-09-07** (PD-062 / PD-063, PR #64)

> **APPLICATION STATUS: APPLIED to non-production (`wcoyjeklscuqsumpjpfo`).** 57 versions, local
> and remote agree, no drift. **B5B: 1089/1089 passed, 0 failed.** Production
> (`kxregomuawwcqvisuhtr`) never targeted, never queried.

**PD-063 — Under Review outranks the ordinary exit.** `20261015000000` makes
`cancel_barter_agreement` refuse with the new SQLSTATE **`PT423`** once any no-show report exists
on the agreement. Before it, the provider a report was ABOUT could cancel the trade and make the
derived Under Review state disappear — the report row survived, but nothing showed it. The
approved boundary is now total: cancel-first refuses a later report (`PT409`), report-first
refuses a later cancellation (`PT423`), and a race resolves to exactly one state because **both
writers take the `barter_agreements` row lock FIRST** (`20261014000000` put the no-show RPC on
that order).

`PT423` is deliberately NOT `object_not_in_prerequisite_state`, which already means "something
has already been delivered". A trade under review has not necessarily been delivered, and saying
so would be a false statement about a provider's own trade.

**`20261016000000` — the no-show reason reaches the two participants.** The column, its CHECK and
the RPC parameter existed from `20261012000000` and the RLS always admitted both participants;
what did not exist was a route, so the text sat unreachable at four layers. The view is
`security_invoker`, so exposing it widens NO boundary — it makes readable, to exactly the two
people already entitled to the row, a column they could already reach through PostgREST. No
`reported_by_me` column was added: only the receiver can report, `receiver_user_id` is already on
the view, and a second derivable field is one that can disagree.

---

**`20261017000000` — A MISTAKE, AND THE ONE THIS LEDGER SECTION EXISTS TO PREVENT.**

`20261015000000` added the PD-063 check to `enforce_barter_cancellation_consistent` by writing a
new body **from `20261005000000`, the migration that CREATED the function — not from
`20261006000000`, its LIVE definition.** Two properties were silently reverted:

* `new.created_at := clock_timestamp()`, which server-stamps on EVERY insert path rather than
  only defaulting — without it a direct insert can supply a backdated value.
* **THE ACTOR IS THE CALLER.** Without it a privileged writer holding one participant's session
  could record the OTHER participant's cancellation — and two acts is exactly what the product
  reads as **mutually cancelled**, fabricating assent nobody gave.

**B5B caught it on the first run after apply**, at `supabase/tests/cancellation.test.sql:752-759`
— the assertion `20261006000000` added for precisely this. Nothing reached any environment beyond
the linked non-production project. `20261017000000` restores `20261006000000`'s body verbatim and
re-adds the PD-063 check on top of it.

`cancel_barter_agreement` was NOT affected: `20261015000000` wrote that one from
`20261010000000`, which IS its live definition, and diffed it before commit — exactly one block
added.

**The lesson, recorded because the repo has now paid for it twice** (`20261008000000` restored
four properties `20261007000000` dropped the same way): **read the functions table below BEFORE
redefining anything.** "The migration that created it" and "the migration that defines it" are
different files, and the more discoverable one — the one carrying all the design rationale — is
usually the wrong one.

## Functions redefined across migrations

A `create or replace function` in a later migration silently supersedes an earlier one. The
earlier file still *looks* authoritative, so a change made there and re-applied reverts the
later behaviour with no error. This table records every function whose current definition is
NOT in the migration that created it.

| Function | Created in | **Current definition** | Why it moved |
|---|---|---|---|
| `public.cancel_barter_agreement` | `20261005000000_barter_pre_delivery_cancellation.sql` | **`20261010000000_cancellation_notice_neutral_copy.sql`** | **Replaced FIVE times in one PR — the most-redefined function in this repo. Copying any earlier body forward deletes the in-thread signal and restores the untrue "Both providers agreed to cancel" wording.** `20261006000000` added the post-lock `FOUND` re-check, bound the actor to `auth.uid()` in the consistency trigger, and made `created_at` server-stamped on every insert path rather than by DEFAULT. `20261007000000` added the counterparty notice and the shared reason. `20261008000000` restored the four properties `20261007000000` dropped by copying `20260910000000` instead of the live `20260913000000` — best-effort isolation (**a notice failure must never veto the cancellation**), the open-conversation predicate, the provider-identity re-check, and `system_recipient_id`. `20261009000000` replaced the inlined notice block with a call to `public.pair_conversation_notice` and derives the classification once. `20261010000000` changed **one string literal** — the second notice now states a fact ("Both providers cancelled…") rather than an agreement, because two concurrent cancellations reach two acts without either participant assenting. |
| `public.pair_conversation_notice` (new) | `20261009000000_pair_conversation_notice.sql` | **`20261009000000_pair_conversation_notice.sql`** | **The one writer for platform notices (`sender_id IS NULL`) into a provider pair's existing conversation.** Resolves the canonical thread by `provider_pair_key` with the stale-key fallback, re-checks that both `providers` rows still belong to the agreement's users, skips a thread that cannot take a message, addresses the notice via `system_recipient_id`, and wraps the write so it **can never veto the act it announces**. Creates no conversation. **EXECUTE revoked from `public`, `anon` and `authenticated`** — callers are other definer functions. A NEW signal writer must call this rather than hand-copy it; that hand-copying is exactly what produced the `20261008000000` correction. **`public.release_barter_interest` deliberately still carries its own body** (live definition `20260913000000`): replacing a shipped, authorization-adjacent function wholesale to remove a duplicate would risk a live path to tidy one. Migrate it onto this helper the next time it is opened for a reason of its own. |
| `public.mark_barter_obligation_delivered` / `public.record_barter_obligation_receipt` | `20261004000000_barter_obligation_delivery.sql` | **`20261005000000_barter_pre_delivery_cancellation.sql`** | Both gained a cancellation check placed **after** the obligation row lock — the half of the delivery/cancel race contract that `cancel_barter_agreement` depends on. Every guard from `20261004000000` survives in order; the check precedes the idempotent no-op branch so a cancelled trade is never reported as a successful delivery. The two public receipt wrappers (`confirm_barter_obligation_received`, `report_barter_obligation_not_received`) are untouched and still resolve, because `create or replace` preserves the OID. |
| `public.cancel_barter_agreement` (again) | `20261005000000_barter_pre_delivery_cancellation.sql` | **`20261015000000_under_review_precedes_cancellation.sql`** | **Now redefined SIX times — the most-redefined function in this repo, and the live definition has moved again.** Adds the PD-063 refusal: once any `barter_obligation_no_show_reports` row exists on the agreement it raises **`PT423`**, because a trade under review must not be cancellable out of review. Everything from `20261010000000` survives in order and was diffed before commit — exactly one block added. **Copying any earlier body forward now reverts PD-063 as well as the in-thread notice and the neutral wording.** |
| `public.enforce_barter_cancellation_consistent` | `20261005000000_barter_pre_delivery_cancellation.sql` | **`20261017000000_restore_cancellation_actor_binding.sql`** | Redefined THREE times. `20261006000000` added the server-stamped `created_at` and the ACTOR-IS-THE-CALLER check. **`20261015000000` then silently reverted both by writing its new body from `20261005000000` instead of the live `20261006000000`** — the exact hazard this table exists to prevent; B5B caught it at `cancellation.test.sql:752-759` on the first run after apply. `20261017000000` restores `20261006000000` verbatim and re-adds the PD-063 `PT423` check on top. |
| `public.my_barter_obligations` / `public.my_trade_activity` (VIEWS, not functions) | `20261011000000` / `20260929000000` | **`20261016000000`** (obligations) and **`20261013000000`** (trade activity) | Listed here although this table is named for functions, because both views are recreated IN FULL by `create or replace view` and the same copy-forward hazard applies. `20261012000000` is the more discoverable file — it carries the design rationale — and copying its `my_trade_activity` body forward would reinstate the inline eligibility predicate `20261013000000` removed, while copying its `my_barter_obligations` body would drop `can_report_no_show` and `no_show_reason`. |
| `public.enforce_barter_obligations_immutable` | `20261004000000_barter_obligation_delivery.sql` | **`20261011000000_barter_receiver_window_needs_attention.sql`** | **The privileged early return was SPLIT, and copying the `20261004000000` body forward would silently re-open a `service_role` rewrite of the agreed trade.** Founder ruling 2026-09-06: the obligation's CONTRACT FIELDS — `agreement_id`, `source_term_id`, `side`, the four deliverer/receiver identity columns, `agreed_description`, `due_at`, `scheduled_at` — are now frozen against EVERY writer, `service_role` and the no-JWT maintenance path included. The contract-field diff runs BEFORE the privileged branch; the diff is denied by default (the whole row MINUS `status`, `delivered_at` and `receipt_responded_at` must be identical), so a column added by a later migration is frozen unless deliberately subtracted. **Privileged DELETE is unchanged and must stay that way** — every `auth.users` and `barter_agreements` FK in this graph is `ON DELETE CASCADE`, so account erasure and agreement removal depend on it. The three lifecycle columns keep their prior privileged latitude, still bound by the `20261004000000` CHECK constraints. **This is a narrowing only: nothing gains a write it did not have.** It landed in this migration because this migration made those columns load-bearing — the identity columns became the scoping keys of `my_barter_obligations`, and `due_at`/`scheduled_at` became the PD-057 deadline anchor both participants act on. Message and SQLSTATE unchanged. Asserted by the service_role freeze matrix in `supabase/tests/receiver_window.test.sql` § 14b, which also pins that privileged DELETE and privileged lifecycle writes still work. |
| `public.release_barter_interest` | `20260909000000_barter_interest_release.sql` | **`20260913000000_trade_activity_hardening.sql`** | `20260910000000` added the in-transaction counterparty signal; `20260911000000` made that signal unable to veto the release and added the provider-identity assertion. **`20260909000000`'s header instructs future slices to add the agreement guard "HERE, inside this function", and `20260911000000` repeats it saying "THIS definition, the live one". BOTH now point at DEAD definitions. Extend the current one.** `20260912000000` adds the post-context label and addresses the notice via `system_recipient_id`. |
| `public.enforce_barter_interest_write` | `20260906000000_barter_integrity_slice1.sql` | **`20260909000000_barter_interest_release.sql`** | Adds the `accepted -> released` transition and the release-column allow-list, gated on a transaction-local marker **and** the transition itself. The trigger **derives** `released_at` / `released_by` / `release_reason` rather than trusting them, so attribution is non-forgeable independent of the caller — that clamp is the load-bearing part, not the marker. The INSERT path additionally null-clamps the three new release columns so they are never author-supplied. The pre-existing owner-only `pending -> accepted\|declined` rule and the pre-existing INSERT clamps are carried through unchanged. |
| `public.enforce_message_immutability` (new) / policy `participants_mark_messages_read` | `20260829000000_canonical_live_baseline.sql` (policy) | **`20260911000000_message_authorship_pin.sql`** | The policy's `sender_id = sender_id` conjuncts were TAUTOLOGIES — an RLS policy cannot reference OLD — so they pinned nothing and were NULL for a null sender. The pin moved to a BEFORE UPDATE trigger, where it can compare to OLD; the policy now asserts only participation. |
| `public.enforce_conversation_update` | `20260901000000_prebooking_message_requests.sql` | **`20260908000000_canonical_provider_pair.sql`** | Redefined twice. `20260907000000` added `declined -> accepted` for the barter handoff (gated on an accepted match AND a transaction-local marker set only by `accept_barter_interest`); `20260908000000` then widened the booking-attach predicate to accept EITHER orientation of a provider pair, because a conversation is now canonical for the pair and its orientation need not match the direction a booking was made in. |
| `public.enforce_prebooking_message_rules` | `20260901000000_prebooking_message_requests.sql` | **`20260914000000_trade_activity_corrections.sql`** | Redefined THREE times. `20260901010000` added the `select ... for update` row lock closing the SEC-DATA-001 read-then-insert race. `20260913000000` added the `system_recipient_id` insert clamp **and silently deleted that lock**, because its body was written from `20260901000000` rather than from the live definition. `20260914000000` restores the lock and keeps the clamp. **`supabase/tests/messaging.test.sql` asserts on `prosrc`, with comments stripped, that the lock is on the conversation lookup statement itself** — the only mechanism that survives a future `create or replace`. |
| `public.barter_terms_label` | `20260913000000_trade_activity_hardening.sql` | **`20260914000000_trade_activity_corrections.sql`** | Delegates to the new `public.barter_terms_sanitize`. `20260913000000` quoted and capped the owner-authored offer terms but did not strip the QUOTE CHARACTER, so the boundary the quotes draw could be erased by the quoted text. Sanitising now happens BEFORE the empty test and BEFORE the 40-char cap, so an attacker cannot pad with strippable codepoints. |
| `public.accept_barter_interest` | `20260907000000_barter_accept_handoff.sql` | **`20260915000000_barter_closed_post_terminal.sql`** | Routes the handoff message's two participant-authored values (`providers.display_name`, `barter_offers.offering_service`) through `barter_terms_sanitize` and caps each at 40 chars. That call site was missed when the release notice was hardened. Lower stakes — the message is attributed to the owner, so it never posed as platform speech — but it interpolated up to 200 unbounded characters with a working quote breakout. **The new body was taken from `20260907000000` and diffed before commit: exactly 2 lines of the FUNCTION BODY changed.** Outside the body, the two trailing `revoke` statements were also consolidated into one `revoke all ... from public, anon` — semantically identical, and it still removes the `anon` grant Supabase's `ALTER DEFAULT PRIVILEGES` creates. Recorded because the bare "2 lines" claim was one line short of the literal file diff. |
| `public.enforce_barter_accept_open_offer` → **`public.enforce_barter_answer_open_offer`** | `20260914000000_trade_activity_corrections.sql` | **`20260916000000_barter_guard_admin_escape.sql`** (RENAMED by `20260915000000`, which dropped the old function and trigger; body refreshed by `20260916000000`) | Now refuses the transition into `declined` as well as `accepted` when the parent offer is closed (PD-052), and gains the `service_role` exemption every sibling trigger on this table has — without it the INSERT arm bound *only* service_role, since `enforce_barter_interest_write` clamps every authenticated insert to `pending`. Renamed because "accept" understated what it refuses. Trigger `barter_interests_zy_accept_open_offer` → `barter_interests_zy_answer_open_offer`. `20260916000000` then added the null-`auth.uid()` half of the admin exemption, which `20260915000000` omitted. |
| `public.accept_barter_version` | `20260917000000_barter_proposal_versions.sql` | **`20260921000000_negotiation_write_boundary.sql`** | `20260919000000` gave "these terms were replaced" its own SQLSTATE (`40001`) so it is distinguishable from "this negotiation ended"; `20260921000000` added fail-closed `not found` branches and moved the offer lock ahead of the interest lock. |
| `public.assert_barter_version_budget` | `20260917000000_barter_proposal_versions.sql` | **`20260920000000_negotiation_budget_code.sql`** | The 20-per-24h cap raised `check_violation`, the same code as a malformed proposal and reachable from the same button; now `54000`. Note `create_barter_proposal` no longer calls it — the call sat after the proposal insert and always counted zero. |
| `public.write_barter_proposal_terms` (signature changed) | `20260917000000` as `(uuid, jsonb)` | **`20261001000000_proposal_term_timing.sql`** as `(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)`; old signatures DROPPED | Takes content and timing for the two sides and derives each side's provider/user from the accepted interest in one place. Nothing is passed in that a caller could get wrong, and there is no parameter a caller could forge. |
| `public.enforce_barter_terms_written_once` | `20260924000000` | **`20260925000000_negotiation_directed_terms.sql`** | Now also asserts exactly two terms, one per side, and that each side's stored identity matches the offer/interest — a backstop against a future writer that derives them wrongly or is handed them. |
| `public.create_barter_proposal` / `public.submit_barter_counter` (signatures changed) | `20260917000000` as `(uuid, jsonb)` | **`20261001000000_proposal_term_timing.sql`** as `(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)`; old signatures DROPPED | Clients now send content + timing only. Provider ids, participant ids, side identities and version numbers remain server-derived. |
| `public.assert_barter_proposal_version_timing_current` | `20261002000000_proposal_timing_expiry_guards.sql` | **`20261002000000_proposal_timing_expiry_guards.sql`** | Shared acceptance/finalization-time expiry check for proposal term timing. Raises `PT410` when a version's due/scheduled timing is no longer future-valid; additive triggers call this rather than duplicating timing interpretation. |
| `public.enforce_no_change_after_agreement` | `20260927000000_barter_agreement_finalization.sql` | **`20260928000000_agreement_guard_field_ref.sql`** | Referenced `new.version_id` inside a CASE branch meant for `barter_version_acceptances`; PL/pgSQL resolves NEW's fields regardless of branch, so on a `barter_proposal_versions` row it raised 42703 and blocked EVERY version insert. Caught by B5B on the first run after apply. Now reads the row through `to_jsonb(new)`. |
| `public.enforce_barter_terms_write` | `20260921000000_negotiation_write_boundary.sql` | **`20260926000000_negotiation_stale_comment.sql`** | `20260923000000` removed a per-row write-once count that tripped on the second row of the RPC's own insert; the trigger keeps only the marker check. Write-once now rests on the statement-level `enforce_barter_terms_written_once` (`20260924000000`), and `20260926000000` refreshed a body comment that still cited a since-dropped index. |
| `public.enforce_barter_offer_active_one_way` | `20260915000000_barter_closed_post_terminal.sql` | **`20260916000000_barter_guard_admin_escape.sql`** | Makes `is_active` one-way for authenticated writers (PD-051). `20260915000000` exempted only `auth.role() = 'service_role'`, which covers the PostgREST service path but NOT a psql / SQL-console / migration session, where there is no JWT and `auth.role()` is NULL — so it silently excluded the sessions an operator actually recovers from, and would abort any future migration touching `is_active`. `20260916000000` adds `or (select auth.uid()) is null`, matching `enforce_barter_offer_delete`. |
| `public.getOrCreateConversation` (client) / conversation resolution | — | **`20260908000000_canonical_provider_pair.sql`** | `resolve_conversation` and `find_conversation` are the authoritative resolve-or-create and lookup paths. Do not resolve a conversation by a single `(client_id, provider_id)` orientation anywhere: a provider pair may legitimately be stored either way round. |

`20260907000000`'s "RECORDED, NOT RESOLVED / TWO THREADS PER PAIR" note is **resolved** by
`20260908000000`: the guarantee now lives in the `conversation_one_per_provider_pair` index,
not in `barter_canonical_conversation`, which today only chooses an orientation for a row that
does not exist yet.

**`public.provider_pair_key(uuid, uuid)`** (added by `20260912000000`) is a named READER of the
pair-key format, **not** the single source of truth: `conversation_pair_key()` — the trigger
that WRITES the column — plus `resolve_conversation()` and `find_conversation()` all still carry
the literal (`20260908000000`). Routing them through it is deferred. What guards the drift is
the B5B case asserting the reader equals what the trigger wrote; a divergence would otherwise be
silent, since the release lookup would miss and the counterparty would never be told.

**`public.enforce_prebooking_message_rules`** current definition is
`20260914000000_trade_activity_corrections.sql`. LINEAGE: created in `20260901000000`,
**corrected by `20260901010000`** (which added the `select ... for update` row lock closing the
SEC-DATA-001 read-then-insert race), redefined by `20260913000000` (the `system_recipient_id`
clamp), and redefined again by `20260914000000`.

`20260913000000` **deleted the lock**, because its body was written from `20260901000000` — the
migration that CREATED the function — rather than from the definition that was actually live.
`create or replace function` replaces the whole body, so every correction made since the copy
you started from disappears without a diff, an error, or a failing test. `20260914000000`
restores it, and `supabase/tests/messaging.test.sql` now asserts on `prosrc` that the lock is
present, because the B5B harness runs in ONE transaction and no behavioural assertion in it can
observe a race.

**Before redefining any function, read the definition named in THIS table, not the migration
that created it.** That is the whole reason the table exists.

The current definition clamps `system_recipient_id` to null for any message that HAS an author.
The scoping matters: `SECURITY DEFINER` does not change `auth.role()`, so an unconditional clamp
also fires inside `release_barter_interest` and wipes the addressing it just computed.

**`public.barter_terms_label`** current definition is `20260914000000` (created in
`20260913000000`), and now delegates sanitising to **`public.barter_terms_sanitize`**
(`20260914000000`). `20260913000000` quoted and capped the owner-authored offer terms but did
not remove the QUOTE CHARACTER itself, so the boundary the quotes draw was one the quoted text
could erase. It also strips the Unicode bidi overrides and zero-width marks by exact codepoint
via `translate`, because whether `[[:cntrl:]]` classes them depends on the database ctype.

**`public.enforce_barter_answer_open_offer`** (`20260915000000`, trigger
`barter_interests_zy_answer_open_offer`; bodies refreshed by `20260916000000`) refuses the
transition into `accepted` **or** `declined` when the offer is not active, with SQLSTATE
`55000`. **CORRECTED CLAIM:** this paragraph previously described
`public.enforce_barter_accept_open_offer` / `barter_interests_zy_accept_open_offer`
(`20260914000000`) in the present tense. Both objects were **dropped** by `20260915000000`, and
the old description also stated the accept-only rule that PD-052 superseded. Added as a NEW
trigger rather than as a redefinition of `accept_barter_interest`, specifically to avoid the
failure mode recorded above: an additive trigger cannot delete a correction it does not know
about.

**`public.enforce_barter_offer_active_one_way`** (`20260915000000`, trigger
`barter_offers_zy_active_one_way`; body refreshed by `20260916000000`) makes `is_active`
one-way for authenticated writers (PD-051), with SQLSTATE `55000`. Both guards exempt
`service_role` **and** the null-`auth.uid()` (no-JWT) path, matching
`enforce_barter_offer_delete`; `20260915000000` implemented only the first half, which silently
excluded the psql / SQL-console / migration sessions an operator actually recovers from.

**`public.my_trade_activity`** (view, `20260912000000`, recreated by `20260913000000`) is
`security_invoker = true`, pinned by reloption in B5B. Both pre-existing views in this repo set
it FALSE, so the copyable pattern is the wrong one here. CORRECTED CLAIM: an earlier version of
this entry said omitting the option would return every provider's negotiations to any
authenticated caller. That is FALSE — the view's own `WHERE` is `auth.uid()`-scoped, so a
definer view would still return only the caller's rows. What is lost is the **RLS backstop**:
`release_barter_interest` re-checks that both provider rows belong to the users it is about to
message, precisely because it runs with RLS off; the view makes no such check and relies on
invoker RLS to cover the same identity-drift case. **`messages.system_recipient_id`** (`20260912000000`) names which participant a platform
notice is FOR, so the actor who caused it is not badged; NULL means addressed to both, which is
every ordinary message.

The superseding migration names what it replaces and why. The EARLIER file deliberately
carries no pointer: `supabase/README.md` forbids editing a migration that has already merged,
and that rule does not carve out an exception for comments -- so this table, not a comment at
the old definition site, is where the fact lives. Check it before changing any trigger
function.

B5B covers the carve-out from both directions (`supabase/tests/barter.test.sql`): a reverting
edit fails the suite rather than shipping, so this table is a discovery aid, not the
enforcement.

## Production application policy

Locked by Founder ruling, 2026-09-04. **No production reconciliation or migration work is
authorized. Production remains untouched**, and has never been reconciled by this process.

Before any eventual production application, in this order:

1. Run the required **READ-ONLY** integrity / preflight queries.
2. Return the results to Founder/PM.
3. Obtain **explicit** authorization for any remediation.
4. Obtain **explicit and separate** authorization for the production apply itself.

**No automatic remediation. No production writes.** Authorization for one step is not
authorization for the next, and authorization for one apply is not standing authorization.

This matters concretely for `20260908000000_canonical_provider_pair.sql`, whose section-0
precheck **refuses to apply** if any provider pair already holds two conversation rows. Zero
such pairs exist on non-production; the production count is **unknown and has not been
queried**. Establishing it is a step 1 read-only query, not a fix.
