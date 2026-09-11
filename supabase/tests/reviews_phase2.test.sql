-- B5B suite: Reviews Phase 2 — integrity and anti-gaming.
--
-- The two questions this exists to answer:
--   1. **Can one participant learn the other's review before they are allowed
--      to?** That is the whole point of a blind window, and a leak makes the
--      window decorative.
--   2. **Can two people manufacture a reputation by booking each other?**
--
-- Everything is asserted as the role that would attack it. Phase 0 built the
-- window and the reveal rule; most of what follows checks that Phase 2's
-- aggregate change did not weaken either.

do $$
declare
  pu uuid := gen_random_uuid();   -- the provider's owner
  c1 uuid := gen_random_uuid();   -- a repeat client
  c2 uuid := gen_random_uuid();   -- a second, independent client
  c3 uuid := gen_random_uuid();   -- a third
  pid uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (pu), (c1), (c2), (c3);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (pu, 'R2 Provider', 'r2_'||substr(pu::text,1,8), true) returning id into pid;
  insert into public.clients(id, name)
    values (c1, 'Repeat'), (c2, 'Second'), (c3, 'Third') on conflict (id) do nothing;
  perform set_config('b5b.r2_pu', pu::text, true);
  perform set_config('b5b.r2_c1', c1::text, true);
  perform set_config('b5b.r2_c2', c2::text, true);
  perform set_config('b5b.r2_c3', c3::text, true);
  perform set_config('b5b.r2_pid', pid::text, true);
end $$;

-- A completed booking, ready to review. `completed_at` is server-stamped and
-- immutable (Phase 0), which is what makes the review window unforgeable.
create or replace function pg_temp.r2_booking(p_client uuid, p_days_ago integer)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at, completed_at)
  values (p_client, current_setting('b5b.r2_pid')::uuid, 'a service',
          current_date - p_days_ago, 'completed',
          now() - (p_days_ago || ' days')::interval,
          now() - (p_days_ago || ' days')::interval + interval '71 hours',
          now() - (p_days_ago || ' days')::interval)
  returning id into v_id;
  return v_id;
end $$;

-- ══ 1. THE BLIND WINDOW DOES NOT LEAK ═════════════════════════════════════
--
-- The high-risk question, asserted first and from both sides.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid; v_n integer; v_code text;
begin
  perform pg_temp.act_service();
  v_bk := pg_temp.r2_booking(c1, 1);   -- completed yesterday: window is OPEN

  -- The CLIENT reviews the provider. Nobody else has reviewed yet.
  perform pg_temp.act(c1);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      review_text)
  values (v_bk, pid, c1, 5, 'great');

  -- THE PROVIDER MUST NOT SEE IT. Not the text, not the rating, not the ROW —
  -- because knowing a review exists is itself the retaliation signal.
  perform pg_temp.act(pu);
  select count(*) into v_n from public.provider_reviews where booking_id = v_bk;
  perform pg_temp.chk('reviews2',
    'a provider cannot see a client review during the blind window', '0', v_n::text);

  -- Not through the aggregate either. A rating that moved the moment a blind
  -- review landed would leak it just as loudly as showing the row.
  perform pg_temp.act_service();
  perform public.recompute_provider_rating_for(pid);
  -- `0.00`, not `0`: average_rating is numeric(…,2) and the text form carries the
  -- scale. Comparing against '0' would have failed for a correct value, which is
  -- the kind of assertion people relax instead of fixing.
  perform pg_temp.chk('reviews2', 'and the stored rating does not move for a blind review',
    '0.00', (select average_rating::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2', 'nor the review count', '0',
    (select review_count::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2', 'nor the live reputation function', '0',
    (select review_count::text from public.provider_reputation(pid)));

  -- The reviewer can always read their OWN review — they wrote it.
  perform pg_temp.act(c1);
  select count(*) into v_n from public.provider_reviews where booking_id = v_bk;
  perform pg_temp.chk('reviews2', 'but the author can see their own', '1', v_n::text);
  perform set_config('b5b.r2_blind_bk', v_bk::text, true);
  perform pg_temp.act_service();
end $$;

-- ══ 2. ONE SIDE IS ENOUGH — SILENCE NEVER SUPPRESSES ══════════════════════
--
-- The locked rule: either review is independently valid, and the other side
-- never reviewing must not invalidate or permanently hide the one that exists.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c2 uuid := current_setting('b5b.r2_c2')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_old uuid; v_n integer;
begin
  perform pg_temp.act_service();
  -- Completed 30 days ago: the 7-day window is CLOSED, and the provider never
  -- reviewed. The client's review must still reveal.
  v_old := pg_temp.r2_booking(c2, 30);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
  values (v_old, pid, c2, 4);

  perform pg_temp.chk('reviews2',
    'a one-sided review reveals when the window closes', 'true',
    public.provider_review_revealed(v_old)::text);

  perform pg_temp.act(pu);
  select count(*) into v_n from public.provider_reviews where booking_id = v_old;
  perform pg_temp.chk('reviews2', 'and the provider can then read it', '1', v_n::text);

  -- And it counts, with no counterpart in existence.
  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2',
    'a review with no counterpart still counts toward reputation', '1',
    (select review_count::text from public.provider_reputation(pid)));
  perform set_config('b5b.r2_old_bk', v_old::text, true);
end $$;

-- A COUNTERPART REVEALS EARLY. The other half of the same rule: reviewing is
-- what buys you the right to see, which is what makes the window fair rather
-- than merely slow.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid := current_setting('b5b.r2_blind_bk')::uuid;
  v_n integer;
begin
  perform pg_temp.act(pu);
  insert into public.client_reviews(booking_id, reviewer_provider_id, client_user_id, rating)
  values (v_bk, pid, c1, 5);

  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2',
    'once BOTH have reviewed, the window opens early', 'true',
    public.provider_review_revealed(v_bk)::text);
  perform pg_temp.act(pu);
  select count(*) into v_n from public.provider_reviews where booking_id = v_bk;
  perform pg_temp.chk('reviews2', 'and each side can now read the other''s', '1', v_n::text);
  perform pg_temp.act_service();
