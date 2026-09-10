-- Session 8C — PD-088. REPORT INTAKE IS BOUNDED, NOT RESTRICTED.
--
-- ══ WHY A BOUND EXISTS AT ALL ═════════════════════════════════════════════
--
-- Before Session 8 a report was an inert row. Since `20261050000000` every
-- INSERT into `public.reports` opens an `operator_cases` row, so filing a report
-- CREATES WORK in the queue PD-068 makes a pre-beta requirement. One ordinary
-- account could open unlimited live cases.
--
-- ══ THE THING THIS MUST NOT DO ════════════════════════════════════════════
--
-- A safety report is the last thing you want to throttle. PD-088 is explicit
-- that duplicate protection is the PRIMARY control and rate limiting is only a
-- BACKSTOP, and that the limits are deliberately loose: the cost of refusing a
-- real report is not comparable to the cost of an operator reading a few junk
-- ones, so where the two trade off, the bound gives way.
--
-- **No standing requirement.** A reporter need not have transacted with the
-- person they report. A bystander who sees something in the community feed must
-- be able to say so, and requiring a prior booking would silence exactly the
-- reports that have no other route in. Nothing below adds one.
--
-- **Nothing a person wrote is discarded.** Every report that is accepted becomes
-- a `reports` row, including the second and third about the same person — they
-- are appended to the existing case rather than dropped. A refused report is
-- refused BEFORE the write, with a distinct SQLSTATE, so the client can keep the
-- text on screen instead of losing it.

-- ── 1. DUPLICATE PROTECTION — the primary control ─────────────────────────
--
-- At most one OPEN case per (reporter, target). A second report about the same
-- person while the first is unresolved APPENDS to that case.
--
-- ── WHAT "TARGET" MEANS, AND WHY IT IS A COALESCE ─────────────────────────
--
-- A report names a person (`reported_user_id`), a business
-- (`reported_provider_id`), a booking, or some combination — the thread reporter
-- names both a person and their provider row. The target is resolved in that
-- order of specificity, and a report that names none of them (impossible under
-- `reports_target_check`, but the code does not rely on that) always opens its
-- own case.
--
-- ── FOUR RULES THAT ARE DELIBERATE, NOT INCIDENTAL ────────────────────────
--
-- 1. **DIFFERENT REPORTERS ARE NEVER MERGED.** Two people reporting the same
--    person are two independent signals, and collapsing them would hide the one
--    fact an operator most needs — that it is not just one person complaining.
--    The dedupe key includes the reporter for that reason alone.
-- 2. **A CLOSED CASE DOES NOT ABSORB A NEW REPORT.** Once resolved or dismissed
--    a case is history; a later report is a NEW question about someone already
--    looked at, which is more urgent rather than less, and it opens a new case.
-- 3. **A CHANGED CATEGORY STILL APPENDS**, and the appended note records the new
--    reason. Someone who first said "service issue" and then "safety concern" is
--    telling the operator something important about the SAME situation, and two
--    cases would split the story in half.
-- 4. **BLOCKING SOMEONE DOES NOT STOP YOU REPORTING THEM.** Nothing here
--    consults `user_blocks`. The two acts are independent and a person will
--    often do both.
create or replace function public.open_case_for_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case uuid;
  v_existing uuid;
begin
  -- Is there already a LIVE case from this reporter about this target?
  select c.id into v_existing
    from public.operator_cases c
    join public.reports r on r.id = c.report_id
   where c.case_type = 'user_report'
     and c.status in ('open', 'under_review')
     and r.reporter_user_id = new.reporter_user_id
     and (
       (new.reported_user_id is not null
          and r.reported_user_id is not distinct from new.reported_user_id)
       or (new.reported_user_id is null and new.reported_provider_id is not null
          and r.reported_provider_id is not distinct from new.reported_provider_id)
       or (new.reported_user_id is null and new.reported_provider_id is null
          and new.booking_id is not null
          and r.booking_id is not distinct from new.booking_id)
     )
   order by c.created_at asc
   limit 1;

  if found then
    -- APPEND, do not open a second case. The note carries the new report's id
    -- and reason so the operator can find the row — the case still POINTS at the
    -- first report and never copies content, which is the rule the whole case
    -- design rests on (20261049000000).
    insert into public.operator_case_events (case_id, actor_user_id, action, note)
    values (v_existing, new.reporter_user_id, 'noted',
            'Further report from the same reporter about the same subject. '
            || 'report_id=' || new.id::text
            || ' reason=' || coalesce(new.report_reason, '(none)'));
    return new;
  end if;

  insert into public.operator_cases
    (case_type, report_id, requested_by_user_id, status)
  values ('user_report', new.id, new.reporter_user_id, 'open')
  returning id into v_case;

  insert into public.operator_case_events (case_id, actor_user_id, action, to_status)
  values (v_case, new.reporter_user_id, 'opened', 'open');

  return new;
