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

-- ══ 5b. THE ORDERING KEY IS THE SERVICE, AND IT IS THE SERVER'S ══════════
--
-- Two properties, and they fail in different ways.
--
-- **(a) PD-092 — "latest" is the latest SERVICE, not the latest receipt.**
-- `20261077000000` ordered on `provider_reviews.created_at`: the latest review
-- WRITTEN. A client who visits on the 1st and the 5th, then reviews the 5th visit
-- first and the 1st visit second, had their OLDER visit decide the rating. A late
-- review of an old service must not replace the reputation contribution of a more
-- recent one, so the key is `bookings.completed_at` — the same server-stamped,
-- immutable chronology eligibility, the blind window and reveal already use.
--
-- **(b) The key must not be reviewer-settable.** `created_at` was `DEFAULT now()`
-- with INSERT granted on every column: the reviewer picked it, and could pin one
-- review as "latest" forever in a record that can never be edited or deleted.
-- `20261079000000` stamps it. It now only breaks ties, but a tie-break a reviewer
-- controls is still a channel.
--
-- **THE SUITE ABOVE COULD NOT HAVE CAUGHT EITHER**, and the reason is worth
-- recording. Every review in § 5 is seeded as `service_role` on a 40-day-old
-- booking, because `review_eligible` requires the 7-day window to still be open
-- and a client simply cannot write that history. So § 5 demonstrated the ordering
-- rule from the one role that is ALLOWED to choose a timestamp, and never asked
-- whether a CLIENT could choose the order. This section asks, as the client, on
-- bookings they are genuinely eligible to review.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c3 uuid := current_setting('b5b.r2_c3')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_b1 uuid; v_b2 uuid; v_when timestamptz; v_rep record;
begin
  perform pg_temp.act_service();
  delete from public.provider_reviews where provider_id = pid;
  delete from public.client_reviews where reviewer_provider_id = pid;
  delete from public.bookings where provider_id = pid;
  v_b1 := pg_temp.r2_booking(c3, 1);   -- the RECENT service (yesterday)
  v_b2 := pg_temp.r2_booking(c3, 2);   -- the OLDER service (the day before)

  -- The client reviews the RECENT service first, and tries to pin their own voice
  -- as "latest" in the year 2999 while they are at it.
  perform pg_temp.act(c3);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_b1, pid, c3, 5, timestamptz '2999-01-01');

  perform pg_temp.act_service();
  select created_at into v_when from public.provider_reviews where booking_id = v_b1;
  perform pg_temp.chk('reviews2',
    'a client-supplied review timestamp does not survive the insert', 'true',
    (v_when < now() + interval '1 minute')::text);

  -- Then they get round to the OLDER service. This review is written LATER — it
  -- is the "latest receipt" — and under PD-092 it must NOT take over the rating,
  -- because the service it describes happened first.
  perform pg_temp.act(c3);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_b2, pid, c3, 1, timestamptz '1999-01-01');

  -- Reveal both through the counterpart route, so the aggregate can see them.
  perform pg_temp.act(pu);
  insert into public.client_reviews(booking_id, reviewer_provider_id, client_user_id, rating)
  values (v_b1, pid, c3, 5), (v_b2, pid, c3, 5);

  perform pg_temp.act_service();
  select * into v_rep from public.provider_reputation(pid);
  -- 5.00 is the review of the MOST RECENTLY COMPLETED service. 1.00 would be the
  -- last review written — the pre-PD-092 answer, and the defect the ruling names.
  perform pg_temp.chk('reviews2',
    'PD-092: the review of the most recently COMPLETED service is the one that counts',
    '5.00', v_rep.average_rating::text);
  perform pg_temp.chk('reviews2',
    'a late review of an older service does not replace it', 'true',
    (v_rep.average_rating <> 1.00)::text);
  perform pg_temp.chk('reviews2',
    'and both still display — one voice, two reviews', '2',
    v_rep.review_count::text);
  perform pg_temp.chk('reviews2', 'still one client behind the rating', '1',
    v_rep.rating_client_count::text);

  -- And the timestamp cannot be rewritten after the fact either.
  perform pg_temp.act(c3);
  begin
    update public.provider_reviews set created_at = timestamptz '2999-01-01'
     where booking_id = v_b1;
  exception when others then null;   -- no UPDATE policy; either refusal is correct
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2', 'and the timestamp cannot be moved afterwards', 'true',
    (select (created_at < now() + interval '1 minute')::text
       from public.provider_reviews where booking_id = v_b1));
end $$;

