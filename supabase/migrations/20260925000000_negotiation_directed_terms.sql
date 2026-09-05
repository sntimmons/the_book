-- Two directed terms, with participant identity owned by the server.
--
-- Founder rulings. Three changes, all narrowing what a client may assert:
--
-- 1. `estimated_value` is REMOVED. Barter requires no dollar equivalence and no value
--    comparison is part of agreement; the UI never produced one. An unused authoritative field
--    implies a product meaning it does not have, and the next reader would reasonably conclude
--    values are negotiated. Not replaced with another monetary field.
--
-- 2. EXACTLY TWO directed terms per version: one for what the offer owner gives, one for what
--    the responder gives. Complex packages live inside a side's own description. This also
--    matches the shape the later agreement model needs — exactly one required obligation per
--    participant — so the beta does not have to unpick an arbitrary-N model to get there.
--
-- 3. PARTICIPANT IDENTITY IS NEVER CLIENT-SUPPLIED. Previously the client sent
--    `provided_by` per term and the server checked only that both sides appeared: it validated
--    WHO may write, never WHICH SIDE they claimed. A caller could silently swap the two sides,
--    so the authoritative record of who gives what came from the party with the most reason to
--    get it wrong. The sides are now fixed labels the server assigns, and each term additionally
--    carries the provider and user id DERIVED from the accepted interest — so a term cannot
--    name a third provider, cannot name the same provider twice, and cannot be re-pointed.
--
-- The client submits CONTENT for both sides, which is the thing it legitimately knows.

-- ── 1. The table, narrowed ──────────────────────────────────────────────────
-- Safe as a straight alter: `barter_proposal_terms` is empty on every environment this has been
-- applied to (verified before writing this), and it has never been on main.
alter table public.barter_proposal_terms
  drop column if exists estimated_value,
  drop column if exists sort_order;

alter table public.barter_proposal_terms
  drop constraint if exists barter_proposal_terms_side_check,
  drop constraint if exists barter_proposal_terms_value_check;

-- Server-owned identity, materialised so it can be constrained and asserted rather than
-- re-derived by every reader.
alter table public.barter_proposal_terms
  add column if not exists provider_id uuid references public.providers(id) on delete cascade,
  add column if not exists provider_user_id uuid references auth.users(id) on delete cascade;

alter table public.barter_proposal_terms
  add constraint barter_proposal_terms_side_check
    check (provided_by in ('offer_owner', 'responder'));

-- One term per side per version: no duplicate side, and with the statement guard below, no
-- missing side either.
create unique index if not exists barter_proposal_terms_one_per_side
  on public.barter_proposal_terms (version_id, provided_by);

comment on column public.barter_proposal_terms.provided_by is
  'Which SIDE of the trade provides this: offer_owner or responder. A fixed server-assigned '
  'label, never client-supplied — a client that could choose it could swap who gives what.';
comment on column public.barter_proposal_terms.provider_user_id is
  'Derived from the accepted interest by write_barter_proposal_terms. Materialised so the '
  'binding between a side and a real participant is a constrained fact, not a join a reader '
  'has to remember to make.';

-- ── 2. Exactly two, one per side, bound to the right participants ───────────
create or replace function public.enforce_barter_terms_written_once()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad integer;
begin
  -- Already had terms before this statement. A per-row count cannot see this (it trips on the
  -- second row of its own insert) and an index can only approximate it.
  select count(*) into v_bad
    from (select i.version_id, count(*) as inserted_now from inserted i group by i.version_id) g
    join lateral (
      select count(*) as total from public.barter_proposal_terms t where t.version_id = g.version_id
    ) tot on true
   where tot.total > g.inserted_now;
  if v_bad > 0 then
    raise exception 'A version''s terms are written once and cannot be added to.'
      using errcode = 'check_violation';
  end if;

  -- EXACTLY TWO, ONE PER SIDE. Cross-row shape, so no table constraint can express it: a
  -- unique index stops a duplicate side, nothing stops a MISSING one.
  select count(*) into v_bad
    from (
      select t.version_id,
             count(*) as n,
             count(*) filter (where t.provided_by = 'offer_owner') as owner_side,
             count(*) filter (where t.provided_by = 'responder') as responder_side
        from public.barter_proposal_terms t
       where t.version_id in (select distinct i.version_id from inserted i)
       group by t.version_id
    ) g
   where g.n <> 2 or g.owner_side <> 1 or g.responder_side <> 1;
  if v_bad > 0 then
    raise exception 'A proposal must say exactly what each provider gives — one term per side.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- IDENTITY. Each side must carry the provider and user the accepted interest says it is.
  -- Backstop against a future writer that derives them wrongly, or is handed them.
  select count(*) into v_bad
    from public.barter_proposal_terms t
    join public.barter_proposal_versions v on v.id = t.version_id
    join public.barter_proposals p on p.id = v.proposal_id
    join public.barter_interests i on i.id = p.interest_id
    join public.barter_offers o on o.id = p.offer_id
   where t.version_id in (select distinct x.version_id from inserted x)
     and (
       (t.provided_by = 'offer_owner'
         and (t.provider_id is distinct from o.provider_id
              or t.provider_user_id is distinct from o.user_id))
       or (t.provided_by = 'responder'
         and (t.provider_id is distinct from i.interested_provider_id
              or t.provider_user_id is distinct from i.interested_user_id))
     );
  if v_bad > 0 then
    raise exception 'A term''s provider must be the participant that side belongs to.'
      using errcode = 'insufficient_privilege';
  end if;
  return null;
