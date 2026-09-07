-- The no-show reason reaches the two participants (Founder ruling, 2026-09-07).
--
-- The reason column, its CHECK and the RPC parameter have existed since `20261012000000`, and
-- the reports table's RLS has always let BOTH participants read the row. What did not exist was
-- a route to it: no view exposed the text, so the client could not show it, and — as the code
-- review noted — the plumbing sat unreachable at four layers.
--
-- FOUNDER RULING: the reason is PARTICIPANT-VISIBLE CONTEXT. Both agreement participants may
-- read it. It is NOT a platform finding, not proof of fault, not an adjudication, not a
-- reliability judgment and not a reputation impact — and the UI must attribute it as the
-- REPORTING PARTICIPANT'S STATEMENT, never as something the product concluded. Non-participants
-- and anon must not read it.
--
-- WHY NO NEW POLICY IS NEEDED, and why that is the point rather than an omission. The view is
-- `security_invoker`, so the subquery below runs as the CALLER and
-- `barter_no_show_reports_participant_read` governs it — the same policy that already scopes the
-- report's existence and its timestamp. A non-participant cannot see the obligation row at all,
-- so there is nothing for the reason to leak through. Exposing the text therefore widens NO
-- boundary: it makes readable, to exactly the two people who could already read the row through
-- PostgREST, a column they were always entitled to.
--
-- WHO WROTE IT is not a new column either. Only the obligation's RECEIVER may report, and
-- `receiver_user_id` is already on this view, so a client attributes the statement by comparing
-- it to the caller. A `reported_by_me` flag would be a second, derivable source of the same
-- fact — the kind that can disagree.

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
  ) as can_report_no_show,
  -- APPENDED, as `create or replace view` requires. The receiver's own words, or NULL. The
  -- reporter is always this obligation's receiver, so a client attributes it by comparing
  -- `receiver_user_id` to the caller — no second column, no second source of truth.
  (select r.reason from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reason
from public.barter_obligations o;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

comment on view public.my_barter_obligations is
  'Participant-scoped obligations with the PD-057 receiver window, the derived Under Review '
  'state, and the reporting participant''s own words where a no-show was reported — all scoped '
  'by barter_obligations_participant_read and barter_no_show_reports_participant_read through '
  'security_invoker, not by a second copy of either. The reason is a PARTICIPANT STATEMENT, '
  'never a platform finding. Read-only; every write goes through the four obligation RPCs.';

-- No policy, grant, table, column or write path changed. `my_trade_activity` is deliberately
-- NOT given the reason: a list row is the wrong place for someone's account of what happened,
-- and the trade's own screen is where it belongs.
