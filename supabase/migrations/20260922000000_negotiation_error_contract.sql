-- Stop overloading two SQLSTATEs on the propose path.
--
-- This slice already split two overloaded codes (20260919000000, 20260920000000) on the
-- argument that a client keying on (operation, SQLSTATE) must be able to tell distinct facts
-- apart. Two more were left standing on the SAME operation, and both reviews found them.
--
-- 1. "A negotiation is already open for this response" raised 55000 -- the same code as "this
--    negotiation is not active". So a LIVE negotiation that simply already has terms was
--    reported to the user as terminal: "This negotiation has ended. Terms can no longer be
--    proposed." Two providers opening Trade terms within the same second produce exactly this,
--    and the screen then reloads behind the alert and displays the other's terms, so the alert
--    and the screen contradict each other. Now re-raises the underlying unique_violation.
--
-- 2. Malformed terms raised check_violation, which the two propose RPCs also raise for "not
--    authenticated", "that response no longer exists", "that post no longer exists" and "that
--    negotiation no longer exists". Mapping 23514 to "Check these terms" told a user with an
--    expired session or a vanished negotiation to edit terms that were already valid, and --
--    because that mapping is non-terminal -- the screen never reloaded to show them why.
--    Malformed input now raises invalid_parameter_value (22023), which is what it is.
--
-- Forward-only: the functions are applied. Diffed before commit -- create_barter_proposal
-- changes one raise, write_barter_proposal_terms changes three.
create or replace function public.create_barter_proposal(p_interest_id uuid, p_terms jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_role text;
  v_proposal_id uuid;
  v_version_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- LOCK ORDER: OFFER, then interest -- matching release_barter_interest and
  -- accept_barter_interest, which both take the offer first. An earlier version of this
  -- function took them in the opposite order and claimed the ordering was consistent; it was
  -- not, and inserting a row whose FK references barter_offers takes a FOR KEY SHARE on the
  -- offer, which closes the cycle. Two callers could deadlock (40P01).
  --
  -- Reading the interest id first is unavoidable, so the offer is resolved through it and then
  -- locked before the interest is locked.
  select o.* into v_offer from public.barter_offers o
   where o.id = (select i.offer_id from public.barter_interests i where i.id = p_interest_id)
   for update;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  -- Holding the interest lock is what makes "proposal creation races with interest release"
  -- decidable: release_barter_interest updates this same row, so one of the two blocks and
  -- then observes the other's committed state.
  select i.* into v_interest from public.barter_interests i
   where i.id = p_interest_id for update;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    -- DISTINCT from the state refusals below: "you are not in this negotiation" and "this
    -- negotiation is over" are different facts and the client must not conflate them.
    raise exception 'Only the two providers in a negotiation can propose terms.'
      using errcode = 'insufficient_privilege';
  end if;

  -- No cold proposals. `accepted` is the only live state; `released` means the negotiation
  -- ended before any agreement (PD-049) and nothing may be added to it afterwards.
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be proposed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- DEFENSE IN DEPTH, mirroring accept_barter_interest: running as postgres with RLS off,
  -- nothing else here re-establishes that these provider rows belong to the users about to be
  -- bound into a proposal.
  if not exists (
    select 1 from public.providers p
     where p.id = v_offer.provider_id and p.user_id = v_offer.user_id
  ) or not exists (
    select 1 from public.providers p
     where p.id = v_interest.interested_provider_id
       and p.user_id = v_interest.interested_user_id
  ) then
    raise exception 'Offer or response identity is inconsistent; cannot open a negotiation.'
      using errcode = 'internal_error';
  end if;

  insert into public.barter_proposals
    (interest_id, offer_id, owner_user_id, responder_user_id, current_version_no)
  values (p_interest_id, v_offer.id, v_offer.user_id, v_interest.interested_user_id, 1)
  returning id into v_proposal_id;

  -- NO budget check here, deliberately. It was called after the proposal insert, against a
  -- brand-new id with zero versions, so it always counted 0 -- a guard that looked present and
  -- could never fire. Creation is bounded by the unique constraint on interest_id (one per
  -- accepted response) and upstream by the 15-interests-per-day cap; counters are where the
  -- 20-per-24h budget actually applies.
  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (v_proposal_id, 1, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  -- Publish the write marker for exactly this one call, then clear it. The terms table's
  -- insert guard requires it, so terms can only be written from inside a negotiation RPC --
  -- not by a direct call to the helper. Transaction-local, and cleared explicitly because the
  -- B5B harness runs the whole suite in ONE transaction, where a marker left set would make a
  -- later direct-write test pass for the wrong reason.
  perform set_config('app.barter_terms_write', v_version_id::text, true);
  perform public.write_barter_proposal_terms(v_version_id, p_terms);
  perform set_config('app.barter_terms_write', '', true);

  -- AUTHORING IS NOT ACCEPTANCE (rule 6). The author gets no acceptance row here; they accept
  -- their own version by calling accept_barter_version like anyone else. Making authoring
  -- implicit acceptance would mean a counter silently re-accepted on the counterer's behalf,
  -- and "both accepted" would stop meaning two deliberate acts.
  return v_proposal_id;
exception
  when unique_violation then
    -- The one-per-interest constraint. Concurrent duplicate creation lands here rather than
    -- producing two negotiations for one accepted response.
    -- A DISTINCT code. This was 55000 -- the same code as "this negotiation is not active" --
    -- so the client mapped a LIVE negotiation that simply already has terms to the terminal
    -- "This negotiation has ended". Two providers opening Trade terms at once produced exactly
    -- that: the loser was told their negotiation was over while the screen reloaded behind the
    -- alert and showed the winner's terms. Re-raising the underlying unique_violation says what
    -- actually happened, and it is not terminal: the right next action is to read their terms
    -- and counter.
    raise exception 'The other provider proposed terms first.'
      using errcode = 'unique_violation';
end;
$$;

alter function public.create_barter_proposal(uuid, jsonb) owner to postgres;
revoke all on function public.create_barter_proposal(uuid, jsonb) from public, anon;
grant execute on function public.create_barter_proposal(uuid, jsonb) to authenticated;

create or replace function public.write_barter_proposal_terms(p_version_id uuid, p_terms jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_owner_sides integer;
  v_responder_sides integer;
begin
  if p_terms is null or jsonb_typeof(p_terms) <> 'array' then
    raise exception 'Terms must be a list.' using errcode = 'invalid_parameter_value';
  end if;
  v_count := jsonb_array_length(p_terms);
  if v_count < 2 or v_count > 6 then
    raise exception 'A proposal needs between 2 and 6 terms.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.barter_proposal_terms
    (version_id, provided_by, service_description, estimated_value, sort_order)
  select
    p_version_id,
    t.value ->> 'provided_by',
    btrim(t.value ->> 'service_description'),
    nullif(t.value ->> 'estimated_value', '')::integer,
    (t.ordinality - 1)::integer
  from jsonb_array_elements(p_terms) with ordinality as t(value, ordinality);

  -- A barter has TWO sides. A "trade" where one party provides everything is not a trade, and
  -- the check constraints on the table cannot see across rows.
  select count(*) filter (where provided_by = 'owner'),
         count(*) filter (where provided_by = 'responder')
    into v_owner_sides, v_responder_sides
    from public.barter_proposal_terms where version_id = p_version_id;
  if v_owner_sides = 0 or v_responder_sides = 0 then
    raise exception 'A proposal must say what each provider gives.'
      using errcode = 'invalid_parameter_value';
  end if;
  return v_count;
end;
$$;

alter function public.write_barter_proposal_terms(uuid, jsonb) owner to postgres;
revoke all on function public.write_barter_proposal_terms(uuid, jsonb)
  from public, anon, authenticated;
