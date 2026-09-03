-- B5B suite: Reviews Phase 0/1 trust boundaries.
-- Every assertion exercises real DB enforcement (RLS, triggers, SECURITY DEFINER),
-- never application code.

-- ── Grants / reachability ───────────────────────────────────────────────────
select pg_temp.chk('reviews', 'anon cannot EXECUTE review_opportunity', 'false',
  has_function_privilege('anon', 'public.review_opportunity(uuid,text)', 'EXECUTE')::text);
select pg_temp.chk('reviews', 'anon cannot EXECUTE review_opportunities (batch)', 'false',
  has_function_privilege('anon', 'public.review_opportunities(uuid[],text)', 'EXECUTE')::text);
select pg_temp.chk('reviews', 'authenticated CAN EXECUTE review_opportunity', 'true',
  has_function_privilege('authenticated', 'public.review_opportunity(uuid,text)', 'EXECUTE')::text);
select pg_temp.chk('reviews', 'PUBLIC cannot EXECUTE review_opportunity', 'false',
  has_function_privilege('public', 'public.review_opportunity(uuid,text)', 'EXECUTE')::text);
select pg_temp.chk('reviews', 'anon cannot EXECUTE review_eligible', 'false',
  has_function_privilege('anon', 'public.review_eligible(uuid)', 'EXECUTE')::text);
select pg_temp.chk('reviews', 'review_window_closed is internal (no anon/auth EXECUTE)', 'false/false',
  has_function_privilege('anon', 'public.review_window_closed(uuid)', 'EXECUTE')::text || '/' ||
  has_function_privilege('authenticated', 'public.review_window_closed(uuid)', 'EXECUTE')::text);

select pg_temp.chk('reviews', 'authenticated CAN EXECUTE review_opportunities', 'true',
  has_function_privilege('authenticated', 'public.review_opportunities(uuid[],text)', 'EXECUTE')::text);
-- The batch wrapper must stay SECURITY INVOKER. Flipping it to DEFINER would not change
-- any current return value (auth.uid() is a GUC), so nothing would visibly break -- but
-- it would silently become a privilege surface. Pin the decision here.
select pg_temp.chk('reviews', 'review_opportunities is SECURITY INVOKER, not DEFINER', 'false',
  (select prosecdef::text from pg_proc where proname='review_opportunities'));

-- ── RLS is actually enabled on the tables these policies protect ────────────
-- Role assumption only matters if the tables have RLS on at all.
select pg_temp.chk('reviews', 'RLS is enabled on the review + booking tables', 'true',
  (select bool_and(relrowsecurity)::text from pg_class
    where oid in ('public.bookings'::regclass, 'public.provider_reviews'::regclass,
                  'public.client_reviews'::regclass, 'public.conversation'::regclass,
                  'public.messages'::regclass)));

-- ── Null auth context must fail closed ──────────────────────────────────────
select pg_temp.act(null);
select pg_temp.chk('reviews', 'null auth.uid() -> not_participant (client dir)', 'not_participant',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'null auth.uid() -> not_participant (provider dir)', 'not_participant',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'provider_to_client'));

-- ── Non-participant isolation ───────────────────────────────────────────────
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk('reviews', 'outsider -> not_participant', 'not_participant',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'outsider cannot distinguish a real booking from a fake one', 'true',
  (public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'client_to_provider')
   = public.review_opportunity('00000000-0000-0000-0000-000000000000'::uuid, 'client_to_provider'))::text);
select pg_temp.chk_blocked('reviews', 'outsider cannot INSERT a provider review',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_elig'), current_setting('b5b.pid'),
          current_setting('b5b.ou')));

-- The batch wrapper must agree with the per-id function for a non-participant too.
select pg_temp.chk('reviews', 'batch: outsider gets not_participant for every id', 'true',
  (select bool_and(opportunity = 'not_participant')::text
     from public.review_opportunities(
       array[current_setting('b5b.b_elig')::uuid, current_setting('b5b.b_sub')::uuid,
             '00000000-0000-0000-0000-000000000000'::uuid], 'client_to_provider')));

-- ── Direction binding ───────────────────────────────────────────────────────
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk('reviews', 'client cannot use the provider direction', 'not_participant',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'provider_to_client'));
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('reviews', 'provider cannot use the client direction', 'not_participant',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'client_to_provider'));
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk('reviews', 'an unknown direction is rejected', 'not_participant',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'not_a_direction'));