exception
  when unique_violation then
    return new;
end;
$$;

alter function public.open_case_for_report() owner to postgres;
revoke all on function public.open_case_for_report() from public, anon, authenticated;

comment on function public.open_case_for_report() is
  'Opens the operator case for a report, or APPENDS to the live one this '
  'reporter already has about this subject (PD-088). Duplicate protection is the '
  'PRIMARY intake control and it costs an honest reporter nothing — their words '
  'are still recorded, on the case an operator is already reading. The dedupe key '
  'includes the REPORTER deliberately: two people reporting the same person are '
  'two independent signals, and merging them would hide the one fact an operator '
  'most needs. A CLOSED case never absorbs a new report — that is a new question '
  'about someone already looked at.';

-- ── 2. THE RATE LIMIT — the backstop, and only that ───────────────────────
--
-- 5 per hour and 20 per day per reporter, across all targets.
--
-- A person in a genuinely bad situation reports one or two people, not six an
-- hour. Twenty a day is far beyond any honest use and far below what makes
-- flooding worthwhile. If these ever refuse a real reporter, THEY ARE WRONG AND
-- SHOULD BE RAISED — that is the stated trade-off in PD-088, not a concession.
--
-- `PT428` is its own SQLSTATE so the client can say what happened and KEEP THE
-- TEXT THE PERSON WROTE. A generic failure would lose it, and losing what
-- someone typed about a safety problem is its own harm.
--
-- SERVICE PATHS ARE EXEMPT. `service_role` and no-claims sessions carry no
-- `auth.uid()`; they are migrations, ops scripts and the operator surface, not a
-- person filing reports.
create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hour integer;
  v_day integer;
begin
  if v_uid is null then
    return new;
  end if;

  -- Counted against the CALLER, not against `new.reporter_user_id`. The INSERT
  -- policy already pins those to each other, but a limit that trusted a column
  -- the client supplies would be no limit at all.
  select count(*) into v_hour from public.reports r
   where r.reporter_user_id = v_uid and r.created_at > now() - interval '1 hour';
  if v_hour >= 5 then
    raise exception 'You have filed several reports in the last hour. Please try again later.'
      using errcode = 'PT428';
  end if;

  select count(*) into v_day from public.reports r
   where r.reporter_user_id = v_uid and r.created_at > now() - interval '24 hours';
  if v_day >= 20 then
    raise exception 'You have filed many reports today. Please try again tomorrow.'
      using errcode = 'PT428';
  end if;

  return new;
end;
$$;

alter function public.enforce_report_rate_limit() owner to postgres;
revoke all on function public.enforce_report_rate_limit()
  from public, anon, authenticated;

comment on function public.enforce_report_rate_limit() is
  'PD-088 backstop: 5 reports/hour and 20/day per reporter, counted against '
  'auth.uid() rather than the client-supplied reporter column. Deliberately loose '
  '— duplicate protection is the primary control and this only stops flooding. '
  'Raises PT428 so the client can name the limit and KEEP the text the person '
  'wrote. service_role and no-claims sessions are exempt: they are not people '
  'filing reports.';

-- `zz_` LEADING, so it sorts after every other trigger on this table. The lesson
-- is `20261058000000`'s: `bookings_zz_` sorted on 'b' and ran FIRST, which is the
-- opposite of what its comment claimed. A rate limit belongs LAST, so a report
-- refused for any other reason does not consume the reporter's budget.
drop trigger if exists zz_reports_rate_limit on public.reports;
create trigger zz_reports_rate_limit
  before insert on public.reports
  for each row execute function public.enforce_report_rate_limit();
