-- Receiver-confirmation window and Needs Attention.
--
-- Makes PD-057 and PD-059 real, as DERIVED READ STATE. This migration adds NO column, NO row,
-- NO write path, NO background job, NO new RPC and NO trigger. Every fact it exposes is computed
-- from the immutable timestamps `20261003000000` and `20261004000000` already store, plus the
-- SERVER's clock. Nothing here can be flipped by a client, and there is no persisted transition
-- to fall out of step with the timestamps it was derived from.
--
-- ONE THING IT DOES TIGHTEN, and it is a narrowing rather than a new capability: § 3b replaces
-- the body of `public.enforce_barter_obligations_immutable` so the obligation's CONTRACT FIELDS
-- are frozen against EVERY writer, `service_role` and the no-JWT maintenance path included
-- (Founder ruling, 2026-09-06). Nothing gains a write it did not have. This belongs in this
-- migration rather than a later one because it is this migration that makes those columns
-- load-bearing for a second read surface and for a deadline both providers act on.
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
-- Genuinely IMMUTABLE, unlike the two functions below: `case`, `greatest` and `coalesce` over
-- `timestamptz` are all immutable, and nothing here does calendar arithmetic. The difference in
-- volatility between this function and the deadline is deliberate, not an oversight.
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
-- STABLE, not IMMUTABLE, and the distinction is real rather than pedantic. `timestamptz +
-- interval '7 days'` is `timestamptz_pl_interval`, which is **STABLE**: it converts to local
-- time in the session's TimeZone, adds the calendar day component, and converts back. Declaring
-- it IMMUTABLE would be a false promise to the planner — PostgreSQL does not verify volatility
-- claims at CREATE FUNCTION, so the lie would be silent. `stable` is also the repo's own
-- precedent for exactly this shape (`public.review_window_closed`,
-- 20260902000000_reviews_phase0_foundation.sql). Neither function is used in an index or a
-- generated column, so STABLE costs nothing.
stable
set search_path = ''
-- And the timezone is PINNED, which is the half that actually protects the product. Without it
-- the boundary is timezone-RELATIVE while `now()` is absolute, so two sessions whose TimeZone
-- straddles a DST transition would disagree by up to an hour about whether a trade needs
-- attention — the two participants of one trade seeing different answers. Pinning UTC makes the
-- deadline one instant for everybody. It changes nothing under Supabase's UTC default; it stops
-- a role-level `alter role ... set TimeZone`, a db-pre-request hook or a psql session from
-- moving the boundary.
set timezone = 'UTC'
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
-- ON `coalesce(p_trade_cancelled, true)`, AND WHAT IT DOES *NOT* PROTECT. Treating UNKNOWN as
-- cancelled is the safe direction — withhold an attention state, never invent one — but be
-- precise about the reach of that branch. The view below passes an `exists (...)` subquery, and
-- SQL `EXISTS` returns true or false and NEVER NULL, not even when RLS filters every candidate
-- row away. So the `coalesce` is UNREACHABLE from the view, and the view's cancellation input is
-- NOT fail-closed by it. It is retained for a direct caller (who holds no authority and learns
-- nothing) and for a future caller that resolves cancellation some other way.
--
-- What actually keeps the view correct is a structural invariant. The obligation read policy
-- scopes on the obligation's participant columns while the cancellation read policy scopes on
-- the agreement's, and those two sets are pinned to each other: the consistency trigger derives
-- them at INSERT, and as of § 3b above they are frozen against EVERY writer including
-- `service_role`. A caller who can see the obligation can therefore always see its cancellation
-- acts, so `exists` cannot return false for a cancelled trade the caller is party to. That
-- invariant is asserted directly in supabase/tests/receiver_window.test.sql § 14c.
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
-- STABLE because it calls `barter_confirmation_deadline`, which is STABLE. A function may not
-- claim stricter volatility than anything it calls. The comparison itself is between two
-- absolute `timestamptz` values, so this one needs no timezone pin of its own — the deadline
-- function has already resolved the only timezone-sensitive step.
stable
set search_path = ''
as $$
  select case
    -- Unknown is treated as cancelled. See the note above this function on what that does and
    -- does not protect.
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

