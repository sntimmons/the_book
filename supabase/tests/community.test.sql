-- B5B suite: the Community post model.
--
-- Written BEFORE the surface it guards is finished, because the audit that
-- preceded this session found the post model had **zero** test coverage — no
-- unit test, no DB test, nothing. Every defect it turned up (inert counters, a
-- half-enforced provider gate, deapproval not reaching Community) would have
-- been caught by one suite like this, and the change this session makes is
-- exactly a change to the access matrix. So the matrix is the artifact.
--
-- Everything is asserted as the role that would attack it.

do $$
declare
  pu  uuid := gen_random_uuid();   -- an approved provider's owner
  pu2 uuid := gen_random_uuid();   -- a second approved provider's owner
  du  uuid := gen_random_uuid();   -- a DEAPPROVED provider's owner
  cu  uuid := gen_random_uuid();   -- a plain client
  bu  uuid := gen_random_uuid();   -- a client who will block, and be blocked
  pid uuid; pid2 uuid; did uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (pu), (pu2), (du), (cu), (bu);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (pu, 'Comm Provider', 'cm_'||substr(pu::text,1,8), true) returning id into pid;
  insert into public.providers(user_id, display_name, username, is_approved)
    values (pu2, 'Other Provider', 'cm2_'||substr(pu2::text,1,8), true) returning id into pid2;
  insert into public.providers(user_id, display_name, username, is_approved)
    values (du, 'Deapproved', 'cmd_'||substr(du::text,1,8), false) returning id into did;
  insert into public.clients(id, name)
    values (cu, 'A Client'), (bu, 'Blocker'), (pu, 'P Owner') on conflict (id) do nothing;

  perform set_config('b5b.cm_pu',  pu::text,  true);
  perform set_config('b5b.cm_pu2', pu2::text, true);
  perform set_config('b5b.cm_du',  du::text,  true);
  perform set_config('b5b.cm_cu',  cu::text,  true);
  perform set_config('b5b.cm_bu',  bu::text,  true);
  perform set_config('b5b.cm_pid',  pid::text,  true);
  perform set_config('b5b.cm_pid2', pid2::text, true);
  perform set_config('b5b.cm_did',  did::text,  true);
end $$;

-- Insert one post as the given caller, returning the SQLSTATE (or 'NO ERROR').
create or replace function pg_temp.cm_post(
  p_actor uuid, p_kind text, p_intent text,
  p_provider uuid default null, p_tagged uuid default null, p_booking uuid default null)
returns text language plpgsql as $$
begin
  perform pg_temp.act(p_actor);
  insert into public.community_posts(user_id, provider_id, author_kind, intent,
                                     content, tagged_provider_id, tagged_booking_id)
  values (p_actor, p_provider, p_kind, p_intent, 'some content', p_tagged, p_booking);
  perform pg_temp.act_service();
  return 'NO ERROR';
exception when others then
  perform pg_temp.act_service();
  return sqlstate;
end $$;

-- ══ 1. THE ACCESS MATRIX: WHO MAY SAY WHAT ═══════════════════════════════
--
-- The audit's finding was that the old matrix was only PARTLY deliberate — read
-- and post were provider-gated, like and bookmark never were, and nobody had
-- written down which of the six verbs was which. This section is that statement.
do $$
declare
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  du  uuid := current_setting('b5b.cm_du')::uuid;
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  did uuid := current_setting('b5b.cm_did')::uuid;
  pid2 uuid := current_setting('b5b.cm_pid2')::uuid;
begin
  -- A CLIENT MAY POST THE FOUR CLIENT INTENTS. This is the whole reshape: a
  -- client asking "who does braids in the Heights" is why the surface exists.
  perform pg_temp.chk('community', 'a client can post: looking for someone', 'NO ERROR',
    pg_temp.cm_post(cu, 'client', 'looking_for'));
  perform pg_temp.chk('community', 'a client can post: need advice', 'NO ERROR',
    pg_temp.cm_post(cu, 'client', 'need_advice'));
  perform pg_temp.chk('community', 'a client can post: who does this style', 'NO ERROR',
    pg_temp.cm_post(cu, 'client', 'who_does_this'));
  perform pg_temp.chk('community', 'a client can post: a shoutout naming a provider',
    'NO ERROR', pg_temp.cm_post(cu, 'client', 'shoutout', null, pid));

  -- AND ONLY THOSE FOUR. There is no generic client post, which is the product
  -- rule: a blank "what's on your mind" composer is how this becomes a feed.
  perform pg_temp.chk('community', 'a client cannot post a provider announcement',
    '23514', pg_temp.cm_post(cu, 'client', 'announcement'));
  perform pg_temp.chk('community', 'nor a provider update', '23514',
    pg_temp.cm_post(cu, 'client', 'update'));
  -- 20261091000000: the refusal must DESCRIBE ITSELF. This previously arrived as
  -- PT430 "publish your hours for today" — advice a client cannot act on,
  -- because they do not have hours.
  perform pg_temp.chk('community', 'nor an open-today note', '23514',
    pg_temp.cm_post(cu, 'client', 'open_today'));
  perform pg_temp.chk('community', 'and there is no generic social post to make',
    '23514', pg_temp.cm_post(cu, 'client', 'status'));

  -- A CLIENT CANNOT SPEAK AS A BUSINESS. Asserted two ways, because there are
  -- two different lies: claiming to be a provider at all, and naming someone
  -- else's business.
  perform pg_temp.chk('community', 'a client cannot post AS a provider', 'PT431',
    pg_temp.cm_post(cu, 'provider', 'update', pid));
  perform pg_temp.chk('community', 'nor while naming a real provider they do not own',
    'PT431', pg_temp.cm_post(cu, 'provider', 'announcement', pid2));

  -- A PROVIDER MAY POST THE THREE PROVIDER INTENTS, and not the client ones —
  -- a provider who wants to ask a question posts as a CLIENT, which is allowed.
  perform pg_temp.chk('community', 'a provider can post: an update', 'NO ERROR',
    pg_temp.cm_post(pu, 'provider', 'update', pid));
  perform pg_temp.chk('community', 'a provider can post: an announcement', 'NO ERROR',
    pg_temp.cm_post(pu, 'provider', 'announcement', pid));
  perform pg_temp.chk('community', 'a provider cannot post a client intent as a business',
    '23514', pg_temp.cm_post(pu, 'provider', 'need_advice', pid));
  perform pg_temp.chk('community', 'but may ask as a person, which is the point of author_kind',
    'NO ERROR', pg_temp.cm_post(pu, 'client', 'need_advice'));

  -- THE SERVER DECIDES WHICH BUSINESS. A provider who names someone else's
  -- provider id has it rewritten to their own rather than being refused, which
  -- is the stronger outcome: there is no id worth guessing.
  perform pg_temp.chk('community', 'a provider naming ANOTHER provider''s id is rewritten to their own',
    'NO ERROR', pg_temp.cm_post(pu, 'provider', 'update', pid2));
  perform pg_temp.chk('community', 'and the stored post belongs to the caller''s own business',
    '0', (select count(*)::text from public.community_posts
           where user_id = pu and provider_id = pid2));

  -- A DEAPPROVED PROVIDER CANNOT CREATE PROVIDER ACTIVITY. This is the gap
  -- 20261048000000 closed for barter writes and never closed here.
  perform pg_temp.chk('community', 'a deapproved provider cannot post as a provider',
    'PT431', pg_temp.cm_post(du, 'provider', 'update', did));
  perform pg_temp.chk('community', 'nor announce', 'PT431',
    pg_temp.cm_post(du, 'provider', 'announcement', did));
  -- They are still a PERSON, and the product does not take that away: their
  -- existing history stays readable and they can still ask a question.
  perform pg_temp.chk('community', 'but is still a person who can ask a question',
    'NO ERROR', pg_temp.cm_post(du, 'client', 'need_advice'));
