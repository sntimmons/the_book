-- No-show reporting and the Under Review foundation.
--
-- Adds ONE new fact to the barter graph — a receiver's report that a SCHEDULED service did not
-- happen — and derives ONE new read state from it: Under Review, meaning "this trade needs
-- manual resolution". It adds no adjudication, no operator decision path and no terminal
-- outcome, and it is not able to express one.
--
-- ── WHAT UNDER REVIEW IS, AND WHAT IT IS NOT ───────────────────────────────
--
-- Under Review means the trade REQUIRES OPERATOR/MANUAL RESOLUTION. It does NOT mean the
-- deliverer is guilty, the receiver is correct, or that anything has been decided. There is no
-- Fulfilled, Unfulfilled, Closed Without Resolution, Completed, Partially Fulfilled or Not
-- Completed in this product, elapsed time creates none of them, and neither does a report. The
-- four-value `status` vocabulary (`pending | delivered | received | not_received`) is
-- UNCHANGED: Under Review is deliberately NOT a status value, for the same reason Needs
-- Attention is not one.
--
-- ── DERIVED, NOT PERSISTED — AND WHY THERE IS NO `barter_review_cases` TABLE ─
--
-- The brief offered `barter_review_cases` as a possible object and asked for "one authoritative
-- active review case per obligation", while also requiring "avoid redundant state that can
-- disagree". Those pull in opposite directions only if the case row carries information. Today
-- it would carry NONE: with adjudication out of scope there is no assignee, no decision, no
-- resolution and no closure to store, so a case row would hold nothing that
-- `(a no-show report exists) OR (status = 'not_received')` does not already determine — while
-- adding a second place for the answer to live, and therefore a second place to be wrong.
--
-- So Under Review is DERIVED, and "one authoritative active review case" is satisfied BY
-- CONSTRUCTION: a derived predicate cannot have two values. This follows the chain's own
-- precedent twice over — PD-057's window is derived from timestamps (`20261011000000`), and
-- cancelled-by-one versus mutually-cancelled is derived from a row count and explicitly "never
-- stored" (`20261005000000`).
--
-- WHEN THAT SHOULD CHANGE: the moment an operator can DO something to a review — take it,
-- annotate it, resolve it — there is real state to hold and a case table becomes right. That is
-- the adjudication slice, which this migration deliberately does not begin.
--
-- ── THE ONE QUESTION THIS MIGRATION DOES NOT ANSWER ────────────────────────
--
-- Under Review is reachable here from TWO explicit acts: a no-show report, and a receiver's
-- `not_received` answer. The brief also asked whether an unresolved NEEDS ATTENTION should be
-- escalatable into Under Review. It is NOT built here, deliberately:
--
--   * An automatic escalation would be a SECOND TIMER beyond PD-057's seven days, which the
--     brief forbids outright and no PD defines.
--   * A manual escalation would need a NEW ACTOR AND ACTION — someone pressing "send this to
--     review" — and no authoritative document defines who may do that, on what terms, or
--     whether the counterparty can contest it.
--
-- Inventing either would be resolving an open product question by implementing one answer.
-- Recorded for the Founder instead; Needs Attention therefore still resolves only by the
-- receiver answering, exactly as `20261011000000` left it.

