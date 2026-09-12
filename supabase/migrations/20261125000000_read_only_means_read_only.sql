-- ACCOUNT ERASURE — OQ-086 CLOSED. Deletion grace preserves RESOLUTION rights,
-- not PARTICIPATION rights.
--
-- ══ THE RULING ════════════════════════════════════════════════════════════
--
-- During the 30-day grace period the account is READ-ONLY except for:
--
--   A. secure account restoration, and
--   B. the minimum state transitions necessary to resolve transactions that
--      existed before deletion was requested.
--
-- A deactivated account MUST NOT create new bookings, barter interests or
-- proposals, messages, reviews, Community posts or replies, Reels or content,
-- provider services, provider availability or content, likes, follows,
-- bookmarks, or any other new marketplace or social object. For an already
-- existing active booking or barter transaction, only the minimum EXISTING
-- terminal-state actions the current workflow already has — cancel, decline,
-- complete, acknowledge — are permitted. **New free-form messaging is not
-- reopened merely because an existing transaction exists**; if communication is
-- needed during grace, that is an Operations obligation, not a restored right.
--
-- ══ A COMMENT IN 20261102000000 SAYS THE OPPOSITE, AND IT IS WRONG ════════
--
-- `20261102000000:24-31` reads *"A person with an active booking must still be
-- able to see it, MESSAGE ABOUT IT, cancel or complete it"*. The code it sits
-- above never permitted that — `b_messages_refuse_when_inactive` refuses every
-- message INSERT from a deactivated caller, unconditionally — so the comment
-- described an intention the migration did not implement. The ruling settles it
-- in the CODE's favour and the comment is corrected here rather than edited
-- there, because that migration is applied.
--
-- ══ WHAT THIS FILE ADDS, AND WHY IT IS SO MANY TRIGGERS ═══════════════════
--
-- `20261102000000` gated the paths somebody thought of: fourteen tables, INSERT
-- only. The audit behind this ruling enumerated the whole `authenticated` write
-- surface and found the rule missing from thirty-odd more places, of which these
-- mattered:
--
--   * **The draft-submit hole.** `b_bookings_refuse_when_inactive` is BEFORE
--     INSERT, and `lib/bookingDraft.ts:308` sends a booking by UPDATING an
--     existing draft's `submitted_at`. A deactivated account holding a draft
--     could therefore send a real, new booking request with no refusal at all.
--     The block workstream had the identical hole and fixed it with
--     `enforce_booking_submit_not_blocked` (`20261058000000:128`); this is the
--     deactivation twin of that function, and it exists because the same shape
--     was missed twice.
--   * **Every barter negotiation RPC.** `create_barter_proposal`,
--     `submit_barter_counter`, `accept_barter_version` and above all
--     `finalize_barter_agreement` — which creates a BINDING AGREEMENT with new
--     obligations — checked nothing. They are `SECURITY DEFINER`, but a definer
--     function does not change `auth.uid()` or `auth.role()`, so a trigger on
--     the table it writes sees the real caller. Gating the five TABLES is
--     therefore both sufficient and far safer than `create or replace`-ing five
--     large function bodies, which is how this repo has lost a rule three times.
--   * **Storage.** All five buckets accepted uploads from a deactivated account,
--     including the two PUBLIC ones — bytes on the internet from an account the
--     product says is hidden, which the erasure engine would then have to queue
--     and delete.
--   * **Likes, follows, saves and bookmarks**, named in the ruling, none gated.
--   * **Editing existing content** — a Reel's caption, a Community post's body —
--     which is authoring, not resolving.
--
-- ══ THE COUNTER TRAP, WHICH THIS FILE WOULD OTHERWISE WALK INTO ═══════════
--
-- `update_post_like_count` and friends UPDATE `posts.like_count` /
-- `community_posts.like_count` from an AFTER trigger that runs under the
-- LIKER's JWT. A blanket UPDATE refusal on those tables would make a deactivated
-- person unable to un-like their own post — the identical failure SEC-DATA-011
-- produced on `providers`, where a departing provider got PT440 for completing
-- their own client's booking because the completion recomputes a rating. So the
-- gate below refuses an UPDATE only when the row is the CALLER'S OWN and a
-- NON-DERIVED column actually moves. The derived list is passed per trigger
-- rather than hard-coded, so adding a counter column is a one-line change in the
-- trigger rather than a silent new refusal.

-- ── 1. One gate for "a row of yours changed in a way that is authoring" ──
create or replace function public.refuse_row_write_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode    text := tg_argv[0];          -- 'user' | 'provider'
  v_col     text := tg_argv[1];          -- the column naming the owner
  v_ignored text[] := case when array_length(tg_argv, 1) >= 3 and tg_argv[2] <> ''
                           then string_to_array(tg_argv[2], ',') else '{}'::text[] end;
  v_owner   uuid;
  v_changed integer;