end $$;

-- ══ 2. A SHOUTOUT NAMES A REAL PROVIDER, AND CHANGES NO REPUTATION ═══════
do $$
declare
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  did uuid := current_setting('b5b.cm_did')::uuid;
  v_before record; v_after record; v_bk uuid; v_code text;
begin
  perform pg_temp.act_service();
  select * into v_before from public.provider_reputation(pid);

  -- Also a CHECK constraint; the trigger answers first so the message is about
  -- the missing name rather than about a provider nobody mentioned.
  perform pg_temp.chk('community', 'a shoutout must name someone', '23514',
    pg_temp.cm_post(cu, 'client', 'shoutout'));
  perform pg_temp.chk('community', 'and it must be a real provider id', 'PT432',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, gen_random_uuid()));
  perform pg_temp.chk('community', 'and one that is actually approved', 'PT432',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, did));
  perform pg_temp.chk('community', 'a provider cannot recommend their own business',
    'PT432', pg_temp.cm_post(pu, 'client', 'shoutout', null, pid));

  -- THE PROPERTY THAT KEEPS REVIEWS AND SHOUTOUTS DIFFERENT PRODUCTS.
  perform pg_temp.act_service();
  select * into v_after from public.provider_reputation(pid);
  perform pg_temp.chk('community', 'a shoutout moves no rating', 'true',
    (v_before.average_rating = v_after.average_rating)::text);
  perform pg_temp.chk('community', 'no review count', 'true',
    (v_before.review_count = v_after.review_count)::text);
  perform pg_temp.chk('community', 'and no client count', 'true',
    (v_before.rating_client_count = v_after.rating_client_count)::text);
  -- Structural, so it holds for every future row rather than today's: the
  -- reputation rule reads the review tables and nothing else.
  perform pg_temp.chk('community', 'and the reputation rule cannot see community at all',
    'false',
    (select (p.prosrc like '%community%') from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'provider_reputation_canonical')::text);
  perform pg_temp.chk('community', 'no community table points into a review table', '0',
    (select count(*)::text
       from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name
      where tc.table_schema = 'public'
        and tc.table_name like 'community%'
        and tc.constraint_type = 'FOREIGN KEY'
        and ccu.table_name in ('provider_reviews', 'client_reviews')));
  perform pg_temp.chk('community', 'and community carries no rating column of its own', '0',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name like 'community%'
        and column_name in ('rating', 'stars', 'score', 'average_rating')));

  -- OPTIONAL booking evidence, VERIFIED when offered. A surface may say "worked
  -- with them" only because the server checked it.
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, completed_at)
  values (cu, pid, 'a service', current_date - 3, 'completed',
          now() - interval '3 days', now() - interval '3 days')
  returning id into v_bk;
  perform pg_temp.chk('community', 'a shoutout may cite the author''s own completed booking',
    'NO ERROR', pg_temp.cm_post(cu, 'client', 'shoutout', null, pid, v_bk));

  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at)
  values (cu, pid, 'not finished', current_date - 1, 'pending', now() - interval '1 day')
  returning id into v_bk;
  perform pg_temp.chk('community', 'but not an uncompleted one', 'PT433',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, pid, v_bk));

  -- Somebody ELSE's completed booking with the same provider. `bu` is used
  -- rather than `pu` because a provider cannot book themselves.
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, completed_at)
  values (current_setting('b5b.cm_bu')::uuid, pid, 'someone else''s', current_date - 3,
          'completed', now() - interval '3 days', now() - interval '3 days')
  returning id into v_bk;
  perform pg_temp.chk('community', 'nor somebody else''s booking', 'PT433',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, pid, v_bk));
end $$;

-- ══ 3. OPEN TODAY RIDES ON REAL AVAILABILITY, AND ENDS ═══════════════════
--
-- The requirement was: structured, time-bounded, gone from Open Today after
-- expiry, and NOT requiring history to be deleted to stop surfacing. All four
-- are asserted, and so is the one that makes them worth having — a provider
-- cannot claim to be open.
do $$
declare
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  v_id uuid; v_exp timestamptz;
begin
  perform pg_temp.act_service();
  delete from public.provider_availability where provider_id = pid;

  -- NO HOURS PUBLISHED → the note is refused. The product does not let a
  -- provider assert availability it has no record of.
  perform pg_temp.chk('community', 'a provider with no published hours cannot post Open Today',
    'PT430', pg_temp.cm_post(pu, 'provider', 'open_today', pid));

  -- Publish today's weekday in the provider's own timezone.
  perform pg_temp.act_service();
  insert into public.provider_availability(provider_id, weekday, start_time, end_time,
                                           is_available, timezone)
  values (pid,
          extract(dow from (now() at time zone 'America/Chicago'))::int,
          '09:00', '17:00', true, 'America/Chicago');

  perform pg_temp.chk('community', 'and can once the hours are actually published',
    'NO ERROR', pg_temp.cm_post(pu, 'provider', 'open_today', pid));

  perform pg_temp.act_service();
  select id, expires_at into v_id, v_exp from public.community_posts
   where provider_id = pid and intent = 'open_today' order by created_at desc limit 1;

  perform pg_temp.chk('community', 'the expiry is the server''s, and it exists', 'true',
    (v_exp is not null and v_exp > now())::text);
  perform pg_temp.chk('community', 'and it ends within a day, not eventually', 'true',
    (v_exp <= now() + interval '1 day')::text);

  -- IT SURFACES WHILE IT IS TRUE.
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'an Open Today note surfaces while the day lasts', '1',
    (select count(*)::text from public.community_posts_visible where id = v_id));

  -- AND STOPS, WITHOUT ANYTHING BEING DELETED. Two independent ways, because
  -- either alone would be a surface that can lie.
  perform pg_temp.act_service();
  update public.community_posts set expires_at = now() - interval '1 minute' where id = v_id;
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'an EXPIRED Open Today note stops surfacing', '0',
    (select count(*)::text from public.community_posts_visible where id = v_id));
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'and the row is still there — history is not deleted', '1',
    (select count(*)::text from public.community_posts where id = v_id));

  -- Restore the expiry; now withdraw the AVAILABILITY instead.
  perform pg_temp.act_service();
  update public.community_posts set expires_at = now() + interval '6 hours' where id = v_id;
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'it surfaces again while both are true', '1',
    (select count(*)::text from public.community_posts_visible where id = v_id));

  perform pg_temp.act_service();
  insert into public.provider_blocked_dates(provider_id, date)
  values (pid, (now() at time zone 'America/Chicago')::date);
  perform pg_temp.act(pu);
  perform pg_temp.chk('community',
    'blocking the date stops it surfacing even before it expires', '0',
    (select count(*)::text from public.community_posts_visible where id = v_id));

  perform pg_temp.act_service();
  delete from public.provider_blocked_dates where provider_id = pid;
