-- Receiver-confirmation window and Needs Attention.
--
-- Makes PD-057 and PD-059 real, as DERIVED READ STATE. This migration adds NO column, NO row,
-- NO write path, NO background job and NO new RPC. Every fact it exposes is computed from the
-- immutable timestamps `20261003000000` and `20261004000000` already store, plus the SERVER's
-- clock. Nothing here can be flipped by a client, and there is no persisted transition to fall
-- out of step with the timestamps it was derived from.
--
-- ── THE ANCHOR (PD-057) ────────────────────────────────────────────────────
--
--   confirmation_anchor   = max(delivered_at, coalesce(scheduled_at, due_at))
--   confirmation_deadline = confirmation_anchor + interval '7 days'
--
-- SUPERSEDES A COMMENT, NOT A DECISION. `20261004000000` line 25 says "`delivered_at` is the
-- only fact the future 7-day window needs, so the deadline is DERIVED from it". Half of that is
-- right and is honoured here: the deadline IS derived and no deadline column is stored. The
-- other half is narrower than the ruling. PD-057 anchors on the LATER of delivery and the
-- agreed time, so `due_at` and `scheduled_at` are needed too. That applied migration is not
-- edited (forward-only); this header and MIGRATION_LEDGER.md carry the correction.
--
-- WHY THE LATER OF THE TWO. A deliverer who marks delivered early must not be able to shorten
-- the receiver's window. Anchoring on `delivered_at` alone would let a delivery marked a month
-- before the agreed date expire the receiver's response period before the service was even due
-- to happen — the receiver would be in Needs Attention for failing to confirm something they
-- had not yet been given. `scheduled_at` is preferred over `due_at` when present because it is
-- the date the two providers actually agreed the service happens (and the CHECK constraint
-- `barter_obligations_scheduled_before_due` guarantees it is never later than `due_at`).
--
-- ── WHAT EXPIRY MEANS, AND WHAT IT MUST NEVER MEAN ─────────────────────────
--
-- `needs_attention` is an UNRESOLVED OPERATIONAL STATE. It is not Fulfilled, not Unfulfilled,
-- not Completed, not Under Review, not Disputed, not a no-show and not an adjudication. None of
-- those exist, and elapsed time manufactures none of them (BARTER_BETA_CONTRACT.md § 6:
-- "Silence is not consent, and elapsed time earns no credit").
--
-- It also does not close the receiver's ability to answer. The two receiver RPCs are UNCHANGED
-- by this migration and neither consults a deadline, so "Confirm received" and "Didn't receive"
-- keep working after the window passes. That is deliberate: the deadline means THIS NEEDS
-- ATTENTION, not "you lost your right to answer". A later Under Review / adjudication slice is
-- the thing that may close it, and it does not exist.
--
-- ── STATE VOCABULARY ───────────────────────────────────────────────────────
--
--   none               nothing is waiting on the receiver: not delivered, already answered,
--                      or the trade was cancelled
--   awaiting_receiver  delivered, unanswered, still inside the window
--   needs_attention    delivered, unanswered, and the window has passed
--
-- ONE enum rather than two booleans (`needs_attention` + `receiver_action_pending`), because two
-- booleans admit a state that cannot exist — both true — and would put the same truth in two
-- places. The client derives whatever booleans it wants from this single value.
--
-- BOUNDARY. Needs Attention begins when `server_now >= confirmation_deadline`, inclusive, per
-- Founder ruling. Spelled once, in `barter_receiver_window` below.
--
-- EXPLICIT ANSWER BEATS SILENCE. `not_received` is an explicit receiver statement (PD-058), so
-- an answered obligation is `none` however long ago the window closed. Unanswered expiry and an
-- explicit answer are different facts and this never conflates them: an obligation the receiver
-- answered is not dragged into Needs Attention by the clock.
--
-- CANCELLED TRADES DO NOT PARTICIPATE. Ordinary cancellation is already impossible once
-- anything is delivered (`20261005000000`, PT409) and delivery is impossible once cancelled, so
-- the two are mutually exclusive already. The rule is still spelled explicitly rather than
-- inferred from that, because a state this one depends on must not rest on a guard two
-- migrations away staying true.

