-- Manual operator adjudication and the three terminal OBLIGATION outcomes
-- (20261019000000, 20261020000000, 20261021000000).
--
-- Runs after receiver_window.test.sql and no_show_under_review.test.sql and reuses fixture
-- helpers from BOTH: `pg_temp.ns_arrived` from the no-show suite, and `pg_temp.rw_expired` /
-- `rw_agreement` / `rw_of` / `rw_age_terms` / `rw_backdate_delivery` from the receiver-window
-- suite — `rw_expired` is called DIRECTLY here, not reached through `ns_arrived`. All suites are
-- concatenated into ONE transaction, so those are in scope, and the registration order in
-- `scripts/db-security-test.mjs` is what makes them defined by the time this file runs.
--
-- HOW AN ELIGIBLE OBLIGATION IS REACHED. Adjudication requires the obligation to be UNDER REVIEW,
-- which is exactly PD-062's two routes: a no-show report, or a `not_received` answer. Both are
-- produced here through the real RPCs, never by writing state directly.
--
-- WHO ADJUDICATES. `adjudicate_barter_obligation` is granted to `service_role` ALONE, so these
-- blocks call it in the harness's privileged context — which is the only context that exists for
-- it. The participant-refusal cases below prove the absence of any other.

create or replace function pg_temp.adj_outcome(p_uid uuid, p_ob uuid)
returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act(p_uid);
  select coalesce(b.terminal_outcome, 'NONE') into v
    from public.my_barter_obligations b where b.id = p_ob;
  perform pg_temp.act_service();
  return coalesce(v, 'NOT VISIBLE');
end $$;

-- An obligation that is UNDER REVIEW via a no-show report, built only through real paths.
create or replace function pg_temp.adj_reported(
  p_ou uuid, p_ru uuid, p_tag text, out o_ag uuid, out o_ob uuid
)
language plpgsql as $$
declare v_ag uuid; v_ob uuid;
begin
  select n.o_ag, n.o_ob into v_ag, v_ob from pg_temp.ns_arrived(p_ou, p_ru, p_tag) n;
  perform pg_temp.act(p_ru);
  perform public.report_barter_obligation_no_show(v_ob, 'nobody came');
  perform pg_temp.act_service();
  o_ag := v_ag; o_ob := v_ob;
end $$;

-- An obligation UNDER REVIEW via `not_received`.
create or replace function pg_temp.adj_not_received(
  p_ou uuid, p_ru uuid, p_tag text, out o_ag uuid, out o_ob uuid
)
language plpgsql as $$
declare v_ag uuid; v_ob uuid;
begin
  select n.o_ag, n.o_ob into v_ag, v_ob from pg_temp.ns_arrived(p_ou, p_ru, p_tag) n;
  perform pg_temp.act(p_ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act(p_ru);
  perform public.report_barter_obligation_not_received(v_ob);
  perform pg_temp.act_service();
  o_ag := v_ag; o_ob := v_ob;
end $$;

-- ── 1-5. The three outcomes, from both Under Review sources ───────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer; v_txt text;
begin
  -- 1 + 4. Fulfilled, from a NO-SHOW report.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj1');
  perform pg_temp.act_service();
  begin
    v_txt := public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'Evidence supported it.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'an Under Review obligation (no-show source) can be adjudicated FULFILLED', 'OK', v_code);
  perform pg_temp.chk('adjudication', 'and the outcome is returned', 'fulfilled', v_txt);

  -- 2 + 5. Unfulfilled, from a NOT_RECEIVED answer.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_not_received(ou, ru, 'adj2');
  perform pg_temp.act_service();
  begin
    v_txt := public.adjudicate_barter_obligation(v_ob, 'unfulfilled', xu, 'Nothing was provided.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'an Under Review obligation (not_received source) can be adjudicated UNFULFILLED',
    'OK', v_code);
  perform pg_temp.chk('adjudication', 'and the outcome is returned', 'unfulfilled', v_txt);

  -- 3. Closed without resolution.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj3');
  perform pg_temp.act_service();
  begin
    v_txt := public.adjudicate_barter_obligation(
      v_ob, 'closed_without_resolution', xu, 'Both accounts are plausible; no evidence either way.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'an Under Review obligation can be CLOSED WITHOUT RESOLUTION', 'OK', v_code);
  perform pg_temp.chk('adjudication', 'and the outcome is returned',
    'closed_without_resolution', v_txt);

  -- Only the three exist.
  perform pg_temp.act_service();
  select count(*) into v_n from pg_constraint
   where conname = 'barter_obligation_adjudications_outcome_check'
     and pg_get_constraintdef(oid) like
         '%''fulfilled''%''unfulfilled''%''closed_without_resolution''%';
  perform pg_temp.chk('adjudication', 'exactly three terminal outcomes exist', '1', v_n::text);
end $$;

-- ── 6-8. What does NOT qualify ────────────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_state text;
begin
  -- 7. DELIVERED alone is not Under Review.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'adj4');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act_service();
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'too early');
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'a merely DELIVERED obligation cannot be adjudicated', '55000', v_code);

  -- 6. NEEDS ATTENTION alone is not Under Review either. The window is elapsed and unanswered.
  -- `rw_expired` is the receiver-window suite's own elapsed fixture — an UNSCHEDULED obligation,
  -- delivered and aged past its deadline — reused rather than reproduced, so "Needs Attention"
  -- here means exactly what it means there.
  --
  -- AGED by Correction 3 item X (20261039000000). OQ-071 — how a plain Needs Attention might
  -- enter Under Review — is now CLOSED, and this assertion is what proves the answer was the
  -- narrow one: a third route exists, but it is a DELIVERER'S EXPLICIT REQUEST and nothing else.
  -- An elapsed window on its own still qualifies for nothing, because no timer, no automatic
  -- escalation and no second deadline was created. The new route's own coverage — including that
  -- the same call SUCCEEDS once a request exists — is barter_review_request.test.sql § 10.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'adj4b');
  perform pg_temp.act_service();
  select public.barter_receiver_window(
           o.status, o.delivered_at, o.scheduled_at, o.due_at, false, now())
    into v_state from public.barter_obligations o where o.id = v_ob;
  perform pg_temp.chk('adjudication',
    'fixture: the obligation really is in Needs Attention', 'needs_attention', v_state);
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'unfulfilled', xu, 'window elapsed');
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'NEEDS ATTENTION alone still does NOT qualify — nothing escalates on its own',
    '55000', v_code);

  -- 8. A CANCELLED agreement cannot be adjudicated. Reported first, then cancelled is refused
  -- by PD-063 — so this uses the other order: cancel a live trade, then try to adjudicate.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'adj5');
  perform pg_temp.act(ru);
  perform public.cancel_barter_agreement(v_ag, null);
  perform pg_temp.act_service();
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'after cancellation');
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'a CANCELLED agreement cannot be adjudicated', 'PT409', v_code);
end $$;

