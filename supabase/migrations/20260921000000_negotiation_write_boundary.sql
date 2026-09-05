-- Close the negotiation write boundary, and the class it belongs to.
--
-- ── 1. THE BLOCKER ──────────────────────────────────────────────────────────
-- `write_barter_proposal_terms` is SECURITY DEFINER, owned by postgres, and performs NO
-- authorization: no auth.uid() read, no participant check, no interest-status check, no
-- current-version check. It was documented as an internal helper and revoked only
-- `from public, anon` -- leaving intact the EXECUTE that Supabase's ALTER DEFAULT PRIVILEGES
-- grants to `authenticated` (canonical baseline). It was therefore callable over PostgREST by
-- any signed-in user, against any version id they could read.
--
-- The consequence is worse than an unauthorized write. Appending term rows to an existing
-- version is neither an UPDATE nor a DELETE, so the append-only trigger never fires; the
-- current-version pointer does not move, so nothing is superseded; and no acceptance row is
-- touched, so `my_barter_proposals.both_accepted` keeps reporting TRUE. One participant could
-- rewrite the content of terms the other had already accepted, with the server still asserting
-- mutual agreement, and the victim would see the injected terms attributed to THEMSELVES.
--
-- This is exactly the trap `20260918000000` documented and fixed FOR THE TABLES. That fix
-- named four tables and none of the five functions in the same migration. The lesson is that
-- `revoke ... from public, anon` is never the complete form on this platform -- for any object
-- kind.
--
-- Two independent corrections, because one of them being right must not be load-bearing:
--   (a) the grant is removed, so the helper is unreachable;
--   (b) a write GUARD on the terms table requires a transaction-local marker that only the
--       negotiation RPCs publish, so even a caller who reached the helper writes nothing --
--       and terms cannot be appended to a version that already has them.

-- ── 2. Grants: internal helpers are internal ────────────────────────────────
-- Every function this slice created except the three public RPCs, plus the two text helpers
-- and the barter trigger functions added earlier in this engagement. Trigger functions are not
-- callable usefully over PostgREST, but leaving them granted teaches the wrong pattern and the
-- audit that found this one should not have to distinguish.
revoke execute on function public.write_barter_proposal_terms(uuid, jsonb) from authenticated;
revoke execute on function public.assert_barter_version_budget(uuid, uuid) from authenticated;
revoke execute on function public.barter_post_snapshot(public.barter_offers) from authenticated;
revoke execute on function public.barter_negotiation_role(
  public.barter_interests, public.barter_offers, uuid) from authenticated;
revoke execute on function public.enforce_barter_negotiation_append_only() from authenticated;
revoke execute on function public.enforce_barter_proposal_immutable() from authenticated;
revoke execute on function public.enforce_barter_answer_open_offer() from authenticated;
revoke execute on function public.enforce_barter_offer_active_one_way() from authenticated;
revoke execute on function public.barter_terms_sanitize(text) from authenticated;
revoke execute on function public.barter_terms_label(text, text) from authenticated;

-- The three public RPCs keep theirs, and are restated so the intended posture is in one place.
grant execute on function public.create_barter_proposal(uuid, jsonb) to authenticated;
grant execute on function public.submit_barter_counter(uuid, jsonb) to authenticated;
grant execute on function public.accept_barter_version(uuid) to authenticated;

-- ── 3. A write guard on the terms table ─────────────────────────────────────
-- The RPCs run as postgres with a REAL auth.uid(), so a trigger cannot tell "called from
-- inside an RPC" from "called directly" by role alone. The repo already solved this shape with
-- a transaction-local marker (`app.barter_handoff` in 20260907000000): the authorised caller
-- publishes it for exactly one statement and clears it immediately.
--
-- The marker also carries the VERSION ID, so a marker published for one version cannot be used
-- to write terms onto another.
create or replace function public.enforce_barter_terms_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marker text := current_setting('app.barter_terms_write', true);
  v_existing integer;
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;

  if v_marker is null or v_marker = '' or v_marker <> new.version_id::text then
    raise exception 'Terms may only be written by a negotiation operation.'
      using errcode = 'insufficient_privilege';
  end if;

  -- WRITTEN ONCE. A version's terms are its identity; appending to one after the counterparty
  -- accepted it changes what they agreed to without superseding it. The RPCs only ever write
  -- terms immediately after creating a version, so this refuses nothing they legitimately do.
  select count(*) into v_existing
    from public.barter_proposal_terms t where t.version_id = new.version_id;
  if v_existing > 0 then
    raise exception 'These terms have already been written and cannot be added to.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_terms_write() owner to postgres;
revoke all on function public.enforce_barter_terms_write() from public, anon, authenticated;

drop trigger if exists barter_proposal_terms_write_guard on public.barter_proposal_terms;
create trigger barter_proposal_terms_write_guard
  before insert on public.barter_proposal_terms
  for each row execute function public.enforce_barter_terms_write();

