-- Restore the null-caller escape on the two guards added by 20260915000000.
--
-- Founder ruling PD-051: "service_role retains the reopen path for support and recovery,
-- matching the exemption every sibling trigger on these tables already grants." Only half of
-- that exemption was implemented. `auth.role() = 'service_role'` covers the PostgREST
-- service_role path; it does NOT cover a psql / SQL-console / migration session, where there
-- are no `request.jwt.claims` at all and `auth.role()` returns NULL.
--
-- The sibling guards on these same tables deliberately carry BOTH escapes --
-- `enforce_barter_offer_delete` and `enforce_barter_interest_delete` (20260906000000) each
-- open with `if (select auth.role()) = 'service_role' or (select auth.uid()) is null then` --
-- so the convention the ruling defers to requires both. This closes the gap.
--
-- It widens nothing an untrusted caller can reach: `anon` holds no privilege on either table
-- (20260906000000 § 10 revokes it), every policy is `TO authenticated`, and an authenticated
-- session always has a non-null `auth.uid()`. The practical effect is that an operator
-- recovering a wrongly-closed post, and any future migration that needs to touch `is_active`,
-- are not refused by a rule aimed at product behaviour.
--
-- Forward-only: 20260915000000 is already applied to non-production, and an applied migration
-- does not re-run. Both bodies below are taken from that file with ONE clause changed each.

create or replace function public.enforce_barter_offer_active_one_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role AND the null-caller (no JWT) path, matching enforce_barter_offer_delete.
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;

  if old.is_active is false and new.is_active is true then
    raise exception 'A closed post cannot be reopened. Create a new post instead.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_offer_active_one_way() owner to postgres;
revoke all on function public.enforce_barter_offer_active_one_way() from public, anon;

create or replace function public.enforce_barter_answer_open_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;

  -- Only the transitions INTO an answered state. `released` is untouched: a negotiation
  -- outlives its post (PD-049), so either party may still end one on a closed post.
  if new.status is null or new.status not in ('accepted', 'declined') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select o.is_active into v_active
    from public.barter_offers o where o.id = new.offer_id;
  if v_active is false then
    raise exception 'This post is closed. Its responses are history and can no longer be answered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_answer_open_offer() owner to postgres;
revoke all on function public.enforce_barter_answer_open_offer() from public, anon;