-- ── 9-13. Authority, identity and timestamps ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_c1 text; v_c2 text; v_c3 text; v_n integer; v_at timestamptz;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj6');

  -- 9. A PARTICIPANT cannot adjudicate — and this is the load-bearing rule, so it is proven
  -- BOTH ways: the RPC is unreachable to them, AND naming one as adjudicator is refused even
  -- from the privileged path.
  perform pg_temp.act(ru);
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', ru, 'deciding my own trade');
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act(ou);
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', ou, 'deciding my own trade');
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  -- 10. An unrelated authenticated user cannot either.
  perform pg_temp.act(xu);
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'not my place');
    v_c3 := 'ALLOWED';
  exception when others then v_c3 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'the RECEIVER cannot adjudicate their own trade', '42501', v_c1);
  perform pg_temp.chk('adjudication',
    'nor can the DELIVERER', '42501', v_c2);
  perform pg_temp.chk('adjudication',
    'nor an unrelated authenticated user — no participant-facing RPC exists', '42501', v_c3);

  -- Even from the PRIVILEGED path, a participant may not be recorded as the adjudicator.
  perform pg_temp.act_service();
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', ru, 'operator names a party');
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'and a privileged caller cannot record a PARTICIPANT as the adjudicator', '42501', v_c1);

  -- 11. anon can do nothing.
  perform pg_temp.act(null, 'anon');
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'anon');
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  begin
    perform 1 from public.barter_obligation_adjudications;
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication', 'anon cannot adjudicate', '42501', v_c1);
  perform pg_temp.chk('adjudication', 'anon cannot read adjudications', '42501', v_c2);

  -- 12 + 13. Adjudicator and timestamp are server-derived and honest.
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'Resolved on the evidence.');
  select count(*) into v_n from public.barter_obligation_adjudications a
    join public.barter_obligations o on o.id = a.obligation_id
   where a.obligation_id = v_ob
     and a.adjudicator_user_id = xu
     and a.agreement_id = o.agreement_id
     and a.adjudicated_at between now() - interval '1 minute' and now() + interval '1 minute';
  perform pg_temp.chk('adjudication',
    'the adjudicator, agreement and timestamp are all derived and consistent', '1', v_n::text);

  -- The timestamp is TRIGGER-stamped, not merely defaulted: a supplied value is discarded.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj7');
  perform pg_temp.act_service();
  insert into public.barter_obligation_adjudications
    (obligation_id, agreement_id, outcome, adjudicator_user_id, rationale, adjudicated_at)
  values (v_ob, v_ag, 'unfulfilled', xu, 'direct privileged insert',
          timestamptz '2020-01-01 00:00:00+00');
  select adjudicated_at into v_at from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication',
    'a supplied adjudicated_at is replaced by the server clock',
    'true', (v_at > now() - interval '5 minutes')::text);
end $$;

-- ── 14. History is PRESERVED, not rewritten to match the outcome ──────────
-- The case the product turns on: a receiver said "Didn't receive", an operator later determined
-- `fulfilled`. Both facts stand. Editing the first to agree with the second would destroy the
-- evidence the second was reached from.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_del timestamptz; v_del2 timestamptz;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_not_received(ou, ru, 'adj8');
  perform pg_temp.act_service();
  select delivered_at into v_del from public.barter_obligations where id = v_ob;

  perform public.adjudicate_barter_obligation(
    v_ob, 'fulfilled', xu, 'Receiver reported not received; evidence shows it was provided.');

  select count(*) into v_n from public.barter_obligations
   where id = v_ob and status = 'not_received' and receipt_responded_at is not null;
  perform pg_temp.chk('adjudication',
    'the receiver''s not_received answer SURVIVES a contradicting Fulfilled outcome',
    '1', v_n::text);
  select delivered_at into v_del2 from public.barter_obligations where id = v_ob;
  perform pg_temp.chk('adjudication', 'and delivered_at is untouched',
    'true', (v_del2 = v_del)::text);

  -- The same for a no-show report and its reason.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj9');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'Attendance confirmed.');
  select count(*) into v_n from public.barter_obligation_no_show_reports
   where obligation_id = v_ob and reason = 'nobody came';
  perform pg_temp.chk('adjudication',
    'the no-show report and its reason survive a contradicting outcome', '1', v_n::text);
  select count(*) into v_n from public.barter_obligations
   where id = v_ob and scheduled_at is not null and due_at is not null;
  perform pg_temp.chk('adjudication', 'and scheduled_at / due_at are untouched', '1', v_n::text);
end $$;