end $$;

-- ══ 4. A BLOCKED PAIR LEAVES EACH OTHER'S COMMUNITY ══════════════════════
do $$
declare
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  bu  uuid := current_setting('b5b.cm_bu')::uuid;
  v_theirs uuid; v_mine uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'the other side''s post') returning id into v_theirs;
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (bu, 'client', 'need_advice', 'the blocker''s post') returning id into v_mine;

  perform pg_temp.act(bu);
  perform pg_temp.chk('community', 'before a block, each sees the other''s post', '1',
    (select count(*)::text from public.community_posts_visible where id = v_theirs));

  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (bu, cu);

  -- BOTH DIRECTIONS. A one-way hide is an oracle: the blocked party learns.
  perform pg_temp.act(bu);
  perform pg_temp.chk('community', 'the blocker no longer sees their post', '0',
    (select count(*)::text from public.community_posts_visible where id = v_theirs));
  perform pg_temp.act(cu);
  perform pg_temp.chk('community', 'and the blocked party no longer sees the blocker''s', '0',
    (select count(*)::text from public.community_posts_visible where id = v_mine));

  -- AND CANNOT REPLY ACROSS IT. The feed hid the post; a held id must not be a
  -- way back in, because replies are where contact actually happens.
  perform pg_temp.act(cu);
  begin
    insert into public.community_replies(post_id, user_id, author_kind, kind, content)
    values (v_mine, cu, 'client', 'reply', 'reaching anyway');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor reply to it with an id they already held',
    'PT427', v_code);

  -- A third party is unaffected — the hide is per-viewer, not a deletion.
  perform pg_temp.act(current_setting('b5b.cm_pu')::uuid);
  perform pg_temp.chk('community', 'and an unrelated viewer still sees both', '2',
    (select count(*)::text from public.community_posts_visible
      where id in (v_theirs, v_mine)));

  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = bu and blocked_user_id = cu;
end $$;

-- ══ 5. ANSWERS ARE ATTACHED, AND THE COUNTERS ARE TRUE ═══════════════════
do $$
declare
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  du  uuid := current_setting('b5b.cm_du')::uuid;
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  v_post uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'looking_for', 'need a braider saturday') returning id into v_post;

  -- A provider answers IN the thread.
  perform pg_temp.act(pu);
  insert into public.community_replies(post_id, user_id, provider_id, author_kind, kind, content)
  values (v_post, pu, pid, 'provider', 'can_help', 'I have saturday open');

  -- "I can help" is a business offering work. A client has nothing to offer.
  perform pg_temp.act(cu);
  begin
    insert into public.community_replies(post_id, user_id, author_kind, kind, content)
    values (v_post, cu, 'client', 'can_help', 'me too');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'a client cannot answer with "I can help"', '23514', v_code);

  -- A deapproved provider cannot answer as a business either.
  perform pg_temp.act(du);
  begin
    insert into public.community_replies(post_id, user_id, provider_id, author_kind, kind, content)
    values (v_post, du, current_setting('b5b.cm_did')::uuid, 'provider', 'can_help', 'pick me');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor can a deapproved provider', 'PT431', v_code);

  -- THE COUNTER THAT NEVER WORKED. The replier is not the author, which is the
  -- case that silently updated zero rows for the whole life of the feature.
  perform pg_temp.chk('community',
    'a reply by someone other than the author moves the reply count', '1',
    (select reply_count::text from public.community_posts where id = v_post));

  perform pg_temp.act(pu);
  insert into public.community_post_likes(user_id, post_id) values (pu, v_post);
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'and a like by someone else moves the like count', '1',
    (select like_count::text from public.community_posts where id = v_post));

  perform pg_temp.act(pu);
  delete from public.community_post_likes where user_id = pu and post_id = v_post;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'and unliking takes it back down', '0',
    (select like_count::text from public.community_posts where id = v_post));

  -- Nobody can enumerate who liked a post.
  perform pg_temp.act(pu);
  insert into public.community_post_likes(user_id, post_id) values (pu, v_post);
  perform pg_temp.act(cu);
  perform pg_temp.chk('community', 'a viewer cannot see who else liked a post', '0',
    (select count(*)::text from public.community_post_likes where post_id = v_post));
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'but can see their own like, so the heart can fill', '1',
    (select count(*)::text from public.community_post_likes where post_id = v_post));
  perform pg_temp.act_service();
end $$;

-- ══ 6. A POST CANNOT BE EDITED INTO SOMETHING ELSE ═══════════════════════
do $$
declare
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  v_post uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'an innocent question') returning id into v_post;

  perform pg_temp.act(cu);
  perform pg_temp.chk_blocked('community',
    'the author cannot promote their own post to a provider announcement',
    format('update public.community_posts set author_kind = ''provider'', intent = ''announcement'' where id = %L', v_post));
  perform pg_temp.chk_blocked('community',
    'nor re-point it at a provider after people have answered',
    format('update public.community_posts set tagged_provider_id = %L where id = %L', pid, v_post));
  perform pg_temp.chk_blocked('community',
    'nor give itself an expiry it was never granted',
    format('update public.community_posts set expires_at = now() + interval ''1 day'' where id = %L', v_post));

  -- The text itself IS editable — a typo in a question is not a lie.
  perform pg_temp.act(cu);
  begin
    update public.community_posts set content = 'a clearer question' where id = v_post;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'but the text may be corrected', 'NO ERROR', v_code);

  -- A reply is a statement in a conversation and cannot be rewritten at all.
  perform pg_temp.act(cu);
  perform pg_temp.chk('community', 'and a reply cannot be edited at all', 'false',
    (select count(*) > 0 from pg_policies
      where schemaname = 'public' and tablename = 'community_replies' and cmd = 'UPDATE')::text);

  -- A stranger cannot edit or delete somebody else's post. Asserted on the
  -- STORED VALUE, not on an exception: RLS filters the row out of their UPDATE
  -- scope, so the statement affects zero rows and raises nothing at all — an
  -- error-shaped assertion would score that silent, stronger refusal as a pass.
  perform pg_temp.act(current_setting('b5b.cm_pu')::uuid);
  update public.community_posts set content = 'a stranger was here' where id = v_post;
  delete from public.community_posts where id = v_post;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'a stranger cannot edit another person''s post',
    'a clearer question',
    (select content from public.community_posts where id = v_post));
  perform pg_temp.chk('community', 'nor delete it', '1',
    (select count(*)::text from public.community_posts where id = v_post));