begin
  -- The erasure engine and migrations. They must be able to write while an
  -- account is inactive; that is the whole job they are doing.
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if public.caller_account_unavailable() then
      raise exception 'This account is scheduled for deletion and cannot start new activity.'
        using errcode = 'PT440';
    end if;
    return new;
  end if;

  -- SOMEBODY ELSE'S ROW. Not this rule's business, and the path that reaches
  -- here is a derived recompute fired by a trigger under the caller's JWT.
  if v_mode = 'provider' then
    select p.user_id into v_owner from public.providers p
     where p.id = (to_jsonb(old) ->> v_col)::uuid;
  else
    v_owner := (to_jsonb(old) ->> v_col)::uuid;
  end if;
  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    return new;
  end if;

  -- ONLY DERIVED COLUMNS MOVED. A counter is not authoring.
  select count(*) into v_changed
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n on n.key = o.key
   where o.value is distinct from n.value
     and not (o.key = any(v_ignored));
  if v_changed = 0 then
    return new;
  end if;

  if public.caller_account_unavailable() then
    raise exception 'This account is scheduled for deletion and cannot start new activity.'
      using errcode = 'PT440';
  end if;
  return new;
end;
$$;

alter function public.refuse_row_write_when_account_inactive() owner to postgres;
revoke all on function public.refuse_row_write_when_account_inactive()
  from public, anon, authenticated;

comment on function public.refuse_row_write_when_account_inactive() is
  'OQ-086. Refuses an INSERT, or an authoring UPDATE of the caller''s OWN row, '
  'from an account with an open deletion request (PT440). Takes the owner mode '
  '(`user`|`provider`), the owner column, and a comma-separated list of DERIVED '
  'columns to ignore — because like/save/reply counters are written by AFTER '
  'triggers under the caller''s own JWT, and refusing those would stop a '
  'departing person un-liking their own post, which is SEC-DATA-011 in a new '
  'place.';

-- ── 2. Creating something new: INSERT refused outright ───────────────────
--
-- `refuse_write_when_account_inactive` (20261102000000 / 20261111000000) is
-- reused unchanged: it already refuses any write from a deactivated caller and
-- carries the service_role and no-claims carve-outs.
do $$
declare t text;
begin
  foreach t in array array[
    -- likes, follows, bookmarks, saves — named in the ruling
    'post_likes', 'post_saves', 'community_post_likes', 'community_bookmarks',
    'provider_follows', 'saved_providers',
    -- content attached to a booking that has not been sent yet
    'booking_reference_photos',
    -- the barter NEGOTIATION chain. Every one of these is written only by a
    -- SECURITY DEFINER RPC, and a definer function does not change auth.uid(),
    -- so the trigger sees the real caller. `barter_agreements` is the one that
    -- matters most: finalising creates a binding agreement with new obligations.
    'barter_proposals', 'barter_proposal_versions', 'barter_proposal_terms',
    'barter_version_acceptances', 'barter_agreements', 'barter_obligations',
    -- a signal of interest is still a new object from an account winding down
    'feature_interest'
  ] loop
    execute format('drop trigger if exists b_%s_refuse_when_inactive on public.%I', t, t);
    execute format(
      'create trigger b_%s_refuse_when_inactive before insert on public.%I '
      'for each row execute function public.refuse_write_when_account_inactive()', t, t);
  end loop;
end $$;

-- ── 3. Creating OR editing: provider content, contracts, personal objects ──
do $$
declare r record;
begin
  for r in select * from (values
    -- table,                          mode,       owner column,        derived columns
    ('contracts',                      'user',     'user_id',           ''),
    ('contract_signatures',            'user',     'client_user_id',    ''),
    ('provider_services',              'provider', 'provider_id',       ''),
    ('provider_availability',          'provider', 'provider_id',       ''),
    ('provider_blocked_dates',         'provider', 'provider_id',       ''),
    ('provider_policies',              'provider', 'provider_id',       ''),
    ('provider_booking_preferences',   'provider', 'provider_id',       ''),
    ('care_reminders',                 'user',     'client_user_id',    ''),
    ('posts',                          'provider', 'provider_id',
       'like_count,comment_count,save_count,view_count,engagement_score'),
    ('community_posts',                'user',     'user_id',
       'like_count,reply_count,updated_at')
  ) as v(tbl, mode, col, derived)
  loop
    execute format('drop trigger if exists b_%s_refuse_edit_when_inactive on public.%I',
                   r.tbl, r.tbl);
    execute format(
      'create trigger b_%s_refuse_edit_when_inactive before insert or update on public.%I '
      'for each row execute function public.refuse_row_write_when_account_inactive(%L, %L, %L)',
      r.tbl, r.tbl, r.mode, r.col, r.derived);
  end loop;