-- ── 15-18. Immutability: no duplicate, no flip, no UPDATE, no DELETE ──────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer; v_txt text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj10');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'unfulfilled', xu, 'Not provided.');

  -- 15. A repeat of the SAME outcome is safe and creates nothing.
  begin
    v_txt := public.adjudicate_barter_obligation(v_ob, 'unfulfilled', xu, 'a different rationale');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication', 'a repeat of the SAME outcome is safe', 'OK', v_code);
  perform pg_temp.chk('adjudication', 'and returns the recorded outcome', 'unfulfilled', v_txt);
  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication', 'exactly one adjudication exists', '1', v_n::text);
  select rationale into v_txt from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication',
    'and the original rationale was not overwritten', 'Not provided.', v_txt);

  -- 16. A DIFFERENT outcome is refused. The decision is terminal.
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'changed my mind');
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('adjudication', 'the outcome CANNOT be flipped', 'PT412', v_code);
  select outcome into v_txt from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication', 'and the recorded outcome is unchanged',
    'unfulfilled', v_txt);

  -- 17 + 18. Direct UPDATE and DELETE, from EVERY caller including the privileged one.
  perform pg_temp.act(ru);
  perform pg_temp.chk_blocked('adjudication', 'a participant cannot UPDATE an adjudication',
    format('update public.barter_obligation_adjudications set outcome = ''fulfilled''
             where obligation_id = %L', v_ob));
  perform pg_temp.chk_blocked('adjudication', 'nor DELETE one',
    format('delete from public.barter_obligation_adjudications where obligation_id = %L', v_ob));
  perform pg_temp.chk_blocked('adjudication', 'nor INSERT one directly',
    format('insert into public.barter_obligation_adjudications
              (obligation_id, agreement_id, outcome, adjudicator_user_id, rationale)
            values (%L, %L, ''fulfilled'', %L, ''forged'')', v_ob, v_ag, ru));
  perform pg_temp.act_service();
  -- UPDATE is refused even for the PRIVILEGED path: a terminal outcome the trusted caller can
  -- edit is not terminal. DELETE stays permitted there, because account erasure depends on it.
  perform pg_temp.chk_blocked('adjudication',
    'and even a privileged UPDATE is refused — the outcome is immutable',
    format('update public.barter_obligation_adjudications set outcome = ''fulfilled''
             where obligation_id = %L', v_ob));
  select outcome into v_txt from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication', 'the outcome survived every attempt', 'unfulfilled', v_txt);
end $$;

-- ── 19-20. Read visibility, and the rationale that is NOT visible ─────────
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_c1 text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj11');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(
    v_ob, 'closed_without_resolution', xu, 'INTERNAL: conflicting accounts, no evidence.');

  -- 19. BOTH participants see the outcome.
  perform pg_temp.chk('adjudication', 'the receiver sees the final outcome',
    'closed_without_resolution', pg_temp.adj_outcome(ru, v_ob));
  perform pg_temp.chk('adjudication', 'and so does the deliverer',
    'closed_without_resolution', pg_temp.adj_outcome(ou, v_ob));

  -- 20. An unrelated user sees nothing at all.
  perform pg_temp.act(xu);
  select count(*) into v_n from public.my_barter_obligations where id = v_ob;
  perform pg_temp.chk('adjudication',
    'an unrelated provider cannot see the obligation at all', '0', v_n::text);
  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication', 'nor the adjudication row', '0', v_n::text);

  -- THE RATIONALE IS INTERNAL. Both participants may read the row, but neither holds the column
  -- privilege — so the operator's reasoning is not reachable even though the outcome is.
  perform pg_temp.act(ru);
  begin
    perform a.rationale from public.barter_obligation_adjudications a
     where a.obligation_id = v_ob;
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'a PARTICIPANT cannot read the operator rationale — no column privilege', '42501', v_c1);
  perform pg_temp.act(ou);
  begin
    perform a.rationale from public.barter_obligation_adjudications a
     where a.obligation_id = v_ob;
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication', 'and neither can the other one', '42501', v_c1);

  -- Nor the adjudicator's identity: which operator decided is not a participant's business.
  perform pg_temp.act(ru);
  begin
    perform a.adjudicator_user_id from public.barter_obligation_adjudications a
     where a.obligation_id = v_ob;
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'nor the adjudicator''s identity', '42501', v_c1);

  -- But the outcome columns ARE readable, which is what makes the split real rather than a
  -- blanket refusal.
  perform pg_temp.act(ru);
  select count(*) into v_n from public.barter_obligation_adjudications a
   where a.obligation_id = v_ob and a.outcome = 'closed_without_resolution'
     and a.adjudicated_at is not null;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'while the outcome and its time ARE readable by a participant', '1', v_n::text);
end $$;

-- ── 21-24. The terminal outcome DOMINATES the derived read state ──────────
-- The precedence rule stated once, at the source: the three derived columns take
-- `cancelled OR adjudicated` as their suppression input, so a resolved obligation cannot also be
-- asking someone to act. These blocks prove it for each of the four states in turn, and prove
-- the state was genuinely PRESENT beforehand — otherwise a column stuck at NULL would pass.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_win text; v_rev boolean; v_rep boolean;
begin
  -- 21 + 22. Action needed / Waiting for confirmation — the live receiver window.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'adj12');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act(ru);
  select b.receiver_window_state into v_win from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.chk('adjudication',
    'fixture: before adjudication the window really is live', 'awaiting_receiver', v_win);

  -- Reach Under Review the only way this obligation now can — the receiver answers not_received.
  perform public.report_barter_obligation_not_received(v_ob);
  select b.under_review into v_rev from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.chk('adjudication', 'fixture: and it is Under Review', 'true', v_rev::text);

  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'Provided as agreed.');

  perform pg_temp.act(ru);
  select b.receiver_window_state, b.under_review, b.can_report_no_show
    into v_win, v_rev, v_rep from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'after the outcome the receiver window is CLOSED — no Action needed, no Waiting',
    'none', v_win);
  -- 24. And no longer Under Review: the review ENDED, that is what an outcome means.
  perform pg_temp.chk('adjudication',
    'and the obligation is no longer UNDER REVIEW', 'false', v_rev::text);
  perform pg_temp.chk('adjudication',
    'and no stale no-show control survives the outcome', 'false', v_rep::text);
  -- The same view, read by the OTHER participant: precedence is not a per-viewer accident.
  perform pg_temp.act(ou);
  select b.receiver_window_state, b.under_review
    into v_win, v_rev from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication', 'the deliverer sees the same closed window', 'none', v_win);
  perform pg_temp.chk('adjudication', 'and the same ended review', 'false', v_rev::text);

  -- 23. NEEDS ATTENTION. An elapsed window plus a not_received answer, then an outcome.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'adj13');
  perform pg_temp.act(ru);
  select b.receiver_window_state into v_win from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.chk('adjudication',
    'fixture: the window really has elapsed into Needs Attention', 'needs_attention', v_win);
  perform public.report_barter_obligation_not_received(v_ob);
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'unfulfilled', xu, 'Never provided.');
  perform pg_temp.act(ru);
  select b.receiver_window_state into v_win from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'a terminal outcome suppresses NEEDS ATTENTION too', 'none', v_win);
