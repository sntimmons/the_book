-- Trade Activity carries the two per-side terminal outcomes.
--
-- APPENDED to `my_trade_activity`, read from `my_barter_obligations` so the resolution is
-- reported in exactly one place and this view cannot drift from the obligations view.
--
-- **TWO COLUMNS, NOT ONE.** There is deliberately no agreement-level outcome: no Completed, no
-- Partially Fulfilled, no Not Completed, and nothing here computes one. A row that carries both
-- sides lets the client say truthfully what happened to each; a single rolled-up verdict would
-- be the next slice''s product decision, taken here by accident.
--
-- Live definition of this view is `20261013000000`; every column before the two new ones is
-- unchanged, as `create or replace view` requires.
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
  coalesce(mine.can_report_no_show, false) as can_report_no_show,
  mine.terminal_outcome      as my_terminal_outcome,
  theirs.terminal_outcome    as their_terminal_outcome
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
         b.no_show_reported_at, b.can_report_no_show, b.terminal_outcome
    from public.my_barter_obligations b
   where b.agreement_id = ag.id and b.receiver_user_id = (select auth.uid())
) mine on true
left join lateral (
  select b.receiver_window_state, b.confirmation_deadline, b.under_review,
         b.no_show_reported_at, b.terminal_outcome
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
  'Barter interests for the current user, with agreement, cancellation, the PD-059 role-relative '
  'receiver-window state, the derived Under Review state, and the two PER-SIDE terminal '
  'outcomes. There is deliberately NO agreement-level outcome column: none exists in the '
  'product, and a row reports what happened to each obligation rather than a verdict on the '
  'trade. All derive from my_barter_obligations so each rule is applied once.';
