-- ONE suppression expression, and a parameter name that stops lying.
--
-- Two deferred findings from PR #68's review, done together because they are the same defect
-- seen from two angles and both live in `my_barter_obligations`.
--
-- ── CODE-DUP-001: the predicate was written THREE TIMES ───────────────────
--
-- `20261020000000` reused the existing dominance rule rather than minting a second predicate,
-- and its header states the goal exactly: "the suppression happens ONCE, in the view, by feeding
-- the existing derived-state functions a cancelled-equivalent input … rather than by adding a
-- second set of predicates that could disagree with the first."
--
-- It achieved that CONCEPTUALLY and not TEXTUALLY: `cancelled OR adjudicated` was spelled out
-- verbatim three times, once per derived function argument, inside a view that must be restated
-- in full on every change. Adding a fourth suppressor later means editing three identical
-- expressions, and editing two of three produces precisely the failure that header names — the
-- read model saying "Under Review" while the record says "unfulfilled". This graph has already
-- had one silent copy-forward revert (`20261015000000`, MIGRATION_LEDGER), so the hazard is
-- demonstrated rather than theoretical.
--
-- Now computed ONCE per row in a lateral and passed to all three. `exists(no_show_reports)` was
-- duplicated the same way, twice, and is deduplicated alongside it. The lateral has no FROM
-- clause, so it yields exactly one row per obligation and cannot multiply or NULL anything.
--
-- ── CODE-NAMING-001: `p_trade_cancelled` no longer means cancelled ────────
--
-- Since `20261020000000` the view has passed `cancelled OR has-a-terminal-outcome` into a
-- parameter called `p_trade_cancelled`. `20261026000000` could only warn about that in the
-- function comments, because `create or replace function` CANNOT rename a parameter. The name is
-- now `p_suppressed`, which is what the value has meant for six migrations.
--
-- The risk this closes is concrete, not cosmetic: these three functions CANNOT distinguish a
-- cancelled trade from a resolved one, and a future editor reading `p_trade_cancelled` would add
-- cancellation-specific behaviour behind it and silently apply cancellation copy to every
-- adjudicated obligation.
--
-- ── WHY A DROP-AND-RECREATE IS SAFE HERE, STATED IN FULL ──────────────────
--
-- Renaming a parameter requires dropping the function, which requires dropping its dependents.
-- That is the riskiest operation available in this schema, so the ground was checked first:
--
--   * DEPENDENTS ARE EXACTLY TWO VIEWS. `pg_depend` reports only `my_barter_obligations` on the
--     three functions, and only `my_trade_activity` on that view. Both are recreated below.
--   * EVERY CALL SITE IS POSITIONAL. `adjudicate_barter_obligation` and
--     `enforce_barter_adjudication_consistent` reference `barter_obligation_under_review` in
--     their plpgsql bodies, positionally; plpgsql resolves by name and argtypes at runtime, both
--     unchanged. No named-argument (`p_trade_cancelled => …`) notation exists anywhere.
--   * BODIES ARE THE LIVE ONES. Every definition below was taken from `pg_get_functiondef` and
--     `pg_get_viewdef` against the non-production database, not from the migration that last
--     wrote them — the rule this repository learned the hard way.
--   * GRANTS, OWNER AND `security_invoker` ARE RE-ESTABLISHED EXPLICITLY, and were read from the
--     live catalog first. Losing `security_invoker` on `my_barter_obligations` would be a silent
--     RLS bypass exposing every provider's obligations, so B5B now PINS it — it did not before,
--     which is a gap this migration's review found rather than created.
--
-- BEHAVIOUR IS UNCHANGED. Not one predicate, branch, column, type or order differs; the same
-- 1209 B5B assertions and 181 concurrency assertions must still pass, and that is the proof.

-- ── 1. Drop the dependents, innermost last ────────────────────────────────
drop view if exists public.my_trade_activity;
drop view if exists public.my_barter_obligations;

drop function if exists public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz);
drop function if exists public.barter_obligation_under_review(text, boolean, boolean);
drop function if exists public.barter_can_report_no_show(
  timestamptz, text, boolean, boolean, timestamptz);

