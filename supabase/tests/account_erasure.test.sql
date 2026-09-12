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
select pg_temp.chk('erasure', 'no retention window is hard-coded in the engine', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('finalize_account_deletion', 'request_account_deletion',
                        'sweep_account_deletions')
      and p.prosrc ~ 'interval\s*''(30|90|180|1460)\s*day'));

select pg_temp.act_service();