-- ══ 5b-ii. THE TIE-BREAK IS DETERMINISTIC, BECAUSE IT IS REACHABLE ════════
--
-- `completed_at` is stamped `now()` — the TRANSACTION timestamp. A provider who
-- marks two of the same client's bookings complete in ONE transaction gives both
-- the identical instant, which is one screen with two buttons, not a thought
-- experiment. `distinct on` without a total order returns an
-- implementation-defined row, and a rating that changes between two recomputes
-- with identical inputs is the worst possible failure mode: unreproducible.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c2 uuid := current_setting('b5b.r2_c2')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_same timestamptz := now() - interval '40 days';
  v_b1 uuid; v_b2 uuid; v_first numeric; v_i integer;
begin
  perform pg_temp.act_service();
  delete from public.provider_reviews where provider_id = pid;
  delete from public.client_reviews where reviewer_provider_id = pid;
  delete from public.bookings where provider_id = pid;

  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, completed_at)
  values (c2, pid, 'tied a', current_date - 40, 'completed', v_same, v_same)
  returning id into v_b1;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, completed_at)
  values (c2, pid, 'tied b', current_date - 40, 'completed', v_same, v_same)
  returning id into v_b2;

  -- Both revealed by the closed window. The reviews differ only in when they were
  -- written, which is the documented tie-break: the client's later statement stands.
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_b1, pid, c2, 1, v_same + interval '1 day'),
         (v_b2, pid, c2, 4, v_same + interval '2 days');

  select average_rating into v_first from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2',
    'services completed at the SAME instant tie-break on the later review', '4.00',
    v_first::text);

  -- Repeat it. Identical inputs must give an identical answer every time, or the
  -- ordering is not total and the rating is a coin-flip nobody can reproduce.
  for v_i in 1..5 loop
    perform pg_temp.chk('reviews2',
      'and the tie-break is stable across repeated computation',
      v_first::text,
      (select average_rating::text from public.provider_reputation(pid)));
  end loop;
end $$;

-- ══ 5c. FILING A DISPUTE IS NOT A WAY TO DELETE A REVIEW ══════════════════
--
-- `20261079000000` made the STORED rating drop the instant a booking was placed
-- `under_review`, and this section previously pinned that as correct. Product
-- reversed it, and the reason is the whole of PD-068: filing is an ACT BY A
-- PARTICIPANT, with no adjudication behind it. A rating that falls when someone
-- files a complaint hands either side an unreviewed veto over the other's public
-- record — the provider who dislikes a 1-star, and the client who wants leverage,
-- reach for exactly the same button.
--
--   * NOT YET REVEALED when the dispute opens  → stays held. Nothing public is
--     being retracted, because nothing was public.
--   * ALREADY REVEALED when the dispute opens  → stays revealed, keeps counting.
--   * Only an operator RESOLUTION may change that, under a rule that does not yet
--     exist and is not invented here.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  c2 uuid := current_setting('b5b.r2_c2')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_pub uuid; v_blind uuid; v_rep record; v_code text;
begin
  perform pg_temp.act_service();
  delete from public.provider_reviews where provider_id = pid;
  delete from public.client_reviews where reviewer_provider_id = pid;
  delete from public.bookings where provider_id = pid;

  -- ── A published review, revealed by the window closing ──────────────────
  v_pub := pg_temp.r2_booking(c1, 40);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_pub, pid, c1, 1, now() - interval '39 days');
  perform public.recompute_provider_rating_for(pid);
  perform pg_temp.chk('reviews2', 'the review is public before anyone disputes it', '1',
    (select review_count::text from public.providers where id = pid));

  -- ── Someone files. Nothing about the public record may move. ────────────
  update public.bookings set under_review = true where id = v_pub;
  select * into v_rep from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2',
    'filing a dispute does not hide an ALREADY REVEALED review', '1',
    v_rep.review_count::text);
  perform pg_temp.chk('reviews2', 'nor drop it out of the rating', '1.00',
    v_rep.average_rating::text);
  perform pg_temp.chk('reviews2',
    'and the STORED number every surface displays does not move either', '1.00',
    (select average_rating::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2', 'nor the stored count', '1',
    (select review_count::text from public.providers where id = pid));
  -- The reviewer can still see their own row, and the read policy still resolves —
  -- this is a reveal question, not a row-visibility trick.
  perform pg_temp.act(pu);
  perform pg_temp.chk('reviews2',
    'and the provider still sees the review they disputed', '1',
    (select count(*)::text from public.provider_reviews where booking_id = v_pub));

  -- ── A review still inside the blind window IS held by a dispute ─────────
  perform pg_temp.act_service();
  v_blind := pg_temp.r2_booking(c2, 1);       -- completed yesterday: window OPEN
  perform pg_temp.act(c2);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
  values (v_blind, pid, c2, 5);

  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2', 'a blind review counts for nothing to begin with', '1',
    (select review_count::text from public.provider_reputation(pid)));
  update public.bookings set under_review = true where id = v_blind;
  perform pg_temp.chk('reviews2',
    'and a dispute on a never-public review keeps it held', '1',
    (select review_count::text from public.provider_reputation(pid)));

  -- A counterpart review cannot be used to force reveal DURING a hold: eligibility
  -- refuses the write outright, so the hold is not routed around.
  perform pg_temp.act(pu);
  begin
    insert into public.client_reviews(booking_id, reviewer_provider_id, client_user_id, rating)
    values (v_blind, pid, c2, 5);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2',
    'and no counterpart review can be written to force it open', '42501', v_code);

  -- ── Lifting the hold returns it to the ordinary rule, nothing more ──────
  perform pg_temp.act_service();
  update public.bookings set under_review = false where id = v_blind;
  perform pg_temp.chk('reviews2',
    'lifting the hold does not itself reveal a review still inside its window', '1',
    (select review_count::text from public.provider_reputation(pid)));

  perform pg_temp.act(pu);
  insert into public.client_reviews(booking_id, reviewer_provider_id, client_user_id, rating)
  values (v_blind, pid, c2, 5);

  perform pg_temp.act_service();
  select * into v_rep from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2',
    'and the ordinary counterpart reveal then works as it always did', '2',
    v_rep.review_count::text);
  -- c1 (1★, still disputed and still counting) and c2 (5★): two voices.
  perform pg_temp.chk('reviews2', 'the disputed review is still one of the two voices',
    '2', v_rep.rating_client_count::text);
  perform pg_temp.chk('reviews2', 'and still in the mean', '3.00',
    v_rep.average_rating::text);
  perform pg_temp.chk('reviews2', 'stored and live agree throughout', 'true',
    (select (p.review_count = r.review_count and p.average_rating = r.average_rating)::text
       from public.providers p, public.provider_reputation(pid) r where p.id = pid));
