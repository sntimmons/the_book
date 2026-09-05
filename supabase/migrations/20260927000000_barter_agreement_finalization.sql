-- AGREEMENT FINALIZATION.
--
-- Turns "both participants explicitly accepted the SAME CURRENT proposal version" into ONE
-- official barter agreement: an immutable row referencing the accepted version, with the
-- sourcing post closed permanently in the same transaction.
--
-- WHAT THIS SLICE DOES NOT BUILD. No obligations, no due dates, no delivery or receipt
-- confirmation, no window, no no-show, no cancellation-after-agreement, no adjudication, no
-- fulfilment result. The agreement PRESERVES the accepted terms by reference; deriving
-- obligations from it is a later slice.
--
-- ── Security posture, stated up front because Slice 3a shipped a BLOCKER by omission ────────
-- Every object below is inspected for: owner (postgres), definer/invoker and search_path,
-- EXECUTE grants INCLUDING `authenticated` (Supabase's ALTER DEFAULT PRIVILEGES grants it ALL
-- on every new function and table; `revoke ... from public, anon` is never the complete form),
-- table grants (SELECT only), RLS (participant reads, NO write policy), and direct write paths
-- (none: the one writer is a definer RPC). supabase/tests/agreement.test.sql pins each.

-- ── 1. The agreement: immutable references, nothing mutable duplicated ───────
create table if not exists public.barter_agreements (
  id uuid primary key default gen_random_uuid(),
  -- ONE agreement per negotiation, per accepted version, per sourcing post, per interest. Four
  -- UNIQUEs because each is a distinct invariant a future writer could violate independently.
  proposal_id uuid not null unique references public.barter_proposals(id) on delete cascade,
  accepted_version_id uuid not null unique
    references public.barter_proposal_versions(id) on delete cascade,
  offer_id uuid not null unique references public.barter_offers(id) on delete cascade,
  interest_id uuid not null unique references public.barter_interests(id) on delete cascade,
  -- Participants, materialised from the proposal at finalization so the agreement is readable
  -- and policy-able without a join, and asserted against it by the guard below. Immutable.
  owner_provider_id uuid not null references public.providers(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  responder_provider_id uuid not null references public.providers(id) on delete cascade,
  responder_user_id uuid not null references auth.users(id) on delete cascade,
  officialized_at timestamptz not null default clock_timestamp(),
  constraint barter_agreements_distinct_participants check (owner_user_id <> responder_user_id)
);

create index if not exists barter_agreements_owner_idx on public.barter_agreements (owner_user_id);
create index if not exists barter_agreements_responder_idx
  on public.barter_agreements (responder_user_id);

comment on table public.barter_agreements is
  'One official barter agreement per negotiation. The ACCEPTED VERSION is authoritative for the '
  'agreed terms; the public post is no longer authority once this row exists. Immutable.';

-- ── 2. Immutable, and consistent with its sources ───────────────────────────
-- An agreement is never edited or deleted by any caller. Re-pointing it at another version or
-- participant would change what two people agreed to after the fact.
create or replace function public.enforce_barter_agreement_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  raise exception 'An agreement cannot be edited or deleted.' using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_agreement_immutable() owner to postgres;
revoke all on function public.enforce_barter_agreement_immutable()
  from public, anon, authenticated;

drop trigger if exists barter_agreements_immutable on public.barter_agreements;
create trigger barter_agreements_immutable
  before update or delete on public.barter_agreements
  for each row execute function public.enforce_barter_agreement_immutable();

-- Consistency at insert: the version must belong to the proposal, the proposal to the interest
-- and offer, and the participants must be the proposal's. A backstop against a future writer;
-- the RPC derives all of these and cannot get them wrong, but "cannot" is a property of one
-- caller and this is a property of the table.
create or replace function public.enforce_barter_agreement_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
      from public.barter_proposals p
      join public.barter_proposal_versions v on v.proposal_id = p.id
      join public.barter_interests i on i.id = p.interest_id
      join public.barter_offers o on o.id = p.offer_id
     where p.id = new.proposal_id
       and v.id = new.accepted_version_id
       and p.interest_id = new.interest_id
       and p.offer_id = new.offer_id
       and p.owner_user_id = new.owner_user_id
       and p.responder_user_id = new.responder_user_id
       and o.provider_id = new.owner_provider_id
       and i.interested_provider_id = new.responder_provider_id
  ) into v_ok;
  if not v_ok then
    raise exception 'An agreement must reference its own negotiation, version and participants.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_agreement_consistent() owner to postgres;