end $$;

-- ── Obligation-GRANULAR: one side may resolve while the other has not ─────
-- The requirement that most easily regresses into a roll-up. Adjudicating one obligation must
-- leave its sibling exactly as it was — still Under Review, still asking its own participant to
-- act — because the two are separate promises.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_mine uuid; v_theirs uuid; v_win text; v_rev boolean; v_n integer; v_out text;
begin
  select o_ag, o_ob into v_ag, v_mine from pg_temp.ns_arrived(ou, ru, 'adj14');
  perform pg_temp.act_service();
  select id into v_theirs from public.barter_obligations
   where agreement_id = v_ag and id <> v_mine;
  perform pg_temp.chk('adjudication',
    'fixture: the agreement has a second, independent obligation',
    'true', (v_theirs is not null)::text);

  -- Side A goes Under Review and is resolved. Side B is delivered and awaiting its receiver.
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_mine);
  perform pg_temp.act(ru);
  perform public.mark_barter_obligation_delivered(v_theirs);
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_mine, 'fulfilled', xu, 'Resolved for this side.');

  select outcome into v_out from public.barter_obligation_adjudications
   where obligation_id = v_mine;
  perform pg_temp.chk('adjudication', 'side A carries a terminal outcome', 'fulfilled', v_out);
  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_theirs;
  perform pg_temp.chk('adjudication',
    'and side B was NOT resolved with it — obligations resolve one at a time', '0', v_n::text);

  -- Side B's own live state is untouched: its receiver is still being asked to answer.
  perform pg_temp.act(ou);
  select b.receiver_window_state, b.under_review, b.terminal_outcome
    into v_win, v_rev, v_out from public.my_barter_obligations b where b.id = v_theirs;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'side B is still awaiting its receiver', 'awaiting_receiver', v_win);
  perform pg_temp.chk('adjudication', 'and carries no outcome', 'true', (v_out is null)::text);

  -- And side B remains genuinely actionable: its receiver can still answer, after the fact.
  perform pg_temp.act(ou);
  perform public.confirm_barter_obligation_received(v_theirs);
  perform pg_temp.act_service();
  select status into v_out from public.barter_obligations where id = v_theirs;
  perform pg_temp.chk('adjudication',
    'side B can still be answered normally while side A is terminal', 'received', v_out);

  -- BOTH sides terminal, and STILL no agreement-level roll-up. PD-070 makes that PERMANENT:
-- agreement-level resolution is DERIVED from these immutable facts and never stored. This
-- assertion is therefore a standing rule, not a placeholder for a future slice.
  select o_ag, o_ob into v_ag, v_mine from pg_temp.ns_arrived(ou, ru, 'adj15');
  perform pg_temp.act_service();
  select id into v_theirs from public.barter_obligations
   where agreement_id = v_ag and id <> v_mine;
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_mine);
  -- Side B has no appointment (only the owner side is scheduled), so it reaches Under Review by
  -- the other route: delivered, then answered `not_received`.
  perform pg_temp.act(ru);
  perform public.mark_barter_obligation_delivered(v_theirs);
  perform pg_temp.act(ou);
  perform public.report_barter_obligation_not_received(v_theirs);
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_mine, 'fulfilled', xu, 'Side A stands.');
  perform public.adjudicate_barter_obligation(v_theirs, 'unfulfilled', xu, 'Side B does not.');
  select count(*) into v_n from public.barter_obligation_adjudications
   where agreement_id = v_ag;
  perform pg_temp.chk('adjudication',
    'both sides may hold DIFFERENT terminal outcomes at once', '2', v_n::text);
end $$;