end $$;

-- ══ 3. ONE REVIEW PER REVIEWER PER BOOKING ════════════════════════════════
do $$
declare
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid := current_setting('b5b.r2_blind_bk')::uuid;
  v_code text;
begin
  perform pg_temp.act(c1);
  begin
    insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
    values (v_bk, pid, c1, 1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  -- A retry lands here too, which is what makes duplicate submission safe: the
  -- second write is refused by the constraint rather than creating a second row.
  perform pg_temp.chk('reviews2',
    'the same booking cannot be reviewed twice by the same side', '23505', v_code);

  -- THE TARGET IS NOT THE CALLER'S TO CHOOSE. Naming someone else's booking, or
  -- reviewing as someone else, is refused by the insert policy rather than by
  -- the client behaving.
  begin
    insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
    values (current_setting('b5b.r2_old_bk')::uuid, pid, c1, 5);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2',
    'a client cannot review a booking that is not theirs', '42501', v_code);
  perform pg_temp.act_service();
end $$;

-- ══ 4. A REVIEW CANNOT BE EDITED OR DELETED ═══════════════════════════════
--
-- Phase 0 shipped no UPDATE and no DELETE policy on either table, which IS the
-- preferred beta posture — so this pins the absence rather than adding a rule.
-- Without it, a reputation-manipulation loop is one permissive policy away.
select pg_temp.chk('reviews2', 'no UPDATE or DELETE policy exists on provider_reviews', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'provider_reviews'
      and cmd in ('UPDATE', 'DELETE')));
select pg_temp.chk('reviews2', 'nor on client_reviews', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'client_reviews'
      and cmd in ('UPDATE', 'DELETE')));

do $$
declare
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  v_bk uuid := current_setting('b5b.r2_blind_bk')::uuid;
  v_code text; v_n integer;
begin
  perform pg_temp.act(c1);
  update public.provider_reviews set rating = 1 where booking_id = v_bk;
  perform pg_temp.chk('reviews2', 'a reviewer cannot rewrite their own rating', '5',
    (select rating::text from public.provider_reviews where booking_id = v_bk));
  delete from public.provider_reviews where booking_id = v_bk;
  select count(*) into v_n from public.provider_reviews where booking_id = v_bk;
  perform pg_temp.chk('reviews2',
    'nor delete it to escape a bad one', '1', v_n::text);
  perform pg_temp.act_service();
end $$;

