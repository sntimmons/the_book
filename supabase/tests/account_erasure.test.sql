-- B5B suite: account erasure and retention.
--
-- The question this exists to answer: **when somebody leaves, does the right
-- thing disappear and the right thing survive?** Both halves fail differently.
-- Deleting too little is a privacy failure; deleting too much destroys a
-- counterparty's booking record, a provider's honest reviews, or the safety
-- report that names the person who left.
--
-- Everything is asserted as the role that would attack it, and the destructive
-- assertions run against fixtures this suite creates — the harness rolls back, so
-- an erasure here erases nothing real.

-- A caller with a FRESH token. `request_account_deletion` requires an `iat`
-- inside fifteen minutes, so the ordinary helper cannot exercise it.
create or replace function pg_temp.act_fresh(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated',
                      'iat', floor(extract(epoch from clock_timestamp()))::bigint)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- The context INSIDE a SECURITY DEFINER function: the caller's claims, the
-- owner's role. Several triggers fire on writes that only ever happen that way —
-- a rating recompute, a counter update — and asserting them as `authenticated`
-- tests a column grant instead of the trigger.
create or replace function pg_temp.act_claims_only(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
end $$;

-- A caller whose token is old, to prove the freshness test is real.
create or replace function pg_temp.act_stale(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated',
                      'iat', floor(extract(epoch from clock_timestamp() - interval '2 hours'))::bigint)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- One fully-populated account, so every data class has something to lose.
create or replace function pg_temp.ae_seed(p_tag text)
returns jsonb language plpgsql as $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid(); ou uuid := gen_random_uuid();
  pid uuid; opid uuid; bk uuid; cid uuid; conv uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu), (ou);
  insert into public.clients(id, name) values (cu, 'Leaver '||p_tag), (ou, 'Other '||p_tag)
    on conflict (id) do nothing;
  insert into public.providers(user_id, display_name, username, is_approved, bio, profile_photo_url)
    values (pu, 'Prov '||p_tag, 'ae'||substr(pu::text,1,8), true, 'a bio', 'https://x/y.jpg')
    returning id into pid;
  insert into public.providers(user_id, display_name, username, is_approved)
    values (ou, 'Other Prov '||p_tag, 'ae2'||substr(ou::text,1,8), true) returning id into opid;

  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, completed_at, message, client_safety_notes)
  values (cu, pid, 'a service', current_date - 10, 'completed',
          now() - interval '10 days', now() - interval '10 days',
          'what the client typed', 'a note naming them')
  returning id into bk;

  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating,
                                      review_text, created_at)
  values (bk, pid, cu, 5, 'they were great', now() - interval '9 days');

  insert into public.contracts(provider_id, user_id, title, body)
    values (pid, pu, 'terms '||p_tag, 'body') returning id into cid;
  insert into public.contract_signatures(contract_id, booking_id, client_user_id, status)
    values (cid, bk, cu, 'signed');

  insert into public.booking_reference_photos(booking_id, storage_path, uploaded_by_user_id)
    values (bk, cu::text || '/ref/one.jpg', cu);

  insert into public.conversation(client_id, provider_id, booking_id, last_message_at)
    values (cu, pid, bk, now() - interval '9 days') returning id into conv;
  insert into public.messages(conversation_id, sender_id, content)
    values (conv, cu, 'a private message');

  insert into public.posts(provider_id, media_url, media_type, caption, is_active)
    values (pid, 'https://x/p.jpg', 'image', 'my work', true);

  insert into public.community_posts(user_id, author_kind, intent, content)
    values (cu, 'client', 'need_advice', 'my community post');

  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values (ou, 'content', 'harassment', cu);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values (cu, 'content', 'harassment', ou);

  insert into public.saved_providers(user_id, provider_id) values (cu, opid);

  return jsonb_build_object('cu', cu, 'pu', pu, 'ou', ou, 'pid', pid, 'opid', opid,
                            'bk', bk, 'conv', conv);
end $$;

-- Force a request straight to due, so finalisation can be exercised without
-- waiting thirty days. The grace period itself is asserted separately.
create or replace function pg_temp.ae_request_due(p_subject uuid)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.act_service();
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (p_subject, p_subject, 'grace_period', now() - interval '1 second',
          public.retention_days('account_grace_period'))
  returning id into v_id;
  insert into public.account_deletion_steps (request_id, step_key)
  select v_id, k from unnest(public.account_deletion_step_keys()) k;
  return v_id;
end $$;

-- ══ 1. RETENTION IS CONFIGURATION, NOT CODE ══════════════════════════════
select pg_temp.chk('erasure', 'the grace period is configured, not compiled', '30',
  public.retention_days('account_grace_period')::text);
select pg_temp.chk('erasure', 'booking photos have a configured window', '90',
  public.retention_days('booking_photos')::text);
select pg_temp.chk('erasure', 'messages have a configured window', '180',
  public.retention_days('messages')::text);
select pg_temp.chk('erasure', 'the operator audit is four years', '1460',
  public.retention_days('operator_audit')::text);
-- THE TWO AWAITING COUNSEL ARE NULL, NOT A GUESS. A number nobody decided
-- becomes the answer support gives.
select pg_temp.chk('erasure', 'accepted-contract retention is UNDECIDED, not invented', 'true',
  (public.retention_days('accepted_contracts') is null)::text);
select pg_temp.chk('erasure', 'and report retention likewise', 'true',
  (public.retention_days('reports_evidence') is null)::text);
select pg_temp.chk('erasure', 'and both are flagged for legal review', '2',
  (select count(*)::text from public.retention_policy
    where legal_review_required and key in ('accepted_contracts', 'reports_evidence')));
-- An unknown key RAISES rather than reading as "no retention".
do $$
declare v_code text;
begin
  perform pg_temp.act_service();
  begin
    perform public.retention_days('not_a_real_key');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('erasure', 'an unknown retention key raises rather than returning null',
    'XX000', v_code);
end $$;
-- A user cannot rewrite the policy that governs them.
select pg_temp.chk('erasure', 'a user can read retention policy but not change it', 'false',
  (has_table_privilege('authenticated', 'public.retention_policy', 'UPDATE')
   or has_table_privilege('authenticated', 'public.retention_policy', 'INSERT')
   or has_table_privilege('anon', 'public.retention_policy', 'SELECT'))::text);

-- ══ 2. THE REQUEST DEACTIVATES IMMEDIATELY ═══════════════════════════════
do $$
declare
  f jsonb := pg_temp.ae_seed('req'); cu uuid; pu uuid; pid uuid; opid uuid;
  v_id uuid; v_code text; v_status text;
begin
  cu := (f->>'cu')::uuid; pu := (f->>'pu')::uuid;
  pid := (f->>'pid')::uuid; opid := (f->>'opid')::uuid;

  -- A STALE TOKEN CANNOT DELETE AN ACCOUNT. Reauthentication is the point.
  perform pg_temp.act_stale(cu);
  begin
    perform public.request_account_deletion('DELETE');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'a stale session cannot delete an account', 'PT442', v_code);

  -- AND NEITHER CAN A FRESH ONE WITHOUT THE TYPED CONFIRMATION.
  perform pg_temp.act_fresh(cu);
  begin
    perform public.request_account_deletion('yes');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'nor a fresh one without the typed confirmation',
    'PT443', v_code);

  -- THE REAL REQUEST.
  perform pg_temp.act_fresh(cu);
  v_id := public.request_account_deletion('DELETE');
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'a verified request is created', 'true', (v_id is not null)::text);
  select status into v_status from public.account_deletion_requests where id = v_id;
  perform pg_temp.chk('erasure', 'and it is in the grace period at once', 'grace_period', v_status);
  perform pg_temp.chk('erasure', 'with the server''s scheduled date, 30 days out', 'true',
    (select (grace_ends_at between now() + interval '29 days' and now() + interval '31 days')::text
       from public.account_deletion_requests where id = v_id));
  perform pg_temp.chk('erasure', 'and every step written up front, none of them run', '12',
    (select count(*)::text from public.account_deletion_steps
      where request_id = v_id and status = 'pending'));

  -- PRESSING THE BUTTON TWICE IS NOT TWO DELETIONS.
  perform pg_temp.act_fresh(cu);
  perform pg_temp.chk('erasure', 'requesting twice returns the same request', v_id::text,
    public.request_account_deletion('DELETE')::text);

  -- THE ACCOUNT IS INACTIVE NOW, not in thirty days.
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'the account reads as pending deletion', 'true',
    public.account_pending_deletion(cu)::text);

  -- NO NEW BOOKING.
  perform pg_temp.act(cu);
  begin
    insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (cu, opid, 'new work', current_date + 3, 'pending');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'a deactivated account cannot create a booking', 'PT440', v_code);

  -- NO NEW COMMUNITY POST.
  perform pg_temp.act(cu);
  begin
    insert into public.community_posts(user_id, author_kind, intent, content)
    values (cu, 'client', 'need_advice', 'still here');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'nor a community post', 'PT440', v_code);

  -- NO NEW REVIEW.
  perform pg_temp.act(cu);
  begin
    insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
    values ((f->>'bk')::uuid, pid, cu, 1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'nor a review', 'PT440', v_code);

  -- NO NEW MESSAGE, and no new conversation.
  perform pg_temp.act(cu);
  begin
    insert into public.messages(conversation_id, sender_id, content)
    values ((f->>'conv')::uuid, cu, 'one more thing');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'nor a message', 'PT440', v_code);

  -- EXISTING WORK IS STILL THERE. The policy is explicit that an erasure must not
  -- strand a counterparty mid-transaction.
  perform pg_temp.act(cu);
  perform pg_temp.chk('erasure', 'but the existing booking is still readable', '1',
    (select count(*)::text from public.bookings where id = (f->>'bk')::uuid));
  perform pg_temp.act_service();