-- ── 4. Account erasure is not blocked by a negotiation ──────────────────────
-- Every auth.users FK in the canonical baseline is ON DELETE CASCADE, and
-- `barter_interests.interested_user_id` already cascades -- so deleting an account already
-- erases that provider's interests. This slice attached the negotiation chain with ON DELETE
-- RESTRICT, which blocked that cascade: once a provider had negotiated, their auth.users row
-- could not be deleted at all. That silently removed a capability two earlier migrations spent
-- paragraphs preserving, and it is not a decision anyone took.
--
-- Aligned with the existing convention rather than inventing a new one: a deleted account
-- takes its negotiations with it, exactly as it already takes its interests.
alter table public.barter_proposals
  drop constraint if exists barter_proposals_interest_id_fkey,
  drop constraint if exists barter_proposals_offer_id_fkey,
  drop constraint if exists barter_proposals_owner_user_id_fkey,
  drop constraint if exists barter_proposals_responder_user_id_fkey;
alter table public.barter_proposals
  add constraint barter_proposals_interest_id_fkey foreign key (interest_id)
    references public.barter_interests(id) on delete cascade,
  add constraint barter_proposals_offer_id_fkey foreign key (offer_id)
    references public.barter_offers(id) on delete cascade,
  add constraint barter_proposals_owner_user_id_fkey foreign key (owner_user_id)
    references auth.users(id) on delete cascade,
  add constraint barter_proposals_responder_user_id_fkey foreign key (responder_user_id)
    references auth.users(id) on delete cascade;

alter table public.barter_proposal_versions
  drop constraint if exists barter_proposal_versions_proposal_id_fkey,
  drop constraint if exists barter_proposal_versions_author_user_id_fkey;
alter table public.barter_proposal_versions
  add constraint barter_proposal_versions_proposal_id_fkey foreign key (proposal_id)
    references public.barter_proposals(id) on delete cascade,
  add constraint barter_proposal_versions_author_user_id_fkey foreign key (author_user_id)
    references auth.users(id) on delete cascade;

alter table public.barter_proposal_terms
  drop constraint if exists barter_proposal_terms_version_id_fkey;
alter table public.barter_proposal_terms
  add constraint barter_proposal_terms_version_id_fkey foreign key (version_id)
    references public.barter_proposal_versions(id) on delete cascade;

alter table public.barter_version_acceptances
  drop constraint if exists barter_version_acceptances_version_id_fkey,
  drop constraint if exists barter_version_acceptances_participant_user_id_fkey;
alter table public.barter_version_acceptances
  add constraint barter_version_acceptances_version_id_fkey foreign key (version_id)
    references public.barter_proposal_versions(id) on delete cascade,
  add constraint barter_version_acceptances_participant_user_id_fkey
    foreign key (participant_user_id) references auth.users(id) on delete cascade;

-- ── 5. The RPCs: lock order, a no-op guard removed, fail-closed reads ───────
-- LOCK ORDER. This slice claimed "interest -> offer -> proposal in every RPC". The pre-existing
-- release_barter_interest and accept_barter_interest take the OFFER first, so the claim was
-- false and create_barter_proposal could deadlock against a concurrent release: it held the
-- interest while its insert needed FOR KEY SHARE on the offer, which the releaser held.
-- All three now take the offer first.
--
-- The budget call in create_barter_proposal ran AFTER the proposal insert, against a new id
-- with zero versions, so it always counted zero. Removed rather than moved: creation is
-- already bounded one-per-interest, and a guard that cannot fire is worse than no guard.
--
-- Each `select ... into` now has a `not found` branch. Without one the composite is all-NULL
-- and `if v_interest.status <> 'accepted'` evaluates to NULL -- not TRUE -- so the liveness
-- gate is SKIPPED. It failed closed only because the FKs happen to guarantee the rows exist.
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
    raise exception 'A negotiation is already open for this response.'
      using errcode = 'object_not_in_prerequisite_state';
end;
$$;

alter function public.create_barter_proposal(uuid, jsonb) owner to postgres;
revoke all on function public.create_barter_proposal(uuid, jsonb) from public, anon;
grant execute on function public.create_barter_proposal(uuid, jsonb) to authenticated;

create or replace function public.submit_barter_counter(p_proposal_id uuid, p_terms jsonb)
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

  -- Same lock ORDER as every other RPC here: interest, then offer, then proposal. Taking them
  -- in a consistent order across all three entry points is what stops two callers deadlocking
  -- by each holding what the other needs.
  select p.* into v_proposal from public.barter_proposals p where p.id = p_proposal_id;
  if not found then
    raise exception 'That negotiation no longer exists.' using errcode = 'check_violation';
  end if;

  -- OFFER FIRST, matching the sibling RPCs. Then the interest.
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
  perform public.write_barter_proposal_terms(v_version_id, p_terms);
  perform set_config('app.barter_terms_write', '', true);

  -- Advancing the pointer is what INVALIDATES prior acceptances (rule 5). The acceptance rows
  -- are not touched -- they remain the true record of who accepted version N -- they simply
  -- stop being acceptances of the CURRENT version.
  update public.barter_proposals set current_version_no = v_next where id = p_proposal_id;

  return v_next;
end;
$$;

alter function public.submit_barter_counter(uuid, jsonb) owner to postgres;
revoke all on function public.submit_barter_counter(uuid, jsonb) from public, anon;
grant execute on function public.submit_barter_counter(uuid, jsonb) to authenticated;

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
  -- Fail closed structurally: an all-NULL composite makes the liveness gate below NULL, which
  -- is not TRUE, so it would be skipped rather than refusing.
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

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
