-- B5B suite: Correction 3 item X — the deliverer can ask The Book to look
-- (20261039000000).
--
-- PD-057 gives the receiver a 7-day window. When it passes unanswered the
-- obligation sits in **Needs Attention** and the DELIVERER has no move, because
-- both routes into Under Review were RECEIVER acts. OQ-071 recorded how a plain
-- Needs Attention might enter Under Review as deliberately open — "no second
-- timer, no automatic escalation, no participant escalation action". This suite
-- pins the Founder ruling that closed it, and pins that it closed it WITHOUT
-- inventing a timer, an automatic escalation, or an outcome.
--
-- Runs after receiver_window.test.sql and reuses `pg_temp.rw_expired` from it,
-- which is the only honest way to reach Needs Attention here: it ages the
-- ACCEPTED TERM, re-derives the obligation pair through production code, delivers
-- through the real RPC and backdates the one lifecycle stamp. No obligation
-- contract field is ever written directly. All suites are concatenated into ONE
-- transaction, so the helper is in scope by registration order.

-- Its OWN provider-backed identities, so nothing here depends on what the earlier
-- barter suites left behind, and nothing here disturbs them.
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'RR Owner', 'rro_'||substr(ou::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (ru, 'RR Resp', 'rrr_'||substr(ru::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (xu, 'RR Other', 'rrx_'||substr(xu::text,1,8));
  perform set_config('b5b.rr_ou', ou::text, true);
  perform set_config('b5b.rr_ru', ru::text, true);
  perform set_config('b5b.rr_xu', xu::text, true);
end $$;

-- ── 1. Object posture ──────────────────────────────────────────────────────
--
-- The table is readable by participants and writable by nobody: the RPC is the
-- only writer, which is what makes every eligibility rule below unbypassable
-- rather than merely enforced on the happy path.
select pg_temp.chk('reviewrequest', 'RLS is enabled on the review-request table', 'true',
  (select relrowsecurity::text from pg_class
    where oid = 'public.barter_obligation_review_requests'::regclass));
select pg_temp.chk('reviewrequest', 'authenticated may SELECT and may not write', 'true',
  (has_table_privilege('authenticated','public.barter_obligation_review_requests','SELECT')
   and not has_table_privilege('authenticated','public.barter_obligation_review_requests','INSERT')
   and not has_table_privilege('authenticated','public.barter_obligation_review_requests','UPDATE')
   and not has_table_privilege('authenticated','public.barter_obligation_review_requests','DELETE'))::text);
select pg_temp.chk('reviewrequest', 'anon holds nothing at all', 'false',
  (has_table_privilege('anon','public.barter_obligation_review_requests','SELECT')
   or has_table_privilege('anon','public.barter_obligation_review_requests','INSERT')
   or has_table_privilege('anon','public.barter_obligation_review_requests','UPDATE')
   or has_table_privilege('anon','public.barter_obligation_review_requests','DELETE'))::text);
select pg_temp.chk('reviewrequest', 'the only policy is a read policy', 'SELECT',
  (select string_agg(distinct cmd, ',') from pg_policies
    where schemaname = 'public' and tablename = 'barter_obligation_review_requests'));
select pg_temp.chk('reviewrequest', 'the RPC is SECURITY DEFINER with a pinned search_path', 'true',
  (select (prosecdef and coalesce(proconfig::text, '') like '%search_path=%')::text
     from pg_proc where proname = 'request_barter_obligation_review'
       and pronamespace = 'public'::regnamespace));
select pg_temp.chk('reviewrequest', 'anon cannot EXECUTE the RPC', 'false',
  has_function_privilege('anon', 'public.request_barter_obligation_review(uuid)', 'EXECUTE')::text);
select pg_temp.chk('reviewrequest', 'authenticated CAN EXECUTE the RPC', 'true',
  has_function_privilege('authenticated', 'public.request_barter_obligation_review(uuid)', 'EXECUTE')::text);

-- ── 2. ASKING IS NOT ADJUDICATING ──────────────────────────────────────────
--
-- The most important pin in this file. A participant gained an ACTION; they did
-- not gain the ability to decide an OUTCOME. PD-068 is unchanged by item X, and
-- the absence assertion aged from adjudication.test.sql still holds afterwards.
select pg_temp.chk('reviewrequest', 'no participant may adjudicate, after item X as before', 'false',
  (has_function_privilege('authenticated',
     'public.adjudicate_barter_obligation(uuid,text,uuid,text)', 'EXECUTE')
   or has_function_privilege('anon',
     'public.adjudicate_barter_obligation(uuid,text,uuid,text)', 'EXECUTE'))::text);
-- One uuid in, a timestamp out. There is no outcome parameter because asking for
-- a review is not deciding one, and no `p_as_of` because the deadline is the
-- server's to evaluate.
select pg_temp.chk('reviewrequest', 'the RPC takes exactly one uuid and returns a timestamp',
  'p_obligation_id uuid -> timestamp with time zone',
  (select pg_get_function_arguments(oid) || ' -> ' || pg_get_function_result(oid)
     from pg_proc where proname = 'request_barter_obligation_review'
       and pronamespace = 'public'::regnamespace));

-- ── 3. Eligibility: ONLY from Needs Attention ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text;
begin
  -- An UNDELIVERED obligation whose window has not opened at all. The deliverer
  -- has done nothing yet, so there is nothing for The Book to look at.
  v_ag := pg_temp.rw_agreement(ou, ru, 'rr_early',
                               pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ou);
  begin
    perform public.request_barter_obligation_review(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'a never-delivered obligation cannot be sent for review',
    '55000', v_code);

  -- DELIVERED, but the receiver still has time. Needs Attention has not begun, so
  -- neither has this act — the receiver's window is not something the deliverer
  -- may cut short by asking early.
  perform public.mark_barter_obligation_delivered(v_ob);
  begin
    perform public.request_barter_obligation_review(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'a deliverer cannot ask while the receiver still has time',
    '55000', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('reviewrequest', 'and no request row was created by either refusal', '0',
    (select count(*)::text from public.barter_obligation_review_requests
      where obligation_id = v_ob));
end $$;

-- ── 4. Only the deliverer, and no existence oracle ─────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  xu uuid := current_setting('b5b.rr_xu')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_msg text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'rr_who');
  perform pg_temp.act(ou);
  perform pg_temp.chk('reviewrequest', 'the obligation is genuinely in needs_attention',
    'needs_attention', pg_temp.rw_state(ou, v_ob));
  perform set_config('b5b.rr_ob_who', v_ob::text, true);

  -- The RECEIVER already has two routes into Under Review and does not need a
  -- third; this act exists for the side that has none.
  perform pg_temp.act(ru);
  begin
    perform public.request_barter_obligation_review(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'the receiver cannot ask for a review', '42501', v_code);

  -- An unrelated user is answered EXACTLY as a caller naming an id that does not
  -- exist is — same SQLSTATE, same text. Asking about a stranger's trade must not
  -- reveal that it is real.
  perform pg_temp.act(xu);
  begin
    perform public.request_barter_obligation_review(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.chk('reviewrequest', 'an outsider is refused', '23514', v_code);
  begin
    perform public.request_barter_obligation_review(gen_random_uuid());
  exception when others then
    perform pg_temp.chk('reviewrequest',
      'and is told exactly what a nonexistent obligation is told', sqlerrm, v_msg);
  end;

  perform pg_temp.act_service();
  perform pg_temp.chk('reviewrequest', 'neither refusal recorded anything', '0',
    (select count(*)::text from public.barter_obligation_review_requests
      where obligation_id = v_ob));
end $$;

-- ── 5. The deliverer asks ──────────────────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  v_ob uuid := current_setting('b5b.rr_ob_who')::uuid;
  v_t1 timestamptz; v_t2 timestamptz; v_who uuid; v_ag_row uuid; v_n integer;
begin
  perform pg_temp.act(ou);
  v_t1 := public.request_barter_obligation_review(v_ob);
  perform pg_temp.chk('reviewrequest', 'the deliverer CAN ask for a review', 'true',
    (v_t1 is not null)::text);

  -- IDEMPOTENT. A double tap is the same ask: it returns the ORIGINAL time rather
  -- than re-stamping it, so a slow network cannot rewrite when the provider
  -- actually asked, and cannot raise an error at someone who did nothing wrong.
  v_t2 := public.request_barter_obligation_review(v_ob);
  perform pg_temp.chk('reviewrequest', 'asking twice returns the original timestamp',
    v_t1::text, v_t2::text);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_review_requests
   where obligation_id = v_ob;
  perform pg_temp.chk('reviewrequest', 'exactly one request exists', '1', v_n::text);

  select requested_by_user_id, agreement_id into v_who, v_ag_row
    from public.barter_obligation_review_requests where obligation_id = v_ob;
  perform pg_temp.chk('reviewrequest', 'it is attributed to the deliverer', ou::text, v_who::text);
  -- The agreement is DERIVED from the obligation, never taken from the caller: a
  -- mismatched pair would file the request against a trade it does not belong to.
  perform pg_temp.chk('reviewrequest', 'the agreement is derived from the obligation', 'true',
    (v_ag_row = (select agreement_id from public.barter_obligations where id = v_ob))::text);
end $$;

-- ── 6. Append-only, at both layers ─────────────────────────────────────────
--
-- Same posture as the no-show report: a participant statement, once made, is
-- history. For a PARTICIPANT the refusal comes from the missing GRANT, before any
-- trigger runs — there is no write privilege to abuse, so the RPC really is the
-- only door. For `service_role`, which does hold the grant so account-erasure
-- cascades still work, the append-only trigger is what refuses.
select pg_temp.act(current_setting('b5b.rr_ou')::uuid);
select pg_temp.chk_blocked('reviewrequest', 'a participant cannot withdraw their request',
  format('delete from public.barter_obligation_review_requests where obligation_id = %L',
         current_setting('b5b.rr_ob_who')),
  'permission denied');
select pg_temp.chk_blocked('reviewrequest', 'nor re-attribute it to the counterparty',
  format($f$update public.barter_obligation_review_requests
             set requested_by_user_id = %L where obligation_id = %L$f$,
         current_setting('b5b.rr_ru'), current_setting('b5b.rr_ob_who')),
  'permission denied');
select pg_temp.chk_blocked('reviewrequest', 'a participant cannot insert a request directly',
  format($f$insert into public.barter_obligation_review_requests
              (obligation_id, agreement_id, requested_by_user_id)
            values (%L, %L, %L)$f$,
         current_setting('b5b.rr_ob_who'), gen_random_uuid(), current_setting('b5b.rr_ou')),
  'permission denied');

-- The privileged role holds the grant and is still refused: the record is history
-- even to the role that could otherwise rewrite it.
select pg_temp.act_service();
select pg_temp.chk_blocked('reviewrequest', 'not even service_role may edit a recorded request',
  format($f$update public.barter_obligation_review_requests
             set created_at = now() - interval '90 days' where obligation_id = %L$f$,
         current_setting('b5b.rr_ob_who')),
  'cannot be changed');

-- ── 7. It reaches Under Review, and changes nothing else ───────────────────
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  v_ob uuid := current_setting('b5b.rr_ob_who')::uuid;
  v_ur boolean; v_delivered timestamptz; v_answered timestamptz; v_n integer; v_state text;
begin
  -- The whole point of the row: the deliverer's own view now says Under Review.
  perform pg_temp.act(ou);
  select b.under_review into v_ur from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.chk('reviewrequest', 'the deliverer sees the obligation as under review',
    'true', v_ur::text);
  -- And so does the receiver. Under Review is a property of the trade, not a
  -- private label on one side's screen.
  perform pg_temp.act(ru);
  select b.under_review into v_ur from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.chk('reviewrequest', 'the receiver sees it too', 'true', v_ur::text);

  -- NOTHING WAS DECIDED. No outcome exists, the delivery fact stands exactly as
  -- its author left it, and the receiver's silence has not been converted into an
  -- answer on their behalf.
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_adjudications where obligation_id = v_ob;
  perform pg_temp.chk('reviewrequest', 'no terminal outcome was created', '0', v_n::text);
  select delivered_at, receipt_responded_at into v_delivered, v_answered
    from public.barter_obligations where id = v_ob;
  perform pg_temp.chk('reviewrequest', 'the delivery fact is untouched', 'true',
    (v_delivered is not null)::text);
  perform pg_temp.chk('reviewrequest', 'the receiver has still not answered', 'true',
    (v_answered is null)::text);
  -- The underlying window state is unchanged as well: asking for a review does not
  -- rewrite the receiver's deadline or pretend the window reopened.
  perform pg_temp.chk('reviewrequest', 'the receiver window still reads needs_attention',
    'needs_attention', pg_temp.rw_state(ou, v_ob));
end $$;

-- ── 8. Both participants read it; nobody else does ─────────────────────────
select pg_temp.act(current_setting('b5b.rr_ou')::uuid);
select pg_temp.chk('reviewrequest', 'the deliverer reads their own request', '1',
  (select count(*)::text from public.barter_obligation_review_requests
    where obligation_id = current_setting('b5b.rr_ob_who')::uuid));
select pg_temp.act(current_setting('b5b.rr_ru')::uuid);
select pg_temp.chk('reviewrequest', 'the receiver reads it too', '1',
  (select count(*)::text from public.barter_obligation_review_requests
    where obligation_id = current_setting('b5b.rr_ob_who')::uuid));
select pg_temp.act(current_setting('b5b.rr_xu')::uuid);
select pg_temp.chk('reviewrequest', 'an outsider reads nothing', '0',
  (select count(*)::text from public.barter_obligation_review_requests));

-- ── 9. The receiver keeps their controls ───────────────────────────────────
--
-- Under Review has never frozen the receiver (PD-062) and it does not here. A
-- receiver who finally opens the app can still give the answer that was always
-- theirs to give — asking for a review does not take the decision away from them.
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_status text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'rr_answer');
  perform pg_temp.act(ou);
  perform public.request_barter_obligation_review(v_ob);
  perform pg_temp.act(ru);
  begin
    perform public.confirm_barter_obligation_received(v_ob);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'the receiver can still confirm after a review is asked for',
    'OK', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_obligations where id = v_ob;
  perform pg_temp.chk('reviewrequest', 'and their answer is what is recorded', 'received', v_status);
end $$;

-- ── 10. A requested review is adjudicable ──────────────────────────────────
--
-- Without this the transition would be COSMETIC: the trade would read Under
-- Review while `adjudicate_barter_obligation` still refused it as
-- object_not_in_prerequisite_state, and the Review Queue Session 8 builds would
-- be unable to act on the very rows it was built for.
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  xu uuid := current_setting('b5b.rr_xu')::uuid;
  v_ag uuid; v_ob uuid; v_txt text; v_code text; v_ur boolean;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'rr_adj');

  -- BEFORE the request, the same operator call is refused. This is what proves the
  -- request is doing the work, rather than the obligation having been eligible all
  -- along for some unrelated reason.
  perform pg_temp.act_service();
  begin
    perform public.adjudicate_barter_obligation(v_ob, 'fulfilled', xu, 'Too early.');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest',
    'a plain Needs Attention obligation still cannot be adjudicated', '55000', v_code);

  perform pg_temp.act(ou);
  perform public.request_barter_obligation_review(v_ob);
  perform pg_temp.act_service();
  begin
    v_txt := public.adjudicate_barter_obligation(
               v_ob, 'closed_without_resolution', xu, 'Neither side could show what happened.');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'an operator CAN resolve a requested review', 'OK', v_code);
  perform pg_temp.chk('reviewrequest', 'and the outcome is returned',
    'closed_without_resolution', v_txt);

  -- Once resolved it is no longer under review, by the same `suppressed` rule that
  -- already governed the other two routes — the new disjunct did not escape it.
  perform pg_temp.act(ou);
  select b.under_review into v_ur from public.my_barter_obligations b where b.id = v_ob;
  perform pg_temp.chk('reviewrequest', 'a resolved obligation is no longer under review',
    'false', v_ur::text);

  -- Asking again after the outcome is still the SAME ask. Idempotence is checked
  -- before eligibility deliberately: the deliverer already asked, so a repeat tap
  -- returns the original timestamp rather than erroring at someone who did nothing
  -- wrong, and it records nothing new.
  begin
    v_txt := public.request_barter_obligation_review(v_ob)::text;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'asking again after the outcome is still the same ask',
    'OK', v_code);
  perform pg_temp.act_service();
  select count(*)::text into v_txt from public.barter_obligation_review_requests
   where obligation_id = v_ob;
  perform pg_temp.chk('reviewrequest', 'and there is still exactly one request', '1', v_txt);