-- ── 3b. The agreed trade is frozen against EVERY writer, service_role included ──
--
-- FOUNDER RULING, 2026-09-06. The core obligation contract fields stay immutable even to
-- ordinary `service_role` maintenance paths once the agreement exists:
--
--   agreement_id, source_term_id, side,
--   deliverer_provider_id, deliverer_user_id, receiver_provider_id, receiver_user_id,
--   agreed_description, due_at, scheduled_at
--
-- These are the OFFICIAL ACCEPTED TRADE. Two providers agreed to exactly this, an agreement was
-- written on it (PD-055), and it must not be silently rewritten afterwards by anyone. If an
-- operator correction is ever needed it must be an explicit, audited workflow with its own
-- Founder approval — **this slice does not build that**, and nothing here is a substitute for it.
--
-- WHY THIS SLICE IS WHERE IT LANDS. This migration makes those columns load-bearing in two new
-- ways: `deliverer_user_id`/`receiver_user_id` become the scoping keys of a second read surface
-- (`my_barter_obligations`), and `due_at`/`scheduled_at` become the PD-057 anchor that decides
-- Needs Attention for both participants. A privileged rewrite of either would silently move a
-- deadline both providers are acting on, or move an obligation into a different pair of hands.
--
-- WHAT CHANGED, PRECISELY. The live definition is
-- `20261004000000_barter_obligation_delivery.sql:87-152` (read from MIGRATION_LEDGER.md's
-- functions table, not from the file that first created it). Its first statement was an
-- unconditional early return for `service_role` OR a null `auth.uid()`, covering UPDATE and
-- DELETE alike. That early return is now SPLIT:
--
--   * DELETE keeps its previous behaviour exactly — privileged callers may delete, everyone else
--     is refused absolutely. This is deliberate and must not be tightened here: every
--     `auth.users` and `barter_agreements` FK in this graph is ON DELETE CASCADE, so account
--     erasure and agreement removal delete obligations as a privileged cascade. Blocking that
--     would break erasure, which is a capability two earlier migrations spent paragraphs
--     preserving.
--   * The CONTRACT-FIELD diff now runs for EVERY writer, before the privileged branch.
--   * The three LIFECYCLE columns (`status`, `delivered_at`, `receipt_responded_at`) keep their
--     existing treatment: privileged maintenance may write them, and non-privileged callers must
--     still come through the write marker and a legal transition. The Founder ruling names the
--     contract fields only, and the CHECK constraints added by 20261004000000 remain what binds
--     a lifecycle stamp to its status for a privileged writer.
--
-- Still DENIED BY DEFAULT rather than by an allowlist: the whole row MINUS the three lifecycle
-- keys must be identical, so a column added by a later migration is frozen unless somebody
-- deliberately subtracts it below. The message and SQLSTATE are unchanged, so nothing that
-- reports this refusal has to change.
create or replace function public.enforce_barter_obligations_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  if (to_jsonb(new) - 'status' - 'delivered_at' - 'receipt_responded_at')
     is distinct from
     (to_jsonb(old) - 'status' - 'delivered_at' - 'receipt_responded_at') then
    raise exception 'A barter obligation cannot be edited or deleted.'
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
$$;

alter function public.enforce_barter_obligations_immutable() owner to postgres;
revoke all on function public.enforce_barter_obligations_immutable()
  from public, anon, authenticated;

-- The trigger itself is NOT recreated: `create or replace function` replaces the body in place
-- and the existing `barter_obligations_immutable` trigger (20261004000000) already points at
-- this name. Dropping and recreating it would widen the change for no gain.

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
-- transition, and no new write path of any kind. The one function body it replaces
-- (`enforce_barter_obligations_immutable`, § 3b) only REMOVES a write that was previously
-- permitted; it grants nothing. No Under Review, no no-show, no adjudication,
-- no Fulfilled, no Unfulfilled, no Completed, no Closed Without Resolution, no Partially
-- Fulfilled, no terminal obligation outcome and no terminal agreement outcome. The three
-- obligation RPCs and every cancellation object are untouched: `git diff` on this migration
-- touches no function whose name contains `mark_`, `record_`, `confirm_`, `report_` or
-- `cancel_`.
