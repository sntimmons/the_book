-- No-show reporting and Under Review (20261012000000, 20261013000000).
--
-- Runs AFTER receiver_window.test.sql and deliberately reuses its fixture helpers
-- (`pg_temp.rw_agreement`, `rw_of`, `rw_age_terms`, `rw_due`) rather than defining a second,
-- drifting copy. All suites are concatenated into ONE transaction, so those functions are in
-- scope here.
--
-- HOW A PAST APPOINTMENT IS REACHED. `scheduled_at` must be in the FUTURE when a proposal is
-- written, so an arrived appointment cannot occur naturally inside one transaction. The suite
-- ages the ACCEPTED TERM and re-derives the obligation pair through production code — the same
-- legitimate route receiver_window.test.sql uses, and NOT a privileged UPDATE of a contract
-- field, which `20261011000000` § 3b forbids for everyone including service_role.
--
-- RACES. This harness runs in one transaction and cannot stage one. The no-show races are
-- proven separately in scripts/negotiation-concurrency.mjs; what is pinned here is every
-- invariant a race could violate — one report per obligation, an immutable original timestamp,
-- and idempotence returning the first report rather than a second.

create or replace function pg_temp.ns_report_state(p_uid uuid, p_ob uuid)
returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act(p_uid);
  select case when b.under_review then 'under_review' else 'not_under_review' end into v
    from public.my_barter_obligations b where b.id = p_ob;
  return coalesce(v, 'NOT VISIBLE');
end $$;

-- A confirmed trade whose owner-side appointment has already ARRIVED, built only through
-- legitimate paths. Returns the agreement and the owner-side obligation, whose RECEIVER is the
-- responder.
-- The timings are chosen so that after ageing the APPOINTMENT is in the past while the DUE
-- DATE is still in the future. That is the shape the rule is actually about: a receiver does
-- NOT have to wait out the delivery window to say a booking was missed, and a fixture where
-- both had passed would let a `due_at`-based implementation pass by accident.
create or replace function pg_temp.ns_arrived(
  p_ou uuid, p_ru uuid, p_tag text, p_by interval default interval '25 days',
  out o_ag uuid, out o_ob uuid
)
language plpgsql as $$
begin
  o_ag := pg_temp.rw_agreement(
    p_ou, p_ru, p_tag,
    pg_temp.rw_due(30), pg_temp.rw_due(20),   -- owner side: due and SCHEDULED
    pg_temp.rw_due(30), null                  -- responder side: due only, NO schedule
  );
  perform pg_temp.rw_age_terms(o_ag, p_by);
  o_ob := pg_temp.rw_of(o_ag, 'offer_owner');
end $$;

