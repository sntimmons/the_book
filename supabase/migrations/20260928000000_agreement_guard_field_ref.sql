-- enforce_no_change_after_agreement referenced `new.version_id` inside a CASE branch meant for
-- barter_version_acceptances. PL/pgSQL resolves record field references against NEW at
-- evaluation regardless of which branch is taken, so on a barter_proposal_versions row it
-- raised 42703 ("record new has no field version_id") — which blocked EVERY version insert,
-- including the first one on a brand-new negotiation. B5B caught it on the first run after
-- apply; nothing in the pre-apply grant audit could have.
--
-- Fixed by reading the row through jsonb, which yields NULL for an absent key instead of
-- failing to compile. Two trigger functions would also have worked; one function keeps the
-- grant/pin surface a single object. Body otherwise identical to 20260927000000.
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