-- ── 1. The report ──────────────────────────────────────────────────────────
--
-- Append-only, and at most ONE row per obligation. One row is not an arbitrary cap: only the
-- obligation's RECEIVER may report, and an obligation has exactly one receiver, so a second row
-- could only ever be the same person filing the same complaint twice. The unique constraint is
-- what makes a repeat call idempotent rather than a second event.
--
-- NOTHING IS DELETED OR REWRITTEN. A report cannot be edited, withdrawn or re-stamped — see
-- § 2. `delivered_at` is never erased and no prior history is rewritten: a no-show report is an
-- ADDITIONAL fact standing beside the delivery record, not a correction of it.
create table if not exists public.barter_obligation_no_show_reports (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.barter_obligations(id) on delete cascade,
  agreement_id uuid not null references public.barter_agreements(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_provider_id uuid not null references public.providers(id) on delete cascade,
  -- The obligation's `scheduled_at` as it stood when the report was filed. Copied, not joined,
  -- because it is the fact the report is ABOUT: the appointment that did not happen. The column
  -- is frozen against every writer (`20261011000000` § 3b) so the two cannot drift, and holding
  -- it here means the report stays legible on its own terms.
  scheduled_at timestamptz not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  constraint barter_obligation_no_show_reports_one_per_obligation unique (obligation_id),
  constraint barter_obligation_no_show_reports_reason_check
    check (reason is null or char_length(btrim(reason)) between 1 and 200)
);

create index if not exists barter_obligation_no_show_reports_agreement_idx
  on public.barter_obligation_no_show_reports (agreement_id);

alter table public.barter_obligation_no_show_reports owner to postgres;

comment on table public.barter_obligation_no_show_reports is
  'Append-only record that a SCHEDULED service did not happen, reported by the obligation''s '
  'receiver. At most one per obligation. It is a reported EVENT, never an inference from '
  'timestamps, and it decides no fault: it routes the trade into the derived Under Review '
  'state and nothing else. Not an outcome, not an adjudication, not a reputation signal.';
comment on column public.barter_obligation_no_show_reports.reporter_user_id is
  'Derived server-side from auth.uid() and re-checked against the obligation''s receiver. Never '
  'client-supplied — a client that could name the reporter could file in someone else''s name.';
comment on column public.barter_obligation_no_show_reports.reporter_provider_id is
  'The reporting participant''s provider on THIS obligation, read from the obligation row. '
  'Deliberately NOT re-checked against providers.is_approved: a participant who was approved '
  'when the agreement was made keeps their authority over it, and losing approval must not '
  'strip someone of the ability to report what happened on a trade they are already in.';
comment on column public.barter_obligation_no_show_reports.scheduled_at is
  'Copy of the obligation''s scheduled_at at report time — the appointment the report is about.';
comment on column public.barter_obligation_no_show_reports.reason is
  'Optional free text, at most 200 characters, matching the cancellation reason. No taxonomy: '
  'reason CODES would be product vocabulary nobody has decided, and a code list is exactly the '
  'kind of thing an adjudication model needs to define for itself.';
comment on column public.barter_obligation_no_show_reports.created_at is
  'Server-stamped and immutable. A repeat report returns the EXISTING timestamp rather than '
  're-stamping it, so the record of when the complaint was first made cannot be moved.';

-- ── 2. The report is append-only ───────────────────────────────────────────
-- No edits, no withdrawals, no deletes, and no flipping. A report that could be taken back
-- would let the record of a missed appointment vanish after the counterparty had seen it, and
-- Under Review would silently un-derive itself. Matches
-- `enforce_barter_cancellation_append_only` exactly, including the privileged branch: DELETE by
-- a privileged caller is what account erasure and the agreement CASCADE rely on.
create or replace function public.enforce_barter_no_show_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  raise exception 'A no-show report cannot be edited or withdrawn.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_no_show_append_only() owner to postgres;
revoke all on function public.enforce_barter_no_show_append_only()
  from public, anon, authenticated;

drop trigger if exists barter_no_show_reports_append_only
  on public.barter_obligation_no_show_reports;
create trigger barter_no_show_reports_append_only
  before update or delete on public.barter_obligation_no_show_reports
  for each row execute function public.enforce_barter_no_show_append_only();

-- ── 3. A report row must describe a real, reportable obligation ────────────
-- Defense in depth BEHIND the RPC: `authenticated` holds no INSERT on this table, so this
-- trigger exists for a forged or mistaken privileged insert. It re-derives every identity from
-- the obligation rather than trusting the row, so a row cannot name a reporter the obligation
-- does not have, attach the wrong provider to a real participant, claim an appointment the
-- obligation never had, or predate the appointment it reports.
--
-- BE PRECISE ABOUT WHAT THIS BUYS. The cancellation check below is an UNLOCKED read, so it is a
-- SEQUENTIAL guard: it catches a direct privileged insert against an already-cancelled
-- agreement and does NOT by itself decide a race. Race-safety is owned by the obligation row
-- lock in the RPC, which is the same lock `record_barter_obligation_receipt` and
-- `mark_barter_obligation_delivered` take.
create or replace function public.enforce_barter_no_show_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.barter_obligations%rowtype;
begin
  select o.* into v_o from public.barter_obligations o where o.id = new.obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if new.agreement_id <> v_o.agreement_id then
    raise exception 'A no-show report must belong to its obligation''s agreement.'
      using errcode = 'check_violation';
  end if;
  -- Only the RECEIVER. The deliverer cannot report themselves as a no-show, and nobody outside
  -- the obligation can report at all.
  if new.reporter_user_id <> v_o.receiver_user_id
     or new.reporter_provider_id <> v_o.receiver_provider_id then
    raise exception 'Only the provider receiving this can report a no-show.'
      using errcode = 'check_violation';
  end if;
  -- No-show exists ONLY for a scheduled obligation, and only once the appointment has arrived.
  if v_o.scheduled_at is null then
    raise exception 'This trade has no scheduled time, so there is no appointment to miss.'
      using errcode = 'check_violation';
  end if;
  if new.scheduled_at <> v_o.scheduled_at then
    raise exception 'A no-show report must carry its obligation''s scheduled time.'
      using errcode = 'check_violation';
  end if;
  if new.created_at < v_o.scheduled_at then
    raise exception 'A no-show cannot be reported before the scheduled time.'
      using errcode = 'check_violation';
  end if;
  -- An explicitly RECEIVED obligation is settled by the receiver's own word; they cannot then
  -- report that the same service never happened. `not_received` is deliberately NOT blocked —
  -- see the RPC.
  if v_o.status = 'received' then
    raise exception 'You already confirmed you received this.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_no_show_consistent() owner to postgres;
revoke all on function public.enforce_barter_no_show_consistent()
  from public, anon, authenticated;

drop trigger if exists barter_no_show_reports_consistent
  on public.barter_obligation_no_show_reports;
create trigger barter_no_show_reports_consistent
  before insert on public.barter_obligation_no_show_reports
  for each row execute function public.enforce_barter_no_show_consistent();

-- ── 4. RLS: both participants read, nobody writes directly ────────────────
alter table public.barter_obligation_no_show_reports enable row level security;

-- BOTH participants, not only the reporter. The deliverer must be able to see that a report
-- exists — it is why their trade says Under Review, and a state they cannot see the cause of is
-- worse than the state itself. Scoped through the OBLIGATION's participant columns, which are
-- frozen against every writer (`20261011000000` § 3b), so this policy cannot be widened by
-- moving an obligation into different hands.
drop policy if exists barter_no_show_reports_participant_read
  on public.barter_obligation_no_show_reports;
create policy barter_no_show_reports_participant_read
  on public.barter_obligation_no_show_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.barter_obligations o
       where o.id = barter_obligation_no_show_reports.obligation_id
         and (select auth.uid()) in (o.deliverer_user_id, o.receiver_user_id)
    )
  );

