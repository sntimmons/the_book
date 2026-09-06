-- Proposal Timing Expiry Guards.
--
-- 20261001000000 made timing valid when a proposal version is authored. Founder then extended
-- the invariant: the same versioned timing must still be future-valid when a participant
-- accepts it and when an official agreement is created from it. This stays additive: the
-- existing accept/finalize RPCs keep owning authorization, liveness and locking; these triggers
-- are the shared stale-timing boundary for acceptance rows and agreement rows.
--
-- SQLSTATE PT410 is intentionally distinct from replaced terms (40001), ended negotiation
-- (55000), confirmed trade (PT409) and permission denied (42501).

create or replace function public.assert_barter_proposal_version_timing_current(p_version_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bad integer;
begin
  select count(*) into v_bad
    from public.barter_proposal_terms t
   where t.version_id = p_version_id
     and (
       t.due_at <= v_now
       or (t.scheduled_at is not null and t.scheduled_at <= v_now)
     );

  if v_bad > 0 then
    raise exception 'These trade terms have expired. Update the timing before continuing.'
      using errcode = 'PT410';
  end if;
end;
$$;

alter function public.assert_barter_proposal_version_timing_current(uuid) owner to postgres;
revoke all on function public.assert_barter_proposal_version_timing_current(uuid)
  from public, anon, authenticated;

create or replace function public.enforce_barter_acceptance_timing_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_barter_proposal_version_timing_current(new.version_id);
  return new;
end;
$$;

alter function public.enforce_barter_acceptance_timing_current() owner to postgres;
revoke all on function public.enforce_barter_acceptance_timing_current()
  from public, anon, authenticated;

drop trigger if exists barter_version_acceptances_timing_current
  on public.barter_version_acceptances;
create trigger barter_version_acceptances_timing_current
  before insert on public.barter_version_acceptances
  for each row execute function public.enforce_barter_acceptance_timing_current();

create or replace function public.enforce_barter_agreement_timing_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_barter_proposal_version_timing_current(new.accepted_version_id);
  return new;
end;
$$;

alter function public.enforce_barter_agreement_timing_current() owner to postgres;
revoke all on function public.enforce_barter_agreement_timing_current()
  from public, anon, authenticated;

drop trigger if exists barter_agreements_timing_current
  on public.barter_agreements;
create trigger barter_agreements_timing_current
  before insert on public.barter_agreements
  for each row execute function public.enforce_barter_agreement_timing_current();
