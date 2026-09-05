-- Enforce "a version's terms are written once" structurally, not by counting.
--
-- 20260921000000's guard refused an insert when the version already had terms. That is the
-- right property and the wrong mechanism: a BEFORE INSERT ROW trigger fires per row, so the
-- second row of the RPC's own multi-row insert saw the first and refused. The guard blocked the
-- legitimate write it was written to protect.
--
-- A unique index says the same thing without needing to know which statement a row came from.
-- `write_barter_proposal_terms` always numbers terms from 0, so a second write to the same
-- version collides on (version_id, 0) whatever else it contains. Rows inserted together carry
-- distinct sort_orders and do not collide with each other.
--
-- The marker check in the trigger remains the primary boundary — it is what stops a direct
-- call to the helper from writing anything at all. This is the structural backstop behind it,
-- so neither is load-bearing alone.
create unique index if not exists barter_proposal_terms_one_write_per_version
  on public.barter_proposal_terms (version_id, sort_order);

create or replace function public.enforce_barter_terms_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marker text := current_setting('app.barter_terms_write', true);
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;

  -- Terms may only be written from inside a negotiation RPC. The RPCs run as postgres with a
  -- REAL auth.uid(), so a trigger cannot tell "called from inside an RPC" from "called
  -- directly" by role alone; the transaction-local marker is what distinguishes them, and it
  -- carries the VERSION ID so a marker published for one version cannot write terms onto
  -- another. Same shape as `app.barter_handoff` in 20260907000000.
  if v_marker is null or v_marker = '' or v_marker <> new.version_id::text then
    raise exception 'Terms may only be written by a negotiation operation.'
      using errcode = 'insufficient_privilege';
  end if;

  -- The write-once property is held by barter_proposal_terms_one_write_per_version, not by a
  -- count here: a per-row count cannot tell a second call from the second row of the first.
  return new;
end;
$$;

alter function public.enforce_barter_terms_write() owner to postgres;
revoke all on function public.enforce_barter_terms_write() from public, anon, authenticated;
