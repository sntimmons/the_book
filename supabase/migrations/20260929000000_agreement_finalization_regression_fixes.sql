-- Agreement finalization regression fixes.
--
-- Keeps the post-agreement guard fail-closed if the trigger cannot resolve the proposal id,
-- and pins defense-in-depth write revokes on the agreement read models.

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
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_no_change_after_agreement() owner to postgres;
revoke all on function public.enforce_no_change_after_agreement()
  from public, anon, authenticated;

alter table public.barter_agreements owner to postgres;
revoke insert, update, delete on table public.barter_agreements from authenticated;

revoke insert, update, delete on table public.my_barter_agreements from authenticated;
revoke insert, update, delete on table public.my_barter_proposals from authenticated;
revoke insert, update, delete on table public.my_trade_activity from authenticated;
