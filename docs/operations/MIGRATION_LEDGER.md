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

## Prevention

Apply migrations through `supabase migration up` / `db push` so the ledger records them.
Hand-applied SQL requires a `migration repair` in the same sitting, or the drift returns.

## Production

Out of scope for this note. Production has never been reconciled by this process and must
not be, without a separate, explicitly approved change.

## Functions redefined across migrations

A `create or replace function` in a later migration silently supersedes an earlier one. The
earlier file still *looks* authoritative, so a change made there and re-applied reverts the
later behaviour with no error. This table records every function whose current definition is
NOT in the migration that created it.

| Function | Created in | **Current definition** | Why it moved |
|---|---|---|---|
| `public.release_barter_interest` | `20260909000000_barter_interest_release.sql` | **`20260913000000_trade_activity_hardening.sql`** | `20260910000000` added the in-transaction counterparty signal; `20260911000000` made that signal unable to veto the release and added the provider-identity assertion. **`20260909000000`'s header instructs future slices to add the agreement guard "HERE, inside this function", and `20260911000000` repeats it saying "THIS definition, the live one". BOTH now point at DEAD definitions. Extend the current one.** `20260912000000` adds the post-context label and addresses the notice via `system_recipient_id`. |
| `public.enforce_barter_interest_write` | `20260906000000_barter_integrity_slice1.sql` | **`20260909000000_barter_interest_release.sql`** | Adds the `accepted -> released` transition and the release-column allow-list, gated on a transaction-local marker **and** the transition itself. The trigger **derives** `released_at` / `released_by` / `release_reason` rather than trusting them, so attribution is non-forgeable independent of the caller — that clamp is the load-bearing part, not the marker. The INSERT path additionally null-clamps the three new release columns so they are never author-supplied. The pre-existing owner-only `pending -> accepted\|declined` rule and the pre-existing INSERT clamps are carried through unchanged. |
| `public.enforce_message_immutability` (new) / policy `participants_mark_messages_read` | `20260829000000_canonical_live_baseline.sql` (policy) | **`20260911000000_message_authorship_pin.sql`** | The policy's `sender_id = sender_id` conjuncts were TAUTOLOGIES — an RLS policy cannot reference OLD — so they pinned nothing and were NULL for a null sender. The pin moved to a BEFORE UPDATE trigger, where it can compare to OLD; the policy now asserts only participation. |
| `public.enforce_conversation_update` | `20260901000000_prebooking_message_requests.sql` | **`20260908000000_canonical_provider_pair.sql`** | Redefined twice. `20260907000000` added `declined -> accepted` for the barter handoff (gated on an accepted match AND a transaction-local marker set only by `accept_barter_interest`); `20260908000000` then widened the booking-attach predicate to accept EITHER orientation of a provider pair, because a conversation is now canonical for the pair and its orientation need not match the direction a booking was made in. |
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
`20260913000000_trade_activity_hardening.sql` (created in `20260901000000`). It now clamps
`system_recipient_id` to null for any message that HAS an author. The scoping matters:
`SECURITY DEFINER` does not change `auth.role()`, so an unconditional clamp also fires inside
`release_barter_interest` and wipes the addressing it just computed.

**`public.my_trade_activity`** (view, `20260912000000`, recreated by `20260913000000`) is `security_invoker = true`, pinned by
reloption in B5B. Both pre-existing views in this repo set it FALSE, so the copyable pattern is
the wrong one here — omitting it would return every provider's negotiations to any authenticated
caller. **`messages.system_recipient_id`** (`20260912000000`) names which participant a platform
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