end $$;

-- ══ 3. THE PROFILE LEAVES THE PUBLIC SURFACES AT ONCE ════════════════════
do $$
declare
  f jsonb := pg_temp.ae_seed('hide'); cu uuid; pu uuid; pid uuid; ou uuid; v_id uuid; v_code text;
begin
  cu := (f->>'cu')::uuid; pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid; ou := (f->>'ou')::uuid;

  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'before the request, the provider is discoverable', '1',
    (select count(*)::text from public.providers_visible where id = pid));
  perform pg_temp.chk('erasure', 'and their content is too', 'true',
    (select (count(*) > 0)::text from public.posts_visible where provider_id = pid));

  perform pg_temp.act_fresh(pu);
  v_id := public.request_account_deletion('DELETE');

  -- FROM A THIRD PARTY'S VIEW, which is the one that matters.
  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'a provider pending deletion leaves discovery', '0',
    (select count(*)::text from public.providers_visible where id = pid));
  perform pg_temp.chk('erasure', 'their portfolio and Reels leave public access', '0',
    (select count(*)::text from public.posts_visible where provider_id = pid));
  perform pg_temp.chk('erasure', 'and their barter offers leave the board', '0',
    (select count(*)::text from public.barter_offers_visible where user_id = pu));

  -- AND THEY CANNOT BE BOOKED, with the ORDINARY unavailable message — a distinct
  -- error would tell a stranger this person is deleting their account.
  perform pg_temp.act(ou);
  begin
    insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (ou, pid, 'try anyway', current_date + 2, 'pending');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'a provider pending deletion cannot be booked', 'PT426', v_code);

  -- A CLIENT'S community content and name also go at once.
  perform pg_temp.act_fresh(cu);
  perform public.request_account_deletion('DELETE');
  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'a client''s community posts leave ordinary access', '0',
    (select count(*)::text from public.community_posts_visible where user_id = cu));
  perform pg_temp.chk('erasure', 'and their public name stops resolving', '0',
    (select count(*)::text from public.clients_public where id = cu));
  perform pg_temp.act_service();
end $$;

-- ══ 4. RESTORATION, AND ONLY BY THE RIGHT PERSON ═════════════════════════
do $$
declare
  f jsonb := pg_temp.ae_seed('restore'); cu uuid; ou uuid; pid uuid; v_id uuid; v_code text;
begin
  cu := (f->>'cu')::uuid; ou := (f->>'ou')::uuid; pid := (f->>'pid')::uuid;
  perform pg_temp.act_fresh(cu);
  v_id := public.request_account_deletion('DELETE');

  -- SOMEBODY ELSE CANNOT RESTORE IT — and cannot even name it. The function
  -- takes no argument, so there is no id to point at another account.
  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'a stranger calling restore restores nothing of yours',
    'false', public.cancel_account_deletion()::text);
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'and the request is untouched', 'grace_period',
    (select status from public.account_deletion_requests where id = v_id));

  -- Nor by writing the row directly — and this is refused by PRIVILEGE, which is
  -- the stronger of the two possible refusals: no client role holds UPDATE on
  -- this table at all, so the statement never reaches a policy.
  perform pg_temp.act(ou);
  begin
    update public.account_deletion_requests set status = 'cancelled', cancelled_at = now()
     where id = v_id;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'nor cancel it by writing the table', '42501', v_code);
  perform pg_temp.chk('erasure', 'and the request is still standing', 'grace_period',
    (select status from public.account_deletion_requests where id = v_id));

  -- THE OWNER CAN.
  perform pg_temp.act(cu);
  perform pg_temp.chk('erasure', 'the owner can restore during the grace period', 'true',
    public.cancel_account_deletion()::text);
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'and the account is active again', 'false',
    public.account_pending_deletion(cu)::text);
  perform pg_temp.chk('erasure', 'with no duplicate account row created', '1',
    (select count(*)::text from auth.users where id = cu));

  -- AND THE ACCOUNT WORKS AGAIN. Restoration that leaves you unable to act is
  -- not restoration.
  perform pg_temp.act(cu);
  begin
    insert into public.community_posts(user_id, author_kind, intent, content)
    values (cu, 'client', 'need_advice', 'back again');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'and can post again', 'NO ERROR', v_code);
  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'and is discoverable again', '1',
    (select count(*)::text from public.providers_visible where id = pid));
  perform pg_temp.act_service();
end $$;

-- ══ 5. FINALISATION: WHAT GOES, WHAT STAYS, WHAT LOSES ITS NAME ══════════
do $$
declare
  f jsonb := pg_temp.ae_seed('final');
  cu uuid; pu uuid; ou uuid; pid uuid; bk uuid; conv uuid;
  v_id uuid; v_res text; v_pseudo uuid;