end;
$$;

alter function public.enforce_barter_terms_written_once() owner to postgres;
revoke all on function public.enforce_barter_terms_written_once()
  from public, anon, authenticated;

-- ── 3. The writer: content in, identity derived ────────────────────────────
drop function if exists public.write_barter_proposal_terms(uuid, jsonb);

create or replace function public.write_barter_proposal_terms(
  p_version_id uuid,
  p_owner_gives text,
  p_responder_gives text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_provider uuid; v_owner_user uuid;
  v_responder_provider uuid; v_responder_user uuid;
  v_owner text := btrim(coalesce(p_owner_gives, ''));
  v_responder text := btrim(coalesce(p_responder_gives, ''));
begin
  if v_owner = '' or v_responder = '' then
    raise exception 'A proposal must say what each provider gives.'
      using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_owner) > 200 or char_length(v_responder) > 200 then
    raise exception 'Each side of a proposal must be 200 characters or fewer.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Identity is DERIVED HERE, from the accepted interest, in one place. Nothing is passed in
  -- that a caller could get wrong, and there is no parameter a caller could forge.
  select o.provider_id, o.user_id, i.interested_provider_id, i.interested_user_id
    into v_owner_provider, v_owner_user, v_responder_provider, v_responder_user
    from public.barter_proposal_versions v
    join public.barter_proposals p on p.id = v.proposal_id
    join public.barter_interests i on i.id = p.interest_id
    join public.barter_offers o on o.id = p.offer_id
   where v.id = p_version_id;
  if not found then
    raise exception 'Those terms do not belong to a negotiation.' using errcode = 'check_violation';
  end if;

  insert into public.barter_proposal_terms
    (version_id, provided_by, service_description, provider_id, provider_user_id)
  values
    (p_version_id, 'offer_owner', v_owner, v_owner_provider, v_owner_user),
    (p_version_id, 'responder', v_responder, v_responder_provider, v_responder_user);
end;
$$;

alter function public.write_barter_proposal_terms(uuid, text, text) owner to postgres;
revoke all on function public.write_barter_proposal_terms(uuid, text, text)
  from public, anon, authenticated;


-- ── 4. The RPCs: content in, nothing about identity ─────────────────────────
-- The old (uuid, jsonb) signatures are DROPPED, not left as overloads: an overload that still
-- accepted client-asserted sides would be exactly the path this migration closes.
drop function if exists public.create_barter_proposal(uuid, jsonb);
drop function if exists public.submit_barter_counter(uuid, jsonb);

create or replace function public.create_barter_proposal(p_interest_id uuid, p_owner_gives text, p_responder_gives text)
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
  perform public.write_barter_proposal_terms(v_version_id, p_owner_gives, p_responder_gives);
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

alter function public.create_barter_proposal(uuid, text, text) owner to postgres;
revoke all on function public.create_barter_proposal(uuid, text, text) from public, anon;
grant execute on function public.create_barter_proposal(uuid, text, text) to authenticated;

create or replace function public.submit_barter_counter(p_proposal_id uuid, p_owner_gives text, p_responder_gives text)
returns integer
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
  v_role text;
  v_next integer;
  v_version_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- LOCK ORDER: offer, then interest, then proposal -- matching release_barter_interest and
  -- accept_barter_interest, which take the offer first. Taking them in opposite orders is what
  -- allowed a deadlock (40P01) against a concurrent release.
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
  -- FAIL CLOSED STRUCTURALLY. Without this the composite is all-NULL and the liveness gate
  -- below evaluates to NULL -- which is not TRUE, so the `if` is skipped and execution
  -- continues. The guard would fail OPEN by arrangement rather than by construction.
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can propose terms.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be proposed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- THE serialisation point. Two simultaneous counters both reach here; one waits, then reads
  -- the other's committed current_version_no and takes the next number after it. Without this
  -- both would compute the same next number and the unique index would turn a legitimate
  -- counter into an error the user cannot act on.
  select p.* into v_proposal from public.barter_proposals p
   where p.id = p_proposal_id for update;

  perform public.assert_barter_version_budget(p_proposal_id, v_uid);

  v_next := v_proposal.current_version_no + 1;

  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (p_proposal_id, v_next, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  perform set_config('app.barter_terms_write', v_version_id::text, true);
  perform public.write_barter_proposal_terms(v_version_id, p_owner_gives, p_responder_gives);
  perform set_config('app.barter_terms_write', '', true);

  -- Advancing the pointer is what INVALIDATES prior acceptances (rule 5). The acceptance rows
  -- are not touched -- they remain the true record of who accepted version N -- they simply
  -- stop being acceptances of the CURRENT version.
  update public.barter_proposals set current_version_no = v_next where id = p_proposal_id;

  return v_next;
end;
$$;

alter function public.submit_barter_counter(uuid, text, text) owner to postgres;
revoke all on function public.submit_barter_counter(uuid, text, text) from public, anon;
grant execute on function public.submit_barter_counter(uuid, text, text) to authenticated;
