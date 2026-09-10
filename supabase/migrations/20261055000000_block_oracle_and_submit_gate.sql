-- FORWARD CORRECTION to 20261046000000 / 20261047000000 (Session 8, PD-082).
--
-- ══ THREE WAYS THE BLOCK WAS DEFEATED ═════════════════════════════════════
--
-- Security review found all three. Each is reachable by an ordinary authenticated
-- user with no crafted client, and each contradicts PD-082 as written.
--
-- ── 1. THE PREDICATES WERE AN ORACLE ──────────────────────────────────────
--
-- `contact_blocked`, `contact_blocked_provider` and `has_live_transaction` were
-- `SECURITY DEFINER` (so RLS-exempt) **and** granted `EXECUTE` to `authenticated`.
-- `public` is the PostgREST-exposed schema, so all three were callable at
-- `/rest/v1/rpc/` with attacker-chosen arguments.
--
-- So a blocked person could ask the database the one question PD-082 says they can
-- never be told the answer to:
--
--     POST /rpc/contact_blocked_provider {"p_user": "<me>", "p_provider_id": "<them>"}
--       -> true
--     (and their own `user_blocks` read returns nothing)
--       => "they blocked me."
--
-- **My own comment on that function claimed this was impossible.** It said the
-- function "cannot be used to discover that you have been blocked" — which was
-- true of the REFUSAL MESSAGES the gates emit, and simply not true of the
-- function itself. A guarantee asserted in a comment is not a guarantee.
--
-- `has_live_transaction` was worse in a different way: it reads `bookings`,
-- `barter_agreements` and `barter_obligations` with RLS bypassed and answers about
-- ANY two users, so it disclosed the relationship graph — who currently has live
-- work with whom — to anyone holding two uuids, and provider `user_id` is public.
--
-- **THE FIX, AND WHY IT IS NOT JUST A REVOKE.** `contact_blocked` had a real
-- caller that needed the grant: the `barter_interests_provider_insert` RLS
-- `WITH CHECK`, which is evaluated as the querying user. A caller-scoped variant
-- would not have helped — "am I blocked by X" is precisely the oracle. So the
-- check MOVES OUT of the policy and into a `SECURITY DEFINER` trigger, which runs
-- as `postgres` and needs no client grant at all. All three predicates are then
-- revoked from `authenticated` outright.
--
-- ── 2. `PT427` WAS INSERT-ONLY, AND A REQUEST IS MADE ON UPDATE ────────────
--
-- The booking block gate sat inside `if tg_op = 'INSERT'`. But a `bookings` row
-- only becomes a REQUEST on the UPDATE that stamps `submitted_at` (PD-071), and
-- that path had no block check.
--
-- The shipped client walks it unaided: `ensureBookingDraft` UPDATES when a draft
-- already exists (never INSERTs, so `PT427` never fires), then
-- `submitBookingRequest` submits. So a blocked client with a draft created BEFORE
-- the block — which is what merely opening the booking flow leaves behind —
-- could deliver a real booking request to the person who blocked them.
--
-- And it compounded: a submitted, non-terminal booking is exactly what
-- `has_live_transaction` looks for, so the same act **manufactured the messaging
-- exception** and reopened the thread. `20261046000000` anticipated the draft
-- vector and closed half of it — drafts do not count as live — but nothing stopped
-- a draft from ceasing to be a draft after the block.
--
-- ── 3. `declined -> pending` WAS UNGATED ──────────────────────────────────
--
-- `enforce_conversation_update` never received a block gate, so a blocked party
-- could flip a declined thread back to `pending` — putting themselves back in the
-- blocker's Requests tab, repeatedly. The message that would follow was refused,
-- but the status flip is itself the contact signal.
--
-- ══ WHAT DOES NOT CHANGE ══════════════════════════════════════════════════
--
-- A booking submitted BEFORE the block is untouched, still readable by both
-- sides, and still counts as live — the messaging exception must not regress, or
-- blocking mid-transaction would trap both people. That is asserted as a negative
-- control in the test suite.

-- ── 1. The predicates stop being answerable by clients ─────────────────────
revoke execute on function public.contact_blocked(uuid, uuid) from authenticated;
revoke execute on function public.contact_blocked_provider(uuid, uuid) from authenticated;
revoke execute on function public.has_live_transaction(uuid, uuid) from authenticated;

comment on function public.contact_blocked(uuid, uuid) is
  'True when a block exists between these two users in EITHER direction. '
  'SECURITY DEFINER because the enforcement half must see the block the OTHER '
  'party made. **EXECUTE is revoked from authenticated**: it was granted until '
  '20261055000000, which made it directly callable over PostgREST /rpc/ and gave '
  'a blocked person a one-request answer to "did they block me" — the exact '
  'question PD-082 says they may never be told. Callers are definer triggers '
  'only. Do not grant this to a client role to satisfy an RLS policy; put the '
  'check in a trigger instead, as barter_interests does.';

comment on function public.has_live_transaction(uuid, uuid) is
  'True when these two users have a SUBMITTED, non-terminal booking or a '
  'confirmed, uncancelled barter agreement with an unresolved obligation. Reads '
  'bookings, agreements and obligations with RLS bypassed and answers about ANY '
  'pair, so **EXECUTE is revoked from authenticated** — granted until '
  '20261055000000, it disclosed the relationship graph to anyone holding two '
  'uuids. Definer callers only.';