-- ── 1. The anchor ──────────────────────────────────────────────────────────
-- Pure arithmetic. IMMUTABLE, reads no table, holds no authority, and returns NULL until a
-- delivery exists — there is no window to be inside before something has been delivered.
--
-- `greatest` is NOT used across `p_delivered_at` on its own: greatest() IGNORES nulls in
-- Postgres, so greatest(null, x) is x, which would silently produce an anchor for an
-- undelivered obligation. The null case is therefore decided explicitly, first.
create or replace function public.barter_confirmation_anchor(
  p_delivered_at timestamptz,
  p_scheduled_at timestamptz,
  p_due_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_delivered_at is null then null
    -- coalesce(scheduled_at, due_at) is never null: due_at is NOT NULL on the table.
    else greatest(p_delivered_at, coalesce(p_scheduled_at, p_due_at))
  end
$$;

comment on function public.barter_confirmation_anchor(timestamptz, timestamptz, timestamptz) is
  'PD-057 confirmation anchor: max(delivered_at, coalesce(scheduled_at, due_at)); NULL before '
  'delivery. The one place this rule is spelled. Pure arithmetic — no authority, no table read.';

-- ── 2. The deadline ────────────────────────────────────────────────────────
-- The ONLY place `7 days` appears. Calls the anchor rather than re-deriving it, so the two can
-- never disagree, and inherits its NULL-before-delivery behaviour.
create or replace function public.barter_confirmation_deadline(
  p_delivered_at timestamptz,
  p_scheduled_at timestamptz,
  p_due_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select public.barter_confirmation_anchor(p_delivered_at, p_scheduled_at, p_due_at)
         + interval '7 days'
$$;

comment on function public.barter_confirmation_deadline(timestamptz, timestamptz, timestamptz) is
  'PD-057 receiver-response deadline: confirmation anchor + 7 days. The only place the 7-day '
  'interval is written. NULL before delivery.';

-- ── 3. The state ───────────────────────────────────────────────────────────
-- `p_as_of` is a PARAMETER so the boundary is exactly testable at, just before and just after
-- the deadline. It is NOT a way for a client to choose its own clock: the only caller that
-- decides anything is the view below, which passes the server's `now()`. Nothing persisted or
-- authorized depends on this function's return value — it computes a label, reads no table, and
-- grants no access — so a caller passing a fabricated `p_as_of` learns nothing it could not
-- compute locally from columns it can already read.
--
-- `p_status = 'delivered'` IS "delivered and unanswered", guaranteed by two CHECK constraints on
-- the table: `barter_obligations_delivered_stamp` ties pending to a null `delivered_at`, and
-- `barter_obligations_response_stamp` ties an answered status to a non-null
-- `receipt_responded_at`. Testing the status alone therefore cannot drift from testing the
-- timestamps, and there is no second spelling of "unanswered" to keep in step.
create or replace function public.barter_receiver_window(
  p_status text,
  p_delivered_at timestamptz,
  p_scheduled_at timestamptz,
  p_due_at timestamptz,
  p_trade_cancelled boolean,
  p_as_of timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    -- Fail closed on a missing input rather than reporting a state. `coalesce(p_..., true)` for
    -- the cancellation flag deliberately treats UNKNOWN as cancelled: the safe direction is to
    -- withhold an attention state, never to invent one.
    when coalesce(p_trade_cancelled, true) then 'none'
    when p_status is distinct from 'delivered' then 'none'
    when p_delivered_at is null then 'none'
    when p_as_of is null then 'none'
    when p_as_of >= public.barter_confirmation_deadline(
                      p_delivered_at, p_scheduled_at, p_due_at)
      then 'needs_attention'
    else 'awaiting_receiver'
  end
$$;

comment on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) is
  'Receiver-window state: none | awaiting_receiver | needs_attention. Needs Attention begins at '
  'p_as_of >= deadline, inclusive. An answered or cancelled obligation is always none. NOT a '
  'verdict: needs_attention is an unresolved operational state, never Fulfilled, Unfulfilled, '
  'Completed, Under Review, Disputed, a no-show or an adjudication, none of which exist.';

-- ── 4. Participant-scoped obligation read ──────────────────────────────────
-- `security_invoker = true`, matching `my_barter_proposals` and `my_trade_activity`: the view
-- runs as the caller, so `barter_obligations_participant_read` — deliverer or receiver only —
-- is what scopes it. The view adds no WHERE clause of its own precisely so it cannot become a
-- second, weaker copy of that policy.
--
-- `now()` (transaction_timestamp), NOT `clock_timestamp()`: every row in one read must be
-- judged against the SAME instant, or two obligations of one agreement could be evaluated
-- microseconds apart and a caller could see a self-inconsistent pair. `server_now` is returned
-- so a client can render "response due by" and relative time against the clock the state was
-- actually decided by, instead of the device's.
create or replace view public.my_barter_obligations
with (security_invoker = true) as
select
  o.id,
  o.agreement_id,
  o.side,
  o.agreed_description,
  o.due_at,
  o.scheduled_at,
  o.status,
  o.delivered_at,
  o.receipt_responded_at,
  o.deliverer_user_id,
  o.receiver_user_id,
  public.barter_confirmation_anchor(o.delivered_at, o.scheduled_at, o.due_at)
    as confirmation_anchor,
  public.barter_confirmation_deadline(o.delivered_at, o.scheduled_at, o.due_at)
    as confirmation_deadline,
  public.barter_receiver_window(
    o.status, o.delivered_at, o.scheduled_at, o.due_at,
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id),
    now()
  ) as receiver_window_state,
  now() as server_now
from public.barter_obligations o;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
-- Belt and braces, matching 20260929000000's treatment of my_trade_activity: a simple view can
-- be auto-updatable, and this one must never be a write path to barter_obligations.
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

comment on view public.my_barter_obligations is
  'Participant-scoped obligations with the PD-057 receiver window derived server-side. '
  'security_invoker: scoped by barter_obligations_participant_read, not by a second copy of it. '
  'Read-only; every write still goes through the three obligation RPCs.';

-- ── 5. Trade Activity: role-relative attention (PD-059) ────────────────────
-- Recreated in full rather than patched, per the ledger rule: the body below is
-- 20261005000000's view plus four columns, diffed against it before writing.
--
-- Each agreement has exactly two obligations and each participant is the deliverer of exactly
-- one and the receiver of the other (`barter_obligations_one_per_side` plus
-- `barter_obligations_distinct_users`). So each side below is a SCALAR read, not an aggregate:
-- there is no "strongest of several" to resolve here, and no priority rule is encoded in SQL.
-- Display priority across the two is the client's job (lib/tradeActivity.ts), because it is a
-- copy decision, not a fact.
--
--   my_response_*     the obligation THIS caller receives — their own action
--   their_response_*  the obligation THIS caller delivers — waiting on the counterparty
--
-- The deliverer sees the receiver's window state too, deliberately: after an unanswered
-- deadline the trade is unresolved for BOTH providers, and a deliverer told only "waiting for
-- confirmation" forever would be the party least able to find out why.
create or replace view public.my_trade_activity
with (security_invoker = true) as
select
  i.id                       as interest_id,
  i.offer_id,
  i.status,
  i.created_at,
  i.released_at,
  i.release_reason,
  o.offering_service,
  o.seeking_service,
  o.is_active                as offer_is_active,
  case when o.user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when o.user_id = (select auth.uid()) then i.interested_provider_id else o.provider_id end
                             as counterparty_provider_id,
  c.id                       as conversation_id,
  ag.id                      as agreement_id,
  exists (select 1 from public.barter_agreement_cancellations x
           where x.agreement_id = ag.id and x.actor_user_id = (select auth.uid()))
                             as i_cancelled,
  exists (select 1 from public.barter_agreement_cancellations x
           where x.agreement_id = ag.id and x.actor_user_id <> (select auth.uid()))
                             as they_cancelled,
  (select min(x.created_at) from public.barter_agreement_cancellations x
    where x.agreement_id = ag.id)
                             as cancelled_at,
  mine.receiver_window_state as my_response_state,
  mine.confirmation_deadline as my_response_deadline,
  theirs.receiver_window_state as their_response_state,
  theirs.confirmation_deadline as their_response_deadline
from public.barter_interests i
join public.barter_offers o on o.id = i.offer_id
left join lateral (
  select cv.id from public.conversation cv
   where cv.provider_pair_key =
           public.provider_pair_key(o.provider_id, i.interested_provider_id)
      or (cv.client_id = i.interested_user_id and cv.provider_id = o.provider_id)
      or (cv.client_id = o.user_id and cv.provider_id = i.interested_provider_id)
   order by cv.id limit 1
) c on true
left join public.barter_agreements ag on ag.interest_id = i.id
-- Reads the VIEW, not the table, so the window rule is applied in exactly one place and this
-- view cannot drift from my_barter_obligations. Both are security_invoker, so the participant
-- policy still governs which obligation rows are visible.
left join lateral (
  select b.receiver_window_state, b.confirmation_deadline
    from public.my_barter_obligations b
   where b.agreement_id = ag.id and b.receiver_user_id = (select auth.uid())
) mine on true
left join lateral (
  select b.receiver_window_state, b.confirmation_deadline
    from public.my_barter_obligations b
   where b.agreement_id = ag.id and b.deliverer_user_id = (select auth.uid())
) theirs on true
where o.user_id = (select auth.uid())
   or i.interested_user_id = (select auth.uid());

alter view public.my_trade_activity owner to postgres;
revoke all on public.my_trade_activity from public, anon;
grant select on public.my_trade_activity to authenticated;
revoke insert, update, delete on table public.my_trade_activity from authenticated;

comment on view public.my_trade_activity is
  'Barter interests for the current user, with agreement, cancellation and PD-059 role-relative '
  'receiver-window state. my_response_* is the obligation the caller RECEIVES (their action); '
  'their_response_* is the one they DELIVER (waiting on the counterparty). Both derive from '
  'my_barter_obligations so the PD-057 window is applied in one place.';

-- ── 6. Function grants ─────────────────────────────────────────────────────
-- EXECUTE to authenticated is REQUIRED, not incidental: both views are security_invoker, so
-- these functions run as the caller. anon and public are revoked, matching every other function
-- in this chain.
--
-- Safe to expose. All three are IMMUTABLE, read no table, take no id, hold no authority and
-- return arithmetic over values the caller can already read through the participant-scoped
-- view. There is no existence oracle here: passing timestamps in tells the caller nothing about
-- whether any row has them.
-- Spelled out rather than looped: a grant is the thing a reader most needs to be able to check
-- at a glance, and a format()-generated one hides the exact signature being widened.
alter function public.barter_confirmation_anchor(timestamptz, timestamptz, timestamptz)
  owner to postgres;
revoke all on function public.barter_confirmation_anchor(timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.barter_confirmation_anchor(timestamptz, timestamptz, timestamptz)
  to authenticated;

alter function public.barter_confirmation_deadline(timestamptz, timestamptz, timestamptz)
  owner to postgres;
revoke all on function public.barter_confirmation_deadline(timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.barter_confirmation_deadline(timestamptz, timestamptz, timestamptz)
  to authenticated;

alter function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) owner to postgres;
revoke all on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from public, anon;
grant execute on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) to authenticated;

-- ── 7. What this migration deliberately does NOT create ────────────────────
-- No column, no table, no trigger, no RPC, no background job, no scheduled task, no persisted
-- transition, and no new write path of any kind. No Under Review, no no-show, no adjudication,
-- no Fulfilled, no Unfulfilled, no Completed, no Closed Without Resolution, no Partially
-- Fulfilled, no terminal obligation outcome and no terminal agreement outcome. The three
-- obligation RPCs and every cancellation object are untouched: `git diff` on this migration
-- touches no function whose name contains `mark_`, `record_`, `confirm_`, `report_` or
-- `cancel_`.