end $$;

-- `clients` is UPDATE-only on purpose. The INSERT is `ensureClientRow`
-- (`lib/ensureClientRow.ts:17-22`), an `upsert` with `ignoreDuplicates` — so it
-- can only CREATE the row the app needs to render a signed-in session, never
-- overwrite one. Refusing it would break the sign-in a person performs in order
-- to RESTORE their account, which is exception (A) of the ruling. Editing the
-- name or avatar is neither restoration nor resolution, and is refused.
drop trigger if exists b_clients_refuse_edit_when_inactive on public.clients;
create trigger b_clients_refuse_edit_when_inactive
  before update on public.clients
  for each row execute function public.refuse_row_write_when_account_inactive('user', 'id', '');

-- ── 4. The shaped allowances: exactly the terminal transitions, nothing else ──
--
-- These four paths are UPDATEs that are LEGITIMATE during grace in one exact
-- shape and are new participation in every other. A blanket refusal would strand
-- a counterparty mid-transaction, which PD-102 forbids; a blanket allowance is
-- what OQ-086 was raised about.

-- (a) THE DRAFT-SUBMIT HOLE. Sending a booking is an UPDATE, not an INSERT.
create or replace function public.enforce_booking_submit_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  -- OLD identity, like the block twin: user_id is fixed when a draft is created
  -- and a submit does not change it, so a caller cannot submit as someone else.
  if old.submitted_at is null and new.submitted_at is not null then
    if public.account_unavailable(old.user_id) then
      raise exception 'This account is scheduled for deletion and cannot start new activity.'
        using errcode = 'PT440';
    end if;
    -- Nor may a live client send a NEW request to a provider who is leaving.
    -- The INSERT gate already refuses this; the submit path did not.
    if exists (select 1 from public.providers p
                where p.id = old.provider_id and public.account_unavailable(p.user_id)) then
      raise exception 'This provider is not currently available for new bookings.'
        using errcode = 'PT426';
    end if;
  end if;
  return new;
end;
$$;
alter function public.enforce_booking_submit_when_account_inactive() owner to postgres;
revoke all on function public.enforce_booking_submit_when_account_inactive()
  from public, anon, authenticated;

comment on function public.enforce_booking_submit_when_account_inactive() is
  'Refuses the draft->submitted transition when either party''s account is '
  'unavailable (PT440 for the sender, PT426 for the recipient). The deactivation '
  'twin of enforce_booking_submit_not_blocked (20261058000000): the INSERT gate '
  'covered draft CREATION and the app sends a booking by UPDATING submitted_at, '
  'so a deactivated account holding a draft could send a real new request.';

drop trigger if exists zz_bookings_submit_when_inactive on public.bookings;
create trigger zz_bookings_submit_when_inactive
  before update on public.bookings
  for each row execute function public.enforce_booking_submit_when_account_inactive();

-- (b) A BARTER OFFER may be CLOSED and nothing else. Closing is winding down;
-- editing the terms is authoring a marketplace object. Reopening is already
-- refused one-way by enforce_barter_offer_active_one_way (20260915000000:63).
create or replace function public.refuse_barter_offer_edit_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed integer;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  if old.user_id is null or old.user_id is distinct from (select auth.uid()) then
    return new;
  end if;
  if not public.caller_account_unavailable() then
    return new;
  end if;
  select count(*) into v_changed
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n on n.key = o.key
   where o.value is distinct from n.value and o.key <> 'is_active';
  if v_changed = 0 and old.is_active and not new.is_active then
    return new;          -- the close, and only the close
  end if;
  raise exception 'This account is scheduled for deletion and cannot start new activity.'
    using errcode = 'PT440';
end;
$$;
alter function public.refuse_barter_offer_edit_when_account_inactive() owner to postgres;
revoke all on function public.refuse_barter_offer_edit_when_account_inactive()
  from public, anon, authenticated;

drop trigger if exists zz_barter_offers_edit_when_inactive on public.barter_offers;
create trigger zz_barter_offers_edit_when_inactive
  before update on public.barter_offers
  for each row execute function public.refuse_barter_offer_edit_when_account_inactive();

-- (c) A BARTER INTEREST may be DECLINED or RELEASED and nothing else. Both are
-- terminal: they END a negotiation. `release_barter_interest` is an RPC and is
-- covered here rather than in its body, for the definer reason above.
create or replace function public.refuse_barter_interest_edit_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed integer;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  if not public.caller_account_unavailable() then
    return new;
  end if;
  select count(*) into v_changed
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n on n.key = o.key
   where o.value is distinct from n.value
     and o.key not in ('status', 'released_at', 'released_by', 'release_reason');
  if v_changed = 0
     and ((old.status = 'pending'  and new.status = 'declined')
       or (old.status = 'accepted' and new.status = 'released')) then
    return new;
  end if;
  raise exception 'This account is scheduled for deletion and cannot start new activity.'
    using errcode = 'PT440';