end $$;

-- ══ 5d. THE HOLD INSTANT IS THE SERVER'S, AND SURVIVES OTHER WRITES ══════
--
-- The latch above is only as trustworthy as `under_review_at`. If a disputant
-- could choose it, they would choose which already-public reviews their dispute
-- suppresses — the exact power the ruling removes, one column over.
do $$
declare
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid; v_at timestamptz;
begin
  perform pg_temp.act_service();
  v_bk := pg_temp.r2_booking(c1, 40);

  perform pg_temp.chk('reviews2', 'a booking with no dispute has no hold instant', 'true',
    (select (under_review_at is null)::text from public.bookings where id = v_bk));

  -- service_role opens the hold AND supplies a backdated instant. Only one of
  -- those is honoured, and it is not the supplied one: no carve-out here.
  update public.bookings
     set under_review = true, under_review_at = timestamptz '1999-01-01'
   where id = v_bk;
  select under_review_at into v_at from public.bookings where id = v_bk;
  perform pg_temp.chk('reviews2',
    'the hold instant is stamped by the server, not supplied', 'true',
    (v_at > now() - interval '1 hour')::text);

  -- An unrelated booking write must not move it, or every later edit would
  -- re-date the dispute and re-decide what it suppresses.
  update public.bookings set service_name = 'renamed' where id = v_bk;
  perform pg_temp.chk('reviews2', 'and an unrelated booking write does not re-date it',
    'true',
    (select (under_review_at = v_at)::text from public.bookings where id = v_bk));

  update public.bookings set under_review = false where id = v_bk;
  perform pg_temp.chk('reviews2', 'lifting the hold clears it', 'true',
    (select (under_review_at is null)::text from public.bookings where id = v_bk));

  delete from public.bookings where id = v_bk;
end $$;

-- ══ 5e. THE LEGACY HOLD, AND THE ASSERTION THAT WOULD HAVE CAUGHT IT ═════
--
-- `20261082000000` created the stamping trigger and THEN ran its backfill. The
-- backfill does not change `under_review`, so the trigger took its unchanged-hold
-- branch and wrote `old.under_review_at` — `NULL` — straight back. The backfill
-- wrote nothing, silently, while the migration comment and the ledger both
-- asserted the post-condition. Nothing broke, because the latch tests for null
-- and fails closed; the safety net was doing the load-bearing work while the
-- documentation credited the anchor. `20261086000000` heals it inside the
-- function, which is the only place the value can be computed without letting a
-- writer supply it.
--
-- The first assertion here is the one that was missing and is worth more than the
-- fix: it is a whole-table post-condition, so it catches the same class again.
select pg_temp.chk('reviews2', 'no held booking is missing its hold instant', '0',
  (select count(*)::text from public.bookings
    where under_review = true and under_review_at is null));

