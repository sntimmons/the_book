-- FORWARD CORRECTION to 20261108000000 (Account erasure, policy H).
--
-- ══ THE AGREED TRADE IS PROTECTED FROM EVERYONE, INCLUDING THE ERASER ═════
--
-- `enforce_barter_obligations_immutable` checks its set-difference BEFORE the
-- privileged branch, deliberately — its own comment says so: *"Checked before the
-- privileged branch, so it binds service_role and the no-JWT path as well."* The
-- agreed trade cannot be rewritten by anybody, and that is a guarantee worth
-- keeping.
--
-- It also blocked the referential SET NULL that anonymises a departed
-- participant, so erasure failed with `check_violation` — and the CASCADE it
-- replaced destroyed the entire agreement and its adjudicated outcome, which is
-- what policy H forbids. Neither was acceptable.
--
-- The distinction this whole session keeps drawing applies here too: a party's
-- **user id** is not a **term of the trade**. What identifies the parties for
-- trade purposes is `deliverer_provider_id` / `receiver_provider_id`, and those
-- are untouched — the provider row is kept and emptied precisely so records like
-- this retain which business was involved. So the two user ids join the allowed
-- set, and a second check makes the permission one-directional: they may be
-- severed to NULL, never REPOINTED at somebody else.
create or replace function public.enforce_barter_obligations_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_marker text := current_setting('app.barter_obligation_write', true);
  -- `service_role` OR a null `auth.uid()`. BOTH disjuncts, named once: the second is the
  -- no-JWT maintenance path, and a reader pointed only at `service_role` is being shown half
  -- the reason a privileged write succeeds.
  v_privileged boolean :=
    (select auth.role()) = 'service_role' or (select auth.uid()) is null;
begin
  -- DELETE first, and unchanged from the live definition in both directions.
  if tg_op = 'DELETE' then
    if v_privileged then
      return old;
    end if;
    -- History is retained (PD-043); a delete would destroy the counterparty's record.
    raise exception 'A barter obligation cannot be edited or deleted.'
      using errcode = 'check_violation';
  end if;

  -- THE AGREED TRADE. Checked before the privileged branch, so it binds service_role and the
  -- no-JWT path as well.
  -- ACCOUNT ERASURE (20261109000000). The two participant USER ids may be severed
  -- to NULL and nothing else about them may change. They are not terms of the
  -- trade: `deliverer_provider_id` and `receiver_provider_id` are what identify
  -- the parties, and those are untouched — the provider row is kept (emptied) for
  -- exactly this reason. Without this the referential SET NULL that anonymises a
  -- departed participant is refused, and the CASCADE that replaced it destroyed
  -- the whole agreed trade, which is what policy H forbids.
  if (to_jsonb(new) - 'status' - 'delivered_at' - 'receipt_responded_at'
        - 'deliverer_user_id' - 'receiver_user_id')
     is distinct from
     (to_jsonb(old) - 'status' - 'delivered_at' - 'receipt_responded_at'
        - 'deliverer_user_id' - 'receiver_user_id') then
    raise exception 'A barter obligation cannot be edited or deleted.'
      using errcode = 'check_violation';
  end if;

  -- And those two may only ever go to NULL: severing an identity is permitted,
  -- REPOINTING one at somebody else is not.
  if (new.deliverer_user_id is distinct from old.deliverer_user_id
        and new.deliverer_user_id is not null)
     or (new.receiver_user_id is distinct from old.receiver_user_id
        and new.receiver_user_id is not null) then
    raise exception 'A barter obligation''s participants cannot be changed.'
      using errcode = 'check_violation';
  end if;

  -- Beyond the agreed trade, privileged maintenance keeps exactly the latitude it had: the three
  -- lifecycle columns, without the marker or the transition table.
  if v_privileged then
    return new;
  end if;

  if v_marker is null or v_marker = '' or v_marker <> old.id::text then
    raise exception 'A barter obligation may only be updated by a delivery operation.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Legal transitions, exhaustively. Anything else — including delivered → pending, a repeat
  -- of the same transition, and received ↔ not_received — is refused here regardless of which
  -- RPC published the marker.
  if not (
    (old.status = 'pending' and new.status = 'delivered')
    or (old.status = 'delivered' and new.status in ('received', 'not_received'))
  ) then
    raise exception 'That is not a change this obligation can make.'
      using errcode = 'check_violation';
  end if;

  -- Write-once stamps. The CHECK constraints bind a stamp to its status; these bind it to the
  -- moment it was first written, so no later transition can move an earlier one.
  if old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at then
    raise exception 'A delivery time cannot be changed once it is recorded.'
      using errcode = 'check_violation';
  end if;
  if old.receipt_responded_at is not null
     and new.receipt_responded_at is distinct from old.receipt_responded_at then
    raise exception 'A receipt answer cannot be changed once it is recorded.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

alter function public.enforce_barter_obligations_immutable() owner to postgres;
revoke all on function public.enforce_barter_obligations_immutable()
  from public, anon, authenticated;

comment on function public.enforce_barter_obligations_immutable() is
  'The agreed trade is immutable for EVERYONE, service_role included — the '
  'set-difference is checked before the privileged branch on purpose. Since '
  '20261109000000 the two participant USER ids are outside that set and may be '
  'SEVERED TO NULL (never repointed), because account erasure has to be able to '
  'anonymise a departed party and the alternative was a CASCADE that destroyed '
  'the agreement and its adjudicated outcome. A user id is not a term of the '
  'trade; deliverer_provider_id and receiver_provider_id are, and they do not '
  'move.';