end $$;

-- ══ 6b. A RECOMMENDATION MUST NOT MAKE ITS SUBJECT UNDELETABLE ══════════
--
-- `20261090000000` was written to stop exactly this, fixed the TRIGGER half and
-- missed the CHECK half — `tagged_provider_id` was `ON DELETE SET NULL`, and the
-- constraint saying a shoutout must name someone then failed on the set-null.
-- So deleting a recommended provider still aborted, and **any client could make
-- any approved provider permanently undeletable by posting one recommendation of
-- them.** That is a right-to-erasure failure a stranger can inflict.
--
-- This is the assertion that was missing, and it is the one worth having: it
-- tests the DELETE, not the trigger, so it catches every rule the referential
-- action fires rather than the one that was being thought about.
do $$
declare
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  v_u uuid := gen_random_uuid();
  v_p uuid;
  v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (v_u);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (v_u, 'Doomed', 'cmz_'||substr(v_u::text,1,8), true) returning id into v_p;

  perform pg_temp.chk('community', 'a client can recommend them', 'NO ERROR',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, v_p));
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'and the recommendation exists', '1',
    (select count(*)::text from public.community_posts where tagged_provider_id = v_p));

  -- THE PROVIDER ROW.
  begin
    delete from public.providers where id = v_p;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('community',
    'deleting a recommended provider SUCCEEDS', 'NO ERROR', v_code);
  perform pg_temp.chk('community', 'and the recommendation goes with them', '0',
    (select count(*)::text from public.community_posts where tagged_provider_id = v_p));

  -- AND THE ACCOUNT BEHIND THEM, which is the one erasure actually deletes.
  insert into public.providers(user_id, display_name, username, is_approved)
    values (v_u, 'Doomed Again', 'cmz2_'||substr(v_u::text,1,8), true) returning id into v_p;
  perform pg_temp.chk('community', 'a second recommendation is posted', 'NO ERROR',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, v_p));
  perform pg_temp.act_service();
  begin
    delete from auth.users where id = v_u;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('community',
    'and deleting the ACCOUNT behind them succeeds too', 'NO ERROR', v_code);

  -- A deleted BOOKING behaves the opposite way, and should: the recommendation
  -- was never about the booking, so it survives and simply loses its badge.
  perform pg_temp.chk('community', 'no orphan recommendation is left behind', '0',
    (select count(*)::text from public.community_posts
      where intent = 'shoutout' and tagged_provider_id is null));
end $$;

-- ══ 6c. THE REST OF THE SHOUTOUT GATE, AND THE COUNTERS ══════════════════
do $$
declare
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pu2 uuid := current_setting('b5b.cm_pu2')::uuid;
  pid2 uuid := current_setting('b5b.cm_pid2')::uuid;
  v_post uuid; v_code text;
begin
  -- A BLOCK STOPS A RECOMMENDATION, in both directions. The one shoutout refusal
  -- that had no test.
  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, pu2);
  perform pg_temp.chk('community', 'you cannot recommend someone you blocked', 'PT432',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, pid2));
  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = cu and blocked_user_id = pu2;

  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (pu2, cu);
  perform pg_temp.chk('community', 'nor someone who blocked you', 'PT432',
    pg_temp.cm_post(cu, 'client', 'shoutout', null, pid2));

  -- AND A THIRD PARTY'S RECOMMENDATION OF THEM LEAVES YOUR FEED. A nameless card
  -- that still offers the action is worse than no filter (20261066000000).
  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = pu2 and blocked_user_id = cu;
  perform pg_temp.chk('community', 'a third party recommends them', 'NO ERROR',
    pg_temp.cm_post(current_setting('b5b.cm_bu')::uuid, 'client', 'shoutout', null, pid2));
  perform pg_temp.act_service();
  select id into v_post from public.community_posts
   where tagged_provider_id = pid2 order by created_at desc limit 1;

  perform pg_temp.act(cu);
  perform pg_temp.chk('community', 'and an unblocked viewer sees it', '1',
    (select count(*)::text from public.community_posts_visible where id = v_post));
  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, pu2);
  perform pg_temp.act(cu);
  perform pg_temp.chk('community',
    'a recommendation of someone you blocked leaves your feed entirely', '0',
    (select count(*)::text from public.community_posts_visible where id = v_post));
  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = cu and blocked_user_id = pu2;

  -- THE AUTHOR CANNOT SET THEIR OWN ENGAGEMENT NUMBERS. Asserted on the STORED
  -- VALUE: these are carried over from `old` rather than refused, so a client
  -- round-tripping a row it read is not rejected for sending back what it was
  -- given — the values it sends are simply not what is stored.
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'countable') returning id into v_post;

  -- The counters RAISE, because there is a true value to compare against and a
  -- loud refusal is better than a silent correction.
  perform pg_temp.act(cu);
  begin
    update public.community_posts set like_count = 999999 where id = v_post;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'an author cannot invent their own like count',
    '23514', v_code);
  perform pg_temp.act(cu);
  begin
    update public.community_posts set reply_count = 4242 where id = v_post;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor their reply count', '23514', v_code);
  perform pg_temp.chk('community', 'and nothing was stored', '0',
    (select (like_count + reply_count)::text from public.community_posts where id = v_post));

  -- BUT A TRUE COUNT IS ACCEPTED FROM ANYONE, which is the whole point of
  -- checking the value rather than the writer — it is what lets the counter
  -- triggers work at all. Asserted through the real path: a like by someone else.
  perform pg_temp.act(current_setting('b5b.cm_pu')::uuid);
  insert into public.community_post_likes(user_id, post_id)
  values (current_setting('b5b.cm_pu')::uuid, v_post);
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'while a TRUE count still lands', '1',
    (select like_count::text from public.community_posts where id = v_post));

  -- VISIBILITY IS A MODERATION DECISION (20261096000000). It was silently pinned
  -- while nothing could set it; now that an operator can, an author flipping it
  -- would undo a take-down — so it is refused OUT LOUD. This is the author, who
  -- owns the row, so RLS lets the statement through and the trigger answers.
  perform pg_temp.act(cu);
  begin
    update public.community_posts set is_active = false where id = v_post;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor deactivate — or reactivate — their own post',
    '42501', v_code);
  perform pg_temp.chk('community', 'and the post is still visible', 'true',
    (select is_active::text from public.community_posts where id = v_post));

  -- And an Open Today note cannot outlive the day even by a declared timezone.
  perform pg_temp.chk('community',
    'no open_today note may expire more than a day out', '0',
    (select count(*)::text from public.community_posts
      where intent = 'open_today' and expires_at > now() + interval '24 hours'));
end $$;