-- WHY THE NULL STATE IS PINNED BY SOURCE AND NOT BY A FIXTURE, recorded because
-- "just construct the row" is the obvious objection.
--
-- The state this guards against is now UNREACHABLE: the trigger overwrites
-- `under_review_at` on every path, so the only way to manufacture a held booking
-- with a null instant is `alter table public.bookings disable trigger` — which
-- takes an **ACCESS EXCLUSIVE lock on `bookings` and holds it until the
-- transaction ends**. This suite runs as ONE transaction that lasts minutes, so
-- that lock would stall every other session's access to the hottest table in the
-- schema for the whole run. A first version of this section did exactly that, and
-- the db-security job failed once, against a database the concurrency harness was
-- writing to at the same time.
--
-- A test that takes the product down to prove a point is not worth the point. So:
-- the ABSENCE is pinned above as a whole-table post-condition, and the
-- fail-closed branch is pinned in the source, where removing it is the edit that
-- would matter.
do $$
declare v_src text;
begin
  perform pg_temp.act_service();
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provider_review_revealed';
  perform pg_temp.chk('reviews2',
    'the latch refuses to evaluate a hold with no recorded instant', 'true',
    (v_src ~* 'under_review_at\s+is\s+not\s+null')::text);

  -- And the heal itself, which is the mechanism the post-condition rests on.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'stamp_under_review_at';
  perform pg_temp.chk('reviews2',
    'and an unchanged hold heals a missing instant to completed_at', 'true',
    (v_src ~* 'coalesce\s*\(\s*old\.under_review_at')::text);
  -- The supplied value is never read, on any path. That is the PD-093 property:
  -- choosing the instant would mean choosing which public reviews a dispute
  -- suppresses, so there is no `new.under_review_at` on the right-hand side of
  -- any assignment in this function.
  perform pg_temp.chk('reviews2',
    'and a caller-supplied hold instant is never read', 'false',
    (v_src ~* ':=\s*[^;]*new\.under_review_at')::text);
end $$;

-- THE POSTURE FOR A CLIENT SUPPLYING THE FIELD, pinned as what it IS rather than
-- as what would be tidier. `under_review_at` is NOT in
-- `enforce_booking_write_integrity`'s non-user-editable list — that function is
-- ~290 lines and has lost a rule to a copy-forward three times, so it was not
-- reopened for a fourth, redundant pin. The boundary is the stamp's
-- unconditional overwrite, so the write is CLAMPED rather than refused. If this
-- ever flips to an exception the guard grew the field, which is an improvement —
-- but it must be a deliberate one.
do $$
declare
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid; v_code text;
begin
  perform pg_temp.act_service();
  v_bk := pg_temp.r2_booking(c1, 40);
  perform pg_temp.act(c1);
  begin
    update public.bookings set under_review_at = timestamptz '1999-01-01' where id = v_bk;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2',
    'a client supplying a hold instant is clamped, not obeyed', 'true',
    (select (under_review_at is null)::text from public.bookings where id = v_bk));
  delete from public.bookings where id = v_bk;
end $$;

