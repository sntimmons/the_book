-- Barter obligation delivery and receiver confirmation.
--
-- Adds the SMALLEST durable lifecycle that supports two actions and nothing else:
--
--   deliverer  → mark their own obligation delivered   (server stamps delivered_at)
--   receiver   → confirm received  /  say they did not receive
--
-- LIFECYCLE VOCABULARY. `status` records WHAT HAPPENED, never a verdict:
--
--   pending       nobody has marked this delivered
--   delivered     the deliverer marked it; the receiver has not answered
--   received      the receiver confirmed they received it
--   not_received  the receiver said they did not receive it
--
-- `received` is deliberately NOT `fulfilled`, and `not_received` is deliberately NOT
-- `unfulfilled`, `disputed` or `needs_attention`. Those are ADJUDICATED OUTCOMES (PD-046 /
-- BARTER_BETA_CONTRACT.md § 7.5) and no adjudication exists. Keeping the column a record of
-- events rather than of verdicts is what lets Needs Attention, Under Review, Fulfilled,
-- Unfulfilled and Closed Without Resolution be added later as further values (or as a separate
-- outcome column) without rewriting the meaning of any row already written.
--
-- NOT IN THIS SLICE, and deliberately absent from the schema: the 7-day timeout transition,
-- automatic fulfilment or completion, cancellation, mutual cancellation, no-show, Needs
-- Attention, Under Review, adjudication, any terminal obligation outcome, and any terminal
-- agreement outcome. `delivered_at` is the only fact the future 7-day window needs, so the
-- deadline is DERIVED from it and no redundant deadline column is stored.
--
-- The obligation's CONTENT and TIMING remain immutable. Only the three lifecycle columns may
-- ever change, only through the two RPCs below, and only along the transitions listed above.

alter table public.barter_obligations
  add column if not exists status text not null default 'pending',
  add column if not exists delivered_at timestamptz,
  add column if not exists receipt_responded_at timestamptz;

alter table public.barter_obligations
  drop constraint if exists barter_obligations_status_check;
alter table public.barter_obligations
  add constraint barter_obligations_status_check
  check (status in ('pending', 'delivered', 'received', 'not_received'));

-- The timestamps and the status cannot disagree. Without these a lifecycle column could be
-- moved without its stamp (or a stamp written with no transition) and the row would still
-- satisfy every other rule while claiming something that never happened.
alter table public.barter_obligations
  drop constraint if exists barter_obligations_delivered_stamp;
alter table public.barter_obligations
  add constraint barter_obligations_delivered_stamp
  check ((status = 'pending') = (delivered_at is null));

alter table public.barter_obligations
  drop constraint if exists barter_obligations_response_stamp;
alter table public.barter_obligations
  add constraint barter_obligations_response_stamp
  check ((status in ('received', 'not_received')) = (receipt_responded_at is not null));

alter table public.barter_obligations
  drop constraint if exists barter_obligations_response_after_delivery;
alter table public.barter_obligations
  add constraint barter_obligations_response_after_delivery
  check (
    receipt_responded_at is null
    or (delivered_at is not null and receipt_responded_at >= delivered_at)
  );

comment on column public.barter_obligations.status is
  'What has happened to this obligation: pending, delivered, received, not_received. A record '
  'of events, never an adjudicated verdict — no Fulfilled, Unfulfilled, Needs Attention, '
  'Under Review or Closed Without Resolution outcome exists yet.';
comment on column public.barter_obligations.delivered_at is
  'Server-stamped when the DELIVERER marks this delivered. Never client-supplied, and '
  'immutable once set: a second mark must not reset the clock the future 7-day receiver '
  'window is measured from.';
comment on column public.barter_obligations.receipt_responded_at is
  'Server-stamped when the RECEIVER answers. Immutable once set; the answer cannot be '
  'changed, and no timeout writes it.';

