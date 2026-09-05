-- Give confirmed-trade terminal refusals their own SQLSTATE.
--
-- `object_not_in_prerequisite_state` already means a live negotiation is not in the right
-- pre-agreement state. Confirmed trades need distinct client copy, so post-agreement guards
-- raise `PT409` instead.

create or replace function public.enforce_no_change_after_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_proposal_id uuid;
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;

  v_proposal_id := case tg_table_name
    when 'barter_proposal_versions' then (v_row ->> 'proposal_id')::uuid
    when 'barter_version_acceptances' then
      (select v.proposal_id from public.barter_proposal_versions v
        where v.id = (v_row ->> 'version_id')::uuid)
  end;

  if v_proposal_id is null then
    raise exception 'Agreement guard could not resolve the proposal for this write.'
      using errcode = 'internal_error';
  end if;

  if exists (select 1 from public.barter_agreements a where a.proposal_id = v_proposal_id) then
    raise exception 'This trade is confirmed. Its terms can no longer change.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$$;

alter function public.enforce_no_change_after_agreement() owner to postgres;
revoke all on function public.enforce_no_change_after_agreement()
  from public, anon, authenticated;

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
      using errcode = 'PT409';
  end if;
  return new;
end;
$$;

alter function public.enforce_no_release_after_agreement() owner to postgres;
revoke all on function public.enforce_no_release_after_agreement()
  from public, anon, authenticated;