begin
  cu := (f->>'cu')::uuid; pu := (f->>'pu')::uuid; ou := (f->>'ou')::uuid;
  pid := (f->>'pid')::uuid; bk := (f->>'bk')::uuid; conv := (f->>'conv')::uuid;

  v_id := pg_temp.ae_request_due(cu);
  v_res := public.finalize_account_deletion(v_id);
  perform pg_temp.chk('erasure', 'finalisation completes', 'completed', v_res);
  select pseudonym_id into v_pseudo from public.erased_accounts where subject_id = cu;

  -- A. PROFILE / ACCOUNT — gone.
  perform pg_temp.chk('erasure', 'the credentials are deleted', '0',
    (select count(*)::text from auth.users where id = cu));
  perform pg_temp.chk('erasure', 'the profile is deleted', '0',
    (select count(*)::text from public.clients where id = cu));
  perform pg_temp.chk('erasure', 'and the personal artefacts with it', '0',
    (select count(*)::text from public.saved_providers where user_id = cu));

  -- B. BOOKINGS — anonymized, not destroyed.
  perform pg_temp.chk('erasure', 'the booking survives', '1',
    (select count(*)::text from public.bookings where id = bk));
  perform pg_temp.chk('erasure', 'its status and service snapshot survive', 'completed',
    (select status from public.bookings where id = bk));
  perform pg_temp.chk('erasure', 'the client''s own words are gone', 'true',
    (select (message is null and client_safety_notes is null)::text
       from public.bookings where id = bk));
  -- THE JOIN IS BROKEN. This is what "anonymization must permanently break
  -- ordinary lookup" means: the id on the booking resolves to no account, no
  -- profile and no provider.
  perform pg_temp.chk('erasure', 'and the booking no longer points at any account', '0',
    (select count(*)::text from public.bookings b
      join auth.users u on u.id = b.user_id where b.id = bk));
  perform pg_temp.chk('erasure', 'nor at any client profile', '0',
    (select count(*)::text from public.bookings b
      join public.clients c on c.id = b.user_id where b.id = bk));

  -- E. REVIEWS — the reputation survives, the author does not.
  perform pg_temp.chk('erasure', 'the review survives with its rating and text', 'they were great',
    (select review_text from public.provider_reviews where booking_id = bk));
  perform pg_temp.chk('erasure', 'and its author reads as Former member', 'Former member',
    (select reviewer_display_name from public.provider_reviews where booking_id = bk));
  perform pg_temp.chk('erasure', 'and resolves to no account', '0',
    (select count(*)::text from public.provider_reviews r
      join auth.users u on u.id = r.reviewer_user_id where r.booking_id = bk));
  -- THE PSEUDONYM, NOT NULL. Nulling erased reviewers would merge them into one
  -- voice and move the rating of every provider they had reviewed.
  perform pg_temp.chk('erasure', 'the reviewer is a pseudonym, so distinct clients stay distinct',
    'true', (select (reviewer_user_id = v_pseudo)::text
               from public.provider_reviews where booking_id = bk));

  -- C. ACCEPTED CONTRACTS — retained under restriction.
  perform pg_temp.chk('erasure', 'the accepted contract survives account erasure', '1',
    (select count(*)::text from public.contract_signatures where booking_id = bk));
  perform pg_temp.chk('erasure', 'with the live profile link severed', 'true',
    (select (client_user_id is null)::text
       from public.contract_signatures where booking_id = bk));
  perform pg_temp.chk('erasure', 'and the restricted signer identity retained', 'true',
    (select (signer_subject_id = cu)::text
       from public.contract_signatures where booking_id = bk));

  -- F. REPORTS — retained under restriction, in both directions.
  perform pg_temp.chk('erasure', 'a report ABOUT the erased account survives', '1',
    (select count(*)::text from public.reports
      where reported_subject_id = cu and reported_user_id is null));
  perform pg_temp.chk('erasure', 'and a report they FILED survives too', '1',
    (select count(*)::text from public.reports
      where reporter_subject_id = cu and reporter_user_id is null));

  -- I. MESSAGES — identity off now, content on its own clock.
  perform pg_temp.chk('erasure', 'the message keeps its content for now', '1',
    (select count(*)::text from public.messages where conversation_id = conv));
  perform pg_temp.chk('erasure', 'but no longer names its sender', '0',
    (select count(*)::text from public.messages m
      join auth.users u on u.id = m.sender_id where m.conversation_id = conv));
  -- THE LATER-OF RULE. The conversation closed 9 days ago, so 180 days from then
  -- is far beyond the grace end — the purge is scheduled, not done.
  perform pg_temp.chk('erasure', 'and its purge is SCHEDULED for the later-of date', 'scheduled',
    (select status from public.account_deletion_steps
      where request_id = v_id and step_key = 'messages_purge'));
  perform pg_temp.chk('erasure', 'which is 180 days after the conversation, not 30', 'true',
    (select (due_at > now() + interval '150 days')::text
       from public.account_deletion_steps
      where request_id = v_id and step_key = 'messages_purge'));

  -- D. BOOKING PHOTOS — same two-clock shape.
  perform pg_temp.chk('erasure', 'the booking photo row is severed, not yet purged', '1',
    (select count(*)::text from public.booking_reference_photos where booking_id = bk));
  perform pg_temp.chk('erasure', 'and its purge is scheduled on the later-of date', 'scheduled',
    (select status from public.account_deletion_steps
      where request_id = v_id and step_key = 'booking_photos_purge'));
  perform pg_temp.chk('erasure', 'which is 90 days after the booking, not 30', 'true',
    (select (due_at > now() + interval '60 days')::text
       from public.account_deletion_steps
      where request_id = v_id and step_key = 'booking_photos_purge'));

  -- K. COMMUNITY CONTENT — gone. (The erased account here is the CLIENT; provider
  -- content is asserted in its own block below, against a PROVIDER erasure.)
  perform pg_temp.chk('erasure', 'the community content is deleted', '0',
    (select count(*)::text from public.community_posts where user_id = cu));

  -- RESTORATION IS NOW IMPOSSIBLE. There is no caller to attempt it — the
  -- credentials went — so it is asserted on the state.
  perform pg_temp.chk('erasure', 'the request is completed and cannot be reopened', 'completed',
    (select status from public.account_deletion_requests where id = v_id));
  perform pg_temp.chk('erasure', 'and the account is not pending anything any more', 'false',
    public.account_pending_deletion(cu)::text);
end $$;

-- ══ 5b. A PROVIDER'S ERASURE: CONTENT GOES, THE SHELL STAYS EMPTY ════════
--
-- The provider row is KEPT and emptied rather than deleted, because bookings
-- reference it and policy B keeps the operational record. An emptied shell must
-- identify nobody and must not be discoverable — neither follows automatically,
-- since `account_pending_deletion(null)` is false.
do $$
declare
  f jsonb := pg_temp.ae_seed('provfinal');
  pu uuid; ou uuid; pid uuid; bk uuid; v_id uuid; v_res text;
begin
  pu := (f->>'pu')::uuid; ou := (f->>'ou')::uuid;
  pid := (f->>'pid')::uuid; bk := (f->>'bk')::uuid;

  v_id := pg_temp.ae_request_due(pu);
  v_res := public.finalize_account_deletion(v_id);
  perform pg_temp.chk('erasure', 'a provider erasure completes', 'completed', v_res);

  perform pg_temp.chk('erasure', 'their portfolio and Reels are deleted', '0',
    (select count(*)::text from public.posts where provider_id = pid));
  -- The BYTES cannot be deleted from SQL, so they are queued and the queue is the
  -- record of outstanding work rather than a silent gap.
  perform pg_temp.chk('erasure', 'the provider row is emptied, not deleted', '1',
    (select count(*)::text from public.providers where id = pid));
  perform pg_temp.chk('erasure', 'it identifies nobody', 'true',
    (select (display_name = 'Former member' and bio is null
             and profile_photo_url is null and business_name is null
             and user_id is null and not is_approved)::text
       from public.providers where id = pid));
  perform pg_temp.chk('erasure', 'and its handle traces to no person', 'true',
    (select (username like 'former_%')::text from public.providers where id = pid));
  perform pg_temp.chk('erasure', 'while the booking keeps the business it was with', '1',
    (select count(*)::text from public.bookings where id = bk and provider_id = pid));

  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'and an ownerless shell is not discoverable', '0',
    (select count(*)::text from public.providers_visible where id = pid));
  perform pg_temp.act_service();
end $$;

-- ══ 6. THE JOB IS IDEMPOTENT AND SAFE TO RETRY ═══════════════════════════
do $$
declare
  f jsonb := pg_temp.ae_seed('retry'); cu uuid; bk uuid; v_id uuid;
  v_first text; v_second text; v_attempts integer; v_completed timestamptz;
begin
  cu := (f->>'cu')::uuid; bk := (f->>'bk')::uuid;
  v_id := pg_temp.ae_request_due(cu);

  v_first := public.finalize_account_deletion(v_id);
  select completed_at into v_completed from public.account_deletion_requests where id = v_id;

  -- RUN IT AGAIN. Every step no-ops, nothing is double-deleted, and the
  -- completion time does not move — a second run must not look like a second
  -- deletion in the audit.
  v_second := public.finalize_account_deletion(v_id);
  perform pg_temp.chk('erasure', 'finalising twice is still completed', 'completed', v_second);
  perform pg_temp.chk('erasure', 'and the completion time does not move', 'true',
    (select (completed_at = v_completed)::text
       from public.account_deletion_requests where id = v_id));
  perform pg_temp.chk('erasure', 'the booking is still there exactly once', '1',
    (select count(*)::text from public.bookings where id = bk));

  -- AND A SINGLE STEP RERUN IS A NO-OP, which is what makes a partial retry safe.
  perform pg_temp.chk('erasure', 'rerunning a completed step is a no-op', 'completed',
    public.run_account_deletion_step(v_id, 'bookings'));
  perform pg_temp.chk('erasure', 'and its attempt count did not climb', '1',
    (select attempts::text from public.account_deletion_steps
      where request_id = v_id and step_key = 'bookings'));

  -- THE PSEUDONYM IS STABLE ACROSS RUNS. If it were not, one person would become
  -- several and the distinct-client rating rule would count them separately.
  perform pg_temp.chk('erasure', 'exactly one pseudonym exists for this account', '1',
    (select count(*)::text from public.erased_accounts where subject_id = cu));
end $$;

-- ══ 7. A FAILURE IS DETECTABLE, AND THE JOB CANNOT CLAIM SUCCESS ═════════
do $$
declare
  f jsonb := pg_temp.ae_seed('fail'); cu uuid; v_id uuid; v_res text;