revoke all on function public.enforce_barter_agreement_consistent()
  from public, anon, authenticated;

drop trigger if exists barter_agreements_consistent on public.barter_agreements;
create trigger barter_agreements_consistent
  before insert on public.barter_agreements
  for each row execute function public.enforce_barter_agreement_consistent();

-- ── 3. Once official, the negotiation is closed to change ──────────────────
-- ADDITIVE triggers, not redefinitions of submit_barter_counter / accept_barter_version /
-- release_barter_interest. 20260909000000's header directs "add the agreement guard HERE,
-- inside this function"; the ledger records that both such pointers now name dead definitions
-- and that this repo has lost a row lock to exactly that kind of rewrite. A trigger binds the
-- rule to the TRANSITION, so every current and future path inherits it.
create or replace function public.enforce_no_change_after_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal_id uuid;
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;

  v_proposal_id := case tg_table_name
    when 'barter_proposal_versions' then new.proposal_id
    when 'barter_version_acceptances' then
      (select v.proposal_id from public.barter_proposal_versions v where v.id = new.version_id)
  end;

  if exists (select 1 from public.barter_agreements a where a.proposal_id = v_proposal_id) then
    -- A new version would supersede the terms two people agreed to; a new acceptance is
    -- meaningless once agreement exists. Both are refused with the state code, since the
    -- client's right response to either is "re-read: this trade is confirmed".
    raise exception 'This trade is confirmed. Its terms can no longer change.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_no_change_after_agreement() owner to postgres;
revoke all on function public.enforce_no_change_after_agreement()
  from public, anon, authenticated;

drop trigger if exists barter_proposal_versions_no_change_after_agreement
  on public.barter_proposal_versions;
create trigger barter_proposal_versions_no_change_after_agreement
  before insert on public.barter_proposal_versions
  for each row execute function public.enforce_no_change_after_agreement();

drop trigger if exists barter_version_acceptances_no_change_after_agreement
  on public.barter_version_acceptances;
create trigger barter_version_acceptances_no_change_after_agreement
  before insert on public.barter_version_acceptances
  for each row execute function public.enforce_no_change_after_agreement();

-- Release is the pre-agreement exit (PD-049). Once an agreement exists it is no longer
-- available: what ends a confirmed trade is a later slice (cancellation-after-agreement), and
-- letting release stand in for it would erase the agreement's basis while leaving the
-- agreement row in place.
create or replace function public.enforce_no_release_after_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;
  if new.status = 'released' and old.status is distinct from 'released'
     and exists (select 1 from public.barter_agreements a where a.interest_id = new.id) then
    raise exception 'This trade is confirmed and can no longer be released.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_no_release_after_agreement() owner to postgres;
revoke all on function public.enforce_no_release_after_agreement()
  from public, anon, authenticated;

-- `zx` sorts after write_integrity (which validates the transition) and before the `zy`
-- post-openness guard, so an illegal transition is refused by the rule that owns it first.
drop trigger if exists barter_interests_zx_no_release_after_agreement on public.barter_interests;
create trigger barter_interests_zx_no_release_after_agreement
  before update on public.barter_interests
  for each row execute function public.enforce_no_release_after_agreement();

-- ── 4. RLS and grants ───────────────────────────────────────────────────────
alter table public.barter_agreements enable row level security;

drop policy if exists barter_agreements_participant_read on public.barter_agreements;
create policy barter_agreements_participant_read on public.barter_agreements
  for select to authenticated
  using (owner_user_id = (select auth.uid()) or responder_user_id = (select auth.uid()));

-- NO write policy. The only writer is the definer RPC below.
revoke all on table public.barter_agreements from public, anon, authenticated;
grant select on table public.barter_agreements to authenticated;