-- Its OWN three provider-backed identities, not the shared cast: barter needs two PROVIDERS on
-- both sides, and the shared `b5b.cu` is a client with no provider row. Creating them here also
-- keeps this suite independent of whatever state receiver_window.test.sql left on its own.
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'NS Owner', 'nso_'||substr(ou::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (ru, 'NS Resp', 'nsr_'||substr(ru::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (xu, 'NS Other', 'nsx_'||substr(xu::text,1,8));
  perform set_config('b5b.ns_ou', ou::text, true);
  perform set_config('b5b.ns_ru', ru::text, true);
  perform set_config('b5b.ns_xu', xu::text, true);
  perform pg_temp.act(null, 'anon');
end $$;

do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;   -- offer owner  (delivers the scheduled side)
  ru uuid := current_setting('b5b.ns_ru')::uuid;  -- responder    (RECEIVES the scheduled side)
  xu uuid := current_setting('b5b.ns_xu')::uuid;  -- unrelated outsider
  v_ag uuid; v_ob uuid; v_other uuid;
  v_ag2 uuid; v_ob2 uuid;
  v_code text; v_n integer; v_at timestamptz; v_at2 timestamptz;
  v_txt text;
begin
  -- ── 1. The receiver may report once the appointment has arrived ─────────
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns1');
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations
   where id = v_ob and receiver_user_id = ru and scheduled_at < now() and due_at > now();
  perform pg_temp.chk('no_show',
    'fixture: the appointment has passed while the due date has NOT — no waiting for due_at',
    '1', v_n::text);

  perform pg_temp.act(ru);
  begin
    v_at := public.report_barter_obligation_no_show(v_ob, 'They did not turn up.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'the RECEIVER can report a no-show once the scheduled time has passed', 'OK', v_code);
  perform pg_temp.chk('no_show', 'and the report is server-stamped, not null',
    'true', (v_at is not null)::text);

  -- ── 8. The timestamp is the SERVER's ────────────────────────────────────
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob
     and reporter_user_id = ru
     and created_at between now() - interval '1 minute' and now() + interval '1 minute';
  perform pg_temp.chk('no_show',
    'the report time is the server''s own clock, not a client value', '1', v_n::text);
  select count(*) into v_n from public.barter_obligation_no_show_reports r
    join public.barter_obligations o on o.id = r.obligation_id
   where r.obligation_id = v_ob
     and r.reporter_provider_id = o.receiver_provider_id
     and r.agreement_id = o.agreement_id
     and r.scheduled_at = o.scheduled_at;
  perform pg_temp.chk('no_show',
    'every identity on the report is derived from the obligation', '1', v_n::text);

  -- ── 11. The report derives Under Review, obligation-granular ────────────
  perform pg_temp.chk('no_show', 'the reported obligation is under review',
    'under_review', pg_temp.ns_report_state(ru, v_ob));
  v_other := pg_temp.rw_of(v_ag, 'responder');
  perform pg_temp.chk('no_show',
    'and the OTHER obligation is untouched — review is per obligation',
    'not_under_review', pg_temp.ns_report_state(ru, v_other));
  perform pg_temp.act(ou);
  perform pg_temp.chk('no_show', 'the deliverer sees the same review state on their side',
    'under_review', pg_temp.ns_report_state(ou, v_ob));

  -- Agreement-level roll-up is true, and is a DISPLAY fact over both sides.
  perform pg_temp.act(ru);
  select count(*) into v_n from public.my_trade_activity
   where agreement_id = v_ag and agreement_under_review and my_under_review
     and not their_under_review;
  perform pg_temp.chk('no_show',
    'agreement-level review is true while only the receiver''s side is', '1', v_n::text);

  -- ── 9 & 10. Idempotent, and the original is never overwritten ───────────
  perform pg_temp.act(ru);
  begin
    v_at2 := public.report_barter_obligation_no_show(v_ob, 'A completely different reason.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show', 'a repeat report is SAFE, not an error', 'OK', v_code);
  perform pg_temp.chk('no_show', 'and returns the ORIGINAL timestamp',
    'true', (v_at2 = v_at)::text);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show', 'exactly one report exists, never a duplicate',
    '1', v_n::text);
  select reason into v_txt from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show',
    'and the original words were not silently rewritten by the repeat',
    'They did not turn up.', v_txt);

  -- ── 10. The report is immutable, and cannot be withdrawn ────────────────
  perform pg_temp.act(ru);
  perform pg_temp.chk_blocked('no_show', 'the reporter cannot edit their own report',
    format('update public.barter_obligation_no_show_reports set reason = ''changed''
             where obligation_id = %L', v_ob));
  perform pg_temp.chk_blocked('no_show', 'nor delete it — a report cannot be withdrawn',
    format('delete from public.barter_obligation_no_show_reports where obligation_id = %L',
           v_ob));
  perform pg_temp.chk_blocked('no_show', 'nor move its timestamp',
    format('update public.barter_obligation_no_show_reports set created_at = now()
             where obligation_id = %L', v_ob));
  perform pg_temp.chk_blocked('no_show', 'and cannot insert one directly, bypassing the RPC',
    format('insert into public.barter_obligation_no_show_reports
              (obligation_id, agreement_id, reporter_user_id, reporter_provider_id,
               scheduled_at)
            values (%L, %L, %L, (select id from public.providers where user_id = %L), now())',
           v_other, v_ag, ru, ru));
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob and reason = 'They did not turn up.';
  perform pg_temp.chk('no_show', 'and none of those attempts changed the row', '1', v_n::text);

  -- ── 12 & 13 & 18. No outcome, no reputation, no terminal state ──────────
  perform pg_temp.act_service();
  select status into v_txt from public.barter_obligations where id = v_ob;
  perform pg_temp.chk('no_show',
    'the reported obligation is STILL pending — no automatic Unfulfilled', 'pending', v_txt);
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_obligations'
     and column_name in ('under_review', 'no_show', 'no_show_at', 'outcome', 'verdict',
                         'fault', 'resolution', 'adjudicated_at', 'reputation');
  perform pg_temp.chk('no_show',
    'no outcome, verdict, fault, resolution or reputation column was added', '0', v_n::text);
  select count(*) into v_n from pg_constraint
   where conname = 'barter_obligations_status_check'
     and pg_get_constraintdef(oid) like
         '%''pending''%''delivered''%''received''%''not_received''%';
  perform pg_temp.chk('no_show',
    'the four-value status vocabulary is unchanged — Under Review is not a status',
    '1', v_n::text);
  -- ADJUDICATION EXISTS NOW (20261019000000), and this pin was written before it did. What it
  -- still guards is what it always meant: this slice creates no AUTOMATIC outcome. The three
  -- objects the adjudication migration added are exempted by name — a fourth, or anything
  -- reputation- or penalty-shaped, still fails. The agreement-level roll-up vocabulary
  -- (`closed_without`, `partially`, `not_completed`) remains banned outright: it is REFUSED PERMANENTLY by PD-070, not deferred.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname ~* 'adjudicat|fulfil|unfulfil|reputation|verdict|penalt|refund'
          or p.proname ~* 'closed_without|partially|not_completed')
     and p.proname not in ('adjudicate_barter_obligation',
                           'enforce_barter_adjudication_append_only',
                           'enforce_barter_adjudication_consistent',
                           -- Reviews Phase 2. `provider_reputation` matches
                           -- `reputation` but is not in the domain this pin
                           -- guards: it computes a BOOKING-review aggregate and
                           -- PD-027/PD-028 have always anticipated one. Exempted
                           -- by name, the same mechanism the three above use —
                           -- and the assertion immediately below keeps the
                           -- exemption honest by proving it touches no barter
                           -- object, so this cannot quietly become the hole the
                           -- pin exists to prevent.
                           'provider_reputation',
                           'recompute_provider_rating_for',
                           -- Three more from the PM rulings on the same branch:
                           -- the single canonical definition the two above
                           -- delegate to, and the invariant that refuses a stored
                           -- rating the canonical query does not produce (OQ-079).
                           -- Both are booking-review objects; the assertion below
                           -- proves they read no barter table.
                           'provider_reputation_canonical',
                           'reputation_is_derived');
  perform pg_temp.chk('no_show',
    'no fulfilment, reputation, penalty or refund function beyond the ruled adjudication',
    '0', v_n::text);
  -- The exemption above is only safe while it stays true. A reputation function
  -- that learned to read barter would be exactly the thing this pin bans, wearing
  -- an approved name.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('provider_reputation', 'recompute_provider_rating_for',
                       'provider_reputation_canonical', 'reputation_is_derived')
     and p.prosrc ~* 'barter';
  perform pg_temp.chk('no_show',
    'and the exempted reputation functions read no barter object', '0', v_n::text);

  select count(*) into v_n from information_schema.tables
   where table_schema = 'public'
     and (table_name ~* 'adjudicat|reputation|verdict|penalt'
          or table_name ~* 'review_case|review_decision|outcome')
     and table_name <> 'barter_obligation_adjudications';
  perform pg_temp.chk('no_show',
    'no review-case, outcome or reputation TABLE beyond the adjudication record', '0', v_n::text);
  select count(*) into v_n from pg_extension where extname in ('pg_cron', 'pg_timetable');
  perform pg_temp.chk('no_show',
    'no scheduler was installed — nothing escalates on a timer', '0', v_n::text);

  -- ── 19. History is retained ─────────────────────────────────────────────
  select count(*) into v_n from public.barter_obligations where agreement_id = v_ag;
  perform pg_temp.chk('no_show', 'both obligations survive a report', '2', v_n::text);
  select count(*) into v_n from public.barter_agreements where id = v_ag;
  perform pg_temp.chk('no_show', 'and so does the agreement', '1', v_n::text);
end $$;

-- ── Authority, timing and eligibility ──────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_other uuid; v_code text; v_n integer;
  v_c1 text; v_c2 text; v_c3 text; v_c4 text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns2');
  v_other := pg_temp.rw_of(v_ag, 'responder');

  -- ── 4. The deliverer cannot report themselves as a no-show ──────────────
  perform pg_temp.act(ou);
  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'the DELIVERER cannot report themselves as a no-show', '42501', v_code);

  -- ── 5. An unrelated user cannot report, and learns nothing ──────────────
  perform pg_temp.act(xu);
  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show', 'an unrelated provider cannot report', '23514', v_code);
  -- NOT AN EXISTENCE ORACLE: the same code and message as a non-existent id.
  begin
    perform public.report_barter_obligation_no_show(gen_random_uuid());
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'and gets the same refusal as for an id that does not exist', '23514', v_code);
  select count(*) into v_n from public.my_barter_obligations where id = v_ob;
  perform pg_temp.chk('no_show', 'an unrelated provider cannot even see the obligation',
    '0', v_n::text);

  -- ── 17. An unrelated user cannot read the review state ──────────────────
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where agreement_id = v_ag;
  perform pg_temp.chk('no_show', 'nor read any no-show report on it', '0', v_n::text);
  select count(*) into v_n from public.my_trade_activity where agreement_id = v_ag;
  perform pg_temp.chk('no_show', 'nor the trade activity row', '0', v_n::text);

  -- ── 6. anon can do nothing at all ───────────────────────────────────────
  -- Codes are captured WHILE anon and asserted after switching back: `chk` writes to a temp
  -- table anon cannot insert into, so asserting in place would fail on the harness rather than
  -- on the thing under test.
  perform pg_temp.act(null, 'anon');
  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  begin
    perform 1 from public.barter_obligation_no_show_reports;
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  begin
    perform public.barter_obligation_under_review('delivered', true, false);
    v_c3 := 'ALLOWED';
  exception when others then v_c3 := sqlstate;
  end;
  begin
    perform public.barter_can_report_no_show(now(), 'pending', false, false, now());
    v_c4 := 'ALLOWED';
  exception when others then v_c4 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('no_show', 'anon cannot call the report RPC', '42501', v_c1);
  perform pg_temp.chk('no_show', 'anon cannot read the reports table', '42501', v_c2);
  perform pg_temp.chk('no_show', 'anon cannot call the under-review function', '42501', v_c3);
  perform pg_temp.chk('no_show', 'anon cannot call the eligibility function', '42501', v_c4);

  -- ── 3. No schedule means no appointment to miss ─────────────────────────
  -- `v_other` is the responder-side obligation, which has due_at only. Its receiver is the
  -- OFFER OWNER, so this also proves the rule is about the obligation, not about the person.
  perform pg_temp.act(ou);
  begin
    perform public.report_barter_obligation_no_show(v_other);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'an obligation with NO scheduled time cannot have a no-show', '55000', v_code);
  perform pg_temp.chk('no_show', 'and the server does not offer the control for it',
    'false', (select can_report_no_show::text from public.my_barter_obligations
               where id = v_other));
end $$;

-- ── 2. Cannot report before the scheduled time ─────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text;
begin
  -- NOT aged: the appointment is genuinely in the future.
  v_ag := pg_temp.rw_agreement(ou, ru, 'ns3',
    pg_temp.rw_due(20), pg_temp.rw_due(15), pg_temp.rw_due(20), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');

  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'a no-show cannot be reported BEFORE the scheduled time', '55000', v_code);
  perform pg_temp.chk('no_show', 'and the control is not offered before it either',
    'false', (select can_report_no_show::text from public.my_barter_obligations
               where id = v_ob));
  perform pg_temp.chk('no_show', 'the obligation is not under review',
    'not_under_review', pg_temp.ns_report_state(ru, v_ob));

  -- The boundary is the SERVER's clock. A client cannot bring the appointment forward: there is
  -- no `p_as_of` on the RPC at all, so there is nothing to pass.
  perform pg_temp.act_service();
  perform pg_temp.chk('no_show',
    'the report RPC takes no caller-supplied time — only an obligation and a reason',
    '2', (select pronargs::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'report_barter_obligation_no_show'));
end $$;

-- ── 7. A de-approved participant keeps authority on an existing agreement ──
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_was boolean;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns4');

  perform pg_temp.act_service();
  select is_approved into v_was from public.providers where user_id = ru;
  update public.providers set is_approved = false where user_id = ru;

  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'a de-approved receiver keeps authority over a trade they were already in',
    'OK', v_code);

  perform pg_temp.act_service();
  update public.providers set is_approved = v_was where user_id = ru;
end $$;

-- ── 14. not_received qualifies for Under Review on its own ─────────────────
-- The receiver who already said "I did not get it" is heard WITHOUT having to file a second
-- complaint. This is the "do not force users to duplicate the same complaint" rule.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_code text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns5');

  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_not_received(v_ob);

  perform pg_temp.chk('no_show',
    'a not_received answer puts the obligation under review with NO no-show report',
    'under_review', pg_temp.ns_report_state(ru, v_ob));
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show', 'and no report was invented to achieve it', '0', v_n::text);
  perform pg_temp.chk('no_show',
    'the status stays not_received — review is not a status', 'not_received',
    (select status from public.barter_obligations where id = v_ob));

  -- PD-058 still holds: the answer is immutable and is not a verdict.
  perform pg_temp.act(ru);
  begin
    perform public.confirm_barter_obligation_received(v_ob);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'and it cannot be flipped afterwards — PD-058 is untouched', 'PT412', v_code);

  -- The two are DISTINCT facts, so a no-show may still be filed alongside a not_received.
  begin
    perform public.report_barter_obligation_no_show(v_ob, 'They never showed either.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'a no-show may still be recorded alongside not_received — they are different facts',
    'OK', v_code);