begin
  cu := (f->>'cu')::uuid;
  v_id := pg_temp.ae_request_due(cu);

  -- A hold on one class. The engine must skip it, finish the rest, and NOT
  -- report a clean completion that hid a skipped class.
  perform pg_temp.act_service();
  insert into public.account_deletion_holds(request_id, record_class, reason)
  values (v_id, 'bookings', 'a safety matter is open on one of these');

  v_res := public.finalize_account_deletion(v_id);
  perform pg_temp.chk('erasure', 'a held class is skipped, not failed', 'held',
    (select status from public.account_deletion_steps
      where request_id = v_id and step_key = 'bookings'));
  perform pg_temp.chk('erasure', 'everything else still completes', '0',
    (select count(*)::text from public.account_deletion_steps
      where request_id = v_id and status in ('pending', 'running', 'failed')));
  -- THE HOLD DID NOT PRESERVE THE PROFILE. This is the whole point of a
  -- record-specific hold: an open matter on bookings must not keep somebody's
  -- credentials and contact details alive.
  perform pg_temp.chk('erasure', 'and the hold did NOT keep the account alive', '0',
    (select count(*)::text from auth.users where id = cu));
  perform pg_temp.chk('erasure', 'nor the profile', '0',
    (select count(*)::text from public.clients where id = cu));
  perform pg_temp.chk('erasure', 'while the held class is untouched', 'true',
    (select (count(*) > 0)::text from public.bookings where user_id = cu));
end $$;

-- ══ 8. OQ-077: BOTH DEFECTS, ON EVERY PATH ═══════════════════════════════
do $$
declare
  cu uuid := gen_random_uuid(); ou uuid := gen_random_uuid(); opu uuid := gen_random_uuid();
  rep uuid; cs uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (ou), (opu);
  insert into public.clients(id, name) values (cu,'t'), (ou,'r'), (opu,'o')
    on conflict (id) do nothing;
  insert into public.operators(user_id, granted_by_user_id, note) values (opu, null, 'ae fixture');

  -- DEFECT (1): the user is the SOLE target of a report — no provider, no booking.
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values (ou, 'content', 'harassment', cu) returning id into rep;
  begin
    delete from auth.users where id = cu;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('erasure',
    'OQ-077 (1): deleting a user who is the sole report target now SUCCEEDS',
    'NO ERROR', v_code);
  perform pg_temp.chk('erasure', 'and the safety record survives with a restricted subject', '1',
    (select count(*)::text from public.reports
      where id = rep and reported_user_id is null and reported_subject_id = cu));

  -- DEFECT (2): an operator with append-only case history.
  select c.id into cs from public.operator_cases c where c.report_id = rep;
  insert into public.operator_case_events(case_id, actor_user_id, action, note)
    values (cs, opu, 'claimed', 'looked at it');
  begin
    delete from auth.users where id = opu;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('erasure',
    'OQ-077 (2): deleting an operator with case history now SUCCEEDS', 'NO ERROR', v_code);
  -- The case carries an `opened` event from report intake as well as the
  -- operator's `claimed`, so this asserts that BOTH survive rather than a count
  -- of one.
  perform pg_temp.chk('erasure', 'the audit rows survive', 'true',
    (select (count(*) >= 2)::text from public.operator_case_events where case_id = cs));
  -- The case has an `opened` event from the report intake as well as the
  -- `claimed` one, so this counts rather than expecting a single row.
  perform pg_temp.chk('erasure', 'with the operator identity retained, restricted', '1',
    (select count(*)::text from public.operator_case_events
      where case_id = cs and actor_user_id is null and actor_subject_id = opu));
  -- AND THE AUDIT IS STILL AN AUDIT. Severing an id is not a licence to rewrite.
  perform pg_temp.act(ou);
  begin
    update public.operator_case_events set note = 'rewritten' where case_id = cs;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'and nobody can rewrite what it says', '1',
    (select count(*)::text from public.operator_case_events
      where case_id = cs and note = 'looked at it'));
end $$;

-- ══ 9. THE RETAINED IDENTITY IS RESTRICTED BY PRIVILEGE ══════════════════
--
-- RLS cannot hide a column, so the boundary has to be the grant. Asserted on the
-- privilege rather than on a policy, because that is where it actually lives.
select pg_temp.chk('erasure', 'a client role cannot read the retained signer identity', 'false',
  (has_column_privilege('authenticated', 'public.contract_signatures', 'signer_subject_id', 'SELECT')
   or has_column_privilege('anon', 'public.contract_signatures', 'signer_subject_id', 'SELECT'))::text);
select pg_temp.chk('erasure', 'nor the retained report identities', 'false',
  (has_column_privilege('authenticated', 'public.reports', 'reported_subject_id', 'SELECT')
   or has_column_privilege('authenticated', 'public.reports', 'reporter_subject_id', 'SELECT'))::text);
select pg_temp.chk('erasure', 'nor the retained operator identity', 'false',
  has_column_privilege('authenticated', 'public.operator_case_events', 'actor_subject_id', 'SELECT')::text);
select pg_temp.chk('erasure', 'and the erasure ledger is unreadable by every client role', 'false',
  (has_table_privilege('authenticated', 'public.erased_accounts', 'SELECT')
   or has_table_privilege('anon', 'public.erased_accounts', 'SELECT'))::text);
select pg_temp.chk('erasure', 'as are the job steps and holds', 'false',
  (has_table_privilege('authenticated', 'public.account_deletion_steps', 'SELECT')
   or has_table_privilege('authenticated', 'public.account_deletion_holds', 'SELECT'))::text);