-- ── Immutability, narrowed to permit ONLY guarded lifecycle transitions ─────
-- Replaces the blanket refusal from 20261003000000. Content, timing, identity and direction
-- are still frozen; what changed is that the three lifecycle columns may move, and only:
--   * from inside one of the delivery RPCs (proven by a transaction-local marker carrying THIS
--     obligation's id — same shape as `app.barter_terms_write` in 20260923000000, because a
--     definer RPC runs as postgres with a REAL auth.uid() and role alone cannot distinguish
--     "called from inside an RPC" from "called directly"), and
--   * along a legal transition, with each stamp written exactly once.
-- Grants remain the outer wall: `authenticated` holds no UPDATE on this table at all.
create or replace function public.enforce_barter_obligations_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marker text := current_setting('app.barter_obligation_write', true);
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  -- DELETE is still absolute. History is retained (PD-043); nothing in this slice removes an
  -- obligation, and a delete would destroy the counterparty's record of the trade.
  if tg_op = 'DELETE' then
    raise exception 'A barter obligation cannot be edited or deleted.'
      using errcode = 'check_violation';
  end if;

  -- The agreed trade itself. Unchanged by delivery, receipt, or anything in this slice.
  --
  -- DENIED BY DEFAULT, not by an allowlist of frozen column names: the whole row MINUS the
  -- three lifecycle keys must be identical. A named list is complete only on the day it is
  -- written — a column added by a later migration would silently become mutable-with-a-marker,
  -- and nothing would tell the author who added it. This way a new column is frozen unless
  -- somebody deliberately adds it to the subtraction below.
  if (to_jsonb(new) - 'status' - 'delivered_at' - 'receipt_responded_at')
     is distinct from
     (to_jsonb(old) - 'status' - 'delivered_at' - 'receipt_responded_at') then
    raise exception 'A barter obligation cannot be edited or deleted.'
      using errcode = 'check_violation';
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
$$;

alter function public.enforce_barter_obligations_immutable() owner to postgres;
revoke all on function public.enforce_barter_obligations_immutable()
  from public, anon, authenticated;

drop trigger if exists barter_obligations_immutable on public.barter_obligations;
create trigger barter_obligations_immutable
  before update or delete on public.barter_obligations
  for each row execute function public.enforce_barter_obligations_immutable();

-- Every obligation ENTERS the lifecycle at the beginning. Without this, a row could be
-- inserted already 'received' and reach an answered state having passed through neither
-- transition — the CHECK constraints would still find it internally consistent. The pair
-- creator inserts with the column defaults, so nothing legitimate is affected, and this guard
-- deliberately has NO service_role bypass: a backfill has no reason to invent a delivery
-- either.
create or replace function public.enforce_barter_obligation_starts_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending'
     or new.delivered_at is not null
     or new.receipt_responded_at is not null then
    raise exception 'A barter obligation starts with nothing delivered and nothing answered.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_obligation_starts_pending() owner to postgres;
revoke all on function public.enforce_barter_obligation_starts_pending()
  from public, anon, authenticated;

drop trigger if exists barter_obligations_starts_pending on public.barter_obligations;
create trigger barter_obligations_starts_pending
  before insert on public.barter_obligations
  for each row execute function public.enforce_barter_obligation_starts_pending();