end $$;

-- ── 10b. A resolved obligation that was never requested refuses the ask ────
--
-- The complement of the case above, and the one that proves PT424 is real rather
-- than shadowed by idempotence: this obligation reached Under Review by the
-- RECEIVER's `not_received` answer and was resolved without any request, so there
-- is no earlier ask to return. There is nothing left to look at.
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  xu uuid := current_setting('b5b.rr_xu')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'rr_other_route');
  perform pg_temp.act(ru);
  perform public.report_barter_obligation_not_received(v_ob);
  perform pg_temp.act_service();
  perform public.adjudicate_barter_obligation(
    v_ob, 'unfulfilled', xu, 'The receiver said nothing arrived and nothing contradicted it.');

  perform pg_temp.act(ou);
  begin
    perform public.request_barter_obligation_review(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'a resolved obligation cannot be sent for review',
    'PT424', v_code);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_review_requests where obligation_id = v_ob;
  perform pg_temp.chk('reviewrequest', 'and nothing was recorded on it', '0', v_n::text);
end $$;

-- ── 11. A cancelled trade has nothing to review ────────────────────────────
--
-- Cancelled through the real RPC, by a real participant, on a live trade — the
-- order PD-063 permits. The refusal is PT409 and it lands BEFORE the window is
-- even evaluated, so "there is nothing to review here" is the reason given rather
-- than "not yet".
do $$
declare
  ou uuid := current_setting('b5b.rr_ou')::uuid;
  ru uuid := current_setting('b5b.rr_ru')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer;
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'rr_cancel',
                               pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ru);
  perform public.cancel_barter_agreement(v_ag, null);

  perform pg_temp.act(ou);
  begin
    perform public.request_barter_obligation_review(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviewrequest', 'a cancelled trade cannot be sent for review',
    'PT409', v_code);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligation_review_requests where obligation_id = v_ob;
  perform pg_temp.chk('reviewrequest', 'and nothing was recorded on it', '0', v_n::text);
