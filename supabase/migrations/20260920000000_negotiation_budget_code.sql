-- Give the submission cap its own SQLSTATE.
--
-- `assert_barter_version_budget` raised `check_violation` (23514), which is also what a
-- malformed proposal raises from `write_barter_proposal_terms`. Both are reachable on the same
-- call, and they need OPPOSITE advice: an incomplete proposal is fix-and-resend right now, a
-- spent daily budget cannot succeed again until tomorrow. A client keying on
-- (operation, SQLSTATE) would have to describe one of them wrongly.
--
-- This repo has accepted 23514's ambiguity before -- lib/barterErrors.ts says so plainly, that
-- reading it as one meaning is "only correct by coincidence of which rules the UI can currently
-- reach". That coincidence does not hold here: both rules are reachable from one button.
--
-- `54000` (program_limit_exceeded) says what happened: a limit was exceeded.
--
-- Forward-only: 20260917000000 is applied. One clause changed, verified by diff before commit.
create or replace function public.assert_barter_version_budget(p_proposal_id uuid, p_uid uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_max constant integer := 20;
begin
  select count(*) into v_count
    from public.barter_proposal_versions v
   where v.proposal_id = p_proposal_id
     and v.author_user_id = p_uid
     and v.created_at > clock_timestamp() - interval '24 hours';
  if v_count >= v_max then
    raise exception 'You have sent the maximum number of proposals for this trade today.'
      using errcode = 'program_limit_exceeded';
  end if;
end;
$$;

alter function public.assert_barter_version_budget(uuid, uuid) owner to postgres;
revoke all on function public.assert_barter_version_budget(uuid, uuid) from public, anon;