end $$;

-- ── An explicitly RECEIVED obligation cannot be reported ───────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns6');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act(ru);
  perform public.confirm_barter_obligation_received(v_ob);

  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'a receiver who confirmed receipt cannot then report a no-show', 'PT412', v_code);
  perform pg_temp.chk('no_show', 'and a confirmed obligation is not under review',
    'not_under_review', pg_temp.ns_report_state(ru, v_ob));
  perform pg_temp.chk('no_show', 'nor is the control offered for it',
    'false', (select can_report_no_show::text from public.my_barter_obligations
               where id = v_ob));
end $$;

-- ── Delivery does not block a report, and a report does not erase delivery ─
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_del timestamptz; v_del2 timestamptz;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns7');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act_service();
  select delivered_at into v_del from public.barter_obligations where id = v_ob;

  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_no_show(v_ob, 'Marked delivered, but nobody came.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'a receiver may report a no-show even after the deliverer marked it delivered',
    'OK', v_code);

  perform pg_temp.act_service();
  select delivered_at into v_del2 from public.barter_obligations where id = v_ob;
  perform pg_temp.chk('no_show',
    'and delivered_at is NOT erased — the report stands beside it, it does not rewrite history',
    'true', (v_del2 = v_del)::text);
  perform pg_temp.chk('no_show', 'the status is still delivered, not an outcome',
    'delivered', (select status from public.barter_obligations where id = v_ob));
