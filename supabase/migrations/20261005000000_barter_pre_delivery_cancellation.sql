-- Pre-delivery cancellation of an official barter agreement (PD-046 § "After agreement,
-- before any delivery").
--
-- The ordinary escape hatch: once a trade is confirmed but before either side has actually
-- performed, either participant may cancel, and the other party's permission is NOT required.
--
-- SHAPE: an append-only act table, one row per participant per agreement — the same shape as
-- `barter_version_acceptances`, and for the same reason. Mutual cancellation requires TWO
-- explicit acts, so a single mutable `cancelled_by` field on the agreement would have to be
-- overwritten by the second participant, destroying the record of who acted first and when.
-- Both acts are preserved; the classification is DERIVED from how many exist:
--
--   0 acts  → not cancelled
--   1 act   → Cancelled by Participant
--   2 acts  → Mutually Cancelled
--
-- Nothing is stored twice: no `cancelled` flag, no `cancelled_at`, no `mutual` boolean. A
-- derived answer cannot disagree with the rows it is derived from.
--
-- THE FIRST ACT ENDS ORDINARY PERFORMANCE. From the moment one participant cancels, no
-- obligation may be newly marked delivered and no receiver answer may be newly recorded. The
-- counterparty may still record their own assent afterwards, which upgrades the classification
-- to Mutually Cancelled — that is a second act, not a reopening, and it never erases the first.
--
-- NOT IN THIS SLICE: no-show, the 7-day timeout, Needs Attention, Under Review, adjudication,
-- Fulfilled, Unfulfilled, Closed Without Resolution, Completed, Partially Fulfilled, Not
-- Completed, reviews, reputation and notifications. Cancellation here is an AGREEMENT-level
-- event; it decides nothing about whether either obligation was fulfilled, and it writes no
-- obligation outcome.
--
-- NOTHING IS DELETED. The agreement, its two obligations, the proposal versions, their terms
-- and the acceptances all survive a cancellation unchanged and stay readable by both
-- participants. PD-043 (counterparty history is retained) is untouched.

create table if not exists public.barter_agreement_cancellations (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.barter_agreements(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_provider_id uuid not null references public.providers(id) on delete cascade,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  -- ONE act per participant. This is what makes a repeat call idempotent rather than a second
  -- vote, and what caps the table at two rows per agreement.
  constraint barter_agreement_cancellations_one_per_actor unique (agreement_id, actor_user_id),
  constraint barter_agreement_cancellations_reason_check
    check (reason is null or char_length(btrim(reason)) between 1 and 200)
);

create index if not exists barter_agreement_cancellations_agreement_idx
  on public.barter_agreement_cancellations (agreement_id);

alter table public.barter_agreement_cancellations owner to postgres;

comment on column public.barter_agreement_cancellations.agreement_id is
  'FK cascades with barter_agreements, whose own participant FKs already cascade from '
  'auth.users and providers. Erasing a participant therefore destroys this act along with the '
  'agreement it belongs to, exactly as it already destroyed the agreement and its obligations. '
  'This preserves the existing erasure behaviour and adds NO new retention policy. Note for a '
  'later slice: this is the first per-participant conduct record in the barter graph, so '
  'whether an anonymized trace must survive erasure for PD-046''s future reliability model is '
  'an open product question, not something this migration decides.';
comment on table public.barter_agreement_cancellations is
  'Append-only record of pre-delivery cancellation acts, at most one per participant per '
  'agreement. Cancelled-by-participant versus mutually-cancelled is DERIVED from the row '
  'count, never stored. Not an obligation outcome and not an adjudication.';
comment on column public.barter_agreement_cancellations.actor_user_id is
  'Derived server-side from auth.uid() and re-checked against the agreement. Never client-'
  'supplied — a client that could name the actor could cancel in the counterparty''s name.';
comment on column public.barter_agreement_cancellations.actor_provider_id is
  'The acting participant''s provider on THIS agreement, read from the agreement row.';
comment on column public.barter_agreement_cancellations.reason is
  'Optional free text, at most 200 characters. No taxonomy: PD-046 requires only "an optional '
  'reason", and inventing reason codes would create vocabulary the product has not decided.';
comment on column public.barter_agreement_cancellations.created_at is
  'Server-stamped and immutable. A repeat cancellation by the same participant returns the '
  'existing act rather than re-stamping it.';

-- ── The act is append-only ─────────────────────────────────────────────────
-- No edits, no withdrawals, no deletes. A cancellation that could be taken back would let the
-- record of a commitment being abandoned disappear, and the counterparty may already have
-- acted on it. Changing a reason after the fact is deliberately out of scope.
create or replace function public.enforce_barter_cancellation_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  raise exception 'A cancellation cannot be edited or withdrawn.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_cancellation_append_only() owner to postgres;
revoke all on function public.enforce_barter_cancellation_append_only()
  from public, anon, authenticated;

drop trigger if exists barter_agreement_cancellations_append_only
  on public.barter_agreement_cancellations;
create trigger barter_agreement_cancellations_append_only
  before update or delete on public.barter_agreement_cancellations
  for each row execute function public.enforce_barter_cancellation_append_only();

-- ── A cancellation row must describe a real, still-cancellable agreement ───
-- Defense in depth behind the RPC: `authenticated` holds no INSERT on this table, but this
-- trigger means a forged row cannot claim a participant the agreement does not have, cannot
-- attach the wrong provider to a real participant, and cannot exist for an agreement where
-- something has already been delivered.
--
-- BE PRECISE ABOUT WHAT THIS BUYS. The delivery check below is an UNLOCKED read, so it is a
-- SEQUENTIAL guard: it catches a direct privileged insert against an already-delivered
-- agreement, and it does NOT by itself decide a race. Race-safety between cancelling and
-- delivering is owned by the lock order in `cancel_barter_agreement` and the matching
-- post-lock check in `mark_barter_obligation_delivered` — see the contract on the RPC below.
-- A future second writer on either table must take those locks; this trigger will not save it.
create or replace function public.enforce_barter_cancellation_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
  v_delivered integer;
begin
  select exists (
    select 1 from public.barter_agreements ag
     where ag.id = new.agreement_id
       and (
         (new.actor_user_id = ag.owner_user_id
          and new.actor_provider_id = ag.owner_provider_id)
         or
         (new.actor_user_id = ag.responder_user_id
          and new.actor_provider_id = ag.responder_provider_id)
       )
  ) into v_ok;
  if not v_ok then
    raise exception 'Only a participant of that agreement can cancel it.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = new.agreement_id
     and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_cancellation_consistent() owner to postgres;
revoke all on function public.enforce_barter_cancellation_consistent()
  from public, anon, authenticated;

drop trigger if exists barter_agreement_cancellations_consistent
  on public.barter_agreement_cancellations;
create trigger barter_agreement_cancellations_consistent
  before insert on public.barter_agreement_cancellations
  for each row execute function public.enforce_barter_cancellation_consistent();

-- ── cancel_barter_agreement(p_agreement_id, p_reason) → classification ─────
-- The ONE cancellation boundary. The client names the agreement and, optionally, a reason.
-- Everything else — who is calling, which participant they are, which provider that is,
-- whether they have already acted, whether anything has been delivered, and what the resulting
-- classification is — is derived and re-verified here.
--
-- LOCK ORDER: agreement → its obligations, taken before `delivered_at` is read. That ordering
-- is what makes the delivery race decidable, because `mark_barter_obligation_delivered` takes
-- the same obligation row lock before it checks for a cancellation:
--
--   cancel commits first  → mark-delivered waits on the obligation lock, then sees the
--                           cancellation and is refused;
--   delivery commits first → cancel waits on the same lock, then re-reads `delivered_at`,
--                           finds it set, and is refused.
--
-- Exactly one wins. There is no interleaving in which a delivered obligation and an ordinary
-- cancellation both succeed, because neither side reads its decision variable until it holds
-- the lock the other must take to change it.
--
-- IDEMPOTENT per participant: a repeat call returns the existing classification and re-stamps
-- nothing, so a double tap or a second device cannot overwrite the original time or reason.
create or replace function public.cancel_barter_agreement(
  p_agreement_id uuid,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ag public.barter_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
  v_obligations integer;
  v_delivered integer;
  v_acts integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- Bounded, and checked before anything is locked so a malformed reason costs nothing.
  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Keep the reason under 200 characters.' using errcode = 'invalid_parameter_value';
  end if;

  -- AUTHORIZE FIRST, LOCK SECOND — the same shape as the obligation RPCs. A caller with no
  -- relationship to the agreement never contends for its rows, and is answered exactly as they
  -- would be for an agreement that does not exist, so this is not an existence oracle.
  select ag.* into v_ag from public.barter_agreements ag where ag.id = p_agreement_id;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;
  if v_uid not in (v_ag.owner_user_id, v_ag.responder_user_id) then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  -- No provider-approval requirement. A participant who has since been de-approved must still
  -- be able to get out of a trade they are already in.
  v_provider := case when v_uid = v_ag.owner_user_id
                     then v_ag.owner_provider_id else v_ag.responder_provider_id end;

  select ag.* into v_ag from public.barter_agreements ag
   where ag.id = p_agreement_id for update;

  -- Every obligation of this agreement, in a deterministic order, BEFORE `delivered_at` is
  -- read. Ordering by id keeps two concurrent cancellations from taking the two rows in
  -- opposite orders and deadlocking each other.
  select count(*) into v_obligations
    from (select o.id from public.barter_obligations o
           where o.agreement_id = p_agreement_id
           order by o.id for update) locked;
  if v_obligations <> 2 then
    -- Locking nothing would make the delivery race undecidable, so a malformed agreement is
    -- refused rather than cancelled on an unlocked read.
    raise exception 'That trade is not in a state that can be cancelled.'
      using errcode = 'internal_error';
  end if;

  -- Read UNDER the locks. Anything that committed a delivery before we got here is visible;
  -- anything still trying cannot commit until we release.
  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = p_agreement_id and o.delivered_at is not null;
  if v_delivered > 0 then
    -- Permanent. PD-046: once anything has been delivered the ordinary exit is gone, and a
    -- later "didn't receive" does NOT bring it back.
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Already acted: return the state that exists. The original time and reason stand.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = p_agreement_id and c.actor_user_id = v_uid) then
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
  end if;

  insert into public.barter_agreement_cancellations
    (agreement_id, actor_user_id, actor_provider_id, reason)
  values (p_agreement_id, v_uid, v_provider, v_reason);

  select count(*) into v_acts from public.barter_agreement_cancellations c
   where c.agreement_id = p_agreement_id;
  return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
exception
  when unique_violation then
    -- Unreachable under the locks above, but the constraint exists so that "unreachable" is
    -- not load-bearing. Report the state that won rather than an error the user cannot act on.
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
end;
$$;

alter function public.cancel_barter_agreement(uuid, text) owner to postgres;
revoke all on function public.cancel_barter_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_barter_agreement(uuid, text) to authenticated;

-- ── The first act closes delivery and receipt ──────────────────────────────
-- Both guards sit AFTER the obligation row is locked, which is the half of the race contract
-- the cancel RPC depends on. Body otherwise identical to 20261004000000; diffed.
create or replace function public.mark_barter_obligation_delivered(p_obligation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.deliverer_user_id <> v_uid then
    raise exception 'Only the provider who owes this can mark it delivered.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- READ UNDER THE LOCK. A cancellation that committed before we took this lock is visible
  -- here; one that is still trying cannot commit, because cancel_barter_agreement locks this
  -- same row before it decides. Checked before the idempotent branch below so a cancelled
  -- trade is never reported as a successful delivery.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so it can no longer be delivered.'
      using errcode = 'PT409';
  end if;

  if v_o.status <> 'pending' then
    return v_o.status;
  end if;

  perform set_config('app.barter_obligation_write', v_o.id::text, true);
  update public.barter_obligations
     set status = 'delivered',
         delivered_at = clock_timestamp()
   where id = v_o.id;
  perform set_config('app.barter_obligation_write', '', true);

  return 'delivered';
end;
$$;

alter function public.mark_barter_obligation_delivered(uuid) owner to postgres;
revoke all on function public.mark_barter_obligation_delivered(uuid) from public, anon;
grant execute on function public.mark_barter_obligation_delivered(uuid) to authenticated;

-- Same guard for the receiver's answer. In practice a cancelled trade also has no
-- `delivered_at`, so the ordering rule below would refuse anyway — but with 55000 ("not
-- delivered yet"), which invites the receiver to wait for a delivery that can never come.
-- Body otherwise identical to 20261004000000; diffed.
create or replace function public.record_barter_obligation_receipt(
  p_obligation_id uuid,
  p_status text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
begin
  if p_status is null or p_status not in ('received', 'not_received') then
    raise exception 'Unknown receipt answer.' using errcode = 'internal_error';
  end if;
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.receiver_user_id <> v_uid then
    raise exception 'Only the provider receiving this can answer for it.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to answer for.'
      using errcode = 'PT409';
  end if;

  if v_o.delivered_at is null then
    raise exception 'This has not been marked delivered yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_o.status = p_status then
    return v_o.status;
  end if;

  if v_o.status <> 'delivered' then
    raise exception 'You have already answered this.' using errcode = 'PT412';
  end if;

  perform set_config('app.barter_obligation_write', v_o.id::text, true);
  update public.barter_obligations
     set status = p_status,
         receipt_responded_at = clock_timestamp()
   where id = v_o.id;
  perform set_config('app.barter_obligation_write', '', true);

  return p_status;
end;
$$;

alter function public.record_barter_obligation_receipt(uuid, text) owner to postgres;
revoke all on function public.record_barter_obligation_receipt(uuid, text)
  from public, anon, authenticated;

-- ── Read models ────────────────────────────────────────────────────────────
-- Both views gain the same three DERIVED facts, appended (create or replace may only append).
-- No actor id is exposed: a viewer learns whether THEY cancelled and whether the other
-- provider did, which is everything the copy needs and nothing more.
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
  ag.id                       as agreement_id,
  ag.officialized_at,
  exists (select 1 from public.barter_agreement_cancellations c
           where c.agreement_id = ag.id and c.actor_user_id = (select auth.uid()))
                              as i_cancelled,
  exists (select 1 from public.barter_agreement_cancellations c
           where c.agreement_id = ag.id and c.actor_user_id <> (select auth.uid()))
                              as they_cancelled,
  (select min(c.created_at) from public.barter_agreement_cancellations c
    where c.agreement_id = ag.id)
                              as cancelled_at
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

-- Trade Activity gains it too: a cancelled trade must not keep reading as "Trade confirmed"
-- on the list that is the entry point to it.
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
  ag.id                      as agreement_id,
  exists (select 1 from public.barter_agreement_cancellations x
           where x.agreement_id = ag.id and x.actor_user_id = (select auth.uid()))
                             as i_cancelled,
  exists (select 1 from public.barter_agreement_cancellations x
           where x.agreement_id = ag.id and x.actor_user_id <> (select auth.uid()))
                             as they_cancelled,
  (select min(x.created_at) from public.barter_agreement_cancellations x
    where x.agreement_id = ag.id)
                             as cancelled_at
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

-- ── RLS and grants ─────────────────────────────────────────────────────────
alter table public.barter_agreement_cancellations enable row level security;

-- Both participants read BOTH acts — each needs to see the other's to know the trade is
-- mutually cancelled. Shaped like barter_version_acceptances_participant_read: the parent
-- carries the membership, so it is asked rather than denormalised onto every row.
drop policy if exists barter_agreement_cancellations_participant_read
  on public.barter_agreement_cancellations;
create policy barter_agreement_cancellations_participant_read
  on public.barter_agreement_cancellations
  for select to authenticated
  using (exists (
    select 1 from public.barter_agreements ag
     where ag.id = barter_agreement_cancellations.agreement_id
       and ((select auth.uid()) in (ag.owner_user_id, ag.responder_user_id))
  ));

-- NO write policy. The only writer is the definer RPC above. Supabase's ALTER DEFAULT
-- PRIVILEGES grants ALL on a new table to `authenticated` as well as `anon` at CREATE time, so
-- the revoke must name both — revoking from `public, anon` alone would leave `authenticated`
-- holding INSERT, UPDATE and DELETE with RLS as the only remaining wall.
revoke all on table public.barter_agreement_cancellations from public, anon, authenticated;
grant select on table public.barter_agreement_cancellations to authenticated;