-- ══ 5f. TWO ONE-WORD EDITS THAT WOULD LOOK LIKE CONCURRENCY BUGS ═════════
--
-- Both are single tokens inside function bodies, both are invisible to every
-- behavioural test, and both would surface as intermittent failures that get
-- diagnosed as races rather than as the edits they are.
do $$
declare v_src text;
begin
  perform pg_temp.act_service();

  -- `review_window_closed` must use `now()` — the TRANSACTION timestamp. Under
  -- `clock_timestamp()` the reveal predicate would return different answers at
  -- different points inside ONE transaction, so `reputation_is_derived` (which
  -- re-evaluates the canonical query inside the recompute's own UPDATE) would
  -- trip at random near a 7-day boundary. The symptom would be a `23514` nobody
  -- can reproduce.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'review_window_closed';
  perform pg_temp.chk('reviews2',
    'the window clock is the transaction''s, not the wall''s', 'false',
    (v_src ~* 'clock_timestamp')::text);
  perform pg_temp.chk('reviews2', 'and it is still now()', 'true',
    (v_src ~* '\mnow\s*\(\s*\)')::text);

  -- The recompute triggers on both review tables are what serialize every writer
  -- that can change the canonical answer — that is why the invariant above cannot
  -- trip against an honest concurrent reviewer. Their EVENT lists are the
  -- mechanism, so they are pinned. `client_reviews` is insert/delete only: a
  -- privileged UPDATE of a counterpart's created_at would move a latch input
  -- without recomputing. Unreachable by any client role (no UPDATE policy), and
  -- pinned so the asymmetry stays a decision rather than becoming an omission.
  perform pg_temp.chk('reviews2',
    'the provider_reviews recompute fires on insert, update and delete', 'true',
    (select (t.tgtype & 28) = 28 from pg_trigger t
      where t.tgrelid = 'public.provider_reviews'::regclass
        and t.tgname = 'provider_reviews_recompute_rating')::text);
  perform pg_temp.chk('reviews2',
    'and the client_reviews one on insert and delete (NOT update — see OQ-080)',
    'true',
    (select (t.tgtype & 4) = 4 and (t.tgtype & 8) = 8 and (t.tgtype & 16) = 0
       from pg_trigger t
      where t.tgrelid = 'public.client_reviews'::regclass
        and t.tgname = 'client_reviews_recompute_provider_rating')::text);
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

-- ══ 6b. THE TWO THINGS A REBUILD WOULD SILENTLY DROP ═════════════════════
--
-- Both properties below live INSIDE function bodies and trigger definitions, so
-- a `create or replace` that starts from an older copy removes them without any
-- error, any failing behavioural test that happens to run single-threaded, or any
-- visible symptom until the damage is already in the aggregate. This repo has
-- lost a rule to a copy-forward twice (`20261055000000` documents both), so these
-- are pinned by NAME rather than only by behaviour.
do $$
declare
  v_src text;
begin
  perform pg_temp.act_service();

  -- The stamping triggers exist on BOTH review tables.
  perform pg_temp.chk('reviews2',
    'a created_at stamping trigger guards provider_reviews', 'true',
    (select exists (select 1 from pg_trigger t
                     where t.tgrelid = 'public.provider_reviews'::regclass
                       and t.tgname = 'a_provider_review_created_at_server'
                       and not t.tgisinternal))::text);
  perform pg_temp.chk('reviews2',
    'and client_reviews, so the next rule built on it starts trustworthy', 'true',
    (select exists (select 1 from pg_trigger t
                     where t.tgrelid = 'public.client_reviews'::regclass
                       and t.tgname = 'a_client_review_created_at_server'
                       and not t.tgisinternal))::text);

  -- It must fire BEFORE INSERT — an AFTER trigger cannot change the stored value,
  -- and the rewrite would be accepted silently.
  perform pg_temp.chk('reviews2',
    'and it is a BEFORE trigger, or it could not change what is stored', 'true',
    (select (t.tgtype & 2) = 2 from pg_trigger t
      where t.tgrelid = 'public.provider_reviews'::regclass
        and t.tgname = 'a_provider_review_created_at_server')::text);

  -- The recompute takes the row BEFORE it counts. Counting first and locking
  -- second is what let two concurrent reviews each write a total that omitted the
  -- other; the lost update is invisible to this suite, which runs in a single
  -- transaction, so the ONLY defence here is that the lock is still in the source.
  select p.prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'recompute_provider_rating_for';
  -- PIN THE PROPERTY, NOT THE PHRASE. This first asserted the literal `for
  -- update`, which would have FAILED the moment 20261081000000 replaced it with
  -- the safer `for no key update`. A pin that reports a fix as a regression is
  -- worse than no pin, because the reflex is to relax it. What matters is that a
  -- row lock is taken, that it is taken BEFORE the counting, and that it is not
  -- the one mode that deadlocks against the foreign key's own key share.
  perform pg_temp.chk('reviews2',
    'the recompute still takes a row lock on the provider', 'true',
    (v_src ~* 'for\s+(no\s+key\s+)?update\s*;')::text);
  perform pg_temp.chk('reviews2',
    'and takes it BEFORE the counting update, which is the whole fix', 'true',
    (strpos(v_src, 'for no key update') > 0
     and strpos(v_src, 'for no key update')
         < strpos(v_src, 'update public.providers'))::text);
  perform pg_temp.chk('reviews2',
    'and no harder than it needs to be — bare FOR UPDATE deadlocks the FK', 'false',
    (v_src ~* 'for\s+update\s*;')::text);
  -- The rule itself moved OUT of this function in 20261083000000 and into
  -- `provider_reputation_canonical`, which is the point: it used to be written
  -- twice — here and in `provider_reputation` — with the ordering clause copied
  -- between them, and PD-092 added a JOIN to that clause. So what is pinned here
  -- is the DELEGATION, and the rule is pinned once, below.
  perform pg_temp.chk('reviews2',
    'and it stores what the canonical function computes rather than its own copy',
    'true', (v_src like '%provider_reputation_canonical%')::text);
  perform pg_temp.chk('reviews2',
    'and keeps no second copy of the rule to drift', 'false',
    (v_src ~* 'distinct\s+on\s*\(\s*pr\.reviewer_user_id')::text);

  select p.prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provider_reputation_canonical';
  perform pg_temp.chk('reviews2',
    'the canonical rule still counts only REVEALED reviews', 'true',
    (v_src like '%provider_review_revealed%')::text);
  perform pg_temp.chk('reviews2',
    'and is still one voice per distinct client (PD-091)', 'true',
    (v_src ~* 'distinct\s+on\s*\(\s*pr\.reviewer_user_id')::text);
  -- PD-092. Pinned in the SOURCE as well as behaviourally, because a copy-forward
  -- from 20261077000000 would silently restore review-order and every behavioural
  -- assertion that does not happen to review out of service order would still pass.
  perform pg_temp.chk('reviews2',
    'and ordered by the SERVICE chronology, not the review order (PD-092)', 'true',
    (v_src ~* 'order\s+by\s+pr\.reviewer_user_id\s*,\s*b\.completed_at\s+desc')::text);
  perform pg_temp.chk('reviews2',
    'and joined to bookings, which is where that chronology lives', 'true',
    (v_src ~* 'join\s+public\.bookings')::text);
  -- Without a total order `distinct on` returns an implementation-defined row.
  perform pg_temp.chk('reviews2',
    'and finishes on a total order, so the answer cannot wobble', 'true',
    (v_src ~* 'pr\.id\s+desc')::text);

  -- EXACTLY ONE function may contain the rule. This is the assertion that makes
  -- "do not restate this query anywhere" enforceable rather than a comment.
  perform pg_temp.chk('reviews2',
    'and exactly one function in the schema contains the rule', '1',
    (select count(*)::text from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosrc ~* 'distinct\s+on\s*\(\s*pr\.reviewer_user_id'));
end $$;

-- ══ 6c. NOBODY BUT AN OPERATOR CAN PUT A BOOKING UNDER REVIEW ════════════
--
-- § 5c gave `bookings` a trigger that recomputes a provider's public reputation.
-- That is a SECURITY DEFINER write to someone else's reputation row, fired by an
-- UPDATE on a booking — so its entire safety rests on a rule enforced somewhere
-- else: `under_review` and `completed_at` are refused to every non-service_role
-- writer. Nothing in the reviews suite pinned that, which means the reviews
-- feature depended on a guarantee it never checked.
--
-- **ASSERTED ON THE STORED VALUE, NOT ON AN EXCEPTION.** Two different mechanisms
-- refuse these writes and only one of them raises: `enforce_booking_write_integrity`
-- throws `check_violation` when it is reached, but on a COMPLETED booking RLS has
-- already filtered the row out of the client's UPDATE scope, so the statement
-- affects zero rows and raises nothing at all. An error-shaped assertion scores
-- that silent, stronger refusal as a pass-through. The property that actually
-- matters is that the column does not move.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c3 uuid := current_setting('b5b.r2_c3')::uuid;
  v_bk uuid; v_draft uuid; v_when timestamptz; v_raised text;
begin
  perform pg_temp.act_service();
  v_bk := pg_temp.r2_booking(c3, 1);
  select completed_at into v_when from public.bookings where id = v_bk;

  -- The client cannot suppress a review by disputing their own booking, and
  -- cannot move the anchor the whole blind window is measured from.
  perform pg_temp.act(c3);
  begin
    update public.bookings set under_review = true where id = v_bk;
  exception when others then null;
  end;
  begin
    update public.bookings set completed_at = now() - interval '30 days' where id = v_bk;
  exception when others then null;
  end;

  -- The provider is the one that matters: a provider who could set this at will
  -- could hold every bad review they ever received, indefinitely.
  perform pg_temp.act(pu);
  begin
    update public.bookings set under_review = true where id = v_bk;
  exception when others then null;
  end;

  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2',
    'neither party can put a booking under review', 'false',
    (select under_review::text from public.bookings where id = v_bk));
  perform pg_temp.chk('reviews2',
    'and neither can move completed_at, which anchors the blind window', 'true',
    (select (completed_at = v_when)::text from public.bookings where id = v_bk));

  -- And where RLS DOES let the row through, the trigger is the refusal. A draft
  -- is genuinely updatable by its owner, so this reaches the write gate and pins
  -- the gate itself rather than only the policy in front of it.
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (c3, current_setting('b5b.r2_pid')::uuid, 'draft svc', current_date + 3)
  returning id into v_draft;

  perform pg_temp.act(c3);
  begin
    update public.bookings set under_review = true where id = v_draft;
    v_raised := 'NONE';
  exception when others then v_raised := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('reviews2',
    'on a row the client CAN update, the write gate raises rather than ignoring',
    '23514', v_raised);
  perform pg_temp.chk('reviews2', 'and the draft is not under review either', 'false',
    (select under_review::text from public.bookings where id = v_draft));

  delete from public.bookings where id in (v_bk, v_draft);