end $$;

-- ── 15. A cancelled agreement never enters Under Review ────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns8');

  -- Cancel first. Nothing is delivered, so the ordinary exit is still open.
  perform pg_temp.act(ru);
  perform public.cancel_barter_agreement(v_ag, null);

  begin
    perform public.report_barter_obligation_no_show(v_ob);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'a cancelled trade cannot be reported as a no-show', 'PT409', v_code);
  perform pg_temp.chk('no_show', 'and it is not under review',
    'not_under_review', pg_temp.ns_report_state(ru, v_ob));
  perform pg_temp.chk('no_show', 'nor is the control offered on it',
    'false', (select can_report_no_show::text from public.my_barter_obligations
               where id = v_ob));

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where agreement_id = v_ag;
  perform pg_temp.chk('no_show', 'and no report row was written', '0', v_n::text);

  -- Cancellation dominates the derivation even if a report somehow existed.
  perform pg_temp.chk('no_show',
    'the rule itself refuses review for a cancelled trade, whatever else is true',
    'false', public.barter_obligation_under_review('not_received', true, true)::text);
end $$;

-- ── 16. Both participants read the review state; nobody else does ──────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns9');
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_ob, 'No-one arrived.');

  perform pg_temp.act(ru);
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show', 'the reporter can read their own report', '1', v_n::text);
  perform pg_temp.act(ou);
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show',
    'and so can the DELIVERER — they must be able to see why their trade needs review',
    '1', v_n::text);
  perform pg_temp.act(xu);
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show', 'an unrelated provider reads nothing', '0', v_n::text);

  -- Neither participant may write to the table, whatever they can read.
  perform pg_temp.act(ou);
  perform pg_temp.chk_blocked('no_show', 'the deliverer cannot delete the report against them',
    format('delete from public.barter_obligation_no_show_reports where obligation_id = %L',
           v_ob));
  perform pg_temp.chk_blocked('no_show', 'nor edit its reason',
    format('update public.barter_obligation_no_show_reports set reason = ''untrue''
             where obligation_id = %L', v_ob));
end $$;

-- ── Object posture ─────────────────────────────────────────────────────────
do $$
declare v_n integer;
begin
  perform pg_temp.act_service();

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_obligation_under_review', 'barter_can_report_no_show')
     and not p.prosecdef
     and pg_get_userbyid(p.proowner) = 'postgres'
     and 'search_path=""' = any(p.proconfig);
  perform pg_temp.chk('no_show',
    'both derivation functions are invoker-rights, postgres-owned, search_path pinned',
    '2', v_n::text);

  -- Volatility declared honestly, per function: the review rule is pure boolean algebra and is
  -- genuinely IMMUTABLE; eligibility compares against a caller-supplied instant and is STABLE.
  perform pg_temp.chk('no_show', 'the under-review rule is IMMUTABLE — no clock, no calendar',
    'i', (select provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'barter_obligation_under_review'));
  perform pg_temp.chk('no_show', 'the eligibility rule is STABLE',
    's', (select provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'barter_can_report_no_show'));

  -- Neither reads a table, so neither is an existence oracle. Named tables and `auth.uid`,
  -- matching receiver_window's equivalent — a bare `from` also matches the word inside a
  -- comment, which proves nothing about what the function reads.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_obligation_under_review', 'barter_can_report_no_show')
     and (p.prosrc ilike '%barter_obligations%' or p.prosrc ilike '%barter_agreements%'
          or p.prosrc ilike '%no_show_reports%' or p.prosrc ilike '%auth.uid%');
  perform pg_temp.chk('no_show', 'and neither reads a table or the caller identity',
    '0', v_n::text);

  -- The RPC is definer, owned, pinned, and reachable only by authenticated.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'report_barter_obligation_no_show'
     and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
     and 'search_path=""' = any(p.proconfig);
  perform pg_temp.chk('no_show',
    'the report RPC is definer, postgres-owned and search_path pinned', '1', v_n::text);
  perform pg_temp.chk('no_show', 'authenticated may execute it',
    'true', has_function_privilege('authenticated',
      'public.report_barter_obligation_no_show(uuid, text)', 'execute')::text);
  perform pg_temp.chk('no_show', 'anon may not',
    'false', has_function_privilege('anon',
      'public.report_barter_obligation_no_show(uuid, text)', 'execute')::text);

  -- The table: RLS on, read-only to participants, no write grant to anyone.
  perform pg_temp.chk('no_show', 'RLS is enabled on the reports table',
    'true', (select relrowsecurity::text from pg_class
              where oid = 'public.barter_obligation_no_show_reports'::regclass));
  perform pg_temp.chk('no_show', 'authenticated may SELECT it',
    'true', has_table_privilege('authenticated',
      'public.barter_obligation_no_show_reports', 'select')::text);
  select count(*) into v_n from (
    select unnest(array['insert','update','delete','trigger']) as p) x
   where has_table_privilege('authenticated',
     'public.barter_obligation_no_show_reports', x.p);
  perform pg_temp.chk('no_show',
    'and holds NO insert, update, delete or trigger privilege on it', '0', v_n::text);
  select count(*) into v_n from (
    select unnest(array['select','insert','update','delete']) as p) x
   where has_table_privilege('anon', 'public.barter_obligation_no_show_reports', x.p);
  perform pg_temp.chk('no_show', 'anon holds nothing at all on it', '0', v_n::text);

  -- Exactly one read policy, and no write policy of any kind.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_obligation_no_show_reports'
     and cmd <> 'SELECT';
  perform pg_temp.chk('no_show',
    'there is no INSERT, UPDATE or DELETE policy — every write goes through the RPC',
    '0', v_n::text);

  -- ── 20. Zero residue: nothing this slice must not have created ──────────
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_obligations'
     and column_name not in ('id','agreement_id','source_term_id','side',
       'deliverer_provider_id','deliverer_user_id','receiver_provider_id','receiver_user_id',
       'agreed_description','due_at','scheduled_at','created_at','status','delivered_at',
       'receipt_responded_at');
  perform pg_temp.chk('no_show', 'no column was added to barter_obligations', '0', v_n::text);
  -- By NAME, not by count: an allowlist says WHICH triggers are expected, so a renamed or
  -- swapped trigger fails here instead of balancing the arithmetic.
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'barter_obligations' and not t.tgisinternal
     and t.tgname not in ('barter_obligations_immutable', 'barter_obligations_consistent',
                          'barter_obligations_starts_pending');
  perform pg_temp.chk('no_show', 'and no new trigger was added to it', '0', v_n::text);
end $$;

-- ── The eligibility column, asserted POSITIVE and asserted to flip ─────────
-- Every other assertion on `can_report_no_show` in this suite is negative. Without a positive
-- one, a regression that made `barter_can_report_no_show` return false unconditionally — a
-- mis-ordered argument in the view's call, say — would pass the whole suite while the feature
-- was simply unreachable in the UI.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns10');

  perform pg_temp.act(ru);
  perform pg_temp.chk('no_show',
    'the receiver IS offered the control on an arrived, unreported, live obligation',
    'true', (select can_report_no_show::text from public.my_barter_obligations
              where id = v_ob));

  -- ROLE-BLIND BY CONSTRUCTION, and recorded so nobody reads it as a per-caller capability.
  -- `barter_can_report_no_show` takes no identity, so the same row reads true for the DELIVERER
  -- too. The RPC refuses them (42501) and `obligationView` refuses them again, so no control is
  -- ever drawn — but a future consumer reading this column WITHOUT a role check would draw a
  -- button that can only fail. Asserted, not assumed, so the property is visible.
  perform pg_temp.act(ou);
  perform pg_temp.chk('no_show',
    'the column is role-blind — a consumer MUST apply the receiver check itself',
    'true', (select can_report_no_show::text from public.my_barter_obligations
              where id = v_ob));

  -- It flips the moment a report exists, which is what stops the control inviting a duplicate.
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_ob, 'nobody came');
  perform pg_temp.chk('no_show',
    'and it goes false the moment a report is filed, for the receiver',
    'false', (select can_report_no_show::text from public.my_barter_obligations
              where id = v_ob));
  perform pg_temp.act(ou);
  perform pg_temp.chk('no_show', 'and for the deliverer',
    'false', (select can_report_no_show::text from public.my_barter_obligations
              where id = v_ob));
end $$;

-- ── PD-063: Under Review takes precedence over ordinary cancellation ──────
--
-- This block replaces the earlier "pinned open question". The Founder has ruled: once a valid
-- no-show report exists, the ordinary pre-delivery exit is GONE. A trade cannot be cancelled out
-- of review, and a cancellation can never erase or hide a recorded report.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns11');
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_ob, 'they never arrived');
  perform pg_temp.chk('no_show', 'fixture: the trade is under review before the cancellation',
    'under_review', pg_temp.ns_report_state(ru, v_ob));

  -- B. REPORT FIRST → later ordinary cancellation REFUSED, for the reported party...
  perform pg_temp.act(ou);
  begin
    perform public.cancel_barter_agreement(v_ag, null);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'PD-063: the REPORTED party cannot cancel a trade that is under review', 'PT423', v_code);

  -- ...and for the reporter too. The rule is about the STATE, not about who is asking.
  perform pg_temp.act(ru);
  begin
    perform public.cancel_barter_agreement(v_ag, null);
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'PD-063: nor can the REPORTER — the exit is gone for both', 'PT423', v_code);

  -- Nothing was written, and nothing was erased.
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_ag;
  perform pg_temp.chk('no_show', 'no cancellation act was recorded', '0', v_n::text);
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob and reason = 'they never arrived';
  perform pg_temp.chk('no_show',
    'the report survives untouched — a cancellation cannot rewrite it', '1', v_n::text);
  perform pg_temp.chk('no_show', 'and the trade is STILL under review',
    'under_review', pg_temp.ns_report_state(ru, v_ob));

  -- A privileged direct insert is refused by the trigger too, not only by the RPC.
  perform pg_temp.act_service();
  perform pg_temp.chk_blocked('no_show',
    'and the row guard refuses a direct cancellation insert as well',
    format('insert into public.barter_agreement_cancellations
              (agreement_id, actor_user_id, actor_provider_id)
            values (%L, %L, (select id from public.providers where user_id = %L))',
           v_ag, ou, ou));