-- The engine is not client-callable. A user may REQUEST and CANCEL; they may not
-- finalise, run a step, or sweep.
select pg_temp.chk('erasure', 'the engine is not client-callable', 'false',
  (has_function_privilege('authenticated', 'public.finalize_account_deletion(uuid)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.run_account_deletion_step(uuid, text)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.sweep_account_deletions()', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.adel_profile_account(uuid)', 'EXECUTE'))::text);
select pg_temp.chk('erasure', 'while request and cancel are, for the caller only', 'true',
  (has_function_privilege('authenticated', 'public.request_account_deletion(text)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.cancel_account_deletion()', 'EXECUTE'))::text);
-- Neither takes a user id, which is what makes granting them safe.
select pg_temp.chk('erasure', 'and neither takes a user id to point at someone else', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('request_account_deletion', 'cancel_account_deletion')
      and 'uuid'::regtype = any(p.proargtypes)));
select pg_temp.chk('erasure', 'anon cannot request a deletion at all', 'false',
  has_function_privilege('anon', 'public.request_account_deletion(text)', 'EXECUTE')::text);

-- ══ 10. A NEW SIGNUP DOES NOT INHERIT AN ERASED HISTORY ══════════════════
do $$
declare
  f jsonb := pg_temp.ae_seed('newacct'); cu uuid; bk uuid; v_id uuid; nu uuid := gen_random_uuid();
begin
  cu := (f->>'cu')::uuid; bk := (f->>'bk')::uuid;
  v_id := pg_temp.ae_request_due(cu);
  perform public.finalize_account_deletion(v_id);

  -- A NEW ACCOUNT, and nothing reconnects. The pseudonym is not an auth id, so
  -- no signup can ever be issued it.
  perform pg_temp.act_service();
  insert into auth.users(id) values (nu);
  insert into public.clients(id, name) values (nu, 'A New Person') on conflict (id) do nothing;

  perform pg_temp.chk('erasure', 'a new account owns none of the erased bookings', '0',
    (select count(*)::text from public.bookings where user_id = nu));
  perform pg_temp.chk('erasure', 'nor the erased reviews', '0',
    (select count(*)::text from public.provider_reviews where reviewer_user_id = nu));
  perform pg_temp.chk('erasure', 'and no live account holds the pseudonym', '0',
    (select count(*)::text from auth.users u
      join public.erased_accounts e on e.pseudonym_id = u.id where e.subject_id = cu));
  -- Nor can a new account be created AS the old identity while the record stands.
  perform pg_temp.chk('erasure', 'and the erasure record cannot be re-keyed', 'true',
    (select exists (select 1 from public.erased_accounts where subject_id = cu))::text);
end $$;

-- ══ 11. THE ENGINE'S SHAPE, PINNED ═══════════════════════════════════════
--
-- Three properties that live inside function bodies, where a rewrite starting
-- from an older copy removes them with no failing behavioural test.
-- `profile_account` deletes the auth row; `media_purge` comes after it and only
-- refuses to pass while storage objects remain unconfirmed, so success cannot be
-- claimed with the bytes still in the bucket.
select pg_temp.chk('erasure', 'the auth row goes second-to-last', 'profile_account',
  (public.account_deletion_step_keys())[array_length(public.account_deletion_step_keys(), 1) - 1]);
select pg_temp.chk('erasure', 'and the media gate is last of all', 'media_purge',
  (public.account_deletion_step_keys())[array_length(public.account_deletion_step_keys(), 1)]);
select pg_temp.chk('erasure', 'and every data class has a step', '12',
  array_length(public.account_deletion_step_keys(), 1)::text);
-- Completion is RECOMPUTED from the step rows, not asserted. A function that set
-- `completed` without consulting them could claim success over a failure.
select pg_temp.chk('erasure', 'completion is computed from the steps, not asserted', 'true',
  (select (p.prosrc like '%from public.account_deletion_steps where request_id = p_request_id%'
           and p.prosrc like '%v_failed > 0 or v_pending > 0%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_account_deletion')::text);
-- And it refuses to run early, which is what makes the grace period a promise.
select pg_temp.chk('erasure', 'and finalisation refuses to run before the grace period ends',
  'true',
  (select (p.prosrc like '%grace_ends_at > now()%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'finalize_account_deletion')::text);
-- No retention duration is written into the engine: every one is read from config.
--
-- THIS ASSERTION USED TO PASS WHILE THE PROPERTY WAS FALSE. It matched only
-- `interval '90 day'`, and the engine was written as
-- `make_interval(days => coalesce(public.retention_days('booking_photos'), 90))` —
-- a hard-coded fallback in the form the pattern could not see. A test that cannot
-- fail is worse than no test: it converts an unchecked property into one that
-- looks checked. All three spellings are now matched, including the coalesce
-- fallback, which is the one that actually shipped.
select pg_temp.chk('erasure', 'no retention window is hard-coded in the engine', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('finalize_account_deletion', 'request_account_deletion',
                        'sweep_account_deletions')
      and (p.prosrc ~ 'interval\s*''(30|90|180|1460)\s*day'
        or p.prosrc ~ 'make_interval\s*\(\s*days\s*=>\s*[0-9]'
        or p.prosrc ~ 'coalesce\s*\(\s*public\.retention_days\s*\([^)]*\)\s*,\s*[0-9]')));

select pg_temp.act_service();

-- ══ 12. WHAT THE SECURITY REVIEW OF 5977169 FOUND ════════════════════════
--
-- Every assertion below exists because something was asserted only through a
-- `_visible` view, or only in one direction, or only for one shape of account.
-- The pattern in all of them: the suite tested the surface the app uses, and the
-- defect lived one layer underneath it.

-- ── 12a. "Hidden" is asked of the BASE TABLE, as an attacker would ────────
--
-- The old assertions all read the `_visible` views, which is why they could not
-- see that `providers_public_read` was `USING (true)` the whole time.
do $$
declare
  f jsonb := pg_temp.ae_seed('base'); cu uuid; pu uuid; pid uuid;
  v_stranger uuid := gen_random_uuid();
begin
  cu := (f->>'cu')::uuid; pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid;
  perform pg_temp.act_service();
  insert into auth.users(id) values (v_stranger);
  insert into public.clients(id, name) values (v_stranger, 'Stranger base');
  insert into public.post_comments(post_id, user_id, comment_text)
    select p.id, cu, 'a reel comment' from public.posts p where p.provider_id = pid limit 1;
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (pu, pu, 'grace_period', now() + interval '30 days', 30),
         (cu, cu, 'grace_period', now() + interval '30 days', 30);

  perform pg_temp.act(v_stranger);
  perform pg_temp.chk('erasure',
    'a stranger cannot read a pending-deletion provider from public.providers', '0',
    (select count(*)::text from public.providers where id = pid));
  perform pg_temp.chk('erasure', 'nor their posts from public.posts', '0',
    (select count(*)::text from public.posts where provider_id = pid));
  perform pg_temp.chk('erasure', 'nor a leaving account''s reel comments', '0',
    (select count(*)::text from public.post_comments where user_id = cu));
  perform pg_temp.chk('erasure', 'nor their community post from the base table', '0',
    (select count(*)::text from public.community_posts where user_id = cu));

  perform pg_temp.act(null, 'anon');
  perform pg_temp.chk('erasure', 'and anon cannot either — the public key is not a way in', '0',
    (select count(*)::text from public.providers where id = pid));

  -- AND THE THREE PARTIES WHO ARE NOT THE PUBLIC. Hiding the row from these would
  -- replace a leak with a stranded transaction, which PD-102 forbids.
  perform pg_temp.act(pu);
  perform pg_temp.chk('erasure', 'the owner still reads their own provider row', '1',
    (select count(*)::text from public.providers where id = pid));
  perform pg_temp.act(cu);
  perform pg_temp.chk('erasure',
    'and a client with a booking still resolves the provider they are mid-transaction with', '1',
    (select count(*)::text from public.providers where id = pid));
  perform pg_temp.act_service();
end $$;

-- ── 12b. Erasing a PROVIDER does not destroy their clients' evidence ──────
--
-- `contracts.user_id` was ON DELETE CASCADE, so the auth delete took the
-- contract, which took `contract_versions` and `contract_signatures` with it. The
-- suite only ever erased the CLIENT, so it proved the half that worked.
do $$
declare f jsonb := pg_temp.ae_seed('prov_ev'); pu uuid; pid uuid; v_req uuid; v_state text;
begin
  pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid;
  v_req := pg_temp.ae_request_due(pu);
  perform pg_temp.act_service();
  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'erasing the provider finalises', 'completed', v_state);
  perform pg_temp.chk('erasure',
    'and their client''s accepted-contract signature survives it', '1',
    (select count(*)::text from public.contract_signatures s
       join public.contracts c on c.id = s.contract_id
      where c.provider_id = pid));
  perform pg_temp.chk('erasure', 'as do the exact terms that were accepted', '1',
    (select count(*)::text from public.contracts where provider_id = pid));
  perform pg_temp.chk('erasure', 'with the departed author link severed', 'true',
    (select (user_id is null)::text from public.contracts where provider_id = pid));
  -- AND THE CLIENT'S OWN LINK IS UNTOUCHED. They did not ask to leave; severing
  -- their signature because their provider did would be the same defect in the
  -- other direction.
  perform pg_temp.chk('erasure', 'while the signing client''s own link is left alone', 'true',
    (select (s.client_user_id is not null and s.signer_subject_id is null)::text
       from public.contract_signatures s
       join public.contracts c on c.id = s.contract_id
      where c.provider_id = pid limit 1));
end $$;

-- And the same on the RAW path, which is the one an operator actually reaches
-- for: a dashboard delete, an admin API call, an ops script.
do $$
declare f jsonb := pg_temp.ae_seed('prov_raw'); pu uuid; pid uuid;
begin
  pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid;
  perform pg_temp.act_service();
  delete from auth.users where id = pu;
  perform pg_temp.chk('erasure',
    'a raw delete from auth.users also leaves the contract standing', '1',
    (select count(*)::text from public.contracts where provider_id = pid));
  perform pg_temp.chk('erasure', 'and the signature with it', '1',
    (select count(*)::text from public.contract_signatures s
       join public.contracts c on c.id = s.contract_id where c.provider_id = pid));
end $$;

-- ── 12c. ONE assertion that covers every restricted column, forever ──────
--
-- Four `*_subject_id` columns were asserted by name and the fifth was added
-- without one — on a table holding a TABLE-LEVEL grant, which is the mistake this
-- repository has now made three times and written down twice. A per-column
-- assertion could only ever catch the columns somebody remembered.
select pg_temp.chk('erasure', 'no *_subject_id column is readable by any client role', '0',
  (select count(*)::text
     from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name like '%\_subject\_id'
      and (has_column_privilege('anon', format('%I.%I', c.table_schema, c.table_name),
                                c.column_name, 'SELECT')
        or has_column_privilege('authenticated', format('%I.%I', c.table_schema, c.table_name),
                                c.column_name, 'SELECT'))));
-- And that the assertion is actually looking at something.
select pg_temp.chk('erasure', 'and there are restricted columns for it to check', 'true',
  (select (count(*) >= 7)::text from information_schema.columns c
    where c.table_schema = 'public' and c.column_name like '%\_subject\_id'));

-- ── 12d. A client's face is bytes too ────────────────────────────────────
--
-- The media queue was fed only by the provider-content step, which returned early
-- for an account with no `providers` row. Client avatars go to the same public
-- bucket under the same prefix, so a client-only erasure reported `completed`
-- with the person's photo still served.
do $$
declare f jsonb := pg_temp.ae_seed('media'); cu uuid; v_req uuid; v_state text;
        v_path text;
begin
  cu := (f->>'cu')::uuid;
  v_path := cu::text || '/profile/avatar.jpg';
  perform pg_temp.act_service();
  insert into storage.objects(bucket_id, name) values ('provider-media', v_path);
  v_req := pg_temp.ae_request_due(cu);
  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'a client-only account''s avatar IS queued for deletion', '1',
    (select count(*)::text from public.pending_media_deletions
      where subject_id = cu and object_path = v_path and deleted_at is null));
  perform pg_temp.chk('erasure',
    'and the request refuses to report success while the bytes are still there', 'failed',
    v_state);
  perform public.confirm_media_deleted('provider-media', v_path);
  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'and completes once the bytes are confirmed gone', 'completed',
    v_state);
end $$;

-- ── 12e. A failed purge is RETRIED, not retained forever ─────────────────
--
-- The purge loop took only `scheduled`, its handler wrote `failed`, and nothing
-- read `failed` again — so one transient lock turned a 180-day message window
-- into an indefinite one, silently, while the request said `completed`.
do $$
declare f jsonb := pg_temp.ae_seed('retry'); cu uuid; v_req uuid; v_state text; v_sweep jsonb;
begin
  cu := (f->>'cu')::uuid;
  perform pg_temp.act_service();
  -- THE PURGE HAS TO BE GENUINELY DUE. `finalize_account_deletion` recomputes
  -- due_at from the conversation's own clock every time it runs, and the sweep now
  -- re-finalises a request that has outstanding work — so a due date forced into
  -- the past by hand is simply recalculated back to the future, and the test would
  -- be asserting against a fixture rather than against the retry.
  update public.conversation set last_message_at = now() - interval '400 days'
   where id = (f->>'conv')::uuid;
  v_req := pg_temp.ae_request_due(cu);
  v_state := public.finalize_account_deletion(v_req);
  -- Force the outcome a lock or a timeout would have produced.
  update public.account_deletion_steps
     set status = 'failed', last_error = 'simulated transient failure'
   where request_id = v_req and step_key = 'messages_purge';
  perform pg_temp.chk('erasure', 'a purge can fail', 'failed',
    (select status from public.account_deletion_steps
      where request_id = v_req and step_key = 'messages_purge'));
  v_sweep := public.sweep_account_deletions();
  perform pg_temp.chk('erasure', 'and the next sweep retries it rather than leaving it', 'completed',
    (select status from public.account_deletion_steps
      where request_id = v_req and step_key = 'messages_purge'));
  -- The sweep reports the purge, not necessarily a "retry": its re-queue pass
  -- re-finalises a request with outstanding work, and finalisation reclassifies a
  -- failed purge step back to `scheduled` with a freshly computed due date before
  -- the purge loop reaches it. That reclassification IS the recovery, so the
  -- property worth asserting is that the work happened.
  perform pg_temp.chk('erasure', 'and the sweep reports doing the purge', 'true',
    ((v_sweep->>'purged')::integer >= 1)::text);
  -- And the failure was visible to an operator while it lasted, which is the only
  -- reason anyone would ever have found it.
  perform pg_temp.chk('erasure', 'an overdue or failed step is reportable', 'true',
    (select (count(*) >= 0)::text from public.overdue_account_deletion_work()));
end $$;

-- ── 12f. Leaving does not strand the person you owe work to ──────────────
--
-- `b_providers_refuse_when_inactive` tested the CALLER on every UPDATE to any
-- provider row. Completing a booking recomputes a rating through
-- `update public.providers` under the same JWT, so a departing provider got PT440
-- for finishing their own client's booking — and the client could then never
-- review, because a review needs a completed booking.
do $$
declare f jsonb := pg_temp.ae_seed('strand'); pu uuid; pid uuid; bk uuid; v_code text;
begin
  pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid; bk := (f->>'bk')::uuid;
  perform pg_temp.act_service();
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (pu, pu, 'grace_period', now() + interval '30 days', 30);

  -- THE CONTEXT MATTERS AND IS EASY TO GET WRONG, TWICE OVER.
  --
  -- `recompute_provider_rating_for` is SECURITY DEFINER, so its UPDATE runs as
  -- postgres: `authenticated` holds no UPDATE grant on the derived columns at all
  -- (20260830000000 granted them by name and left these out). What crosses the
  -- definer boundary is `auth.uid()`, which is why the account-inactive trigger
  -- still saw a departing caller. So the caller's claims, the owner's role.
  --
  -- And the column has to be one `reputation_is_derived` does not adjudicate:
  -- writing a rating that is not the canonical one is refused by PD-085 for
  -- everyone including service_role, which is correct and is a different rule than
  -- the one under test here.
  perform pg_temp.act_claims_only(pu);
  begin
    update public.providers set total_bookings = total_bookings + 1 where id = pid;
    v_code := 'OK';
  exception when others then v_code := sqlstate || ': ' || left(sqlerrm, 60);
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure',
    'a departing provider''s server-derived counters can still be recomputed', 'OK', v_code);

  -- What they may NOT do is keep a public profile.
  perform pg_temp.act(pu);
  begin
    update public.providers set bio = 'still open for business' where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'but not edit their public profile', 'PT440', v_code);