-- ── 2. The barter block check moves from policy to trigger ─────────────────
--
-- Restored to its pre-Session-8 shape plus the eligibility term. The block term
-- leaves, because a policy is evaluated as the CALLER and therefore forces a
-- client-executable predicate.
drop policy if exists "barter_interests_provider_insert" on public.barter_interests;
create policy "barter_interests_provider_insert" on public.barter_interests
  for insert to authenticated
  with check (
    interested_user_id = (select auth.uid())
    and interested_provider_id = (select public.caller_eligible_provider_id())
  );

create or replace function public.enforce_barter_interest_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  select o.user_id into v_owner
    from public.barter_offers o where o.id = new.offer_id;
  if not found then
    return new;  -- The FK and the policy answer this; not this trigger's job.
  end if;

  -- Generic and identical in both directions: it must not reveal that a block
  -- exists, or which side made it.
  if public.contact_blocked(new.interested_user_id, v_owner) then
    raise exception 'This offer is not available.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_interest_not_blocked() owner to postgres;
revoke all on function public.enforce_barter_interest_not_blocked()
  from public, anon, authenticated;

drop trigger if exists barter_interests_not_blocked on public.barter_interests;
create trigger barter_interests_not_blocked
  before insert on public.barter_interests
  for each row execute function public.enforce_barter_interest_not_blocked();

-- ── 3. A block refuses the SUBMIT, not only the insert ─────────────────────
--
-- A separate trigger rather than another rebuild of `enforce_booking_write_integrity`.
-- That function is ~290 lines, has been rebuilt three times in two weeks, and has
-- twice lost a rule to a copy-forward; adding a nine-line concern to it again is
-- how the fourth loss happens. This fires on the same event and is independently
-- reviewable.
create or replace function public.enforce_booking_submit_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- ONLY the draft -> submitted transition. Every other update on a booking —
  -- cancelling, completing, answering — must stay available to a blocked pair,
  -- because a block never strands a transaction that already exists.
  if old.submitted_at is null and new.submitted_at is not null
     and public.contact_blocked_provider(new.user_id, new.provider_id) then
    raise exception 'This provider is not available for new bookings.'
      using errcode = 'PT427';
  end if;
  return new;
end;
$$;

alter function public.enforce_booking_submit_not_blocked() owner to postgres;
revoke all on function public.enforce_booking_submit_not_blocked()
  from public, anon, authenticated;

-- `zz_` so it runs AFTER `enforce_booking_write_integrity` (triggers fire in name
-- order), which is what stamps `submitted_at`. Firing first would compare against
-- a value the authoritative trigger had not yet set.
drop trigger if exists bookings_zz_submit_not_blocked on public.bookings;
create trigger bookings_zz_submit_not_blocked
  before update on public.bookings
  for each row execute function public.enforce_booking_submit_not_blocked();

-- ── 4. A block refuses re-opening a declined request ───────────────────────
--
-- Also a separate trigger, for the same reason: `enforce_conversation_update` is
-- long, carries the canonical-pair predicate and the barter handoff carve-out,
-- and has already lost rules to a rebuild once.
create or replace function public.enforce_conversation_reopen_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_user uuid;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Only a transition INTO an active request state. Declining, and every other
  -- change, stays available — a blocker must always be able to close a thread.
  if new.request_status is distinct from old.request_status
     and new.request_status in ('pending', 'accepted') then
    select p.user_id into v_provider_user
      from public.providers p where p.id = new.provider_id;
    if v_provider_user is not null
       and public.contact_blocked(new.client_id, v_provider_user) then
      raise exception 'This conversation is not available.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

alter function public.enforce_conversation_reopen_not_blocked() owner to postgres;
revoke all on function public.enforce_conversation_reopen_not_blocked()
  from public, anon, authenticated;

drop trigger if exists conversation_zz_reopen_not_blocked on public.conversation;
create trigger conversation_zz_reopen_not_blocked
  before update on public.conversation
  for each row execute function public.enforce_conversation_reopen_not_blocked();

-- ── 5. The stale live-definition comments ─────────────────────────────────
--
-- `create or replace function` PRESERVES the existing comment, so
-- `enforce_booking_write_integrity` still carried `20261041000000`'s note saying
-- "LIVE DEFINITION: 20261041000000 … Any future redefinition must start from THIS
-- body." Following that instruction would silently delete `PT427` — the fourth
-- repeat of the mistake that has already cost this repo two migrations.
comment on function public.enforce_booking_write_integrity() is
  'LIVE DEFINITION: 20261047000000_blocks_reach_the_write_gates.sql. Rebuilt from '
  '20261041000000 (which restored SEC-LIFECYCLE-001) plus the PT427 block refusal '
  'on INSERT. The draft->submitted transition is gated separately by '
  'enforce_booking_submit_not_blocked (20261055000000) — do not fold that back in '
  'here. Before redefining, read the ledger, not this or any other header.';

comment on function public.enforce_conversation_insert() is
  'LIVE DEFINITION: 20261047000000_blocks_reach_the_write_gates.sql. Carries the '
  'submitted-booking conjunct from 20261045000000 plus the block refusal.';

comment on function public.enforce_prebooking_message_rules() is
  'LIVE DEFINITION: 20261051000000_messaging_block_gate.sql. Carries the FOR '
  'UPDATE lock (SEC-DATA-001, deleted once by a copy-forward already), the '
  'submitted-booking conjunct, and the block gate with its live-transaction '
  'exception.';