end $$;

-- ── PD-063 direction A: cancellation first → later report refused ─────────
-- Already covered above by the cancelled-trade case, and asserted again here beside its mirror
-- so the two halves of the approved boundary read as one rule rather than two accidents.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns12');
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_ag, null);

  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_no_show(v_ob, 'too late');
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('no_show',
    'PD-063: a no-show cannot be reported on an already-cancelled trade', 'PT409', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show', 'and no report row was written', '0', v_n::text);
  perform pg_temp.chk('no_show', 'the cancelled trade is NOT under review',
    'not_under_review', pg_temp.ns_report_state(ru, v_ob));

  -- The two states are mutually exclusive: never both, never compatible.
  select count(*) into v_n
    from public.barter_agreement_cancellations c
   where c.agreement_id = v_ag
     and exists (select 1 from public.barter_obligation_no_show_reports r
                  where r.agreement_id = v_ag);
  perform pg_temp.chk('no_show',
    'a cancellation and a no-show report NEVER coexist on one agreement', '0', v_n::text);
end $$;

-- ── PD-062: the reason is participant-visible context ─────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_txt text; v_n integer; v_c1 text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns13');
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_ob, 'Waited an hour, nobody came.');

  -- The REPORTER reads their own words back.
  perform pg_temp.act(ru);
  select no_show_reason into v_txt from public.my_barter_obligations where id = v_ob;
  perform pg_temp.chk('no_show', 'the reporter reads their own reason',
    'Waited an hour, nobody came.', v_txt);

  -- The DELIVERER reads it too — they must be able to see what was said about their trade.
  perform pg_temp.act(ou);
  select no_show_reason into v_txt from public.my_barter_obligations where id = v_ob;
  perform pg_temp.chk('no_show', 'and so does the other participant',
    'Waited an hour, nobody came.', v_txt);

  -- An unrelated provider reads NOTHING — not the reason, not the row, not the obligation.
  perform pg_temp.act(xu);
  select count(*) into v_n from public.my_barter_obligations where id = v_ob;
  perform pg_temp.chk('no_show', 'an unrelated provider cannot reach the reason at all',
    '0', v_n::text);
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob and reason is not null;
  perform pg_temp.chk('no_show', 'nor read it from the table directly', '0', v_n::text);

  -- anon reads nothing either.
  perform pg_temp.act(null, 'anon');
  begin
    perform 1 from public.my_barter_obligations where id = v_ob;
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('no_show', 'and anon cannot read the view carrying it', '42501', v_c1);
end $$;

