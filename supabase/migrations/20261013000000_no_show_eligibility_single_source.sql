-- The "can this receiver report a no-show right now?" rule, written ONCE.
--
-- FORWARD CORRECTION to `20261012000000`, which is applied and is therefore not edited.
--
-- WHAT WAS WRONG. `20261012000000` computed no-show eligibility inline inside
-- `my_trade_activity` and did not expose it on `my_barter_obligations` at all. That was wrong in
-- both directions at once:
--
--   * The rule existed as a hand-written predicate in a view body — a second place for it to
--     live once anything else needed it, which is the duplication this chain has repeatedly
--     paid for (`barter_terms_label`, the pair-key literal, the delivery/cancel race checks).
--   * The surface that actually renders the button is the TRADE DETAIL, which reads
--     `my_barter_obligations` — and that view did not carry the answer, so the screen would
--     have had to re-derive it from `scheduled_at` and `server_now` on the client. That is
--     precisely the thing PD-057 established must not happen: the SERVER decides whether a
--     moment has arrived, and the client only renders what it is told.
--
-- WHAT THIS DOES. Adds one STABLE function holding the rule, exposes `can_report_no_show` on
-- `my_barter_obligations`, and rewrites `my_trade_activity`'s copy to READ that column instead
-- of recomputing it. After this, the eligibility rule is written in exactly one place and the
-- two views cannot disagree — the same relationship `my_trade_activity` already has with
-- `my_barter_obligations` for the PD-057 window.
--
-- No new capability, no new write path, no schema change to any table, and no change to what
-- the RPC enforces: `report_barter_obligation_no_show` already re-checks every one of these
-- conditions under the obligation row lock, and remains the authority. This function decides
-- only whether a control is worth OFFERING.

-- STABLE, not IMMUTABLE: it compares against `now()`, so its result changes within the same
-- arguments as the transaction clock moves. It reads no table and takes no id, so it is not an
-- existence oracle. No timezone pin is needed — both sides of the comparison are absolute
-- `timestamptz` values and no calendar arithmetic happens here, unlike
-- `barter_confirmation_deadline`, which adds an interval and therefore had to pin one.
create or replace function public.barter_can_report_no_show(
  p_scheduled_at timestamptz,
  p_status text,
  p_already_reported boolean,
  p_trade_cancelled boolean,
  p_as_of timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    -- Unknown is treated as cancelled and as already-reported: the safe direction is to
    -- withhold a control, never to offer one that can only fail.
    when coalesce(p_trade_cancelled, true) then false
    when coalesce(p_already_reported, true) then false
    -- No-show exists ONLY for a scheduled obligation. An obligation with only a due date has no
    -- appointment to miss, and PD-057's due-date anchor is a different rule entirely.
    when p_scheduled_at is null then false
    -- The appointment must have ARRIVED. Deliberately `scheduled_at`, NOT `due_at`: a receiver
    -- does not have to wait out the delivery window to say that a booking did not happen.
    when p_as_of is null or p_as_of < p_scheduled_at then false
    -- A receiver who confirmed they received it cannot then report it never happened. Note that
    -- `not_received` is NOT excluded: the two record different facts, and a receiver who has
    -- already said "I did not get it" may still report that the appointment itself was missed.
    when p_status = 'received' then false
    else true
  end;
$$;

alter function public.barter_can_report_no_show(
  timestamptz, text, boolean, boolean, timestamptz) owner to postgres;
revoke all on function public.barter_can_report_no_show(
  timestamptz, text, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.barter_can_report_no_show(
  timestamptz, text, boolean, boolean, timestamptz) to authenticated;

comment on function public.barter_can_report_no_show(
  timestamptz, text, boolean, boolean, timestamptz) is
  'Whether the receiver may report a no-show right now. Advisory only: it decides whether to '
  'OFFER the control, while report_barter_obligation_no_show re-checks every condition under '
  'the obligation row lock and remains the authority.';

-- ── my_barter_obligations gains the answer ────────────────────────────────
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
  now() as server_now,
  (select r.created_at from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reported_at,
  public.barter_obligation_under_review(
    o.status,
    exists (select 1 from public.barter_obligation_no_show_reports r
             where r.obligation_id = o.id),
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id)
  ) as under_review,
  public.barter_can_report_no_show(
    o.scheduled_at,
    o.status,
    exists (select 1 from public.barter_obligation_no_show_reports r
             where r.obligation_id = o.id),
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id),
    now()
  ) as can_report_no_show
from public.barter_obligations o;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

-- ── my_trade_activity reads it rather than recomputing it ─────────────────
-- The ONLY change from `20261012000000`'s definition is the final column, which now comes from
-- the lateral instead of an inline predicate. Everything before it is byte-identical, as
-- `create or replace view` requires.
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
  theirs.confirmation_deadline as their_response_deadline,
  coalesce(mine.under_review, false)   as my_under_review,
  coalesce(theirs.under_review, false) as their_under_review,
  mine.no_show_reported_at   as my_no_show_reported_at,
  theirs.no_show_reported_at as their_no_show_reported_at,
  (coalesce(mine.under_review, false) or coalesce(theirs.under_review, false))
                             as agreement_under_review,
  coalesce(mine.can_report_no_show, false) as can_report_no_show
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
left join lateral (
  select b.receiver_window_state, b.confirmation_deadline, b.under_review,
         b.no_show_reported_at, b.can_report_no_show
    from public.my_barter_obligations b
   where b.agreement_id = ag.id and b.receiver_user_id = (select auth.uid())
) mine on true
left join lateral (
  select b.receiver_window_state, b.confirmation_deadline, b.under_review,
         b.no_show_reported_at
    from public.my_barter_obligations b
   where b.agreement_id = ag.id and b.deliverer_user_id = (select auth.uid())
) theirs on true
where o.user_id = (select auth.uid())
   or i.interested_user_id = (select auth.uid());

alter view public.my_trade_activity owner to postgres;
revoke all on public.my_trade_activity from public, anon;
grant select on public.my_trade_activity to authenticated;
revoke insert, update, delete on table public.my_trade_activity from authenticated;

-- Nothing else changes. No table, no column, no trigger, no RPC, no grant widening, no new
-- write path, and no terminal outcome — the same absences `20261012000000` § 8 lists.
