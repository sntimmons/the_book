-- Give "these terms were replaced" its own SQLSTATE.
--
-- 20260917000000's accept_barter_version raised `object_not_in_prerequisite_state` (55000) for
-- two different facts: the negotiation has ENDED, and the terms have been REPLACED by a newer
-- version. A client keying on (operation, SQLSTATE) — which is how every other barter refusal
-- is interpreted here — cannot tell them apart, so one of the two would be described wrongly.
--
-- The difference is not cosmetic. "This negotiation has ended" is TERMINAL: retrying can never
-- succeed. "The terms changed" is the opposite: reading the new terms and accepting again is
-- exactly the right thing to do, and telling that user their action is permanently impossible
-- would strand them on a live negotiation.
--
-- `40001` (serialization_failure) is the honest code: an acceptance that loses a race with a
-- counter IS a lost update, and the class already means "re-read and try again", which is the
-- advice the user needs. It is not raised anywhere else in this schema.
--
-- Forward-only: 20260917000000 is applied. Body taken from it with ONE clause changed —
-- verified by diff before commit.
create or replace function public.accept_barter_version(p_version_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version public.barter_proposal_versions%rowtype;
  v_proposal public.barter_proposals%rowtype;
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_role text;
  v_accepted integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select v.* into v_version from public.barter_proposal_versions v where v.id = p_version_id;
  if not found then
    raise exception 'Those terms no longer exist.' using errcode = 'check_violation';
  end if;

  select p.* into v_proposal from public.barter_proposals p where p.id = v_version.proposal_id;
  select i.* into v_interest from public.barter_interests i
   where i.id = v_proposal.interest_id for update;
  select o.* into v_offer from public.barter_offers o where o.id = v_proposal.offer_id;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can accept terms.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be accepted.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Re-read the pointer UNDER LOCK, after the version was read. This is the acceptance-races-
  -- a-counter case: if a counter commits between the two, this sees the advanced pointer and
  -- refuses, instead of recording agreement to terms that are no longer on the table.
  select p.* into v_proposal from public.barter_proposals p
   where p.id = v_version.proposal_id for update;

  if v_version.version_no <> v_proposal.current_version_no then
    -- A DISTINCT code, because this is not a permission problem and not a dead negotiation:
    -- the terms moved. The client must be able to say "these terms changed" and re-read.
    raise exception 'These terms have been replaced by a newer version.'
      using errcode = 'serialization_failure';
  end if;

  -- IDEMPOTENT by constraint, not by read-then-write: a repeat accept from the same
  -- participant does nothing and still reports the true both-accepted state.
  insert into public.barter_version_acceptances (version_id, participant_user_id)
  values (p_version_id, v_uid)
  on conflict (version_id, participant_user_id) do nothing;

  select count(*) into v_accepted
    from public.barter_version_acceptances a
   where a.version_id = p_version_id
     and a.participant_user_id in (v_proposal.owner_user_id, v_proposal.responder_user_id);

  -- Returns the FACT that both have accepted. It does not finalise anything: no agreement row
  -- is written and the sourcing post is not closed. That is the next slice, and keeping the
  -- seam a derived boolean is what stops this one quietly becoming it.
  return v_accepted >= 2;
end;
$$;

alter function public.accept_barter_version(uuid) owner to postgres;
revoke all on function public.accept_barter_version(uuid) from public, anon;
grant execute on function public.accept_barter_version(uuid) to authenticated;