-- ── mark_barter_obligation_delivered(p_obligation_id) → status ─────────────
-- Only the DELIVERER, and only their own obligation. The client names the obligation and
-- nothing else: direction, both identities and the timestamp are all read from the row.
--
-- IDEMPOTENT. A second attempt — a double tap, a retry after a dropped response, a second
-- device — returns the state that already exists and touches nothing. `delivered_at` is never
-- re-stamped, so the clock the future 7-day receiver window will be measured from cannot be
-- pushed forward by re-delivering.
--
-- The row is taken FOR UPDATE first, so two concurrent attempts serialize: the second reads
-- the winner's committed row and takes the no-op branch.
create or replace function public.mark_barter_obligation_delivered(p_obligation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- AUTHORIZE FIRST, LOCK SECOND. This read takes no lock, so a caller with no relationship to
  -- the obligation is refused without ever contending for its row — otherwise a stranger who
  -- guessed an id would block behind a participant's transaction, and "exists but is busy"
  -- would time differently from "does not exist", which is the oracle the next branch closes.
  -- Safe to authorize on an unlocked read because the two identity columns are immutable
  -- (deny-by-default guard above); only the lifecycle can move, and that is re-read under lock.
  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- A NON-PARTICIPANT is answered exactly as a missing obligation is, so this is not an
  -- existence oracle: "that obligation exists but is not yours" and "no such obligation" must
  -- be indistinguishable to someone who is on neither end of it.
  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- The RECEIVER is refused here, with copy they can act on: nobody marks the counterparty's
  -- obligation delivered. Checked against the row's own deliverer, never against anything the
  -- caller supplied.
  if v_o.deliverer_user_id <> v_uid then
    raise exception 'Only the provider who owes this can mark it delivered.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Now the lock, and a fresh read under it: two callers reaching here at once serialize, and
  -- the loser sees the winner's committed state rather than the row it read a moment ago.
  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.status <> 'pending' then
    return v_o.status;
  end if;

  perform set_config('app.barter_obligation_write', v_o.id::text, true);
  update public.barter_obligations
     set status = 'delivered',
         delivered_at = clock_timestamp()
   where id = v_o.id;
  perform set_config('app.barter_obligation_write', '', true);

  return 'delivered';
end;
$$;

alter function public.mark_barter_obligation_delivered(uuid) owner to postgres;
revoke all on function public.mark_barter_obligation_delivered(uuid) from public, anon;
grant execute on function public.mark_barter_obligation_delivered(uuid) to authenticated;

-- ── record_barter_obligation_receipt(p_obligation_id, p_status) → status ───
-- INTERNAL. The single receiver-response boundary, shared by the two public RPCs below so the
-- authority checks, the ordering rule and the one-answer rule exist in exactly one place.
--
-- EXECUTE is revoked from public, anon and authenticated, so no client can reach it: the
-- outcome travels as a parameter here, and a client able to call it directly would be a client
-- choosing its own vocabulary. `service_role` and the owner retain it, as they retain
-- everything on this table — the guard above is what protects the vocabulary from them. The
-- two public wrappers each name one outcome and take no outcome parameter, so "Confirm
-- received" and "Didn't receive" are the only two answers that exist at the API surface.
create or replace function public.record_barter_obligation_receipt(
  p_obligation_id uuid,
  p_status text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
begin
  -- `p_status is null or` is load-bearing: `null not in (...)` evaluates to NULL, not TRUE, so
  -- without it a NULL falls THROUGH this guard and is only stopped by the column's NOT NULL —
  -- after the write marker has already been published. Three-valued logic has produced a
  -- fail-open in this codebase before.
  if p_status is null or p_status not in ('received', 'not_received') then
    raise exception 'Unknown receipt answer.' using errcode = 'internal_error';
  end if;
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- Authorize on an unlocked read first, for the same reason as above.
  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- Same non-oracle rule as mark_barter_obligation_delivered.
  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- The DELIVERER is refused here: nobody confirms their own delivery.
  if v_o.receiver_user_id <> v_uid then
    raise exception 'Only the provider receiving this can answer for it.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- Nothing to answer for yet. 55000 rather than a permission error, because the caller IS the
  -- right person — the obligation is simply not in the state this action needs.
  if v_o.delivered_at is null then
    raise exception 'This has not been marked delivered yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Repeating the SAME answer is safe and changes nothing, including the timestamp.
  if v_o.status = p_status then
    return v_o.status;
  end if;

  -- An answer already exists and this one differs. Refused: the first answer is authoritative
  -- and an answer is not editable in this slice. Distinct SQLSTATE so the UI can say what
  -- actually happened instead of reporting it as a permission problem or a stale screen.
  if v_o.status <> 'delivered' then
    raise exception 'You have already answered this.' using errcode = 'PT412';
  end if;

  perform set_config('app.barter_obligation_write', v_o.id::text, true);
  update public.barter_obligations
     set status = p_status,
         receipt_responded_at = clock_timestamp()
   where id = v_o.id;
  perform set_config('app.barter_obligation_write', '', true);

  return p_status;
end;
$$;

alter function public.record_barter_obligation_receipt(uuid, text) owner to postgres;
revoke all on function public.record_barter_obligation_receipt(uuid, text)
  from public, anon, authenticated;

-- ── The two receiver answers ───────────────────────────────────────────────
-- Two functions rather than one boolean parameter, so the closed vocabulary is enforced by the
-- API surface itself. Neither records a verdict, an agreement outcome, or an adjudication.
create or replace function public.confirm_barter_obligation_received(p_obligation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return public.record_barter_obligation_receipt(p_obligation_id, 'received');
end;
$$;

alter function public.confirm_barter_obligation_received(uuid) owner to postgres;
revoke all on function public.confirm_barter_obligation_received(uuid) from public, anon;
grant execute on function public.confirm_barter_obligation_received(uuid) to authenticated;

-- "Didn't receive" records the receiver's statement and NOTHING else. It does not adjudicate,
-- does not mark the obligation unfulfilled, does not open a review, and does not touch the
-- agreement. It is the durable state a later Needs Attention / Under Review slice consumes.
create or replace function public.report_barter_obligation_not_received(p_obligation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return public.record_barter_obligation_receipt(p_obligation_id, 'not_received');
end;
$$;

alter function public.report_barter_obligation_not_received(uuid) owner to postgres;
revoke all on function public.report_barter_obligation_not_received(uuid) from public, anon;
grant execute on function public.report_barter_obligation_not_received(uuid) to authenticated;

-- Read stays SELECT-only for both participants, exactly as 20261003000000 left it: no write
-- policy is added, and `authenticated` gains no INSERT, UPDATE or DELETE. The RPCs above run
-- as postgres and are the only writers.
