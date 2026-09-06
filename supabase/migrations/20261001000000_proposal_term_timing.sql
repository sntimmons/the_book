-- Proposal Timing Extension.
--
-- Adds due/scheduled timing to versioned proposal terms. Timing is agreed BEFORE an official
-- agreement exists, belongs to the immutable proposal version, and changes only by authoring a
-- new proposal version. This slice deliberately does NOT add obligations, fulfilment, delivery,
-- post-agreement cancellation, no-show handling, adjudication, reviews or reputation.
--
-- Client input remains narrow: content + timing for the two directed sides. The server still
-- derives providers, participant users, side labels and version numbers from the accepted
-- interest and locked proposal state.

alter table public.barter_proposal_terms
  add column if not exists created_at timestamptz not null default clock_timestamp(),
  add column if not exists due_at timestamptz,
  add column if not exists scheduled_at timestamptz;

-- This feature was not on main before PR #50; fail closed instead of inventing due dates for
-- any unexpected historical rows in an environment that already received proposal data.
do $$
begin
  if exists (
    select 1 from public.barter_proposal_terms
     where due_at is null
  ) then
    raise exception 'Cannot add required proposal due_at while untimed proposal terms exist.'
      using errcode = 'check_violation';
  end if;
end $$;

alter table public.barter_proposal_terms
  alter column due_at set not null,
  drop constraint if exists barter_proposal_terms_due_after_created,
  drop constraint if exists barter_proposal_terms_scheduled_after_created,
  drop constraint if exists barter_proposal_terms_scheduled_before_due,
  add constraint barter_proposal_terms_due_after_created
    check (due_at > created_at),
  add constraint barter_proposal_terms_scheduled_after_created
    check (scheduled_at is null or scheduled_at > created_at),
  add constraint barter_proposal_terms_scheduled_before_due
    check (scheduled_at is null or scheduled_at <= due_at);

comment on column public.barter_proposal_terms.due_at is
  'Required deadline for this side of the versioned proposal. Authored before agreement, '
  'immutable after insert, and changed only by a new proposal version.';
comment on column public.barter_proposal_terms.scheduled_at is
  'Optional scheduled time for this side of the versioned proposal. Authored before agreement, '
  'immutable after insert, and changed only by a new proposal version.';

drop function if exists public.write_barter_proposal_terms(uuid, text, text);
drop function if exists public.create_barter_proposal(uuid, text, text);
drop function if exists public.submit_barter_counter(uuid, text, text);

create or replace function public.write_barter_proposal_terms(
  p_version_id uuid,
  p_owner_gives text,
  p_owner_due_at timestamptz,
  p_owner_scheduled_at timestamptz,
  p_responder_gives text,
  p_responder_due_at timestamptz,
  p_responder_scheduled_at timestamptz
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
  v_now timestamptz := clock_timestamp();
begin
  if v_owner = '' or v_responder = '' then
    raise exception 'A proposal must say what each provider gives.'
      using errcode = 'invalid_parameter_value';
  end if;
  if char_length(v_owner) > 200 or char_length(v_responder) > 200 then
    raise exception 'Each side of a proposal must be 200 characters or fewer.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_owner_due_at is null or p_responder_due_at is null then
    raise exception 'Each side of a proposal needs a due date.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_owner_due_at <= v_now or p_responder_due_at <= v_now then
    raise exception 'Due dates must be in the future.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_owner_scheduled_at is not null and p_owner_scheduled_at <= v_now then
    raise exception 'Scheduled times must be in the future.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_responder_scheduled_at is not null and p_responder_scheduled_at <= v_now then
    raise exception 'Scheduled times must be in the future.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_owner_scheduled_at is not null and p_owner_scheduled_at > p_owner_due_at then
    raise exception 'Scheduled times must be on or before the due date.'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_responder_scheduled_at is not null and p_responder_scheduled_at > p_responder_due_at then
    raise exception 'Scheduled times must be on or before the due date.'
      using errcode = 'invalid_parameter_value';
  end if;

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
    (version_id, provided_by, service_description, provider_id, provider_user_id, due_at, scheduled_at)
  values
    (p_version_id, 'offer_owner', v_owner, v_owner_provider, v_owner_user,
      p_owner_due_at, p_owner_scheduled_at),
    (p_version_id, 'responder', v_responder, v_responder_provider, v_responder_user,
      p_responder_due_at, p_responder_scheduled_at);
end;
$$;

alter function public.write_barter_proposal_terms(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) owner to postgres;
revoke all on function public.write_barter_proposal_terms(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) from public, anon, authenticated;

create or replace function public.create_barter_proposal(
  p_interest_id uuid,
  p_owner_gives text,
  p_owner_due_at timestamptz,
  p_owner_scheduled_at timestamptz,
  p_responder_gives text,
  p_responder_due_at timestamptz,
  p_responder_scheduled_at timestamptz
)
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

  select o.* into v_offer from public.barter_offers o
   where o.id = (select i.offer_id from public.barter_interests i where i.id = p_interest_id)
   for update;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i
   where i.id = p_interest_id for update;
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

  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (v_proposal_id, 1, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  perform set_config('app.barter_terms_write', v_version_id::text, true);
  perform public.write_barter_proposal_terms(
    v_version_id,
    p_owner_gives, p_owner_due_at, p_owner_scheduled_at,
    p_responder_gives, p_responder_due_at, p_responder_scheduled_at
  );
  perform set_config('app.barter_terms_write', '', true);

  return v_proposal_id;
exception
  when unique_violation then
    raise exception 'The other provider proposed terms first.'
      using errcode = 'unique_violation';
end;
$$;

alter function public.create_barter_proposal(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) owner to postgres;
revoke all on function public.create_barter_proposal(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) from public, anon;
grant execute on function public.create_barter_proposal(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) to authenticated;

create or replace function public.submit_barter_counter(
  p_proposal_id uuid,
  p_owner_gives text,
  p_owner_due_at timestamptz,
  p_owner_scheduled_at timestamptz,
  p_responder_gives text,
  p_responder_due_at timestamptz,
  p_responder_scheduled_at timestamptz
)
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

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can propose terms.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be proposed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select p.* into v_proposal from public.barter_proposals p
   where p.id = p_proposal_id for update;

  perform public.assert_barter_version_budget(p_proposal_id, v_uid);

  v_next := v_proposal.current_version_no + 1;

  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (p_proposal_id, v_next, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  perform set_config('app.barter_terms_write', v_version_id::text, true);
  perform public.write_barter_proposal_terms(
    v_version_id,
    p_owner_gives, p_owner_due_at, p_owner_scheduled_at,
    p_responder_gives, p_responder_due_at, p_responder_scheduled_at
  );
  perform set_config('app.barter_terms_write', '', true);

  update public.barter_proposals set current_version_no = v_next where id = p_proposal_id;

  return v_next;
end;
$$;

alter function public.submit_barter_counter(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) owner to postgres;
revoke all on function public.submit_barter_counter(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) from public, anon;
grant execute on function public.submit_barter_counter(
  uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz
) to authenticated;