-- ── 25-27. Nothing beyond the obligation was created ──────────────────────
-- The out-of-scope list, asserted rather than assumed: no agreement terminal state, no
-- reputation effect, no review. Each is checked structurally (the column or table does not
-- exist) rather than by value, so a later migration that ADDS one fails here and has to be
-- deliberate.
do $$
declare v_n integer;
begin
  perform pg_temp.act_service();

  -- 25. No agreement-level terminal state. The agreement table gained nothing, and the only
  -- terminal vocabulary that exists is the obligation's.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_agreements'
     and (column_name ilike '%outcome%' or column_name ilike '%completed%'
          or column_name ilike '%fulfil%' or column_name ilike '%resolved%'
          or column_name ilike '%adjudicat%');
  perform pg_temp.chk('adjudication',
    'no agreement-level terminal column exists — the roll-up is REFUSED PERMANENTLY (PD-070)',
    '0', v_n::text);
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'my_trade_activity'
     and column_name in ('terminal_outcome', 'agreement_outcome', 'trade_outcome');
  perform pg_temp.chk('adjudication',
    'and Trade Activity exposes only the two per-side outcomes, never an agreement one',
    '0', v_n::text);
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'my_trade_activity'
     and column_name in ('my_terminal_outcome', 'their_terminal_outcome');
  perform pg_temp.chk('adjudication',
    'the two per-side outcome columns ARE present', '2', v_n::text);

  -- 26 + 27. No reputation, scoring or review surface was created by this slice.
  -- ANCHORED to the barter namespace. Unanchored, this swept the WHOLE schema for
  -- `%rating%` / `%score%`, which the product already has outside barter
  -- (`providers.average_rating`, `posts.engagement_score`, `provider_reviews`) — so it proved
  -- less than its message claimed AND would have failed this suite for an unrelated future
  -- object. What it guards is that THIS slice created no barter reputation surface.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m')
     and c.relname like 'barter%'
     and (c.relname ilike '%reputation%' or c.relname ilike '%rating%'
          or c.relname ilike '%score%' or c.relname ilike '%review%'
          or c.relname ilike '%penalt%' or c.relname ilike '%refund%')
     -- EXEMPTED BY NAME, so a seventh object still fails this sweep.
     -- `barter_obligation_review_requests` (Correction 3, item X) matches the
     -- `%review%` pattern and is a RULED object: it records that a deliverer ASKED
     -- The Book to look at an obligation whose receiver never answered. It is not
     -- reputation, not a rating, not a score and not an outcome — the three
     -- terminal outcomes remain reachable only through adjudicate_barter_obligation,
     -- which is still service_role-only (PD-068).
     and c.relname <> 'barter_obligation_review_requests';
  perform pg_temp.chk('adjudication',
    'no barter reputation, rating, score, review, penalty or refund object exists',
    '0', v_n::text);

  -- 28. Zero residue on the obligation contract itself: adjudication is a SEPARATE record, so
  -- the obligation table gained no column and no trigger.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_obligations'
     and column_name not in ('id','agreement_id','source_term_id','side',
       'deliverer_provider_id','deliverer_user_id','receiver_provider_id','receiver_user_id',
       'agreed_description','due_at','scheduled_at','created_at','status','delivered_at',
       'receipt_responded_at');
  perform pg_temp.chk('adjudication',
    'the obligation contract gained NO column — the outcome lives in its own record',
    '0', v_n::text);
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'barter_obligations' and not t.tgisinternal
     and t.tgname not in ('barter_obligations_immutable', 'barter_obligations_consistent',
                          'barter_obligations_starts_pending');
  perform pg_temp.chk('adjudication', 'and no new trigger', '0', v_n::text);
end $$;

-- ── The participant write paths refuse, and say something TRUE ────────────
-- Precedence is only half the requirement. The other half is that the refusal a participant
-- actually receives is not a lie: `PT424` means "this was resolved", and it is deliberately not
-- `PT412`, which on these same functions already means "your answer is recorded". A receiver
-- whose obligation was resolved may never have answered anything, and `20261022000000` exists
-- because for one migration they were told they had.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_c1 text; v_c2 text; v_c3 text;
begin
  -- Undelivered and under review by report, so ALL THREE participant acts are things the
  -- obligation would otherwise still accept — the refusals below are the outcome's doing.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj16');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'unfulfilled', xu, 'Did not happen.');

  perform pg_temp.act(ou);
  begin
    perform public.mark_barter_obligation_delivered(v_ob);
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act(ru);
  begin
    perform public.confirm_barter_obligation_received(v_ob);
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  begin
    perform public.report_barter_obligation_no_show(v_ob, 'again');
    v_c3 := 'ALLOWED';
  exception when others then v_c3 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'the deliverer cannot mark a RESOLVED obligation delivered', 'PT424', v_c1);
  perform pg_temp.chk('adjudication',
    'the receiver cannot answer a RESOLVED obligation', 'PT424', v_c2);
  perform pg_temp.chk('adjudication',
    'and cannot report a no-show on one', 'PT424', v_c3);

  -- `not_received` takes the same route through the same internal function, so it is asserted
  -- rather than assumed to follow.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_not_received(ou, ru, 'adj17');
  perform pg_temp.act_service();
  -- Re-use a DIFFERENT obligation for this one: `adj_not_received` already answered its own.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'adj18');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_no_show(v_ob, 'no-one there');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'It was provided.');
  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_not_received(v_ob);
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'nor can they say they did not receive it', 'PT424', v_c1);

  -- AND `PT412` STILL MEANS WHAT IT MEANT. Without this the fix above could have been made by
  -- renaming the old refusal rather than adding a new one, and the "you already answered"
  -- distinction would be gone.
  select o_ag, o_ob into v_ag, v_ob from pg_temp.ns_arrived(ou, ru, 'adj19');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.act(ru);
  perform public.confirm_barter_obligation_received(v_ob);
  begin
    perform public.report_barter_obligation_not_received(v_ob);
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'an ALREADY-ANSWERED obligation still refuses with PT412, not PT424', 'PT412', v_c1);
end $$;