end;
$$;
alter function public.refuse_barter_interest_edit_when_account_inactive() owner to postgres;
revoke all on function public.refuse_barter_interest_edit_when_account_inactive()
  from public, anon, authenticated;

drop trigger if exists zz_barter_interests_edit_when_inactive on public.barter_interests;
create trigger zz_barter_interests_edit_when_inactive
  before update on public.barter_interests
  for each row execute function public.refuse_barter_interest_edit_when_account_inactive();

-- (d) A MESSAGE REQUEST may be DECLINED, never ACCEPTED. Accepting opens a
-- channel, and the ruling is explicit that communication during grace is an
-- Operations obligation rather than a reopened participation right. Attaching a
-- booking to an existing thread stays permitted: that is transaction logistics
-- on something that already exists.
create or replace function public.refuse_conversation_accept_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  if new.request_status is distinct from old.request_status
     and new.request_status = 'accepted'
     and public.caller_account_unavailable() then
    raise exception 'This account is scheduled for deletion and cannot start new activity.'
      using errcode = 'PT440';
  end if;
  return new;
end;
$$;
alter function public.refuse_conversation_accept_when_account_inactive() owner to postgres;
revoke all on function public.refuse_conversation_accept_when_account_inactive()
  from public, anon, authenticated;

drop trigger if exists zz_conversation_accept_when_inactive on public.conversation;
create trigger zz_conversation_accept_when_inactive
  before update on public.conversation
  for each row execute function public.refuse_conversation_accept_when_account_inactive();

-- ── 5. STORAGE. Five buckets, none of which asked the question ───────────
--
-- Every write policy is restated from its LAST definition with one clause added,
-- because `create policy` has no `or replace` and a reconstructed policy that
-- drops a predicate is how an authorization boundary quietly widens. DELETE is
-- deliberately untouched: removing your own bytes is winding down, and the
-- erasure engine's own deletes run as service_role.
--
-- `caller_account_unavailable()` is a SECURITY DEFINER function GRANTED to
-- `authenticated`, and every policy below is `TO authenticated` — an RLS policy
-- is evaluated as the CALLER and borrows no privilege, which is the lesson
-- 20261116000000/20261117000000 cost two suites to learn.

drop policy if exists "provider_media_owner_insert" on storage.objects;
create policy "provider_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists "provider_media_owner_update" on storage.objects;
create policy "provider_media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'provider-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists "posts_media_owner_insert" on storage.objects;
create policy "posts_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists "posts_media_owner_update" on storage.objects;
create policy "posts_media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists "contract_pdfs_upload_own" on storage.objects;
create policy "contract_pdfs_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists contract_pdfs_update_own on storage.objects;
create policy contract_pdfs_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'contract-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'contract-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists "signatures_upload_own" on storage.objects;
create policy "signatures_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-signatures'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.caller_account_unavailable()
  );

drop policy if exists booking_photos_insert_own on storage.objects;
create policy booking_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'booking-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.caller_account_unavailable()
  );

-- ── 6. WHAT IS DELIBERATELY STILL WRITABLE, AND WHY ──────────────────────
--
-- Recorded here rather than left to be rediscovered as a gap:
--
--   * **`reports` INSERT and `user_blocks` INSERT/DELETE.** Safety. Reporting a
--     counterparty or blocking someone is protection, not participation, and a
--     person on their way out is exactly who may need it. Filing a report about
--     a booking that already existed is also resolution under exception (B).
--   * **Every DELETE of the caller's own rows** — un-like, unfollow, unsave,
--     delete a post, delete a draft contract. Winding down is not authoring.
--   * **The booking and obligation terminal actions**: cancel, accept, decline,
--     complete, no-show; deliver, confirm received, report not received, report
--     no-show, ask for review; cancel an agreement; decline or release an
--     interest; close an offer. Exception (B), enumerated.
--   * **`messages` UPDATE**, which `enforce_message_immutability`
--     (`20260911000000:64`) already restricts to `is_read`. Marking read is not
--     a message.
--   * **`clients` INSERT**, `request_account_deletion`, `cancel_account_deletion`
--     and auth reauthentication. Exception (A).
--   * **`rate_limit_log` INSERT.** Infrastructure, written by the Edge Function.
--   * **`request_provider_review()`.** It opens an operator case and creates no
--     marketplace or social object; the account is hidden and de-approved
--     anyway, so the case resolves to nothing. Left open rather than gated
--     because `operator_cases` is also written by the ALLOWED barter review
--     request and by report intake, and a blanket trigger there would refuse
--     both. **Recorded as a residual, not as a decision that it should stay.**