-- ── State matrix, client direction ──────────────────────────────────────────
select pg_temp.chk('reviews', 'client: completed + open window -> eligible', 'eligible',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'client: own review exists -> already_submitted', 'already_submitted',
  public.review_opportunity(current_setting('b5b.b_sub')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'client: 8 days after completion -> window_closed', 'window_closed',
  public.review_opportunity(current_setting('b5b.b_win')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'client: under_review -> under_review', 'under_review',
  public.review_opportunity(current_setting('b5b.b_ur')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'client: genuine no_show -> not_completed', 'not_completed',
  public.review_opportunity(current_setting('b5b.b_ns')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'client: pending booking -> not_completed', 'not_completed',
  public.review_opportunity(current_setting('b5b.b_pend')::uuid, 'client_to_provider'));

-- ── State matrix, provider direction ────────────────────────────────────────
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('reviews', 'provider: completed + open window -> eligible', 'eligible',
  public.review_opportunity(current_setting('b5b.b_elig')::uuid, 'provider_to_client'));
select pg_temp.chk('reviews', 'provider: under_review -> under_review', 'under_review',
  public.review_opportunity(current_setting('b5b.b_ur')::uuid, 'provider_to_client'));
select pg_temp.chk('reviews', 'provider: genuine no_show -> not_completed', 'not_completed',
  public.review_opportunity(current_setting('b5b.b_ns')::uuid, 'provider_to_client'));

-- ── Blindness: the counterpart's review must not be observable ──────────────
select pg_temp.chk('reviews', 'counterpart review does NOT leak into provider state', 'eligible',
  public.review_opportunity(current_setting('b5b.b_sub')::uuid, 'provider_to_client'));
select pg_temp.chk('reviews', 'provider cannot read the blind client->provider review', '0',
  (select count(*)::text from public.provider_reviews
     where booking_id = current_setting('b5b.b_sub')::uuid));

-- ── The batch wrapper returns exactly what the per-id function returns ──────
select pg_temp.chk('reviews', 'batch output is identical to per-id review_opportunity', 'true',
  (select bool_and(b.opportunity = public.review_opportunity(b.booking_id, 'client_to_provider'))::text
     from public.review_opportunities(
       array[current_setting('b5b.b_elig')::uuid, current_setting('b5b.b_sub')::uuid,
             current_setting('b5b.b_win')::uuid, current_setting('b5b.b_ur')::uuid,
             current_setting('b5b.b_ns')::uuid, current_setting('b5b.b_pend')::uuid],
       'client_to_provider') b));
select pg_temp.chk('reviews', 'batch returns one row per requested id', '6',
  (select count(*)::text from public.review_opportunities(
     array[current_setting('b5b.b_elig')::uuid, current_setting('b5b.b_sub')::uuid,
           current_setting('b5b.b_win')::uuid, current_setting('b5b.b_ur')::uuid,
           current_setting('b5b.b_ns')::uuid, current_setting('b5b.b_pend')::uuid],
     'client_to_provider')));

-- ── Repeat-booking independence ─────────────────────────────────────────────
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk('reviews', 'repeat booking is independently reviewable', 'eligible',
  public.review_opportunity(current_setting('b5b.b_rep')::uuid, 'client_to_provider'));
select pg_temp.chk('reviews', 'the reviewed booking stays already_submitted', 'already_submitted',
  public.review_opportunity(current_setting('b5b.b_sub')::uuid, 'client_to_provider'));

-- ── review_eligible remains the write authority; the RPC never disagrees ────
select pg_temp.chk('reviews', 'RPC eligible <=> review_eligible (open booking)', 'true',
  ((public.review_opportunity(current_setting('b5b.b_elig')::uuid,'client_to_provider')='eligible')
    = public.review_eligible(current_setting('b5b.b_elig')::uuid))::text);
select pg_temp.chk('reviews', 'under_review booking is NOT review_eligible', 'false',
  public.review_eligible(current_setting('b5b.b_ur')::uuid)::text);
select pg_temp.chk('reviews', 'window-closed booking is NOT review_eligible', 'false',
  public.review_eligible(current_setting('b5b.b_win')::uuid)::text);

-- ── Writes: the DB, not the UI, enforces the window and the hold ────────────
select pg_temp.chk_blocked('reviews', 'late submission is blocked by RLS',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_win'), current_setting('b5b.pid'),
          current_setting('b5b.cu')), 'row-level security');
select pg_temp.chk_blocked('reviews', 'under_review blocks submission',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_ur'), current_setting('b5b.pid'),
          current_setting('b5b.cu')), 'row-level security');
select pg_temp.chk_blocked('reviews', 'a no_show booking cannot be reviewed',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_ns'), current_setting('b5b.pid'),
          current_setting('b5b.cu')));
select pg_temp.chk_blocked('reviews', 'a client cannot forge another user as the reviewer',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_elig'), current_setting('b5b.pid'),
          current_setting('b5b.ou')));