end $$;

-- ══ 7. THE REPUTATION SURFACE DISCLOSES NOTHING EXTRA ═════════════════════
select pg_temp.chk('reviews2', 'the reputation function is callable by a visitor', 'true',
  has_function_privilege('anon', 'public.provider_reputation(uuid)', 'EXECUTE')::text);
-- It reads only revealed reviews, by the same predicate the read policy uses, so
-- it cannot become a side channel for a blind one.
-- It delegates to the canonical rule, which reads revealed reviews only by the
-- same predicate the read policy uses, so it cannot become a side channel for a
-- blind one. Pinned on the delegation AND on the callee, because a rewrite that
-- inlined a query here would otherwise satisfy neither check nor fail one.
select pg_temp.chk('reviews2', 'and it computes over REVEALED reviews only', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provider_reputation'
      and p.prosrc like '%provider_reputation_canonical%'));
-- The canonical engine itself is NOT client-callable. It is the same numbers, but
-- granting it would publish an un-gated entry point to the reputation rule for no
-- reason — `provider_reputation` is the public door and it is already open.
select pg_temp.chk('reviews2', 'the canonical engine is not client-callable', 'false',
  (has_function_privilege('authenticated', 'public.provider_reputation_canonical(uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'public.provider_reputation_canonical(uuid)', 'EXECUTE'))::text);
-- The recompute helper stays server-side: a client that could call it could use
-- timing to infer a blind review landed.
select pg_temp.chk('reviews2', 'the recompute helper is not client-callable', 'false',
  (has_function_privilege('authenticated', 'public.recompute_provider_rating_for(uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'public.recompute_provider_rating_for(uuid)', 'EXECUTE'))::text);

-- ══ 7b. THE PUBLIC LIST IS NOT THE READ POLICY ═══════════════════════════
--
-- `provider_reviews_read` is `auth.uid() = reviewer_user_id OR revealed` — right
-- as a PRIVACY boundary, because a reviewer must be able to read back what they
-- wrote. The app used it as the definition of the PUBLIC review list, so the
-- author, inside their own blind window, opened the provider's profile and found
-- their not-yet-public review listed and counted — one tap below the screen that
-- had just promised it stays private.
--
-- Two different questions: *may I read this row* and *is this row public*.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_blind uuid; v_open uuid;
begin
  perform pg_temp.act_service();
  delete from public.provider_reviews where provider_id = pid;
  delete from public.client_reviews where reviewer_provider_id = pid;
  delete from public.bookings where provider_id = pid;

  v_open  := pg_temp.r2_booking(c1, 40);   -- window closed: public
  v_blind := pg_temp.r2_booking(c1, 1);    -- window open, no counterpart: blind
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_open, pid, c1, 5, now() - interval '39 days');

  perform pg_temp.act(c1);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
  values (v_blind, pid, c1, 1);

  -- The AUTHOR reads. The policy hands them both rows — correctly.
  perform pg_temp.chk('reviews2',
    'the author can still read back their own blind review', '2',
    (select count(*)::text from public.provider_reviews where provider_id = pid));

  -- The public list is only the revealed one, ASKED AS THE AUTHOR, because that
  -- is the caller for whom the two answers differ.
  perform pg_temp.chk('reviews2',
    'but the public list contains only the revealed review, even for its author',
    '1', (select count(*)::text from public.revealed_provider_review_ids(pid)));
  perform pg_temp.chk('reviews2', 'and it is the revealed one', 'true',
    (select exists (
       select 1 from public.revealed_provider_review_ids(pid) as rid(review_id)
        join public.provider_reviews pr on pr.id = rid.review_id
       where pr.booking_id = v_open))::text);
  perform pg_temp.chk('reviews2', 'and never the blind one', 'false',
    (select exists (
       select 1 from public.revealed_provider_review_ids(pid) as rid(review_id)
        join public.provider_reviews pr on pr.id = rid.review_id
       where pr.booking_id = v_blind))::text);

  -- A stranger gets the same answer, which is what makes it a PUBLIC list rather
  -- than a per-caller one.
  perform pg_temp.act(pu);
  perform pg_temp.chk('reviews2', 'a visitor sees the same public list', '1',
    (select count(*)::text from public.revealed_provider_review_ids(pid)));
end $$;

-- It is the public door, so anon may open it; it discloses nothing the read
-- policy does not already hand to anon.
select pg_temp.chk('reviews2', 'the public-list function is callable by a visitor', 'true',
  (has_function_privilege('anon', 'public.revealed_provider_review_ids(uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.revealed_provider_review_ids(uuid)', 'EXECUTE'))::text);
select pg_temp.chk('reviews2', 'and it uses the same reveal predicate as the policy', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'revealed_provider_review_ids'
      and p.prosrc like '%provider_review_revealed%'));
select pg_temp.act_service();

-- ══ 8. THERE IS NO MANUAL RATING PIN ══════════════════════════════════════
--
-- OQ-079's ruling: *"Public rating must be derived from canonical eligible
-- review data. There is NO manual/service-role rating override or permanent
-- rating pin."* Asserted as the ROLE THE RULING IS ABOUT — `service_role`, which
-- bypasses RLS and holds every column grant — because a check that only proves a
-- client cannot do it proves nothing about the ruling.
do $$
declare
  pu uuid := current_setting('b5b.r2_pu')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  v_code text; v_bk uuid; v_new uuid;
begin
  perform pg_temp.act_service();
  delete from public.provider_reviews where provider_id = pid;
  delete from public.client_reviews where reviewer_provider_id = pid;
  delete from public.bookings where provider_id = pid;
  perform public.recompute_provider_rating_for(pid);

  begin
    update public.providers set average_rating = 5.00 where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2',
    'service_role cannot store a rating the review data does not produce',
    '23514', v_code);

  begin
    update public.providers set review_count = 99 where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2', 'nor a review count', '23514', v_code);

  begin
    update public.providers set rating_client_count = 99 where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2', 'nor a client count', '23514', v_code);

  -- `providers.rating` is the one that was actually live: no recompute had ever
  -- written it, and `hooks/useProviders.ts` ranked and filtered provider SEARCH on
  -- it while every display surface read `average_rating`. A value written here was
  -- a permanent, invisible, hand-set marketplace position.
  begin
    update public.providers set rating = 4.90 where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2',
    'nor the legacy search-ranking rating column', '23514', v_code);

  -- And a provider cannot be CREATED carrying one, which is how seeded or
  -- imported rows would have arrived with reputation nobody earned.
  begin
    insert into public.providers(user_id, display_name, username, is_approved,
                                 average_rating, rating, review_count)
    values (pu, 'pinned', 'pinned_'||substr(gen_random_uuid()::text,1,8), true, 5.00, 5.00, 42)
    returning id into v_new;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('reviews2',
    'and a provider cannot be seeded with a rating either', '23514', v_code);

  -- The legitimate writer still works, and `rating` now tracks `average_rating`.
  v_bk := pg_temp.r2_booking(c1, 40);
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      created_at)
  values (v_bk, pid, c1, 4, now() - interval '39 days');
  perform public.recompute_provider_rating_for(pid);
  perform pg_temp.chk('reviews2',
    'the derived rating is still written by the recompute', '4.00',
    (select average_rating::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2',
    'and the search-ranking column mirrors it rather than lagging at zero', '4.00',
    (select rating::text from public.providers where id = pid));
  perform pg_temp.chk('reviews2', 'and it equals a fresh canonical computation', 'true',
    (select (p.rating = c.average_rating and p.average_rating = c.average_rating
             and p.review_count = c.review_count
             and p.rating_client_count = c.rating_client_count)::text
       from public.providers p, public.provider_reputation_canonical(pid) c
      where p.id = pid));
end $$;

-- The other half of the same boundary, from underneath: a provider holds no
-- UPDATE privilege on any reputation column, so the invariant above is the second
-- line of defence for a client role and the FIRST for service_role.
select pg_temp.chk('reviews2',
  'a provider holds no write privilege on any reputation column', 'false',
  (has_column_privilege('authenticated', 'public.providers', 'average_rating', 'UPDATE')
   or has_column_privilege('authenticated', 'public.providers', 'rating', 'UPDATE')
   or has_column_privilege('authenticated', 'public.providers', 'review_count', 'UPDATE')
   or has_column_privilege('authenticated', 'public.providers', 'rating_client_count', 'UPDATE'))::text);
select pg_temp.chk('reviews2', 'and the invariant guards INSERT as well as UPDATE', '2',
  (select count(*)::text from pg_trigger t
    where t.tgrelid = 'public.providers'::regclass
      and t.tgname in ('providers_reputation_is_derived_ins', 'providers_reputation_is_derived_upd')
      and not t.tgisinternal));

-- ══ 9. ELIGIBILITY MOVES, REVEALED REVIEWS DO NOT ════════════════════════
--
-- `completed_at` is the anchor for eligibility, the window and reveal precisely so
-- that a LIVE STATUS change cannot be used to suppress a review (SEC-DATA-101). The
-- aggregate inherits that, and this asserts it there: a provider who dislikes a
-- published review cannot move the booking's status to make it stop counting.
do $$
declare
  c1 uuid := current_setting('b5b.r2_c1')::uuid;
  pid uuid := current_setting('b5b.r2_pid')::uuid;
  v_bk uuid; v_before integer;
begin
  perform pg_temp.act_service();
  select review_count into v_before from public.provider_reputation(pid);
  perform pg_temp.chk('reviews2', 'a published review is being counted to begin with',
    'true', (v_before > 0)::text);

  select booking_id into v_bk from public.provider_reviews
   where provider_id = pid order by created_at desc limit 1;

  update public.bookings set status = 'cancelled_by_provider' where id = v_bk;
  perform pg_temp.chk('reviews2',
    'cancelling a completed booking does not uncount its published review',
    v_before::text, (select review_count::text from public.provider_reputation(pid)));

  update public.bookings set status = 'no_show' where id = v_bk;
  perform pg_temp.chk('reviews2', 'nor does flagging it a no-show', v_before::text,
    (select review_count::text from public.provider_reputation(pid)));

  update public.bookings set status = 'completed' where id = v_bk;
end $$;

select pg_temp.act_service();