-- ══ 6d. ONE PROVIDER CANNOT CLOSE THE FEED FOR EVERYONE ══════════════════
--
-- `providers_open_today()` runs `now() at time zone <the provider's own text>`
-- over every provider's availability, and the reshape put that function in the
-- WHERE clause of the feed view. An unrecognised zone raises 22023 and aborts the
-- whole query — so one provider's own-row write took down the feed, every
-- thread, the Discover module and provider-profile shoutouts, for every user.
do $$
declare
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  v_code text; v_n integer;
begin
  perform pg_temp.act(pu);
  begin
    update public.provider_availability set timezone = 'not-a-zone' where provider_id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'a provider cannot store a timezone PostgreSQL does not know', '23514', v_code);
  perform pg_temp.chk('community', 'and the stored value is untouched', '0',
    (select count(*)::text from public.provider_availability
      where provider_id = pid and timezone = 'not-a-zone'));

  -- The feed still reads. Asserted AS A READ, not as an absence of a constraint:
  -- the failure mode was a query that raised, and only running one proves it does
  -- not. Empty is a fine answer; an exception is not.
  perform pg_temp.act(pu);
  begin
    select count(*) into v_n from public.community_posts_visible;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'and the community feed still reads', 'NO ERROR', v_code);
end $$;

-- ══ 6e. MODERATION: A REPORT NOW HAS AN OUTCOME ══════════════════════════
--
-- Hiding is a VISIBILITY decision, not evidence deletion — so every assertion
-- here checks two things at once: that the content left the ordinary surfaces,
-- and that the row, the report, the case and the action history are all still
-- there. A moderation system that destroys what it acts on cannot be reviewed.
do $$
declare
  opu uuid := gen_random_uuid();   -- an allow-listed operator
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  bu  uuid := current_setting('b5b.cm_bu')::uuid;
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  pid uuid := current_setting('b5b.cm_pid')::uuid;
  did uuid := current_setting('b5b.cm_did')::uuid;
  du  uuid := current_setting('b5b.cm_du')::uuid;
  v_post uuid; v_reply uuid; v_code text; v_case uuid; v_report uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (opu);
  insert into public.operators(user_id, granted_by_user_id, note)
    values (opu, null, 'community suite fixture');
  perform set_config('b5b.cm_op', opu::text, true);

  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'something reportable') returning id into v_post;
  insert into public.community_replies(post_id, user_id, author_kind, kind, content)
  values (v_post, bu, 'client', 'reply', 'a reportable reply') returning id into v_reply;

  -- ── 1. A NORMAL CLIENT CANNOT HIDE ANYTHING ──────────────────────────
  perform pg_temp.act(bu);
  begin
    perform public.operator_set_community_visibility('post', v_post, true, bu, null, null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'a client cannot hide another user''s post',
    '42501', v_code);
  -- Nor by writing the column directly — and this one is asserted ON THE STORED
  -- VALUE rather than on an exception, because TWO different mechanisms refuse
  -- it and only one of them raises. For someone who does not own the row, the
  -- owner UPDATE policy FILTERS it out of scope: the statement touches zero rows
  -- and raises nothing at all. An error-shaped assertion would score that
  -- silent, stronger refusal as a pass-through.
  perform pg_temp.act(bu);
  update public.community_posts set is_active = false where id = v_post;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor by writing the visibility column directly',
    'true', (select is_active::text from public.community_posts where id = v_post));

  -- ── 2. A PROVIDER CANNOT HIDE CONTENT THEY DISLIKE ───────────────────
  -- The one that matters commercially: a provider must not be able to remove a
  -- question or a recommendation that reflects badly on them.
  perform pg_temp.act(pu);
  begin
    perform public.operator_set_community_visibility('post', v_post, true, pu, null, null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'a provider cannot hide content about them',
    '42501', v_code);
  perform pg_temp.act(pu);
  update public.community_posts set is_active = false where id = v_post;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor directly', 'true',
    (select is_active::text from public.community_posts where id = v_post));

  -- ── 3. A DEAPPROVED PROVIDER HAS NO MODERATION POWER EITHER ──────────
  perform pg_temp.act(du);
  begin
    perform public.operator_set_community_visibility('post', v_post, true, du, null, null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor can a deapproved provider moderate', '42501', v_code);

  -- ── 4. AN OPERATOR CANNOT SKIP THE AUDIT EITHER ──────────────────────
  -- `is_operator()` alone would let them PATCH the column straight through and
  -- leave no record. Refused LOUDLY — a privileged action that quietly does
  -- nothing is how this column became a trap in the first place.
  -- An operator does not own the row either, so the same owner policy filters
  -- them out of scope before the trigger is reached. Two refusals stacked, and
  -- the outer one is silent — so the assertion is on the value.
  perform pg_temp.act(opu);
  update public.community_posts set is_active = false where id = v_post;
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'even an operator cannot change visibility outside the audited path', 'true',
    (select is_active::text from public.community_posts where id = v_post));

  -- Nor by forging the session marker: the marker alone is settable by anyone,
  -- which is exactly why it is not the whole gate.
  perform pg_temp.act(bu);
  perform set_config('app.community_moderation', 'on', true);
  update public.community_posts set is_active = false where id = v_post;
  perform set_config('app.community_moderation', 'off', true);
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'and forging the moderation marker grants a non-operator nothing', 'true',
    (select is_active::text from public.community_posts where id = v_post));

  -- THE AUTHOR IS THE ONE WHO REACHES THE TRIGGER, because they own the row —
  -- and the trigger is what stops them undoing a take-down of their own content.
  -- Asserted separately, and as an exception, because here there IS one.
  perform pg_temp.act(cu);
  begin
    perform set_config('app.community_moderation', 'on', true);
    update public.community_posts set is_active = false where id = v_post;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform set_config('app.community_moderation', 'off', true);
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'and an author forging the marker on their OWN post is refused out loud',
    '42501', v_code);

  -- ── 5. AND A FALSE ACTOR IS REFUSED ──────────────────────────────────
  perform pg_temp.act(opu);
  begin
    perform public.operator_set_community_visibility('post', v_post, true, cu, null, null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'a moderation action cannot be filed against someone else', '42501', v_code);
end $$;