select pg_temp.chk_allowed('reviews', 'an eligible client CAN submit (the model is not deny-all)',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 4)', current_setting('b5b.b_rep'), current_setting('b5b.pid'),
          current_setting('b5b.cu')));

-- ── Provider -> client writes ───────────────────────────────────────────────
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_blocked('reviews', 'provider cannot forge client_user_id on a client review',
  format('insert into public.client_reviews(booking_id, client_user_id, reviewer_provider_id, rating)
          values (%L, %L, %L, 1)', current_setting('b5b.b_elig'), current_setting('b5b.ou'),
          current_setting('b5b.pid')));
select pg_temp.chk_allowed('reviews', 'provider CAN review the real client of the booking',
  format('insert into public.client_reviews(booking_id, client_user_id, reviewer_provider_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_elig'), current_setting('b5b.cu'),
          current_setting('b5b.pid')));

-- ── Reveal ──────────────────────────────────────────────────────────────────
-- b_elig now has BOTH sides (client review inserted above on b_rep, provider review
-- here on b_elig)... so assert reveal on the pair that actually has both.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_allowed('reviews', 'client completes the pair on the eligible booking',
  format('insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
          values (%L, %L, %L, 5)', current_setting('b5b.b_elig'), current_setting('b5b.pid'),
          current_setting('b5b.cu')));
select pg_temp.chk('reviews', 'both sides submitted -> revealed immediately', 'true',
  public.provider_review_revealed(current_setting('b5b.b_elig')::uuid)::text);
select pg_temp.chk('reviews', 'one-sided inside the window -> NOT revealed', 'false',
  public.provider_review_revealed(current_setting('b5b.b_rep')::uuid)::text);
select pg_temp.chk('reviews', 'one-sided past the 7-day close -> revealed', 'true',
  public.provider_review_revealed(current_setting('b5b.b_win')::uuid)::text);
select pg_temp.chk('reviews', 'under_review HOLDS reveal even with both sides', 'false',
  public.provider_review_revealed(current_setting('b5b.b_ur')::uuid)::text);

-- ── Positive reads: the public reputation path is OPEN, not merely closed ───
-- Deny-only read assertions would all still pass if a SELECT policy were dropped
-- entirely (RLS on + no policy = deny all), so assert the allowed side too.
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk('reviews', 'a third party CAN read a revealed provider review', '1',
  (select count(*)::text from public.provider_reviews
     where booking_id = current_setting('b5b.b_elig')::uuid));
select pg_temp.chk('reviews', 'a third party still cannot read an unrevealed one', '0',
  (select count(*)::text from public.provider_reviews
     where booking_id = current_setting('b5b.b_rep')::uuid));

-- ── completed_at is server-authoritative and immutable ──────────────────────
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_blocked('reviews', 'provider cannot back-date completed_at',
  format('update public.bookings set completed_at = now() - interval ''30 days'' where id = %L',
         current_setting('b5b.b_elig')),
  'completed_at');
select pg_temp.chk('reviews', 'completed_at survives the rejected update', 'true',
  (select (completed_at > now() - interval '2 days')::text from public.bookings
     where id = current_setting('b5b.b_elig')::uuid));

-- ── Lifecycle guard: completed -> no_show is illegal ────────────────────────
select pg_temp.chk_blocked('reviews', 'completed -> no_show is rejected at the write boundary',
  format('update public.bookings set status = ''no_show'', no_show_flag = true where id = %L',
         current_setting('b5b.b_elig')),
  'completed booking cannot be marked no_show');
select pg_temp.chk('reviews', 'the booking is untouched after the rejected flip', 'completed',
  (select status from public.bookings where id = current_setting('b5b.b_elig')::uuid));
select pg_temp.chk('reviews', 'the earned review survives the suppression attempt', 'true',
  public.provider_review_revealed(current_setting('b5b.b_elig')::uuid)::text);
select pg_temp.chk_allowed('reviews', 'a never-completed booking can still be marked no_show',
  format('update public.bookings set status = ''no_show'', no_show_flag = true where id = %L',
         current_setting('b5b.b_pend')));
