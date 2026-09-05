-- One stale comment inside a live function body.
--
-- `enforce_barter_terms_write` says "The write-once property is held by
-- barter_proposal_terms_one_write_per_version". That index was auto-dropped when
-- 20260925000000 removed sort_order; write-once now rests on the statement-level guard
-- `enforce_barter_terms_written_once`. Comments in a function body land in prosrc, so that was
-- the text the next author would read. Body otherwise identical to 20260923000000; diffed.
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

  -- Write-once, exactly-two and one-per-side are held by the STATEMENT-level guard
  -- enforce_barter_terms_written_once (a per-row check cannot see its own statement's other
  -- rows), and duplicate sides by the (version_id, provided_by) unique index.
  return new;
end;
$$;

alter function public.enforce_barter_terms_write() owner to postgres;
revoke all on function public.enforce_barter_terms_write() from public, anon, authenticated;