-- ══ 5. THE REPEAT-PAIR RULE ═══════════════════════════════════════════════
--
-- One client, one voice, their most recent. Twenty reviews from one pair
-- contribute exactly one value — and that value is the LATEST, so a loyal client
-- who is disappointed this time moves the rating today instead of being outvoted
-- by their own past enthusiasm.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  c3 uuid := current_setting('b5b.r2_c3')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_b uuid; v_i integer; v_rep record;
begin
  perform pg_temp.act_service();
  delete from public.provider_reviews where provider_id = pid;
  delete from public.client_reviews where reviewer_provider_id = pid;
  delete from public.bookings where provider_id = pid;

  -- The repeat pair: five completed bookings, five perfect reviews, all revealed
  -- (completed long enough ago that the window has closed).
  for v_i in 1..5 loop
    v_b := pg_temp.r2_booking(c1, 30 + v_i);
    insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                        created_at)
    values (v_b, pid, c1, 5, now() - ((30 + v_i) || ' days')::interval);
  end loop;

  select * into v_rep from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2', 'five reviews from ONE client rate as one voice', '1',
    v_rep.rating_client_count::text);
  perform pg_temp.chk('reviews2', 'but every review is still counted and shown', '5',
    v_rep.review_count::text);
  perform pg_temp.chk('reviews2', 'and the rating is that one voice', '5.00',
    v_rep.average_rating::text);

  -- THE LATEST ONE WINS. Their sixth visit went badly; the rating must reflect
  -- today, not the five times it went well.
  v_b := pg_temp.r2_booking(c1, 20);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_b, pid, c1, 1, now() - interval '20 days');
  select * into v_rep from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2',
    'a repeat client''s LATEST review is the one that counts', '1.00',
    v_rep.average_rating::text);
  perform pg_temp.chk('reviews2', 'still one voice', '1', v_rep.rating_client_count::text);
  perform pg_temp.chk('reviews2', 'and six reviews on the record', '6',
    v_rep.review_count::text);

  -- AN INDEPENDENT CLIENT IS A SECOND VOICE, and counts fully.
  v_b := pg_temp.r2_booking(c3, 25);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_b, pid, c3, 5, now() - interval '25 days');
  select * into v_rep from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2', 'an unrelated client is a second voice', '2',
    v_rep.rating_client_count::text);
  perform pg_temp.chk('reviews2', 'and the rating is the mean of the two', '3.00',
    v_rep.average_rating::text);

  -- The stored columns agree with the live function once a write recomputes them.
  perform public.recompute_provider_rating_for(pid);
  perform pg_temp.chk('reviews2', 'the stored rating matches the live rule', '3.00',
    (select average_rating::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2', 'and the stored client count too', '2',
    (select rating_client_count::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2', 'and the stored review count shows all six plus one', '7',
    (select review_count::text from public.providers where id = pid));
end $$;

-- ══ 6. WHAT CANNOT BE REVIEWED ════════════════════════════════════════════
do $$
declare
  c2 uuid := current_setting('b5b.r2_c2')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid; v_code text;
begin
  -- A booking that was never completed.
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at)
  values (c2, pid, 'never finished', current_date - 2, 'cancelled_by_client',
          now() - interval '2 days', now() + interval '1 hour')
  returning id into v_bk;

  perform pg_temp.act(c2);
  begin
    insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
    values (v_bk, pid, c2, 5);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2', 'an uncompleted booking cannot be reviewed', '42501', v_code);

  -- BARTER STAYS OUTSIDE REVIEWS ENTIRELY (beta rule). There is no path from an
  -- agreement or an obligation into either review table, and that is asserted as
  -- an ABSENCE rather than assumed: reviews hang off `bookings`, and a barter
  -- trade never creates one.
  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2', 'no review table references a barter object', '0',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public'
        and table_name in ('provider_reviews', 'client_reviews')
        and (column_name like '%agreement%' or column_name like '%obligation%'
             or column_name like '%barter%')));
  -- Structural rather than data-driven: the ONLY transaction a review can hang
  -- off is a `bookings` row, and a barter trade never creates one. Asserting the
  -- FK shape proves it for every future row, where counting today's rows would
  -- only prove it for today's.
  perform pg_temp.chk('reviews2',
    'a review''s only transaction link is a booking', '2',
    (select count(*)::text
       from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
      where tc.table_schema = 'public'
        and tc.table_name in ('provider_reviews', 'client_reviews')
        and tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name = 'bookings'));
  perform pg_temp.chk('reviews2', 'and no barter table points into a review table', '0',
    (select count(*)::text
       from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
      where tc.table_schema = 'public'
        and tc.table_name like 'barter%'
        and tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name in ('provider_reviews', 'client_reviews')));
end $$;

-- ══ 7. THE REPUTATION SURFACE DISCLOSES NOTHING EXTRA ═════════════════════
select pg_temp.chk('reviews2', 'the reputation function is callable by a visitor', 'true',
  has_function_privilege('anon', 'public.provider_reputation(uuid)', 'EXECUTE')::text);
-- It reads only revealed reviews, by the same predicate the read policy uses, so
-- it cannot become a side channel for a blind one.
select pg_temp.chk('reviews2', 'and it computes over REVEALED reviews only', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provider_reputation'
      and p.prosrc like '%provider_review_revealed%'));
-- The recompute helper stays server-side: a client that could call it could use
-- timing to infer a blind review landed.
select pg_temp.chk('reviews2', 'the recompute helper is not client-callable', 'false',
  (has_function_privilege('authenticated', 'public.recompute_provider_rating_for(uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'public.recompute_provider_rating_for(uuid)', 'EXECUTE'))::text);
select pg_temp.act_service();