-- ── Object posture ─────────────────────────────────────────────────────────
do $$
declare v_n integer;
begin
  perform pg_temp.act_service();

  -- The RPC: definer, owned, pinned, and reachable ONLY by the trusted role. The last two
  -- assertions are the authority model in one line — there is no participant-facing path.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
     and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
     and 'search_path=""' = any(p.proconfig);
  perform pg_temp.chk('adjudication',
    'the adjudication RPC is definer, postgres-owned and search_path pinned', '1', v_n::text);
  perform pg_temp.chk('adjudication', 'service_role may execute it',
    'true', has_function_privilege('service_role',
      'public.adjudicate_barter_obligation(uuid, text, uuid, text)', 'execute')::text);
  -- WAS: `authenticated` holds no EXECUTE. Session 8B granted it, because an
  -- operator is now a signed-in person rather than only a server process
  -- (20261059000000). The grant is NOT the gate and never was — the function
  -- refuses any caller `is_operator()` rejects — so this now pins the gate
  -- itself. `operator_surface.test.sql` § 6 asserts the refusal end-to-end as a
  -- real non-operator user, which is the check that would actually catch a
  -- regression here.
  perform pg_temp.chk('adjudication', 'it gates on is_operator(), not on the grant',
    '1', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
             and p.prosrc like '%is_operator()%'));
  perform pg_temp.chk('adjudication', 'and still refuses a participant outright',
    '1', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
             and p.prosrc like '%A participant cannot adjudicate their own trade%'));
  perform pg_temp.chk('adjudication', 'anon may NOT',
    'false', has_function_privilege('anon',
      'public.adjudicate_barter_obligation(uuid, text, uuid, text)', 'execute')::text);
  perform pg_temp.chk('adjudication', 'and neither may PUBLIC',
    'false', has_function_privilege('public',
      'public.adjudicate_barter_obligation(uuid, text, uuid, text)', 'execute')::text);

  -- The table: RLS on, and the COLUMN-LEVEL split that makes the rationale internal. A row
  -- policy cannot hide a column, so this grant is the only thing standing between a participant
  -- and the operator's private reasoning.
  perform pg_temp.chk('adjudication', 'RLS is enabled on the adjudications table',
    'true', (select relrowsecurity::text from pg_class
              where oid = 'public.barter_obligation_adjudications'::regclass));
  perform pg_temp.chk('adjudication', 'authenticated may read the OUTCOME column',
    'true', has_column_privilege('authenticated',
      'public.barter_obligation_adjudications', 'outcome', 'select')::text);
  perform pg_temp.chk('adjudication', 'but NOT the rationale column',
    'false', has_column_privilege('authenticated',
      'public.barter_obligation_adjudications', 'rationale', 'select')::text);
  perform pg_temp.chk('adjudication', 'nor the adjudicator column',
    'false', has_column_privilege('authenticated',
      'public.barter_obligation_adjudications', 'adjudicator_user_id', 'select')::text);
  select count(*) into v_n from (
    select unnest(array['insert','update','delete','trigger']) as p) x
   where has_table_privilege('authenticated',
     'public.barter_obligation_adjudications', x.p);
  perform pg_temp.chk('adjudication',
    'authenticated holds NO write privilege on the table', '0', v_n::text);
  select count(*) into v_n from (
    select unnest(array['select','insert','update','delete']) as p) x
   where has_table_privilege('anon', 'public.barter_obligation_adjudications', x.p);
  perform pg_temp.chk('adjudication', 'anon holds nothing at all on it', '0', v_n::text);

  -- Exactly one read policy, and no write policy: every write goes through the RPC.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_obligation_adjudications'
     and cmd <> 'SELECT';
  perform pg_temp.chk('adjudication',
    'there is no INSERT, UPDATE or DELETE policy on the adjudications table', '0', v_n::text);

  -- ONE outcome per obligation, enforced by the database rather than by the RPC's own check —
  -- so a concurrent pair that both pass the check still cannot both land.
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.barter_obligation_adjudications'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (obligation_id)';
  perform pg_temp.chk('adjudication',
    'a UNIQUE constraint makes one-outcome-per-obligation a database fact', '1', v_n::text);

  -- The table is in no realtime publication: the same pin the reports and cancellations tables
  -- carry, and it matters more here because one of the columns is internal.
  select count(*) into v_n from pg_publication_tables
   where schemaname = 'public' and tablename = 'barter_obligation_adjudications';
  perform pg_temp.chk('adjudication',
    'the adjudications table is in NO realtime publication', '0', v_n::text);
end $$;

-- ── The RPC's OWN participant refusal, isolated from the trigger's ────────
-- `20261019000000` claimed the adjudicator-may-not-be-a-participant rule was enforced in the RPC
-- AND re-enforced in the trigger. It was only in the trigger, and NO TEST COULD TELL: every case
-- that exercised the rule reached the trigger, so the missing layer was invisible to CI.
-- `20261023000000` added the RPC's half. This block proves BOTH halves exist independently by
-- disabling one at a time — inside the harness transaction, which is always rolled back.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_ag uuid; v_ob uuid; v_c1 text; v_c2 text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj20');
  perform pg_temp.act_service();

  -- TRIGGER OFF: only the RPC can refuse now.
  alter table public.barter_obligation_adjudications disable trigger
    barter_obligation_adjudications_consistent;
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', ru, 'a party decides');
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  alter table public.barter_obligation_adjudications enable trigger
    barter_obligation_adjudications_consistent;
  perform pg_temp.chk('adjudication',
    'the RPC refuses a participant adjudicator ON ITS OWN, with the trigger disabled',
    '42501', v_c1);

  -- And the trigger refuses on its own, on the path the RPC cannot guard: a direct privileged
  -- insert. Two independent layers, each proven without the other.
  begin
    insert into public.barter_obligation_adjudications
      (obligation_id, agreement_id, outcome, adjudicator_user_id, rationale)
    values (v_ob, v_ag, 'fulfilled', ru, 'direct insert naming a party');
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'and the TRIGGER refuses one on the direct privileged path', '42501', v_c2);

  -- A null adjudicator is refused too — load-bearing since 20261023000000 made the column
  -- nullable for erasure. Without it the participant test evaluates to NULL and passes.
  begin
    insert into public.barter_obligation_adjudications
      (obligation_id, agreement_id, outcome, adjudicator_user_id, rationale)
    values (v_ob, v_ag, 'fulfilled', null, 'nobody decided this');
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'an adjudication with NO adjudicator is refused', '23514', v_c2);

  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication',
    'and none of those three attempts wrote anything', '0', v_n::text);