-- ── PD-062: a no-show creates NO Needs Attention and NO terminal outcome ──
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_state text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns14');
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_ob, null);

  -- NEEDS ATTENTION IS A SEPARATE ROUTE AND IS UNTOUCHED. The obligation was never delivered,
  -- so its receiver window is `none` — and reporting a no-show did not manufacture one.
  perform pg_temp.act_service();
  select public.barter_receiver_window(
           o.status, o.delivered_at, o.scheduled_at, o.due_at, false, now())
    into v_state
    from public.barter_obligations o where o.id = v_ob;
  perform pg_temp.chk('no_show',
    'a no-show creates NO Needs Attention — the window state is untouched', 'none', v_state);

  -- Under Review survives and stays visible to both.
  perform pg_temp.chk('no_show', 'Under Review survives for the reporter',
    'under_review', pg_temp.ns_report_state(ru, v_ob));
  perform pg_temp.chk('no_show', 'and for the counterparty',
    'under_review', pg_temp.ns_report_state(ou, v_ob));

  -- No outcome, anywhere.
  perform pg_temp.act_service();
  perform pg_temp.chk('no_show', 'the obligation is still pending — no terminal outcome',
    'pending', (select status from public.barter_obligations where id = v_ob));
  select count(*) into v_n from public.barter_agreements
   where id = v_ag and officialized_at is not null;
  perform pg_temp.chk('no_show',
    'and the agreement is still just official — no terminal agreement state', '1', v_n::text);
