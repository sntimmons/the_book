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

## Prevention

Apply migrations through `supabase migration up` / `db push` so the ledger records them, **and
write the apply record in the same sitting** — the seven-migration gap above is what happens
otherwise.
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
| `public.enforce_prebooking_message_rules` | `20260901000000_prebooking_message_requests.sql` | **`20260914000000_trade_activity_corrections.sql`** | Redefined THREE times. `20260901010000` added the `select ... for update` row lock closing the SEC-DATA-001 read-then-insert race. `20260913000000` added the `system_recipient_id` insert clamp **and silently deleted that lock**, because its body was written from `20260901000000` rather than from the live definition. `20260914000000` restores the lock and keeps the clamp. **`supabase/tests/messaging.test.sql` asserts on `prosrc`, with comments stripped, that the lock is on the conversation lookup statement itself** — the only mechanism that survives a future `create or replace`. |
| `public.barter_terms_label` | `20260913000000_trade_activity_hardening.sql` | **`20260914000000_trade_activity_corrections.sql`** | Delegates to the new `public.barter_terms_sanitize`. `20260913000000` quoted and capped the owner-authored offer terms but did not strip the QUOTE CHARACTER, so the boundary the quotes draw could be erased by the quoted text. Sanitising now happens BEFORE the empty test and BEFORE the 40-char cap, so an attacker cannot pad with strippable codepoints. |
| `public.accept_barter_interest` | `20260907000000_barter_accept_handoff.sql` | **`20260915000000_barter_closed_post_terminal.sql`** | Routes the handoff message's two participant-authored values (`providers.display_name`, `barter_offers.offering_service`) through `barter_terms_sanitize` and caps each at 40 chars. That call site was missed when the release notice was hardened. Lower stakes — the message is attributed to the owner, so it never posed as platform speech — but it interpolated up to 200 unbounded characters with a working quote breakout. **The new body was taken from `20260907000000` and diffed before commit: exactly 2 lines of the FUNCTION BODY changed.** Outside the body, the two trailing `revoke` statements were also consolidated into one `revoke all ... from public, anon` — semantically identical, and it still removes the `anon` grant Supabase's `ALTER DEFAULT PRIVILEGES` creates. Recorded because the bare "2 lines" claim was one line short of the literal file diff. |
| `public.enforce_barter_accept_open_offer` → **`public.enforce_barter_answer_open_offer`** | `20260914000000_trade_activity_corrections.sql` | **`20260916000000_barter_guard_admin_escape.sql`** (RENAMED by `20260915000000`, which dropped the old function and trigger; body refreshed by `20260916000000`) | Now refuses the transition into `declined` as well as `accepted` when the parent offer is closed (PD-052), and gains the `service_role` exemption every sibling trigger on this table has — without it the INSERT arm bound *only* service_role, since `enforce_barter_interest_write` clamps every authenticated insert to `pending`. Renamed because "accept" understated what it refuses. Trigger `barter_interests_zy_accept_open_offer` → `barter_interests_zy_answer_open_offer`. `20260916000000` then added the null-`auth.uid()` half of the admin exemption, which `20260915000000` omitted. |
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
