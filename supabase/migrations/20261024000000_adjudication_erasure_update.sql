-- The ONE update an adjudication accepts: forgetting who decided it.
--
-- `20261023000000` changed `adjudicator_user_id` to `on delete set null` so that erasing an
-- operator's account forgets WHO decided without withdrawing WHAT was decided. That was only
-- half the change: `enforce_barter_adjudication_append_only` refuses every UPDATE, so the
-- cascade's own `set adjudicator_user_id = null` was refused and the erasure failed outright —
-- swapping one broken outcome (the decision silently vanishes) for another (an operator account
-- can never be deleted). The B5B erasure case is what surfaced it.
--
-- The allowance is written as narrowly as it can be stated, and every clause is load-bearing:
--
--   * PRIVILEGED CALLERS ONLY, the same branch DELETE already uses. A participant still cannot
--     update anything.
--   * ONLY `adjudicator_user_id` may differ. Asserted by comparing the two rows with that one
--     column blanked on BOTH sides — a whole-row comparison, denied by default, so a column
--     added by a later migration is frozen unless deliberately subtracted. This is the same
--     shape `enforce_barter_obligations_immutable` uses for the obligation contract fields.
--   * ONE DIRECTION ONLY: non-null to null. Forgetting is permitted; naming a different
--     operator, or re-attaching one, is not.
--
-- So the outcome, the rationale, the obligation, the agreement and the timestamp remain
-- unchangeable by every caller including the privileged one, which is what PD-066 requires. What
-- becomes possible is exactly an erasure, and nothing else.
create or replace function public.enforce_barter_adjudication_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.barter_obligation_adjudications%rowtype;
  v_new public.barter_obligation_adjudications%rowtype;
begin
  if tg_op = 'DELETE' then
    if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
      return old;
    end if;
    raise exception 'An adjudication cannot be deleted.' using errcode = 'check_violation';
  end if;

  -- THE ERASURE UPDATE, and only it.
  if ((select auth.role()) = 'service_role' or (select auth.uid()) is null)
     and old.adjudicator_user_id is not null
     and new.adjudicator_user_id is null then
    v_old := old;
    v_new := new;
    v_old.adjudicator_user_id := null;
    if v_old = v_new then
      return new;
    end if;
  end if;

  -- Everything else is refused for EVERYONE, privileged callers included. A terminal outcome
  -- that could be edited by the trusted path is not terminal; a correction needs its own
  -- audited mechanism.
  raise exception 'An adjudication cannot be changed once recorded.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_adjudication_append_only() owner to postgres;
revoke all on function public.enforce_barter_adjudication_append_only()
  from public, anon, authenticated;
-- The trigger is NOT recreated: `create or replace function` preserves the OID, so
-- `barter_obligation_adjudications_append_only` still points at this body.