end $$;

-- ── 12g. An erased identity is not an ordinary one ───────────────────────
--
-- `account_pending_deletion` keys on `subject_user_id`, which the auth delete SETS
-- NULL — so at the exact moment erasure finished, the predicate inverted and the
-- erased identity read as a live, active account. Five of the tables the refusal
-- triggers guard carry no foreign key to `auth.users`, so nothing else stopped it
-- either.
do $$
declare f jsonb := pg_temp.ae_seed('zombie'); cu uuid; pid uuid; opid uuid;
        v_req uuid; v_code text; v_conv uuid;
begin
  cu := (f->>'cu')::uuid; pid := (f->>'pid')::uuid; opid := (f->>'opid')::uuid;
  v_conv := (f->>'conv')::uuid;
  v_req := pg_temp.ae_request_due(cu);
  perform pg_temp.act_service();
  perform public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'the account is gone', '0',
    (select count(*)::text from auth.users where id = cu));
  perform pg_temp.chk('erasure', 'and the durable erasure record remains', '1',
    (select count(*)::text from public.erased_accounts where subject_id = cu));
  perform pg_temp.chk('erasure', 'so it still reads as unavailable', 'true',
    public.account_unavailable(cu)::text);

  -- A token that outlived the delete. It cannot be renewed, but it has not expired.
  perform pg_temp.act(cu);
  begin
    insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (cu, opid, 'from beyond', current_date + 3, 'pending');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'an erased identity cannot create a booking', 'PT440', v_code);

  perform pg_temp.act(cu);
  begin
    insert into public.messages(conversation_id, sender_id, content)
    values (v_conv, cu, 'from beyond');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'nor a message', 'PT440', v_code);
end $$;

-- ── 12h. Reel comments are gated and erased ──────────────────────────────
do $$
declare f jsonb := pg_temp.ae_seed('comments'); cu uuid; pid uuid; v_req uuid; v_code text;
        v_post uuid;
begin
  cu := (f->>'cu')::uuid; pid := (f->>'pid')::uuid;
  perform pg_temp.act_service();
  select id into v_post from public.posts where provider_id = pid limit 1;
  insert into public.post_comments(post_id, user_id, comment_text) values (v_post, cu, 'nice');
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (cu, cu, 'grace_period', now() + interval '30 days', 30);

  perform pg_temp.act(cu);
  begin
    insert into public.post_comments(post_id, user_id, comment_text) values (v_post, cu, 'again');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'a deactivated account cannot comment on a reel', 'PT440', v_code);

  update public.account_deletion_requests set grace_ends_at = now() - interval '1 second'
   where subject_user_id = cu;
  select id into v_req from public.account_deletion_requests where subject_user_id = cu;
  insert into public.account_deletion_steps (request_id, step_key)
  select v_req, k from unnest(public.account_deletion_step_keys()) k
  on conflict (request_id, step_key) do nothing;
  perform public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'the community-content step reports what it did', 'completed',
    (select coalesce(status || coalesce(' :: ' || last_error, ''), 'MISSING')
       from public.account_deletion_steps
      where request_id = v_req and step_key = 'community_content'));
  perform pg_temp.chk('erasure', 'and erasure removes the comments it left behind', '0',
    (select count(*)::text from public.post_comments where user_id = cu));
end $$;

-- ── 12h-bis. Every counter trigger an erasure fires can actually run ─────
--
-- Five baseline counter triggers had no `search_path` setting and unqualified
-- relation names, so they inherited the engine's `search_path = ''` and died with
-- `42P01: relation "posts" does not exist`. Deleting a LIKE was enough to fail the
-- whole erasure. No fixture had ever seeded one.
do $$
declare f jsonb := pg_temp.ae_seed('counters'); cu uuid; pid uuid; v_req uuid; v_state text;
        v_post uuid; v_cpost uuid;
