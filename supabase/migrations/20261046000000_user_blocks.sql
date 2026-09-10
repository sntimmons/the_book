-- Session 8 (A, J, K) — blocking, and what a block deliberately does NOT do.
--
-- ══ WHAT A BLOCK IS ═══════════════════════════════════════════════════════
--
-- One person deciding they do not want NEW contact with another. That is all it
-- is, and the whole design follows from taking that literally.
--
-- **A BLOCK STOPS NEW CONTACT. IT NEVER DELETES HISTORY.** Not a booking, not an
-- agreement, not an obligation, not a message, not a review, not a report. The
-- reason is not sentiment about data: a person who blocks someone mid-transaction
-- still needs the record of that transaction — to complete it, to cancel it, to
-- be paid for it, to dispute it, or to show someone what happened. Erasing the
-- record to express the block would take evidence away from the person the block
-- exists to protect, which is the exact opposite of a safety feature.
--
-- ══ SYMMETRIC IN EFFECT, ASYMMETRIC IN OWNERSHIP ══════════════════════════
--
-- The ROW is directional: A blocked B, and only A may remove it. B cannot
-- discover it, cannot lift it, and is never told.
--
-- The EFFECT is symmetric: while the row exists, neither party may start
-- something new with the other. A one-way effect would be worse than useless —
-- if B could still open a conversation, send a booking request or answer A's
-- barter offer, the block would have stopped only the person who asked for it.
--
-- ══ THE ACTIVE-TRANSACTION EXCEPTION, STATED EXACTLY ══════════════════════
--
-- **A block does not close a conversation attached to a LIVE booking or a LIVE
-- barter agreement.** Those threads stay open to both parties until the
-- transaction reaches a terminal state.
--
-- This is the one place a block is deliberately not absolute, and it is not a
-- convenience. Two providers in a confirmed trade owe each other delivery,
-- confirmation, and — when it goes wrong — a no-show report or a review request.
-- A client with an accepted booking has a provider arriving at their address. If
-- a block severed those threads, the product would be trapping people inside
-- obligations it had just removed their only means of resolving. The narrow
-- exception is what makes the block safe to offer at all.
--
-- The exception is bounded three ways: it applies ONLY to a conversation that
-- ALREADY has a live transaction attached (never to a new one), only while that
-- transaction is live, and it grants nothing else — no new booking, no new barter
-- interest, no new request, no discovery visibility.
--
-- ══ WHAT IS DELIBERATELY NOT BUILT ════════════════════════════════════════
--
-- No mute, no restrict, no shadow-ban, no block list UI beyond what the product
-- needs, no notification to the blocked party, no retention or deletion change
-- (Session 8 is explicit that account-erasure semantics are not reopened here).

-- ── 1. The record ───────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  -- The person who asked for the block. Bound to auth.uid() by the trigger, so a
  -- caller cannot file one in someone else's name.
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id),
  constraint user_blocks_one_per_pair unique (blocker_user_id, blocked_user_id)
);

comment on table public.user_blocks is
  'One directional block: blocker_user_id no longer wants NEW contact from '
  'blocked_user_id. Only the blocker may create or remove it, and the blocked '
  'party is never told. The EFFECT is symmetric — while the row exists neither '
  'party may start a new conversation, booking or barter interaction with the '
  'other — but a block NEVER deletes history and never closes a conversation '
  'attached to a live booking or agreement. See public.contact_blocked.';

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_user_id);

-- ── 2. The actor is the caller ─────────────────────────────────────────────
create or replace function public.enforce_user_block_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Bound to the caller for ordinary writers. `service_role` and the no-JWT path
  -- are exempt, matching every other consistency trigger in this schema.
  if (select auth.role()) is distinct from 'service_role'
     and (select auth.uid()) is not null
     and new.blocker_user_id is distinct from (select auth.uid()) then
    raise exception 'A block must be recorded by the person making it.'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

alter function public.enforce_user_block_actor() owner to postgres;
revoke all on function public.enforce_user_block_actor() from public, anon;

drop trigger if exists user_blocks_actor on public.user_blocks;
create trigger user_blocks_actor
  before insert on public.user_blocks
  for each row execute function public.enforce_user_block_actor();

-- A block row is not editable. Changing `blocker`/`blocked` after the fact would
-- let someone rewrite who blocked whom; removing it is what "unblock" is for, and
-- that is a DELETE the owner may perform.
create or replace function public.enforce_user_block_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'A block cannot be edited. Remove it and create a new one.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_user_block_immutable() owner to postgres;
revoke all on function public.enforce_user_block_immutable() from public, anon;

drop trigger if exists user_blocks_immutable on public.user_blocks;
create trigger user_blocks_immutable
  before update on public.user_blocks
  for each row execute function public.enforce_user_block_immutable();

-- ── 3. Only the blocker sees it, only the blocker lifts it ─────────────────
--
-- The blocked party must NOT be able to read the row. Telling someone they have
-- been blocked is itself a safety event, and a person blocking a harasser should
-- not have that decision announced to them.
alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_owner_read on public.user_blocks;
create policy user_blocks_owner_read on public.user_blocks
  for select to authenticated
  using ((select auth.uid()) = blocker_user_id);

