-- B5B suite: Session 8C — PD-088, report intake bounds.
--
-- The question this suite answers is NOT "does the limit work" but the one that
-- decides whether it is safe to ship: **does it ever turn away a real reporter?**
-- PD-088 says duplicate protection is the primary control, rate limiting is a
-- backstop, and where the two trade off the bound gives way. Most of what
-- follows asserts what the bound does NOT do.

do $$
declare
  ra uuid := gen_random_uuid();   -- reporter A
  rb uuid := gen_random_uuid();   -- reporter B
  t1 uuid := gen_random_uuid();   -- target 1
  t2 uuid := gen_random_uuid();   -- target 2
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ra), (rb), (t1), (t2);
  insert into public.clients(id, name) values (ra, 'Reporter A'), (rb, 'Reporter B')
    on conflict (id) do nothing;
  perform set_config('b5b.rib_ra', ra::text, true);
  perform set_config('b5b.rib_rb', rb::text, true);
  perform set_config('b5b.rib_t1', t1::text, true);
  perform set_config('b5b.rib_t2', t2::text, true);
end $$;

-- ══ 1. DUPLICATE PROTECTION — the primary control ═════════════════════════
do $$
declare
  ra uuid := current_setting('b5b.rib_ra')::uuid;
  rb uuid := current_setting('b5b.rib_rb')::uuid;
  t1 uuid := current_setting('b5b.rib_t1')::uuid;
  t2 uuid := current_setting('b5b.rib_t2')::uuid;
  v_n integer; v_case uuid;
begin
  perform pg_temp.act(ra);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
  values (ra, 'client', 'harassment', t1);
  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = ra and r.reported_user_id = t1;
  perform pg_temp.chk('reportbounds', 'a first report opens a case', '1', v_n::text);

  -- A SECOND report about the same person, while the first is live, APPENDS.
  perform pg_temp.act(ra);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id,
                             notes)
  values (ra, 'client', 'safety_concern', t1, 'it got worse');
  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = ra and r.reported_user_id = t1;
  perform pg_temp.chk('reportbounds', 'a second report about the same person opens NO new case',
    '1', v_n::text);

  -- BUT THE REPORT ITSELF IS KEPT. Nothing a person wrote is discarded — the
  -- second row exists and the operator can read it.
  select count(*) into v_n from public.reports
   where reporter_user_id = ra and reported_user_id = t1;
  perform pg_temp.chk('reportbounds', 'and BOTH reports are still recorded', '2', v_n::text);

  -- And the operator is told, on the case they are already reading.
  select c.id into v_case from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = ra and r.reported_user_id = t1;
  select count(*) into v_n from public.operator_case_events
   where case_id = v_case and action = 'noted' and note like '%Further report%';
  perform pg_temp.chk('reportbounds', 'the case history records the further report',
    '1', v_n::text);
  -- The changed CATEGORY is in the note, because someone moving from "service
  -- issue" to "safety concern" is telling the operator something about the same
  -- situation, and two cases would split that story in half.
  select count(*) into v_n from public.operator_case_events
   where case_id = v_case and note like '%safety_concern%';
  perform pg_temp.chk('reportbounds', 'including the changed reason', '1', v_n::text);

  -- A DIFFERENT TARGET is a different case.
  perform pg_temp.act(ra);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
  values (ra, 'client', 'harassment', t2);
  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = ra;
  perform pg_temp.chk('reportbounds', 'a different target gets its own case', '2', v_n::text);

  -- A DIFFERENT REPORTER IS NEVER MERGED. Two people reporting the same person
  -- are two independent signals, and collapsing them would hide the one fact an
  -- operator most needs — that it is not just one person complaining.
  perform pg_temp.act(rb);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
  values (rb, 'client', 'harassment', t1);
  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reported_user_id = t1;
  perform pg_temp.chk('reportbounds',
    'a SECOND REPORTER about the same person is never merged into the first', '2', v_n::text);
end $$;

-- A CLOSED case does not absorb a new report: that is a NEW question about
-- someone already looked at, which is more urgent rather than less.
do $$
declare
  ra uuid := current_setting('b5b.rib_ra')::uuid;
  t1 uuid := current_setting('b5b.rib_t1')::uuid;
  v_case uuid; v_n integer;
begin
  perform pg_temp.act_service();
  select c.id into v_case from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = ra and r.reported_user_id = t1;
  perform public.operator_update_case(v_case, 'dismissed',
    current_setting('b5b.rw_xu')::uuid, 'nothing found');

  perform pg_temp.act(ra);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
  values (ra, 'client', 'safety_concern', t1);
  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = ra and r.reported_user_id = t1;
  perform pg_temp.chk('reportbounds',
    'a report AFTER the case closed opens a new one', '2', v_n::text);
end $$;