-- ══ 6f. HIDING WORKS, KEEPS EVERYTHING, AND IS REVERSIBLE ════════════════
do $$
declare
  opu uuid := current_setting('b5b.cm_op')::uuid;
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  bu  uuid := current_setting('b5b.cm_bu')::uuid;
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  v_post uuid; v_reply uuid; v_report uuid; v_case uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'looking_for', 'the reported post') returning id into v_post;
  insert into public.community_replies(post_id, user_id, author_kind, kind, content)
  values (v_post, bu, 'client', 'reply', 'the reported reply') returning id into v_reply;

  -- A REAL REPORT, filed by the role that files one, naming the content.
  perform pg_temp.act(bu);
  insert into public.reports(reporter_user_id, report_type, report_reason, notes,
                             reported_user_id, reported_content_kind, reported_content_id)
  values (bu, 'content', 'harassment', 'this is not ok', cu, 'community_post', v_post)
  returning id into v_report;

  perform pg_temp.act_service();
  select c.id into v_case from public.operator_cases c where c.report_id = v_report;
  perform pg_temp.chk('community', 'a community report opens an operator case', 'true',
    (v_case is not null)::text);

  -- THE OPERATOR ACTS.
  perform pg_temp.act(opu);
  perform pg_temp.chk('community', 'an operator can hide the reported post', 'true',
    public.operator_set_community_visibility('post', v_post, true, opu, v_case, 'not ok')::text);

  -- IT LEAVES EVERY ORDINARY SURFACE. Checked from a THIRD party, not the
  -- author — an author's own view is a different question.
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'and it leaves the feed', '0',
    (select count(*)::text from public.community_posts_visible where id = v_post));

  -- AND EVERYTHING IS STILL THERE.
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'the row is kept — hiding is not deletion', '1',
    (select count(*)::text from public.community_posts where id = v_post));
  perform pg_temp.chk('community', 'the report is kept', '1',
    (select count(*)::text from public.reports where id = v_report));
  perform pg_temp.chk('community', 'the case is kept', '1',
    (select count(*)::text from public.operator_cases where id = v_case));
  perform pg_temp.chk('community', 'and the action is recorded against the operator', '1',
    (select count(*)::text from public.community_moderation_actions
      where post_id = v_post and action = 'hidden' and actor_user_id = opu
        and case_id = v_case));
  perform pg_temp.chk('community', 'and it appears in the case trail too', '1',
    (select count(*)::text from public.operator_case_events
      where case_id = v_case and action = 'content_hidden'));

  -- REPLIES TOO, and a hidden reply leaves the thread.
  perform pg_temp.act(opu);
  perform pg_temp.chk('community', 'an operator can hide a reply', 'true',
    public.operator_set_community_visibility('reply', v_reply, true, opu, v_case, null)::text);
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'and it leaves the thread', '0',
    (select count(*)::text from public.community_replies_visible where id = v_reply));
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'while the reply row is kept', '1',
    (select count(*)::text from public.community_replies where id = v_reply));

  -- RESTORE PUTS IT BACK, and says so in the history rather than erasing the
  -- earlier decision.
  perform pg_temp.act(opu);
  perform pg_temp.chk('community', 'an operator can restore it', 'false',
    public.operator_set_community_visibility('post', v_post, false, opu, v_case, 'reviewed')::text);
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'and it returns to the feed', '1',
    (select count(*)::text from public.community_posts_visible where id = v_post));
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'with BOTH decisions on the record', '2',
    (select count(*)::text from public.community_moderation_actions where post_id = v_post));

  -- A REPEATED CLICK IS NOT A NEW DECISION.
  perform pg_temp.act(opu);
  perform public.operator_set_community_visibility('post', v_post, false, opu, v_case, null);
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'restoring an already-visible post records nothing new', '2',
    (select count(*)::text from public.community_moderation_actions where post_id = v_post));

  -- THE AUDIT TRAIL IS APPEND-ONLY. Asserted as the operator, because they are
  -- the only client role that can reach it at all.
  perform pg_temp.act(opu);
  begin
    update public.community_moderation_actions set note = 'rewritten' where post_id = v_post;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'and an operator cannot rewrite their own moderation history', '42501', v_code);
end $$;

-- ══ 6g. HIDDEN CONTENT LEAVES EVERY SURFACE, NOT MOST OF THEM ════════════
--
-- The failure mode worth testing is a partial hide: content gone from the feed
-- and still reachable through the thread, a bookmark, the Discover module or a
-- provider-linked view. Each read path is exercised, because "we filtered the
-- feed" is what a half-done moderation system looks like.
do $$
declare
  opu uuid := current_setting('b5b.cm_op')::uuid;
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  bu  uuid := current_setting('b5b.cm_bu')::uuid;
  pid2 uuid := current_setting('b5b.cm_pid2')::uuid;
  v_post uuid; v_shout uuid; v_reply uuid;
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'to be hidden everywhere') returning id into v_post;
  insert into public.community_replies(post_id, user_id, author_kind, kind, content)
  values (v_post, bu, 'client', 'reply', 'a reply under it') returning id into v_reply;
  insert into public.community_posts(user_id, author_kind, intent, content, tagged_provider_id)
  values (cu, 'client', 'shoutout', 'great work', pid2) returning id into v_shout;
  -- A bookmark, so the saved-posts read is exercised too.
  insert into public.community_bookmarks(user_id, post_id) values (pu, v_post);

  perform pg_temp.act(opu);
  perform public.operator_set_community_visibility('post', v_post,  true, opu, null, null);
  perform public.operator_set_community_visibility('post', v_shout, true, opu, null, null);

  perform pg_temp.act(pu);
  -- The feed, and every filtered view of it.
  perform pg_temp.chk('community', 'hidden content is absent from the feed', '0',
    (select count(*)::text from public.community_posts_visible where id = v_post));
  perform pg_temp.chk('community', 'absent when asking for the post directly', '0',
    (select count(*)::text from public.community_posts_visible where id = v_post));
  perform pg_temp.chk('community', 'absent from an intent filter (the Discover modules)', '0',
    (select count(*)::text from public.community_posts_visible
      where id in (v_post, v_shout) and intent in ('need_advice', 'shoutout')));
  -- The saved list reads the SAME view by id, so a bookmark cannot resurrect it.
  perform pg_temp.chk('community', 'absent from a bookmarked read', '0',
    (select count(*)::text from public.community_posts_visible
      where id in (select b.post_id from public.community_bookmarks b where b.user_id = pu)));
  -- Provider-linked: the shoutout list on a provider profile.
  perform pg_temp.chk('community', 'absent from a provider''s shoutouts', '0',
    (select count(*)::text from public.community_posts_visible
      where tagged_provider_id = pid2 and id = v_shout));

  -- A reply under a hidden post: the reply itself was never hidden, and the
  -- thread that would show it is unreachable. Stated rather than assumed,
  -- because "the parent is hidden" is not the same rule as "this is hidden".
  perform pg_temp.chk('community',
    'a reply under a hidden post is not itself hidden — the thread is simply gone',
    '1', (select count(*)::text from public.community_replies_visible where id = v_reply));

  perform pg_temp.act_service();
end $$;