end $$;

-- ── The reports table is in no realtime publication ───────────────────────
-- Same pin cancellation.test.sql carries for its sibling table: realtime is a delivery layer,
-- and a later `alter publication ... add table` would quietly open a second, unscoped read
-- channel for rows whose entire point is that exactly two people may read them.
do $$
declare v_n integer;
begin
  perform pg_temp.act_service();
  select count(*) into v_n from pg_publication_tables
   where schemaname = 'public' and tablename = 'barter_obligation_no_show_reports';
  perform pg_temp.chk('no_show',
    'the reports table is in NO realtime publication', '0', v_n::text);
end $$;

-- ── The report time is TRIGGER-stamped, not merely defaulted ──────────────
-- A DEFAULT is overridden by an explicit insert, so "server-stamped" is only true if a trigger
-- assigns it. This distinguishes the two: it supplies a `created_at` on a privileged insert and
-- asserts the server's value wins. The sibling assertion for cancellations
-- (`cancellation.test.sql`) is what caught the equivalent regression there.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_at timestamptz;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'ns15');

  -- BACKDATED. Accepted by the arrival check (it is after `scheduled_at`), so only the stamp
  -- can refuse to keep it.
  perform pg_temp.act_service();
  insert into public.barter_obligation_no_show_reports
    (obligation_id, agreement_id, reporter_user_id, reporter_provider_id, scheduled_at,
     created_at)
  select v_ob, v_ag, o.receiver_user_id, o.receiver_provider_id, o.scheduled_at,
         o.scheduled_at + interval '1 minute'
    from public.barter_obligations o where o.id = v_ob;
  select created_at into v_at from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show',
    'a supplied created_at is replaced by the server clock',
    'true', (v_at > now() - interval '5 minutes')::text);

  -- And a FAR-FUTURE value cannot be planted either.
  delete from public.barter_obligation_no_show_reports where obligation_id = v_ob;
  insert into public.barter_obligation_no_show_reports
    (obligation_id, agreement_id, reporter_user_id, reporter_provider_id, scheduled_at,
     created_at)
  select v_ob, v_ag, o.receiver_user_id, o.receiver_provider_id, o.scheduled_at,
         now() + interval '100 days'
    from public.barter_obligations o where o.id = v_ob;
  select created_at into v_at from public.barter_obligation_no_show_reports
   where obligation_id = v_ob;
  perform pg_temp.chk('no_show', 'and a far-future one is replaced too',
    'true', (v_at < now() + interval '5 minutes')::text);