-- ══ 2. THE RATE LIMIT — a backstop, and only that ═════════════════════════
do $$
declare
  rc uuid := gen_random_uuid();
  tgt uuid := current_setting('b5b.rib_t2')::uuid;
  v_code text; v_i integer; v_n integer; v_targets uuid[];
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (rc);
  insert into public.clients(id, name) values (rc, 'Flooder') on conflict (id) do nothing;
  -- Six real target users: `reported_user_id` has an FK to auth.users, so a
  -- random uuid is refused by the constraint rather than by the limit — which
  -- would have made this suite pass for the wrong reason.
  -- Held in an array rather than a temp table: the inserts below run as
  -- `authenticated`, which holds no privilege on a temp table created by the
  -- owner, and the resulting 42501 would have looked like the limit firing.
  for v_i in 1..6 loop
    v_targets[v_i] := gen_random_uuid();
    insert into auth.users(id) values (v_targets[v_i]);
  end loop;

  -- Five land. DISTINCT targets, so duplicate protection is not what stops them
  -- and the sixth refusal can only be the backstop.
  perform pg_temp.act(rc);
  for v_i in 1..5 loop
    insert into public.reports(reporter_user_id, report_type, report_reason, notes,
                               reported_user_id)
    values (rc, 'client', 'other', 'n=' || v_i,
            v_targets[v_i]);
  end loop;
  perform pg_temp.act_service();
  select count(*) into v_n from public.reports where reporter_user_id = rc;
  perform pg_temp.chk('reportbounds', 'five reports in an hour are accepted', '5', v_n::text);

  -- The sixth is refused, with its own SQLSTATE so the client can keep the text.
  perform pg_temp.act(rc);
  begin
    insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values (rc, 'client', 'other', v_targets[6]);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reportbounds', 'the sixth in an hour is refused with PT428',
    'PT428', v_code);

  -- AND NOTHING WAS WRITTEN. A refused report must not half-land.
  perform pg_temp.act_service();
  select count(*) into v_n from public.reports where reporter_user_id = rc;
  perform pg_temp.chk('reportbounds', 'and no sixth row was written', '5', v_n::text);

  -- THE EXEMPTION THAT MATTERS. service_role carries no auth.uid() — it is
  -- migrations, ops scripts and the operator surface, not a person filing
  -- reports — so the backstop does not apply to it. A fix that throttled the
  -- service path would break account erasure and seeding.
  begin
    insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values (rc, 'client', 'other', tgt);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reportbounds', 'service_role is exempt from the backstop', 'OK', v_code);
end $$;

-- ══ 3. WHAT THE BOUND MUST NOT TAKE AWAY ══════════════════════════════════
--
-- The half that decides whether this is safe to ship.
do $$
declare
  rd uuid := gen_random_uuid();
  blocked_target uuid := gen_random_uuid();
  v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (rd), (blocked_target);
  insert into public.clients(id, name) values (rd, 'Blocker') on conflict (id) do nothing;
  insert into public.user_blocks(blocker_user_id, blocked_user_id)
  values (rd, blocked_target);

  -- NO STANDING REQUIREMENT. `rd` has never transacted with `blocked_target` —
  -- no booking, no conversation, no trade. A bystander who saw something in the
  -- feed must still be able to say so, and requiring a prior booking would
  -- silence exactly the reports with no other route in.
  perform pg_temp.act(rd);
  begin
    insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values (rd, 'client', 'safety_concern', blocked_target);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reportbounds',
    'a stranger with no transaction may still report someone', 'OK', v_code);

  -- BLOCKING SOMEONE DOES NOT STOP YOU REPORTING THEM. The two acts are
  -- independent and a person will often do both, usually in that order.
  --
  -- The block is confirmed as SERVICE_ROLE, because `contact_blocked` is revoked
  -- from `authenticated` — it was an oracle until 20261055000000 and calling it
  -- from a client session is exactly what must stay impossible.
  perform pg_temp.act_service();
  perform pg_temp.chk('reportbounds', 'and the pair really is blocked', 'true',
    public.contact_blocked(rd, blocked_target)::text);
  select count(*) into v_n from public.operator_cases c join public.reports r on r.id = c.report_id
   where r.reporter_user_id = rd;
  perform pg_temp.chk('reportbounds', 'and it opened a case like any other', '1', v_n::text);
end $$;

-- ══ 4. THE LIMIT CANNOT BE FORGED ═════════════════════════════════════════
--
-- Counted against auth.uid(), never against the client-supplied reporter column.
-- The INSERT policy already pins those to each other, but a limit that trusted a
-- column the client supplies would be no limit at all — and the policy could be
-- widened by someone who did not know this depended on it.
select pg_temp.chk('reportbounds', 'the backstop counts auth.uid(), not the supplied column',
  '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_report_rate_limit'
      and p.prosrc like '%r.reporter_user_id = v_uid%'));
-- And it sorts LAST, so a report refused for any other reason does not consume
-- the reporter's budget. `zz_` LEADING — 20261058000000's lesson, where
-- `bookings_zz_` sorted on 'b' and ran first.
select pg_temp.chk('reportbounds', 'the backstop trigger fires last on reports',
  'zz_reports_rate_limit',
  (select tgname from pg_trigger where tgrelid = 'public.reports'::regclass
     and not tgisinternal order by tgname desc limit 1));
select pg_temp.act_service();