-- ══ 6h. MODERATION COMPOSES WITH BLOCKING, AND SURVIVES ERASURE ══════════
do $$
declare
  opu uuid := current_setting('b5b.cm_op')::uuid;
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  v_post uuid; v_post2 uuid; v_code text; v_actions integer;
  v_op2 uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'blocked and hidden') returning id into v_post;

  -- BOTH RULES, TOGETHER. Hidden beats visible, and blocked beats visible, and
  -- neither undoes the other: restoring must not resurrect content for someone
  -- who blocked its author.
  perform pg_temp.act(opu);
  perform public.operator_set_community_visibility('post', v_post, true, opu, null, null);
  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (pu, cu);

  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'hidden AND blocked is absent', '0',
    (select count(*)::text from public.community_posts_visible where id = v_post));

  perform pg_temp.act(opu);
  perform public.operator_set_community_visibility('post', v_post, false, opu, null, null);
  perform pg_temp.act(pu);
  perform pg_temp.chk('community',
    'restoring does NOT resurrect it for someone who blocked the author', '0',
    (select count(*)::text from public.community_posts_visible where id = v_post));

  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = pu and blocked_user_id = cu;
  perform pg_temp.act(pu);
  perform pg_temp.chk('community', 'and it returns once the block is lifted', '1',
    (select count(*)::text from public.community_posts_visible where id = v_post));

  -- ERASING A MODERATOR MUST NOT BE BLOCKED BY *THIS* TABLE.
  --
  -- `community_moderation_actions.actor_user_id` is ON DELETE SET NULL, and a
  -- set-null is an UPDATE — so an append-only guard with no carve-out would make
  -- deleting anyone who had ever moderated fail outright. That is OQ-077 defect
  -- (2) in a new place, and this session must not manufacture a third instance
  -- of it. Asserted with a FRESH operator whose only history is moderation, so
  -- the assertion is about this table and not about the pre-existing one.
  perform pg_temp.act_service();
  insert into auth.users(id) values (v_op2);
  insert into public.operators(user_id, granted_by_user_id, note)
    values (v_op2, null, 'erasure fixture');
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'moderated by op2') returning id into v_post2;
  perform pg_temp.act(v_op2);
  -- No case id: a case event would drag in the OTHER table's guard, which is the
  -- recorded defect and not what this assertion is about.
  perform public.operator_set_community_visibility('post', v_post2, true, v_op2, null, 'op2');
  perform pg_temp.act_service();

  select count(*) into v_actions from public.community_moderation_actions
   where actor_user_id = v_op2;
  perform pg_temp.chk('community', 'the operator has moderation history to orphan', 'true',
    (v_actions > 0)::text);
  begin
    delete from auth.users where id = v_op2;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('community',
    'deleting an operator whose history is moderation still succeeds', 'NO ERROR', v_code);
  perform pg_temp.chk('community', 'and the moderation record survives them', 'true',
    (select count(*) > 0 from public.community_moderation_actions
      where actor_user_id is null and post_id = v_post2)::text);
end $$;

-- ══ 6h-ii. OQ-077 DEFECT (2), PINNED WHERE IT ACTUALLY LIVES ═════════════
--
-- Account erasure is OUT OF SCOPE for this session and stays unfixed. What is in
-- scope is leaving the next session a reproducible pointer rather than a
-- sentence, because the defect is one missing branch and it is easy to look
-- straight past.
--
-- `enforce_operator_case_event_append_only` carves out `DELETE` for service_role
-- and a no-claims session, and does NOT carve out `UPDATE`. But
-- `operator_case_events.actor_user_id` is ON DELETE SET NULL — a set-null is an
-- UPDATE — so deleting an operator who has ever ACTED ON A CASE fails with
-- `check_violation`. The carve-out has the right shape and the wrong verb.
--
-- Pinned as a SOURCE fact rather than as a behavioural expectation: asserting
-- "this delete fails" would turn the eventual fix into a test failure, which is
-- how a correct fix gets reverted.
select pg_temp.chk('community',
  'OQ-077 (2): the case-event guard still carves out DELETE only, not UPDATE',
  'true',
  (select (p.prosrc ~* 'tg_op\s*=\s*''DELETE''' and p.prosrc !~* 'tg_op\s*=\s*''UPDATE''')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_operator_case_event_append_only')::text);
select pg_temp.chk('community',
  'and the column that needs it is still ON DELETE SET NULL', 'true',
  (select count(*) > 0 from pg_constraint
    where conrelid = 'public.operator_case_events'::regclass
      and contype = 'f' and confdeltype = 'n')::text);
select pg_temp.act_service();

-- ══ 6i. A REPORT MUST POINT AT THE RIGHT PERSON'S CONTENT ════════════════
do $$
declare
  cu  uuid := current_setting('b5b.cm_cu')::uuid;
  bu  uuid := current_setting('b5b.cm_bu')::uuid;
  pu  uuid := current_setting('b5b.cm_pu')::uuid;
  v_mine uuid; v_theirs uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (cu, 'client', 'need_advice', 'their post') returning id into v_theirs;
  insert into public.community_posts(user_id, author_kind, intent, content)
  values (bu, 'client', 'need_advice', 'my own post') returning id into v_mine;

  -- NAMING ONE PERSON AND ATTACHING ANOTHER'S CONTENT. Without this check an
  -- operator acting on the case would hide the wrong thing with a straight face.
  perform pg_temp.act(bu);
  begin
    insert into public.reports(reporter_user_id, report_type, report_reason,
                               reported_user_id, reported_content_kind, reported_content_id)
    values (bu, 'content', 'harassment', pu, 'community_post', v_theirs);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community',
    'a report cannot name one person and attach another''s content', '23514', v_code);

  -- Reporting your own content is a delete, and the author already has one.
  perform pg_temp.act(bu);
  begin
    insert into public.reports(reporter_user_id, report_type, report_reason,
                               reported_user_id, reported_content_kind, reported_content_id)
    values (bu, 'content', 'other', bu, 'community_post', v_mine);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor report your own content', '23514', v_code);

  -- And content that does not exist cannot be reported at all.
  perform pg_temp.act(bu);
  begin
    insert into public.reports(reporter_user_id, report_type, report_reason,
                               reported_user_id, reported_content_kind, reported_content_id)
    values (bu, 'content', 'other', cu, 'community_post', gen_random_uuid());
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('community', 'nor content that does not exist', '23514', v_code);
end $$;

-- ══ 6j. THE MODERATION SURFACE IS NOT REACHABLE BY THE WRONG ROLE ════════
select pg_temp.chk('community', 'anon cannot call the moderation action', 'false',
  has_function_privilege('anon', 'public.operator_set_community_visibility(text, uuid, boolean, uuid, uuid, text)', 'EXECUTE')::text);
select pg_temp.chk('community', 'nor read the operator content view', 'false',
  has_function_privilege('anon', 'public.operator_community_content(uuid)', 'EXECUTE')::text);
-- Granted to `authenticated` because that is what an operator signs in as; the
-- gate is is_operator(), asserted in the source so a rewrite that drops it fails.
select pg_temp.chk('community', 'and both check is_operator() themselves', '2',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('operator_set_community_visibility', 'operator_community_content')
      and p.prosrc like '%is_operator()%'));
select pg_temp.chk('community', 'no client role can read the moderation log directly', 'false',
  (has_table_privilege('authenticated', 'public.community_moderation_actions', 'SELECT')
   or has_table_privilege('anon', 'public.community_moderation_actions', 'SELECT'))::text);
select pg_temp.chk('community', 'nor write it', 'false',
  (has_table_privilege('authenticated', 'public.community_moderation_actions', 'INSERT')
   or has_table_privilege('authenticated', 'public.community_moderation_actions', 'UPDATE')
   or has_table_privilege('authenticated', 'public.community_moderation_actions', 'DELETE'))::text);
select pg_temp.chk('community', 'and RLS is on it as well', 'true',
  (select relrowsecurity::text from pg_class
    where oid = 'public.community_moderation_actions'::regclass));