end $$;

-- ── The lock order is pinned STRUCTURALLY, not only behaviourally ─────────
-- `20261012000000` shipped a confidently-worded, FALSE lock-order contract and a real deadlock
-- followed; `20261014000000` fixed it. A `create or replace` could silently undo that, and the
-- behavioural proof lives in scripts/negotiation-concurrency.mjs, which is not part of B5B.
-- This asserts the ORDER from `prosrc`, comments stripped — the same mechanism messaging.test.sql
-- uses to keep its `for update` lock from being deleted by a future body rewrite.
do $$
declare v_src text; v_ag_pos integer; v_ob_pos integer;
begin
  perform pg_temp.act_service();
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'report_barter_obligation_no_show';

  -- Whitespace-normalised so reformatting cannot break the match, comments already stripped so
  -- a comment mentioning either table cannot satisfy it.
  v_src := regexp_replace(v_src, '\s+', ' ', 'g');
  v_ag_pos := position('public.barter_agreements ag where ag.id = v_ag for update' in v_src);
  v_ob_pos := position('public.barter_obligations o where o.id = p_obligation_id for update'
                       in v_src);
  perform pg_temp.chk('no_show',
    'the no-show RPC takes the AGREEMENT lock explicitly', 'true', (v_ag_pos > 0)::text);
  perform pg_temp.chk('no_show',
    'and the obligation lock explicitly', 'true', (v_ob_pos > 0)::text);
  -- THE ORDER ITSELF. Reversing the two statements makes this fail, which is the whole point:
  -- the deadlock 20261014000000 fixed was REPRODUCED, and the behavioural proof lives in a
  -- harness that is not part of B5B.
  perform pg_temp.chk('no_show',
    'and takes the agreement lock BEFORE the obligation — the order cancel_barter_agreement uses',
    'true', (v_ag_pos > 0 and v_ob_pos > 0 and v_ag_pos < v_ob_pos)::text);

  -- And PD-063's refusal is still in the cancellation RPC's live body.
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_barter_agreement';
  perform pg_temp.chk('no_show',
    'cancel_barter_agreement still refuses a reported trade (PD-063)',
    'true', (position('barter_obligation_no_show_reports' in v_src) > 0
             and position('PT423' in v_src) > 0)::text);

  -- And the actor binding 20261015000000 briefly reverted is still in the trigger.
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_barter_cancellation_consistent';
  perform pg_temp.chk('no_show',
    'the cancellation trigger still server-stamps created_at',
    'true', (position('new.created_at := clock_timestamp()' in
                      regexp_replace(v_src, '\s+', ' ', 'g')) > 0)::text);
  perform pg_temp.chk('no_show',
    'and still binds the actor to the caller',
    'true', (position('new.actor_user_id <> v_uid' in
                      regexp_replace(v_src, '\s+', ' ', 'g')) > 0)::text);
end $$;