-- ── 2. The three helpers, renamed parameter only ──────────────────────────
create function public.barter_receiver_window(
  p_status text,
  p_delivered_at timestamptz,
  p_scheduled_at timestamptz,
  p_due_at timestamptz,
  p_suppressed boolean,
  p_as_of timestamptz
) returns text
language sql
stable
set search_path = ''
as $$
  select case
    -- Unknown is treated as SUPPRESSED, the safe direction: withhold a window rather than invent
    -- one. The view passes `exists(...) or exists(...)`, which is never NULL, so this branch is
    -- unreachable from there and is retained for a direct caller.
    when coalesce(p_suppressed, true) then 'none'
    when p_status is distinct from 'delivered' then 'none'
    when p_delivered_at is null then 'none'
    when p_as_of is null then 'none'
    when p_as_of >= public.barter_confirmation_deadline(
                      p_delivered_at, p_scheduled_at, p_due_at)
      then 'needs_attention'
    else 'awaiting_receiver'
  end
$$;

alter function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) owner to postgres;
revoke all on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) from public, anon;
grant execute on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) to authenticated;

comment on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) is
  'Receiver-window state: none | awaiting_receiver | needs_attention. Needs Attention begins at '
  'p_as_of >= deadline, inclusive. An answered obligation is always none, and so is a SUPPRESSED '
  'one. NOT a verdict: needs_attention is an unresolved operational state — never Fulfilled, '
  'Unfulfilled, Under Review, Disputed or a no-show, and never an agreement-level Completed or '
  'Partially Fulfilled, which do not exist at any level (PD-065, PD-070). p_suppressed means '
  'CANCELLED OR HAS-A-TERMINAL-OUTCOME — it was called p_trade_cancelled until 20261027000000 '
  'and never meant only cancellation after 20261020000000. This function CANNOT distinguish a '
  'cancelled trade from a resolved one; do NOT add cancellation-specific behaviour behind it.';

