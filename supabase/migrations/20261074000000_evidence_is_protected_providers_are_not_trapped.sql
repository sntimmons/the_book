-- FORWARD CORRECTION to 20261068000000 / 20261073000000.
--
-- ══ TWO RULES THAT DISAGREED ══════════════════════════════════════════════
--
-- `20261073000000` made the contract-delete rule deliberate: an agreement a
-- client has ACCEPTED cannot be deleted, and one nobody has accepted still can.
-- That is the right rule and its message says so.
--
-- But `contract_versions` cascades from `contracts`, and its immutability
-- trigger refuses DELETE for any non-`service_role` caller — so the cascade
-- aborted even when the contract-level rule had just allowed it. A provider
-- deleting an agreement nobody had accepted got *"A contract version cannot be
-- changed once recorded."*
--
-- Since the backfill gave EVERY contract a version, that made provider contract
-- deletion impossible in all cases rather than only the ones worth protecting.
--
-- ══ THE RULE, STATED ONCE AND APPLIED IN BOTH PLACES ══════════════════════
--
-- **Evidence is protected; providers are not trapped.** A version may be deleted
-- only as part of deleting a contract that no client has accepted. Once an
-- acceptance exists, the version it names is permanent — which is the entire
-- point of the table.
--
-- UPDATE remains refused for everyone, always. Rewriting a recorded version is
-- never legitimate, whatever the parent contract's state.
create or replace function public.enforce_contract_version_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Erasure cascades, unchanged (20261053000000's lesson: an append-only table
  -- that refuses DELETE unconditionally makes account deletion impossible).
  if tg_op = 'DELETE' and (select auth.role()) = 'service_role' then
    return old;
  end if;
  if tg_op = 'DELETE'
     and (select auth.role()) is null and (select auth.uid()) is null then
    return old;
  end if;

  -- A cascade from deleting an UNACCEPTED contract. The same test the
  -- contract-level trigger makes, so the two rules cannot drift apart and a
  -- provider never meets one that says yes and another that says no.
  if tg_op = 'DELETE'
     and not exists (
       select 1 from public.contract_signatures s where s.contract_id = old.contract_id
     ) then
    return old;
  end if;

  raise exception 'A contract version cannot be changed once recorded.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_contract_version_immutable() owner to postgres;
revoke all on function public.enforce_contract_version_immutable()
  from public, anon, authenticated;

comment on function public.enforce_contract_version_immutable() is
  'A recorded contract version is immutable: UPDATE is refused for everyone, '
  'always. DELETE is permitted to service_role and a no-claims session (erasure '
  'cascades), and to the cascade from deleting a contract NO CLIENT HAS ACCEPTED '
  '— the same test enforce_contract_delete_keeps_evidence makes, so the two rules '
  'cannot drift and a provider never meets one that permits and another that '
  'refuses. Evidence is protected; providers are not trapped.';