-- No INSERT, UPDATE or DELETE policy of any kind. Every write goes through the RPC in § 6, so
-- there is no direct path a client could take even if it guessed every column.
revoke all on table public.barter_obligation_no_show_reports from public, anon, authenticated;
grant select on table public.barter_obligation_no_show_reports to authenticated;

-- ── 5. The Under Review rule, written once ─────────────────────────────────
--
-- IMMUTABLE and genuinely so: three inputs, boolean algebra, no clock and no calendar
-- arithmetic — unlike `barter_confirmation_deadline`, which had to be STABLE. It reads no table
-- and takes no id, so it is not an existence oracle: a caller passing fabricated arguments
-- learns only what they already asserted.
--
-- CANCELLATION DOMINATES. A cancelled agreement never enters Under Review, and this is the same
-- direction every other derived state in this chain takes: a cancelled trade is over, and
-- telling its participants it needs review would be asking them to resolve something that
-- already ended.
create or replace function public.barter_obligation_under_review(
  p_status text,
  p_no_show_reported boolean,
  p_trade_cancelled boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    -- Unknown is treated as cancelled, the safe direction: withhold a review state rather than
    -- invent one. As with the window function, the view passes `exists (...)`, which is never
    -- NULL, so this branch is unreachable from there and is retained for a direct caller.
    when coalesce(p_trade_cancelled, true) then false
    -- The two explicit acts, and only these two. Both are the receiver saying something went
    -- wrong, in two different ways: `not_received` is "I did not get it", a no-show report is
    -- "the appointment did not happen". Either is enough on its own, which is what stops a
    -- receiver who already answered `not_received` from being made to file a second complaint
    -- to be heard.
    else coalesce(p_no_show_reported, false) or p_status = 'not_received'
  end;
$$;

alter function public.barter_obligation_under_review(text, boolean, boolean)
  owner to postgres;
revoke all on function public.barter_obligation_under_review(text, boolean, boolean)
  from public, anon;
grant execute on function public.barter_obligation_under_review(text, boolean, boolean)
  to authenticated;

comment on function public.barter_obligation_under_review(text, boolean, boolean) is
  'Whether one obligation needs manual resolution. TRUE means a human must look, never that '
  'anyone is at fault, and never Fulfilled, Unfulfilled, Completed, Closed Without Resolution '
  'or any terminal outcome — none of which exist. Cancelled trades are always false.';

-- ── 6. The one write path ──────────────────────────────────────────────────
--
-- The client sends the OBLIGATION ID and an optional reason. Nothing else. It cannot name the
-- reporter, the provider, the appointment, the time, a review status, an adjudicator or an
-- outcome — there is no parameter for any of them here and no RPC for them anywhere.
--
-- LOCK ORDER, stated because it is a contract and not an accident. This takes the OBLIGATION
-- row lock and nothing else, exactly as `record_barter_obligation_receipt` and
-- `mark_barter_obligation_delivered` do. `cancel_barter_agreement` takes the AGREEMENT lock
-- first and then its obligations in id order; because this function never takes the agreement
-- lock it can wait for a cancellation but can never hold something that cancellation needs
-- first, so the pair cannot deadlock. A future writer here must keep that property.
--
-- WHAT THE OBLIGATION LOCK DECIDES: no-show versus confirm-received, and no-show versus a
-- second no-show, are serialized by it. Whichever transaction takes the row first wins, and the
-- loser then sees the committed state and takes the idempotent or refusing branch.
--
-- ON DELIVERY. A no-show may be reported whether or not the deliverer marked the obligation
-- delivered, and whether they did so before or after the appointment. That is deliberate:
-- a no-show is a REPORTED EVENT about what happened in the world, not an inference from
-- timestamps, and "they marked it delivered" is precisely the claim a receiver may need to
-- contradict. `delivered_at` is left exactly as it stands.
--
-- ON `not_received`. A receiver who already answered `not_received` is ALREADY under review by
-- § 5, so they never need to file a no-show to be heard. They may still file one, because the
-- two record different facts — "I did not get it" versus "the appointment did not happen" —
-- and a later review will want both if both are true.
create or replace function public.report_barter_obligation_no_show(
  p_obligation_id uuid,
  p_reason text default null
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;
  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'That reason is too long.' using errcode = '22023';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- NOT AN EXISTENCE ORACLE. A non-participant gets the same message and SQLSTATE as a caller
  -- naming an id that does not exist, so neither learns which it was.
  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- Only the receiver. The deliverer is a participant, so they reach this line — and are
  -- refused here with a message that tells them why, because they can legitimately see the
  -- obligation and there is nothing to hide from them.
  if v_o.receiver_user_id <> v_uid then
    raise exception 'Only the provider receiving this can report a no-show.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to report.'
      using errcode = 'PT409';
  end if;

  if v_o.scheduled_at is null then
    raise exception 'This trade has no scheduled time, so there is no appointment to miss.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- SERVER TIME, always. `now()` is the transaction clock, so both obligations of one agreement
  -- are judged at the same instant, and a device with a wrong clock cannot bring an appointment
  -- forward. There is no `p_as_of` here and no client value reaches this comparison.
  if now() < v_o.scheduled_at then
    raise exception 'That scheduled time has not arrived yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_o.status = 'received' then
    raise exception 'You already confirmed you received this.' using errcode = 'PT412';
  end if;

  -- IDEMPOTENT. The original report and its timestamp are returned unchanged; the reason is
  -- NOT merged in, because silently rewriting the words someone filed is exactly the "original
  -- report not overwritten" failure. A second, different account belongs in the review, which
  -- this slice does not build.
  select r.created_at into v_at
    from public.barter_obligation_no_show_reports r
   where r.obligation_id = v_o.id;
  if found then
    return v_at;
  end if;

  insert into public.barter_obligation_no_show_reports
    (obligation_id, agreement_id, reporter_user_id, reporter_provider_id, scheduled_at, reason)
  values
    (v_o.id, v_o.agreement_id, v_uid, v_o.receiver_provider_id, v_o.scheduled_at, v_reason)
  returning created_at into v_at;

  return v_at;
end;
$$;

alter function public.report_barter_obligation_no_show(uuid, text) owner to postgres;
revoke all on function public.report_barter_obligation_no_show(uuid, text)
  from public, anon, authenticated;
grant execute on function public.report_barter_obligation_no_show(uuid, text) to authenticated;

comment on function public.report_barter_obligation_no_show(uuid, text) is
  'Receiver-only report that a scheduled service did not happen. Server derives the reporter, '
  'the provider, the appointment and the time; the client sends an obligation id and an '
  'optional reason. Idempotent: a repeat call returns the original timestamp. Creates no '
  'outcome, no fault and no reputation effect.';

-- ── 7. Read models ─────────────────────────────────────────────────────────
-- `create or replace view` may only APPEND columns, so both views keep their existing prefix
-- byte-for-byte and gain the new facts at the end.
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
  -- The report's own timestamp, so a screen can say WHEN without a second query. NULL when
  -- none exists. RLS on the reports table scopes this to participants; a non-participant cannot
  -- see the obligation row at all, so there is nothing to leak through.
  (select r.created_at from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reported_at,
  -- Whether THIS obligation needs manual resolution. Obligation-granular by construction: one
  -- side of a trade can be under review while the other is untouched, and nothing here decides
  -- anything about the other side.
  public.barter_obligation_under_review(
    o.status,
    exists (select 1 from public.barter_obligation_no_show_reports r
             where r.obligation_id = o.id),
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id)
  ) as under_review
from public.barter_obligations o;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

comment on view public.my_barter_obligations is
  'Participant-scoped obligations with the PD-057 receiver window and the derived Under Review '
  'state, both computed server-side. security_invoker: scoped by '
  'barter_obligations_participant_read, not by a second copy of it. Read-only; every write '
  'still goes through the four obligation RPCs.';

-- Trade Activity gains the two role-relative review facts plus the agreement-level roll-up.
-- Both laterals read the VIEW, not the table, so the Under Review rule is applied in exactly
-- ONE place and the two views cannot drift.
--
-- STILL NO `order by` / `limit` ON THE TWO LATERALS. Each participant receives exactly one
-- obligation per agreement and delivers exactly one, so both are scalar. Adding a limit to make
-- that "safe" would HIDE a violation of that invariant rather than surface it, and the
-- invariant is asserted directly in the test suite instead.
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
  -- The obligation this caller RECEIVES: the one they can report a no-show on.
  coalesce(mine.under_review, false)   as my_under_review,
  -- The obligation this caller DELIVERS: under review because the counterparty reported.
  coalesce(theirs.under_review, false) as their_under_review,
  mine.no_show_reported_at   as my_no_show_reported_at,
  theirs.no_show_reported_at as their_no_show_reported_at,
  -- AGREEMENT-LEVEL. A trade needs review if EITHER side does. This is a display roll-up and
  -- decides nothing about the other obligation: the per-side columns above stay authoritative,
  -- and a screen showing "Under Review" for the trade must not read it as a finding about
  -- either participant.
  (coalesce(mine.under_review, false) or coalesce(theirs.under_review, false))
                             as agreement_under_review,
  -- Whether the receiver may report a no-show right now, decided by the SERVER against its own
  -- clock. The client renders a control from this rather than comparing `scheduled_at` to the
  -- device clock — the same discipline PD-057 established for the deadline. The RPC re-checks
  -- every one of these conditions; this only decides whether a button is worth offering.
  (
    mine.scheduled_at is not null
    and now() >= mine.scheduled_at
    and mine.status <> 'received'
    and mine.no_show_reported_at is null
    and not exists (select 1 from public.barter_agreement_cancellations x
                     where x.agreement_id = ag.id)
  )                          as can_report_no_show
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
         b.no_show_reported_at, b.scheduled_at, b.status
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

comment on view public.my_trade_activity is
  'Barter interests for the current user, with agreement, cancellation, PD-059 role-relative '
  'receiver-window state, and the derived Under Review state. my_* is the obligation the caller '
  'RECEIVES; their_* is the one they DELIVER. agreement_under_review is a DISPLAY roll-up over '
  'both and decides nothing about either. All derive from my_barter_obligations so each rule is '
  'applied in one place.';

-- ── 8. What this migration deliberately does NOT create ────────────────────
-- No adjudication, no operator decision path, no reviewer or adjudicator identity, no review
-- resolution, no closure, no appeal, and no terminal outcome of any kind: no Fulfilled, no
-- Unfulfilled, no Closed Without Resolution, no Completed, no Partially Fulfilled, no Not
-- Completed, no terminal obligation outcome and no terminal agreement outcome. No reputation
-- signal, no review record, no notification of any kind, and no scheduled task or background
-- job — nothing in this migration moves a row on a timer.
--
-- The obligation `status` vocabulary is UNCHANGED at four values, no column was added to
-- `barter_obligations`, and the three existing obligation RPCs and every cancellation object
-- are untouched. Needs Attention still resolves only by the receiver answering: no automatic
-- second timer was created, and no manual escalation from Needs Attention into Under Review was
-- invented — that remains an open Founder question, recorded in the header.
