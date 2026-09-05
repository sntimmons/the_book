-- Converge the negotiation tables' grants on an already-applied database.
--
-- `20260917000000` revoked from `public, anon` but not from `authenticated`. Supabase's
-- ALTER DEFAULT PRIVILEGES grants ALL to `authenticated` too at CREATE time, so those four
-- tables shipped with INSERT, UPDATE and DELETE still granted to every signed-in caller.
--
-- Not a hole: no write policy exists on any of them, so a direct UPDATE or DELETE is FILTERED
-- to zero rows and a direct INSERT fails the RLS check. But the design intends two independent
-- layers -- grants and RLS -- and only one was actually there. A future permissive policy, or
-- a policy added for one column, would have found the grant already open.
--
-- Forward-only: `20260917000000` is already applied, and an applied migration does not re-run.
-- Its own text was corrected in the same change so a FRESH apply is right the first time; this
-- file is what fixes the database that already has the loose grants.
revoke all on table public.barter_proposals from public, anon, authenticated;
revoke all on table public.barter_proposal_versions from public, anon, authenticated;
revoke all on table public.barter_proposal_terms from public, anon, authenticated;
revoke all on table public.barter_version_acceptances from public, anon, authenticated;

grant select on table public.barter_proposals to authenticated;
grant select on table public.barter_proposal_versions to authenticated;
grant select on table public.barter_proposal_terms to authenticated;
grant select on table public.barter_version_acceptances to authenticated;

-- The view is unaffected (it was granted explicitly, never by default privileges), but assert
-- the same posture so all five objects are stated in one place.
revoke all on public.my_barter_proposals from public, anon;
grant select on public.my_barter_proposals to authenticated;