-- ── 5. finalize_barter_agreement(p_proposal_id) → agreement id ─────────────
-- The ONE finalization boundary. Everything is derived and re-verified under lock; the only
-- thing the client supplies is which negotiation it means.
--
-- LOCK ORDER: offer → interest → proposal, matching every other barter RPC. Holding all three
-- FOR UPDATE for the whole transaction is what makes each race decidable:
--   finalize vs finalize   — the second waits, then finds the agreement and returns it;
--   finalize vs counter    — the counter waits on the proposal lock, then hits the guard;
--   finalize vs release    — release waits on the offer lock, then hits the guard;
--   finalize vs post close — the owner's UPDATE waits on the offer lock; closing after is a
--                            no-op, and the post is closed here anyway;
--   stale version replaced — the pointer is re-read under lock AFTER the locks are held.
create or replace function public.finalize_barter_agreement(p_proposal_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_proposal public.barter_proposals%rowtype;
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_version public.barter_proposal_versions%rowtype;
  v_role text;
  v_existing uuid;
  v_accepted integer;
  v_agreement_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select p.* into v_proposal from public.barter_proposals p where p.id = p_proposal_id;
  if not found then
    raise exception 'That negotiation no longer exists.' using errcode = 'check_violation';
  end if;

  select o.* into v_offer from public.barter_offers o
   where o.id = v_proposal.offer_id for update;
  if not found then
    raise exception 'That post no longer exists.' using errcode = 'check_violation';
  end if;
  select i.* into v_interest from public.barter_interests i
   where i.id = v_proposal.interest_id for update;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;
  select p.* into v_proposal from public.barter_proposals p
   where p.id = p_proposal_id for update;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can confirm it.'
      using errcode = 'insufficient_privilege';
  end if;

  -- IDEMPOTENT. An agreement already exists for this negotiation: return it. Checked BEFORE
  -- the liveness gate, because a confirmed trade's interest is still 'accepted' and a repeat
  -- call must not be refused for a state it legitimately has.
  select a.id into v_existing from public.barter_agreements a where a.proposal_id = p_proposal_id;
  if found then
    return v_existing;
  end if;

  -- A released negotiation cannot finalize. Terminal.
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so it cannot be confirmed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- The current version, read UNDER the proposal lock. A counter that committed before we took
  -- the lock has already moved the pointer; one that is waiting cannot move it until we commit.
  select v.* into v_version from public.barter_proposal_versions v
   where v.proposal_id = p_proposal_id and v.version_no = v_proposal.current_version_no;
  if not found then
    raise exception 'The current terms could not be found.' using errcode = 'internal_error';
  end if;

  -- BOTH participants, THIS version. Authoring, proposing and countering are not acceptance;
  -- only two acceptance rows on the current version count.
  select count(*) into v_accepted
    from public.barter_version_acceptances a
   where a.version_id = v_version.id
     and a.participant_user_id in (v_proposal.owner_user_id, v_proposal.responder_user_id);
  if v_accepted < 2 then
    -- 40001, not 55000: this is not terminal. The state the client showed has moved (someone
    -- countered, or the client is stale); the right response is to re-read, not to give up.
    raise exception 'Both providers must accept the current terms before confirming.'
      using errcode = 'serialization_failure';
  end if;

  -- DEFENSE IN DEPTH, mirroring accept_barter_interest: the provider rows must still belong to
  -- the users about to be bound into an agreement.
  if not exists (
    select 1 from public.providers p
     where p.id = v_offer.provider_id and p.user_id = v_offer.user_id
  ) or not exists (
    select 1 from public.providers p
     where p.id = v_interest.interested_provider_id
       and p.user_id = v_interest.interested_user_id
  ) then
    raise exception 'Offer or response identity is inconsistent; cannot confirm.'
      using errcode = 'internal_error';
  end if;

  insert into public.barter_agreements
    (proposal_id, accepted_version_id, offer_id, interest_id,
     owner_provider_id, owner_user_id, responder_provider_id, responder_user_id)
  values
    (p_proposal_id, v_version.id, v_offer.id, v_interest.id,
     v_offer.provider_id, v_offer.user_id,
     v_interest.interested_provider_id, v_interest.interested_user_id)
  returning id into v_agreement_id;

  -- CLOSE THE SOURCING POST, in this transaction. PD-049: an agreement consumes the post.
  -- PD-051 makes this permanent for normal users. An already-closed post (PD-052 lets a
  -- negotiation outlive one) stays closed; this never reopens anything. The one-way guard
  -- permits true → false, and this function runs as postgres with a real auth.uid(), so the
  -- guard evaluates it as an ordinary closure.
  update public.barter_offers set is_active = false
   where id = v_offer.id and is_active;

  return v_agreement_id;
exception
  when unique_violation then
    -- Two finalizations racing past each other is impossible under the proposal lock, but the
    -- constraints exist so that "impossible" is not load-bearing. Return the winner.
    select a.id into v_existing from public.barter_agreements a where a.proposal_id = p_proposal_id;
    if v_existing is not null then
      return v_existing;
    end if;
    raise;
end;
$$;

alter function public.finalize_barter_agreement(uuid) owner to postgres;
revoke all on function public.finalize_barter_agreement(uuid) from public, anon;
grant execute on function public.finalize_barter_agreement(uuid) to authenticated;

-- ── 6. Read models ──────────────────────────────────────────────────────────
-- The negotiation view gains the agreement fact, appended (create or replace may only append).
create or replace view public.my_barter_proposals
with (security_invoker = true) as
select
  p.id                        as proposal_id,
  p.interest_id,
  p.offer_id,
  p.current_version_no,
  p.created_at,
  i.status                    as interest_status,
  o.is_active                 as offer_is_active,
  case when p.owner_user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when p.owner_user_id = (select auth.uid()) then p.responder_user_id
       else p.owner_user_id end as counterparty_user_id,
  cv.id                       as current_version_id,
  cv.author_user_id           as current_version_author_id,
  cv.created_at               as current_version_at,
  exists (select 1 from public.barter_version_acceptances a
           where a.version_id = cv.id and a.participant_user_id = (select auth.uid()))
                              as i_accepted_current,
  exists (select 1 from public.barter_version_acceptances a
           where a.version_id = cv.id
             and a.participant_user_id = case when p.owner_user_id = (select auth.uid())
                                              then p.responder_user_id else p.owner_user_id end)
                              as they_accepted_current,
  (select count(*) from public.barter_version_acceptances a
    where a.version_id = cv.id
      and a.participant_user_id in (p.owner_user_id, p.responder_user_id)) >= 2
                              as both_accepted,
  -- The agreement, when one exists. `both_accepted` alone is "ready to confirm"; this is
  -- "confirmed". The two are different states and the client must not conflate them.
  ag.id                       as agreement_id,
  ag.officialized_at
from public.barter_proposals p
join public.barter_interests i on i.id = p.interest_id
join public.barter_offers o on o.id = p.offer_id
join public.barter_proposal_versions cv
  on cv.proposal_id = p.id and cv.version_no = p.current_version_no
left join public.barter_agreements ag on ag.proposal_id = p.id
where p.owner_user_id = (select auth.uid()) or p.responder_user_id = (select auth.uid());

alter view public.my_barter_proposals owner to postgres;
revoke all on public.my_barter_proposals from public, anon;
grant select on public.my_barter_proposals to authenticated;

-- Trade Activity gains the same fact, so an accepted interest that has become a confirmed
-- trade can be shown as one.
create or replace view public.my_trade_activity
with (security_invoker = true) as
select
  i.id                       as interest_id,
  i.offer_id,
  i.status,
  i.created_at,
  i.released_at,
  i.release_reason,
  o.offering_service,
  o.seeking_service,
  o.is_active                as offer_is_active,
  case when o.user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when o.user_id = (select auth.uid()) then i.interested_provider_id else o.provider_id end
                             as counterparty_provider_id,
  c.id                       as conversation_id,
  ag.id                      as agreement_id
from public.barter_interests i
join public.barter_offers o on o.id = i.offer_id
left join lateral (
  select cv.id from public.conversation cv
   where cv.provider_pair_key =
           public.provider_pair_key(o.provider_id, i.interested_provider_id)
      or (cv.client_id = i.interested_user_id and cv.provider_id = o.provider_id)
      or (cv.client_id = o.user_id and cv.provider_id = i.interested_provider_id)
   order by cv.id limit 1
) c on true
left join public.barter_agreements ag on ag.interest_id = i.id
where o.user_id = (select auth.uid())
   or i.interested_user_id = (select auth.uid());

alter view public.my_trade_activity owner to postgres;
revoke all on public.my_trade_activity from public, anon;
grant select on public.my_trade_activity to authenticated;

-- The agreement itself, for participants only. Terms come from barter_proposal_terms by
-- accepted_version_id (RLS participant-scoped); the post snapshot from the accepted version.
create or replace view public.my_barter_agreements
with (security_invoker = true) as
select
  ag.id                      as agreement_id,
  ag.proposal_id,
  ag.accepted_version_id,
  ag.offer_id,
  ag.interest_id,
  ag.officialized_at,
  case when ag.owner_user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when ag.owner_user_id = (select auth.uid()) then ag.responder_provider_id
       else ag.owner_provider_id end as counterparty_provider_id,
  v.version_no               as accepted_version_no,
  v.post_snapshot
from public.barter_agreements ag
join public.barter_proposal_versions v on v.id = ag.accepted_version_id
where ag.owner_user_id = (select auth.uid()) or ag.responder_user_id = (select auth.uid());

alter view public.my_barter_agreements owner to postgres;
revoke all on public.my_barter_agreements from public, anon;
grant select on public.my_barter_agreements to authenticated;