-- The moderation action must not have become a way to do anything ELSE: it does
-- not resolve a case, restrict a provider or touch a review.
select pg_temp.chk('community', 'hiding content does not adjudicate or restrict anything', 'false',
  (select (p.prosrc ~* 'is_approved|operator_cases\s+set|provider_reviews|average_rating')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'operator_set_community_visibility')::text);
select pg_temp.act_service();

-- ══ 7. DIRECT-TABLE AND ANON BYPASS ══════════════════════════════════════
select pg_temp.chk('community', 'a signed-out visitor reads no community post', 'false',
  has_table_privilege('anon', 'public.community_posts', 'SELECT')::text);
select pg_temp.chk('community', 'nor through the view', 'false',
  has_table_privilege('anon', 'public.community_posts_visible', 'SELECT')::text);
select pg_temp.chk('community', 'nor the replies view', 'false',
  has_table_privilege('anon', 'public.community_replies_visible', 'SELECT')::text);
select pg_temp.chk('community', 'and anon cannot write anywhere in community', 'false',
  (has_table_privilege('anon', 'public.community_posts', 'INSERT')
   or has_table_privilege('anon', 'public.community_replies', 'INSERT')
   or has_table_privilege('anon', 'public.community_post_likes', 'INSERT')
   or has_table_privilege('anon', 'public.community_bookmarks', 'INSERT'))::text);

-- The integrity triggers are the whole authorization story for who may speak as
-- a business, so a client role must not be able to call them directly.
select pg_temp.chk('community', 'the integrity functions are not client-callable', 'false',
  (has_function_privilege('authenticated', 'public.enforce_community_post_integrity()', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.enforce_community_reply_integrity()', 'EXECUTE')
   or has_function_privilege('anon', 'public.enforce_community_post_integrity()', 'EXECUTE'))::text);

-- THE BASE-TABLE POSTURE, PINNED AS WHAT IT IS. The PD-089 block filter for
-- Community lives in the VIEWS; the base tables read `using (true)` for any
-- signed-in caller, so a blocked party CAN diff the two. That is not an
-- oversight: **PD-090** ruled the `_visible`-vs-base diff an accepted limitation
-- for the Houston closed beta and deliberately did not narrow the base read
-- policies. What changed with this reshape is WHO can do it — from ~30 provider
-- accounts to every account — which is grounds for PD-090's own revisit clause,
-- filed rather than acted on. It is asserted here so the posture is deliberate
-- rather than incidental, and so a future narrowing is a visible change.
select pg_temp.chk('community', 'the base-table read is open to any signed-in caller (PD-090)',
  'true',
  (select count(*) > 0 from pg_policies
    where schemaname = 'public' and tablename = 'community_posts'
      and cmd = 'SELECT' and qual = 'true')::text);

-- The legacy free-text column is bounded, even though nothing writes it.
select pg_temp.chk('community', 'the legacy category column cannot store a megabyte', 'true',
  (select count(*) > 0 from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_category_check')::text);

-- OWNERSHIP IS THE SECURITY CONTEXT of a definer view — it is what lets the view
-- read `user_blocks` rows the caller cannot. Pinned alongside the flag, because
-- the flag alone says the view is definer without saying whose definer.
select pg_temp.chk('community', 'and both are owned by the same role as providers_visible',
  '2',
  (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('community_posts_visible', 'community_replies_visible')
      and c.relowner = (select relowner from pg_class where oid = 'public.providers_visible'::regclass)));

-- Both views must stay DEFINER: an invoker view would re-evaluate the base
-- policy as the caller and lose the block filter's meaning.
select pg_temp.chk('community', 'both community views are definer views', '2',
  (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('community_posts_visible', 'community_replies_visible')
      and c.relkind = 'v'
      and coalesce((select option_value from pg_options_to_table(c.reloptions)
                     where option_name = 'security_invoker'), 'false') = 'false'));

-- ══ 8. THE VOCABULARY IS CLOSED IN THE DATABASE ══════════════════════════
--
-- The old `category` column is free text with no CHECK, and the app's lookup
-- maps anything unrecognised to "Other" — so a typo or a stale client writes a
-- value that renders as Other forever and filters into nothing, with no error at
-- any layer. The new vocabulary does not repeat that.
select pg_temp.chk('community', 'intent is constrained by the database, not only by TypeScript',
  'true',
  (select count(*) > 0 from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_intent_check')::text);
select pg_temp.chk('community', 'and an intent is paired with the actor allowed to use it',
  'true',
  (select count(*) > 0 from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_intent_matches_actor_check')::text);
select pg_temp.chk('community',
  'an open_today post without an expiry is structurally impossible', 'true',
  (select count(*) > 0 from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_open_today_expires_check')::text);
select pg_temp.chk('community', 'and a shoutout that names nobody is too', 'true',
  (select count(*) > 0 from pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_shoutout_tags_provider_check')::text);

-- ══ 9. COMMUNITY DOES NOT RANK PROVIDERS ═════════════════════════════════
--
-- The hard rule. Asserted structurally rather than behaviourally, because the
-- failure would be a future edit, not today's data.
-- EVERY function that reads a community table, named. A new one has to be added
-- here deliberately, which is the point: the failure this guards against is a
-- ranking or discovery function quietly learning to read the feed, and a
-- name-pattern exclusion would let one through the moment it was called
-- something sensible.
select pg_temp.chk('community', 'only the named functions read a community table', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* 'community_post|community_repl|community_bookmark'
      and p.proname not in (
        -- The community feature itself.
        'enforce_community_post_integrity',
        'enforce_community_reply_integrity',
        'update_community_like_count',
        'update_community_reply_count',
        -- Moderation (20261096000000 / 20261097000000).
        'operator_set_community_visibility',
        'operator_community_content',
        -- Report intake validating that a report names its target's content.
        'enforce_report_content_reference'
      )));
select pg_temp.chk('community', 'and providers_open_today reads availability, not posts', 'false',
  (select (p.prosrc ~* 'community') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'providers_open_today')::text);
-- No engagement column has leaked onto the provider row.
select pg_temp.chk('community', 'the provider row gained no community engagement column', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'providers'
      and (column_name like '%post%' or column_name like '%like%'
           or column_name like '%engagement%' or column_name like '%community%')));

-- ══ 10. BARTER IS UNTOUCHED ══════════════════════════════════════════════
--
-- Barter shares the Community ROUTE and nothing else. The reshape must not have
-- reached into it, so the separation is asserted rather than assumed.
select pg_temp.chk('community', 'no community table references a barter object', '0',
  (select count(*)::text
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name like 'community%'
      and tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_name like 'barter%'));
select pg_temp.chk('community', 'and no barter table references a community object', '0',
  (select count(*)::text
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name like 'barter%'
      and tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_name like 'community%'));
select pg_temp.chk('community', 'barter offers still take the eligibility gate they always did',
  'true',
  (select count(*) > 0 from pg_policies
    where schemaname = 'public' and tablename = 'barter_offers' and cmd = 'INSERT'
      and with_check ilike '%caller_eligible_provider_id%')::text);

select pg_temp.act_service();