end $$;

-- ── The outcome SURVIVES the operator ─────────────────────────────────────
-- `on delete cascade` on `adjudicator_user_id` made an "immutable, never withdrawn" outcome
-- deletable by an ordinary administrative act on a THIRD PARTY's account: erase the operator and
-- the two providers' resolved obligation silently reverted to Under Review, with the unique row
-- gone so a different outcome could then be recorded. `20261023000000` made it `set null`.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  v_op uuid := gen_random_uuid();
  v_ag uuid; v_ob uuid; v_n integer; v_txt text; v_rev boolean; v_win text;
begin
  -- Its OWN operator, so erasing them cannot disturb the rest of the suite.
  perform pg_temp.act_service();
  insert into auth.users(id) values (v_op);
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj21');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'unfulfilled', v_op, 'Operator decision.');

  delete from auth.users where id = v_op;

  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication',
    'erasing the OPERATOR does not delete the decision they made', '1', v_n::text);
  select outcome into v_txt from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('adjudication', 'and the outcome is unchanged', 'unfulfilled', v_txt);
  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_ob and adjudicator_user_id is null;
  perform pg_temp.chk('adjudication',
    'only WHO decided is forgotten, which is what an erasure is for', '1', v_n::text);

  -- The read model must not revert. This is the half that actually reached the participants.
  perform pg_temp.act(ru);
  select b.terminal_outcome, b.under_review, b.receiver_window_state
    into v_txt, v_rev, v_win from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'the participants still see the outcome after the operator is gone', 'unfulfilled', v_txt);
  perform pg_temp.chk('adjudication',
    'and the obligation did NOT revert to Under Review', 'false', v_rev::text);
  perform pg_temp.chk('adjudication',
    'and no window reopened', 'none', v_win);

  -- And a second, different outcome still cannot be recorded — the unique row is still there.
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', ou, 'second bite');
    v_txt := 'ALLOWED';
  exception when others then v_txt := sqlstate;
  end;
  perform pg_temp.chk('adjudication',
    'and the decision cannot be re-made now its author is gone', '42501', v_txt);

  -- THE ERASURE ALLOWANCE IS EXACTLY ONE UPDATE, and this is the half that proves it did not
  -- become a general privileged edit. Everything else is still refused, from the same caller.
  perform pg_temp.chk_blocked('adjudication',
    'the outcome is still unchangeable, even privileged',
    format('update public.barter_obligation_adjudications set outcome = ''fulfilled''
             where obligation_id = %L', v_ob));
  perform pg_temp.chk_blocked('adjudication', 'and so is the rationale',
    format('update public.barter_obligation_adjudications set rationale = ''rewritten''
             where obligation_id = %L', v_ob));
  perform pg_temp.chk_blocked('adjudication', 'and the decision time',
    format('update public.barter_obligation_adjudications set adjudicated_at = now()
             where obligation_id = %L', v_ob));
  -- Forgetting is one-directional: a new operator cannot be attached afterwards.
  perform pg_temp.chk_blocked('adjudication',
    'and a forgotten adjudicator cannot be replaced with another',
    format('update public.barter_obligation_adjudications set adjudicator_user_id = %L
             where obligation_id = %L', ou, v_ob));
end $$;

-- ── The internal columns are absent from the VIEWS, not merely ungranted ──
-- The grant is what protects them, but a future `create or replace view` that appended
-- `rationale` is how that protection would be defeated by accident — and it would surface as a
-- broken screen (a runtime 42501 on the participant's own SELECT), not as a caught regression.
do $$
declare v_n integer; v_c1 text;
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
begin
  perform pg_temp.act_service();
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public'
     and table_name in ('my_barter_obligations', 'my_trade_activity')
     and column_name in ('rationale', 'adjudicator_user_id');
  perform pg_temp.chk('adjudication',
    'neither view exposes the rationale or the adjudicator', '0', v_n::text);

  -- The column privilege covers WHERE and ORDER BY too, so there is no blind-filter oracle:
  -- a participant cannot narrow rows by a column they cannot read.
  perform pg_temp.act(ou);
  begin
    perform 1 from public.barter_obligation_adjudications a where a.rationale like '%';
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'a participant cannot even FILTER by the rationale', '42501', v_c1);

  -- `service_role`'s actual table privileges, asserted rather than assumed from a Supabase
  -- default: the erasure cascade depends on DELETE, and TRUNCATE would bypass the row-level
  -- append-only trigger entirely.
  perform pg_temp.chk('adjudication', 'service_role may DELETE (account erasure depends on it)',
    'true', has_table_privilege('service_role',
      'public.barter_obligation_adjudications', 'delete')::text);
  perform pg_temp.chk('adjudication', 'and holds no TRUNCATE, which would skip the row trigger',
    'false', has_table_privilege('service_role',
      'public.barter_obligation_adjudications', 'truncate')::text);
end $$;

-- ── What an outcome must NOT quietly reopen ───────────────────────────────
-- Precedence is implemented by feeding `cancelled OR adjudicated` into the derived functions, so
-- an adjudication makes `under_review` read false. PD-063's cancellation gate asks a DIFFERENT
-- question — does a no-show report exist — and must be unaffected. If the two had been conflated,
-- resolving an obligation would have re-opened the ordinary exit on a trade that had been
-- reported, which is exactly what PD-063 exists to prevent.
do $$
declare
  ou uuid := current_setting('b5b.ns_ou')::uuid;
  ru uuid := current_setting('b5b.ns_ru')::uuid;
  xu uuid := current_setting('b5b.ns_xu')::uuid;
  v_ag uuid; v_ob uuid; v_c1 text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.adj_reported(ou, ru, 'adj22');
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'Resolved.');
  perform pg_temp.act(ru);
  begin
    perform public.cancel_barter_agreement(v_ag, null);
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'a resolved obligation does NOT re-open the ordinary exit its report closed (PD-063)',
    'PT423', v_c1);
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_ag;
  perform pg_temp.chk('adjudication', 'and nothing was cancelled', '0', v_n::text);

  -- HISTORY AT THE READ LAYER, not only in the tables. The suppression feeds three derived
  -- columns; it must not have taken the FACTS with them, because those facts are what a
  -- participant reads to understand a resolution they may disagree with.
  perform pg_temp.act(ru);
  select count(*) into v_n from public.my_barter_obligations b
   where b.id = v_ob
     and b.no_show_reported_at is not null
     and b.no_show_reason = 'nobody came'
     and b.status = 'pending'
     and b.scheduled_at is not null
     and b.terminal_outcome = 'fulfilled'
     and b.adjudicated_at is not null;
  perform pg_temp.act_service();
  perform pg_temp.chk('adjudication',
    'the report, its reason, the status and the timings are ALL still readable beside the outcome',
    '1', v_n::text);
end $$;

-- ── THE PRIVILEGED PREDICATE IS PINNED BY SOURCE TEXT ─────────────────────
--
-- WHY A prosrc PIN AND NOT A BEHAVIOURAL ONE. The loose predicate this guards against —
-- `auth.role() = 'service_role' or auth.uid() is null` — is not reachable through any behaviour
-- the harness can perform, because `anon` and `authenticated` hold no UPDATE or DELETE privilege
-- on this table and no write policy exists. Two layers stop the caller before the trigger sees
-- it. So the only way to assert the INNERMOST guard fails closed on its own is to read it.
--
-- This exists because the defect it pins actually happened: `20261023000000` § 2 diagnosed that
-- predicate as unsound and narrowed it inside `adjudicate_barter_obligation`, and
-- `20261024000000` — the very next migration, in the same slice — wrote the superseded form into
-- BOTH branches of the append-only trigger, including a brand-new one, under a header asserting
-- it was "the same branch DELETE already uses". A full review pass of that migration did not
-- catch it; a reviewer reading two migrations side by side did. `20261026000000` corrects it.
-- A `create or replace` can revert a predicate silently, so an eye is not a control.
--
-- Same shape as the `enforce_prebooking_message_rules` pin in messaging.test.sql: COMMENTS ARE
-- STRIPPED FIRST, so the assertion cannot be satisfied by prose. This file's own header comments
-- quote the loose form, which is exactly why that matters.
do $$
declare
  v_body text;
  v_n int;
begin
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_barter_adjudication_append_only';

  perform pg_temp.chk('adjudication',
    'the append-only guard exists and its body was read',
    'true', (v_body is not null and length(v_body) > 0)::text);

  -- NO BARE `auth.uid() is null` DISJUNCT. The narrowed form always pairs it with a null
  -- `auth.role()`, so every occurrence of the uid test must sit beside a role test. Counting the
  -- two is what distinguishes "no claims AND no subject" from "no subject", which is the whole
  -- difference: an anon PostgREST request carries no `sub` and satisfies the second.
  select count(*) into v_n from regexp_matches(
    lower(v_body), 'auth\.role\(\)\)? is null and \(select auth\.uid\(\)\) is null', 'g');
  perform pg_temp.chk('adjudication',
    'BOTH privileged branches require no claims AND no subject, not merely no subject',
    '2', v_n::text);

  -- And the superseded form is gone outright. `service_role or uid is null` in either branch is
  -- the exact regression.
  select count(*) into v_n from regexp_matches(
    lower(v_body),
    'service_role''\s*or\s*\(select auth\.uid\(\)\) is null', 'g');
  perform pg_temp.chk('adjudication',
    'and the superseded loose disjunct appears nowhere in the body',
    '0', v_n::text);

  -- The erasure allowance itself is unchanged: still one-directional, still whole-row compared.
  perform pg_temp.chk('adjudication',
    'the erasure UPDATE is still non-null to null only',
    'true',
    (position('old.adjudicator_user_id is not null' in lower(v_body)) > 0
     and position('new.adjudicator_user_id is null' in lower(v_body)) > 0)::text);
  perform pg_temp.chk('adjudication',
    'and still proves equality across the WHOLE row, not a column list',
    'true', (position('v_old = v_new' in lower(v_body)) > 0)::text);
end $$;

-- ── AND THE TABLE COMMENT NO LONGER OVERSTATES THE GUARANTEE ──────────────
--
-- `20261019000000` set it to "never edited, never withdrawn, never flipped". Two of those three
-- stopped being literally true INSIDE the same slice: `20261024000000` permits one erasure
-- UPDATE and PD-066 permits a privileged DELETE for cascade. A live comment that claims a
-- stronger guarantee than the schema is how the next editor picks the wrong guard to change.
do $$
declare
  v_c text;
begin
  select obj_description('public.barter_obligation_adjudications'::regclass, 'pg_class')
    into v_c;
  perform pg_temp.chk('adjudication',
    'the table comment states the outcome is unchangeable by EVERY caller',
    'true', (position('unchangeable by every caller' in lower(coalesce(v_c, ''))) > 0)::text);
  perform pg_temp.chk('adjudication',
    'and no longer claims it is never withdrawn, which DELETE contradicts (PD-066)',
    'false', (position('never withdrawn' in lower(coalesce(v_c, ''))) > 0)::text);
end $$;