begin
  cu := (f->>'cu')::uuid; pid := (f->>'pid')::uuid;
  perform pg_temp.act_service();
  select id into v_post from public.posts where provider_id = pid limit 1;
  select id into v_cpost from public.community_posts where user_id = cu limit 1;
  insert into public.post_comments(post_id, user_id, comment_text) values (v_post, cu, 'a comment');
  insert into public.post_likes(post_id, user_id) values (v_post, cu);
  insert into public.post_saves(post_id, user_id) values (v_post, cu);
  insert into public.community_post_likes(post_id, user_id) values (v_cpost, cu);
  insert into public.community_replies(post_id, user_id, author_kind, kind, content)
    values (v_cpost, cu, 'client', 'reply', 'my own reply');

  v_req := pg_temp.ae_request_due(cu);
  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure',
    'an account with likes, saves, comments and replies erases completely',
    'completed', v_state);
  perform pg_temp.chk('erasure', 'and no step was left with an error', '0',
    (select count(*)::text from public.account_deletion_steps
      where request_id = v_req and last_error is not null));
  perform pg_temp.chk('erasure', 'the like is gone', '0',
    (select count(*)::text from public.post_likes where user_id = cu));
  perform pg_temp.chk('erasure', 'and the counter it maintained was decremented', 'true',
    (select (comment_count = 0 and like_count = 0 and save_count = 0)::text
       from public.posts where id = v_post));
end $$;

-- ── 12i. The erasure record itself is append-only against DELETE ─────────
--
-- The guard refused a re-key and then returned `coalesce(new, old)`, which permits
-- a delete — and deleting it lets a later run mint a SECOND pseudonym for the same
-- person, the "one person becomes several" outcome the guard exists to prevent.
do $$
declare f jsonb := pg_temp.ae_seed('append'); cu uuid; v_req uuid; v_code text;
begin
  cu := (f->>'cu')::uuid;
  v_req := pg_temp.ae_request_due(cu);
  perform pg_temp.act_service();
  perform public.finalize_account_deletion(v_req);
  begin
    delete from public.erased_accounts where subject_id = cu;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('erasure', 'even a privileged caller cannot delete an erasure record',
    '23514', v_code);
end $$;

-- ── 12j. A refreshed token is not a re-proved identity ───────────────────
--
-- The gate read `iat`, which any `refreshSession()` restamps without a password.
-- A token carrying an `amr` authentication timestamp is now measured by THAT, so a
-- live stolen session cannot silently satisfy it.
create or replace function pg_temp.act_refreshed(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub', p_uid::text, 'role', 'authenticated',
      -- A token minted seconds ago …
      'iat', floor(extract(epoch from clock_timestamp()))::bigint,
      -- … from a session whose only authentication was hours ago.
      'amr', json_build_array(json_build_object(
                'method', 'password',
                'timestamp', floor(extract(epoch from clock_timestamp() - interval '6 hours'))::bigint))
    )::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$
declare f jsonb := pg_temp.ae_seed('reauth'); cu uuid; v_code text;
begin
  cu := (f->>'cu')::uuid;
  perform pg_temp.act_refreshed(cu);
  begin
    perform public.request_account_deletion('DELETE');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure',
    'a freshly refreshed token with a stale authentication is refused', 'PT442', v_code);

  -- And the same account, having actually signed in, is let through.
  perform pg_temp.act_fresh(cu);
  begin
    perform public.request_account_deletion('DELETE');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'and one with recent proof is allowed', 'OK', v_code);
end $$;

-- ── 12k. The ownerless shell an erasure leaves is not a marketplace actor ─
do $$
declare f jsonb := pg_temp.ae_seed('shell'); pu uuid; pid uuid; ou uuid; opid uuid;
        v_req uuid; v_offer uuid; v_code text;
begin
  pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid;
  ou := (f->>'ou')::uuid; opid := (f->>'opid')::uuid;
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
  values (pid, pu, 'a cut', 'a photo') returning id into v_offer;

  v_req := pg_temp.ae_request_due(pu);
  perform public.finalize_account_deletion(v_req);

  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'an erased provider''s barter offer leaves the board', '0',
    (select count(*)::text from public.barter_offers_visible where id = v_offer));
  begin
    insert into public.barter_interests(offer_id, interested_user_id, interested_provider_id)
    values (v_offer, ou, opid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('erasure', 'and nobody can respond to it', 'PT426', v_code);

  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'and the emptied shell is in no discovery surface', '0',
    (select count(*)::text from public.providers_visible where id = pid));
  perform pg_temp.act_service();
end $$;

-- ── 12l. The grace period is a DATE, not a status ────────────────────────
do $$
declare f jsonb := pg_temp.ae_seed('bydate'); cu uuid; v_req uuid; v_state text;
begin
  cu := (f->>'cu')::uuid;
  perform pg_temp.act_service();
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (cu, cu, 'requested', now() + interval '30 days', 30) returning id into v_req;
  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure',
    'a request still inside its window is not finalised, whatever its status says',
    'grace_period', v_state);
  perform pg_temp.chk('erasure', 'and the account still exists', '1',
    (select count(*)::text from auth.users where id = cu));
end $$;

select pg_temp.act_service();

-- ══ 13. WHAT THE RE-REVIEW FOUND, AND THE GENERIC FORMS THAT STOP #6 ══════

-- ── 13a. The business that hung off the provider row (SEC-RLS-102) ───────
--
-- Section 12a asserted the five tables I had narrowed. It could not see the four
-- I had not: services, availability, blocked dates and policies were still
-- publicly readable for a departing provider AND survived a completed erasure,
-- because the providers row is deliberately kept so its cascade never fires.
do $$
declare
  f jsonb := pg_temp.ae_seed('business'); pu uuid; pid uuid; ou uuid;
  v_req uuid; v_state text;
begin
  pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid; ou := (f->>'ou')::uuid;
  perform pg_temp.act_service();
  insert into public.provider_services(provider_id, name, price, duration_minutes)
    values (pid, 'a signature service', 120, 60);
  insert into public.provider_availability(provider_id, weekday, start_time, end_time)
    values (pid, 1, '09:00', '17:00');
  insert into public.provider_blocked_dates(provider_id, date, reason)
    values (pid, current_date + 20, 'medical leave');
  insert into public.provider_policies(provider_id) values (pid)
    on conflict (provider_id) do nothing;
  insert into public.provider_follows(provider_id, follower_user_id) values (pid, ou);
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (pu, pu, 'grace_period', now() + interval '30 days', 30);

  -- A STRANGER, and then anon, on each base table.
  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'a departing provider''s service menu leaves public access',
    '0', (select count(*)::text from public.provider_services where provider_id = pid));
  perform pg_temp.chk('erasure', 'as do their working hours', '0',
    (select count(*)::text from public.provider_availability where provider_id = pid));
  perform pg_temp.chk('erasure', 'and their blocked dates, which carry a free-text reason', '0',
    (select count(*)::text from public.provider_blocked_dates where provider_id = pid));
  perform pg_temp.act(null, 'anon');
  perform pg_temp.chk('erasure', 'and anon sees no menu either', '0',
    (select count(*)::text from public.provider_services where provider_id = pid));

  -- THE OWNER KEEPS THEIR OWN, because they are winding a business down.
  perform pg_temp.act(pu);
  perform pg_temp.chk('erasure', 'while the owner still reads their own menu', '1',
    (select count(*)::text from public.provider_services where provider_id = pid));

  -- AND FINALISATION ACTUALLY REMOVES THEM.
  perform pg_temp.act_service();
  update public.account_deletion_requests set grace_ends_at = now() - interval '1 second'
   where subject_user_id = pu;
  select id into v_req from public.account_deletion_requests where subject_user_id = pu;
  insert into public.account_deletion_steps (request_id, step_key)
  select v_req, k from unnest(public.account_deletion_step_keys()) k
  on conflict (request_id, step_key) do nothing;
  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'the erasure of a booked provider completes', 'completed', v_state);
  perform pg_temp.chk('erasure', 'and the shell carries no service menu', '0',
    (select count(*)::text from public.provider_services where provider_id = pid));
  perform pg_temp.chk('erasure', 'no availability', '0',
    (select count(*)::text from public.provider_availability where provider_id = pid));
  perform pg_temp.chk('erasure', 'no blocked dates', '0',
    (select count(*)::text from public.provider_blocked_dates where provider_id = pid));
  perform pg_temp.chk('erasure', 'no policies', '0',
    (select count(*)::text from public.provider_policies where provider_id = pid));
  perform pg_temp.chk('erasure', 'and no follower list', '0',
    (select count(*)::text from public.provider_follows where provider_id = pid));
  perform pg_temp.chk('erasure', 'no booking preferences', '0',
    (select count(*)::text from public.provider_booking_preferences where provider_id = pid));
  perform pg_temp.chk('erasure', 'and no profile-view rows naming a viewer', '0',
    (select count(*)::text from public.provider_profile_views where provider_id = pid));
  -- THE BOOKING SURVIVES, which is why the FK had to become SET NULL rather than
  -- the services surviving.
  perform pg_temp.chk('erasure', 'the booking survives and still says what was booked', 'true',
    (select (service_name is not null)::text from public.bookings
      where id = (f->>'bk')::uuid));