end $$;

-- ── 12. Scope pin: item X added ONE act and no vocabulary ──────────────────
--
-- The correction that closes OQ-071 must not have quietly introduced the timer,
-- the auto-escalation or the second deadline that OQ-071 forbade. Nothing in the
-- schema may be scheduling, expiring or escalating a review on its own.
select pg_temp.chk('reviewrequest', 'no scheduled/auto/escalation column exists on the request', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'barter_obligation_review_requests'
      and (column_name ilike '%escalat%' or column_name ilike '%expire%'
           or column_name ilike '%deadline%' or column_name ilike '%outcome%'
           or column_name ilike '%resolv%' or column_name ilike '%status%')));
-- Three functions back this surface — two triggers and the RPC — and exactly ONE
-- of them is reachable by a participant. That is the shape of "a participant may
-- ask, and may do nothing else."
select pg_temp.chk('reviewrequest', 'the review-request surface is three functions', '3',
  (select count(*)::text from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('request_barter_obligation_review',
                      'enforce_barter_review_request_append_only',
                      'enforce_barter_review_request_consistent')));
select pg_temp.chk('reviewrequest', 'and exactly one of them is participant-callable', '1',
  (select count(*)::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('request_barter_obligation_review',
                        'enforce_barter_review_request_append_only',
                        'enforce_barter_review_request_consistent')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')));
select pg_temp.act_service();