create function public.barter_obligation_under_review(
  p_status text,
  p_no_show_reported boolean,
  p_suppressed boolean
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    -- Unknown is treated as SUPPRESSED, the safe direction: withhold a review state rather than
    -- invent one. As with the window function, the view passes `exists (...)`, which is never
    -- NULL, so this branch is unreachable from there and is retained for a direct caller.
    when coalesce(p_suppressed, true) then false
    -- The two explicit acts, and only these two. Both are the receiver saying something went
    -- wrong, in two different ways: `not_received` is "I did not get it", a no-show report is
    -- "the appointment did not happen". Either is enough on its own, which is what stops a
    -- receiver who already answered `not_received` from being made to file a second complaint
    -- to be heard.
    else coalesce(p_no_show_reported, false) or p_status = 'not_received'
  end;
$$;

alter function public.barter_obligation_under_review(text, boolean, boolean) owner to postgres;
revoke all on function public.barter_obligation_under_review(text, boolean, boolean)
  from public, anon;
grant execute on function public.barter_obligation_under_review(text, boolean, boolean)
  to authenticated;

comment on function public.barter_obligation_under_review(text, boolean, boolean) is
  'Whether one obligation needs manual resolution. TRUE means a human must look, never that '
  'anyone is at fault. Terminal OBLIGATION outcomes DO exist (PD-064 … PD-067) and are the '
  'reason this can now be false: a resolved obligation is no longer under review, because the '
  'review ENDED. There is still no agreement-level Completed, Partially Fulfilled or Not '
  'Completed (PD-065, PD-070). p_suppressed means CANCELLED OR HAS-A-TERMINAL-OUTCOME, and the '
  'same warning applies as for barter_receiver_window: do not branch on it as though it meant '
  'cancellation alone.';

create function public.barter_can_report_no_show(
  p_scheduled_at timestamptz,
  p_status text,
  p_already_reported boolean,
  p_suppressed boolean,
  p_as_of timestamptz
) returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    -- Unknown is treated as suppressed and as already-reported: the safe direction is to
    -- withhold a control, never to offer one that can only fail.
    when coalesce(p_suppressed, true) then false
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
  'the obligation row lock and remains the authority — and since 20261022000000 that RPC also '
  'refuses a RESOLVED obligation with PT424. p_suppressed means CANCELLED OR '
  'HAS-A-TERMINAL-OUTCOME, so the control is withheld on a resolved obligation, which is what '
  'keeps the client from drawing a button the server would refuse.';

-- ── 3. The obligation view, with suppression computed ONCE ────────────────
--
-- Column list, names, order and types are IDENTICAL to the definition this replaces. The only
-- change is that `f.suppressed` and `f.no_show_reported` are evaluated once per row in the
-- lateral instead of being spelled out at each call site.
create view public.my_barter_obligations
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
    o.status, o.delivered_at, o.scheduled_at, o.due_at, f.suppressed, now()
  ) as receiver_window_state,
  now() as server_now,
  (select r.created_at from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reported_at,
  public.barter_obligation_under_review(
    o.status, f.no_show_reported, f.suppressed
  ) as under_review,
  public.barter_can_report_no_show(
    o.scheduled_at, o.status, f.no_show_reported, f.suppressed, now()
  ) as can_report_no_show,
  (select r.reason from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reason,
  (select a.outcome from public.barter_obligation_adjudications a
    where a.obligation_id = o.id) as terminal_outcome,
  (select a.adjudicated_at from public.barter_obligation_adjudications a
    where a.obligation_id = o.id) as adjudicated_at
from public.barter_obligations o
-- THE ONE AUTHORITATIVE SUPPRESSION EXPRESSION. A fourth suppressor is added HERE, once, and
-- every derived column follows automatically. No FROM clause, so exactly one row per obligation.
left join lateral (
  select
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id)
      or exists (select 1 from public.barter_obligation_adjudications a
                  where a.obligation_id = o.id) as suppressed,
    exists (select 1 from public.barter_obligation_no_show_reports r
             where r.obligation_id = o.id) as no_show_reported
) f on true;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

comment on view public.my_barter_obligations is
  'Participant-scoped obligations. UNRESOLVED lifecycle state (receiver window, Under Review, '
  'the no-show offer) and the TERMINAL operator resolution are separate fields, and the terminal '
  'one dominates: once it is set the other three are silenced, so the row carries exactly one '
  'answer. The operator rationale is deliberately absent. Suppression is computed ONCE, in the '
  'lateral, and passed to every derived column — add a fourth suppressor there and nowhere else.';

-- ── 4. The trade-activity view, recreated unchanged ───────────────────────
--
-- Restated verbatim from `pg_get_viewdef` because it depends on the view above, not because
-- anything about it changes. Still NO agreement-level outcome column: the two per-side outcomes
-- are reported and the client composes the presentation (PD-070).
create view public.my_trade_activity
with (security_invoker = true) as
select
  i.id as interest_id,
  i.offer_id,
  i.status,
  i.created_at,
  i.released_at,
  i.release_reason,
  o.offering_service,
  o.seeking_service,
  o.is_active as offer_is_active,
  case when o.user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when o.user_id = (select auth.uid()) then i.interested_provider_id
       else o.provider_id end as counterparty_provider_id,
  c.id as conversation_id,
  ag.id as agreement_id,
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
where o.user_id = (select auth.uid()) or i.interested_user_id = (select auth.uid());

alter view public.my_trade_activity owner to postgres;
revoke all on public.my_trade_activity from public, anon;
grant select on public.my_trade_activity to authenticated;
revoke insert, update, delete on table public.my_trade_activity from authenticated;

comment on view public.my_trade_activity is
  'Barter interests for the current user, with agreement, cancellation, the PD-059 role-relative '
  'receiver-window state, the derived Under Review state, and the two PER-SIDE terminal '
  'outcomes. There is deliberately NO agreement-level outcome column: none exists in the '
  'product, and a row reports what happened to each obligation rather than a verdict on the '
  'trade (PD-070). All derive from my_barter_obligations so each rule is applied once.';