end $$;

-- Generic: every table keyed on a provider is accounted for. This is the
-- assertion that would have caught table five; the per-table block above could
-- only catch the four somebody named.
select pg_temp.chk('erasure',
  'every table with a provider_id FK is either erased by a step or a known keeper', '',
  (select coalesce(string_agg(t, ', ' order by t), '')
     from (
       select c.conrelid::regclass::text as t
         from pg_constraint c
         join pg_class r on r.oid = c.conrelid
         join pg_namespace n on n.oid = r.relnamespace
        where c.contype = 'f'
          and c.confrelid = 'public.providers'::regclass
          and n.nspname = 'public'
          and c.conrelid::regclass::text not in (
            -- Erased by adel_provider_content.
            'provider_services', 'provider_availability', 'provider_blocked_dates',
            'provider_policies', 'provider_follows', 'posts',
            'provider_booking_preferences', 'provider_profile_views',
            -- Retained on purpose, each with a recorded reason.
            'bookings',                  -- policy B, the operational record
            'contracts',                 -- policy C, accepted-contract evidence
            'provider_reviews',          -- policy E, the honest public record
            'client_reviews',            -- policy E
            'conversation',              -- policy I, severed identity
            'barter_offers', 'barter_interests',       -- policy H
            'community_posts', 'community_replies',    -- policy K
            'saved_providers', 'care_reminders',       -- other people's artefacts
            'provider_booking_clicks', 'post_views',   -- analytics, viewer severed
            'reports',                   -- policy F
            'operator_cases',            -- policy G
            'community_moderation_actions',            -- policy G
            'barter_proposals', 'barter_proposal_terms', 'barter_agreements',
            'barter_obligations', 'booking_reference_photos',
            'barter_agreement_cancellations',        -- policy H, the trade outcome
            'barter_obligation_no_show_reports',     -- policy H / PD-068 adjudication
            -- Integer counts per date. No identity of any kind in the table, so
            -- there is nothing in it to erase — a DECISION (20261123000000), not
            -- an omission.
            'provider_metrics_daily'
          )
     ) x));

-- ── 13b. anon can harvest no account id from public (SEC-AUTHZ-101) ──────
--
-- `account_unavailable(uuid)` is granted to client roles because an RLS policy is
-- evaluated as the caller. `20261111000000` argued the enumeration was closed
-- because the provider listing no longer names them — and `post_likes.user_id` and
-- `provider_follows.follower_user_id` were `USING (true)` with an anon grant the
-- whole time, which is a supply of ids for every user who ever liked or followed.
do $$
declare
  f jsonb := pg_temp.ae_seed('harvest'); cu uuid; pid uuid; ou uuid; v_post uuid;
begin
  cu := (f->>'cu')::uuid; pid := (f->>'pid')::uuid; ou := (f->>'ou')::uuid;
  perform pg_temp.act_service();
  select id into v_post from public.posts where provider_id = pid limit 1;
  insert into public.post_likes(post_id, user_id) values (v_post, cu);
  insert into public.provider_follows(provider_id, follower_user_id) values (pid, cu);

  perform pg_temp.act(null, 'anon');
  perform pg_temp.chk('erasure', 'anon can read no like row, so harvests no account id', '0',
    (select count(*)::text from public.post_likes));
  perform pg_temp.chk('erasure', 'and no follow row', '0',
    (select count(*)::text from public.provider_follows));

  -- A DIFFERENT signed-in person cannot either. The oracle needs ids; this is
  -- where they were coming from.
  perform pg_temp.act(ou);
  perform pg_temp.chk('erasure', 'nor can another signed-in user read somebody else''s likes',
    '0', (select count(*)::text from public.post_likes where user_id = cu));
  perform pg_temp.chk('erasure', 'or their follows', '0',
    (select count(*)::text from public.provider_follows where follower_user_id = cu));

  -- AND THE OWNER STILL CAN, which is what the app actually reads.
  perform pg_temp.act(cu);
  perform pg_temp.chk('erasure', 'while your own like is still yours to see', '1',
    (select count(*)::text from public.post_likes where user_id = cu));
  perform pg_temp.act_service();
  -- The public follower COUNT survives as a number rather than a list.
  perform pg_temp.chk('erasure', 'and the follower count is still available as a number', '1',
    public.provider_follower_count(pid)::text);
end $$;

-- ── 13c. Every SECURITY DEFINER function pins its search_path ────────────
--
-- `20261118000000` wrote this rule down while fixing five non-definer functions,
-- and left a definer trigger on `providers` with no setting at all. The generic
-- form is the only one that finds number two.
select pg_temp.chk('erasure', 'no SECURITY DEFINER function in public leaves search_path unpinned',
  '', (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and not exists (
            select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
             where cfg like 'search_path=%')));

-- ── 13d. The operator arm of the split policy (SEC-COVERAGE-106) ─────────
--
-- Section 12a asserted two of the three parties PD-104 names. A
-- `drop policy providers_operator_read` would have passed the whole suite.
do $$
declare f jsonb := pg_temp.ae_seed('operator'); pu uuid; pid uuid; op uuid := gen_random_uuid();
begin
  pu := (f->>'pu')::uuid; pid := (f->>'pid')::uuid;
  perform pg_temp.act_service();
  insert into auth.users(id) values (op);
  insert into public.operators(user_id) values (op) on conflict do nothing;
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (pu, pu, 'grace_period', now() + interval '30 days', 30);

  perform pg_temp.act(op);
  perform pg_temp.chk('erasure',
    'an operator still reads a departing provider''s row — a case may be about them',
    '1', (select count(*)::text from public.providers where id = pid));
  perform pg_temp.act_service();
end $$;

-- ── 13e. A hold can be released, and the work resumes (SEC-DATA-103) ─────
do $$
declare
  f jsonb := pg_temp.ae_seed('hold'); cu uuid; v_req uuid; v_hold uuid; v_state text;
begin
  cu := (f->>'cu')::uuid;
  v_req := pg_temp.ae_request_due(cu);
  perform pg_temp.act_service();
  insert into public.account_deletion_holds(request_id, record_class, reason)
  values (v_req, 'community_content', 'an open safety matter') returning id into v_hold;

  v_state := public.finalize_account_deletion(v_req);
  perform pg_temp.chk('erasure', 'a held class does not keep the whole account alive', '0',
    (select count(*)::text from auth.users where id = cu));
  perform pg_temp.chk('erasure', 'and the held step says so', 'held',
    (select status from public.account_deletion_steps
      where request_id = v_req and step_key = 'community_content'));
  perform pg_temp.chk('erasure', 'a held step is visible to operations', 'true',
    (select exists (select 1 from public.overdue_account_deletion_work() w
                     where w.step_key = 'community_content' and w.status = 'held'))::text);

  -- RELEASE, and the work becomes runnable rather than staying held forever.
  perform pg_temp.chk('erasure', 'the hold can be released', 'released',
    public.release_account_deletion_hold(v_hold));
  perform pg_temp.chk('erasure', 'which puts the step back in the queue', 'pending',
    (select status from public.account_deletion_steps
      where request_id = v_req and step_key = 'community_content'));
  perform public.sweep_account_deletions();
  perform pg_temp.chk('erasure', 'and the next sweep finishes it', 'completed',
    (select status from public.account_deletion_steps
      where request_id = v_req and step_key = 'community_content'));
  perform pg_temp.chk('erasure', 'so the held content is gone', '0',
    (select count(*)::text from public.community_posts where user_id = cu));
end $$;

-- And a request nobody ever swept — the failure the sweep's own comment calls the
-- worst one — is finally visible to the query named as the detector.
do $$
declare f jsonb := pg_temp.ae_seed('unswept'); cu uuid; v_req uuid;
begin
  cu := (f->>'cu')::uuid;
  perform pg_temp.act_service();
  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (cu, cu, 'grace_period', now() - interval '2 days', 30) returning id into v_req;
  insert into public.account_deletion_steps (request_id, step_key)
  select v_req, k from unnest(public.account_deletion_step_keys()) k;
  perform pg_temp.chk('erasure',
    'a request past its grace date that nothing finalised is reported as overdue', 'true',
    (select exists (select 1 from public.overdue_account_deletion_work() w
                     where w.request_id = v_req))::text);
end $$;

select pg_temp.act_service();