drop policy if exists user_blocks_owner_insert on public.user_blocks;
create policy user_blocks_owner_insert on public.user_blocks
  for insert to authenticated
  with check ((select auth.uid()) = blocker_user_id);

drop policy if exists user_blocks_owner_delete on public.user_blocks;
create policy user_blocks_owner_delete on public.user_blocks
  for delete to authenticated
  using ((select auth.uid()) = blocker_user_id);

revoke all on table public.user_blocks from public, anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant all on table public.user_blocks to service_role;

-- ── 4. THE PREDICATE every gate asks ───────────────────────────────────────
--
-- SECURITY DEFINER because it must see rows in BOTH directions, and the read
-- policy above deliberately shows a caller only their own. A gate that could see
-- only the blocks the caller made would enforce nothing against the person they
-- blocked — which is the half that matters.
--
-- It returns a boolean and nothing else. It never reveals WHO blocked WHOM, so a
-- caller cannot use it as an oracle to discover that they have been blocked;
-- callers see a generic refusal.
create or replace function public.contact_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_user_id = p_a and b.blocked_user_id = p_b)
        or (b.blocker_user_id = p_b and b.blocked_user_id = p_a)
  );
$$;

alter function public.contact_blocked(uuid, uuid) owner to postgres;
revoke all on function public.contact_blocked(uuid, uuid) from public, anon;
grant execute on function public.contact_blocked(uuid, uuid) to authenticated, service_role;

comment on function public.contact_blocked(uuid, uuid) is
  'True when a block exists between these two users in EITHER direction. '
  'SECURITY DEFINER because the enforcement half must see the block the OTHER '
  'party made, which the read policy deliberately hides. Returns a bare boolean '
  'and never reveals direction, so it cannot be used to discover that you have '
  'been blocked.';

-- The same question for a provider row, since most surfaces hold a provider id
-- rather than the user behind it.
create or replace function public.contact_blocked_provider(p_user uuid, p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.providers p
      join public.user_blocks b
        on (b.blocker_user_id = p_user and b.blocked_user_id = p.user_id)
        or (b.blocker_user_id = p.user_id and b.blocked_user_id = p_user)
     where p.id = p_provider_id
  );
$$;

alter function public.contact_blocked_provider(uuid, uuid) owner to postgres;
revoke all on function public.contact_blocked_provider(uuid, uuid) from public, anon;
grant execute on function public.contact_blocked_provider(uuid, uuid)
  to authenticated, service_role;

-- ── 5. Does this pair have a LIVE transaction? ─────────────────────────────
--
-- The active-transaction exception, expressed once so every gate reads the same
-- rule. "Live" means a booking that is submitted and not yet terminal, or a
-- barter agreement that is confirmed with at least one obligation still
-- unresolved and no cancellation recorded.
--
-- A DRAFT booking does not count. It is invisible to the provider (PD-071) and
-- is not a transaction anyone is owed anything for — treating it as live would
-- let a blocked party manufacture their own exception by opening a booking flow.
create or replace function public.has_live_transaction(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    -- A live booking, in either direction (a provider may book a provider).
    select 1
      from public.bookings bk
      join public.providers p on p.id = bk.provider_id
     where bk.submitted_at is not null
       and bk.status in ('pending', 'accepted', 'arriving', 'checked_in', 'rescheduled')
       and ((bk.user_id = p_a and p.user_id = p_b)
         or (bk.user_id = p_b and p.user_id = p_a))
  )
  or exists (
    -- A confirmed trade with unfinished business.
    select 1
      from public.barter_agreements ag
     where ((ag.owner_user_id = p_a and ag.responder_user_id = p_b)
         or (ag.owner_user_id = p_b and ag.responder_user_id = p_a))
       and not exists (
             select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = ag.id
           )
       and exists (
             select 1 from public.barter_obligations o
              where o.agreement_id = ag.id
                and o.status in ('pending', 'delivered')
                and not exists (
                      select 1 from public.barter_obligation_adjudications a
                       where a.obligation_id = o.id
                    )
           )
  );
$$;

alter function public.has_live_transaction(uuid, uuid) owner to postgres;
revoke all on function public.has_live_transaction(uuid, uuid) from public, anon;
grant execute on function public.has_live_transaction(uuid, uuid) to authenticated, service_role;

comment on function public.has_live_transaction(uuid, uuid) is
  'True when these two users have a SUBMITTED, non-terminal booking or a '
  'confirmed, uncancelled barter agreement with at least one unresolved '
  'obligation. This is the ONLY basis on which a block is relaxed, and it is '
  'relaxed for messaging alone (see 20261047000000) so the two can complete, '
  'cancel or resolve what they already owe each other. A DRAFT booking is '
  'deliberately excluded: it is invisible to the provider and would let a blocked '
  'party manufacture their own exception.';
