-- ACCOUNT ERASURE — the engine: one step per data class, each idempotent.
--
-- ══ THE ORDER IS THE ARCHITECTURE ═════════════════════════════════════════
--
-- **Anonymize first, delete last.** Every step that must SURVIVE the account
-- rewrites its identity columns to a pseudonym, or to a restricted subject id,
-- BEFORE the `auth.users` row is removed. By the time the delete runs there is
-- almost nothing left pointing at that account, so the CASCADEs that would have
-- destroyed bookings, reviews, contracts and barter history have nothing to
-- destroy. That is why this file changes so few foreign keys: the ordering does
-- the work that a schema-wide FK rewrite would otherwise have to.
--
-- ══ TWO CLOCKS, AND WHY SOME STEPS ARE SCHEDULED ══════════════════════════
--
-- Booking photos and messages have retention windows of their own — 90 and 180
-- days from the booking or conversation closing — and the policy says the
-- effective date is the **later of** that and the grace-period end. So they do
-- not finish when the account does.
--
-- Each is therefore TWO steps, which is the honest decomposition:
--
--   * **sever** runs at erasure: the identity comes off the row immediately.
--   * **purge** is SCHEDULED for the later-of date: the content goes when its own
--     clock runs out.
--
-- A `scheduled` step is not an unfinished one. The account is erased, the
-- identity is gone, and what remains is dated future work the engine will do —
-- recorded with its due date rather than left to a comment. Keeping the account
-- alive for 180 days so that one step could report `completed` would be the
-- wrong reading of "cannot claim success early".

alter table public.account_deletion_steps
  add column if not exists due_at timestamptz;

alter table public.account_deletion_steps
  drop constraint if exists account_deletion_steps_status_check;
alter table public.account_deletion_steps
  add constraint account_deletion_steps_status_check
    check (status in ('pending', 'running', 'completed', 'scheduled', 'held', 'failed'));

comment on column public.account_deletion_steps.due_at is
  'When a SCHEDULED step becomes due — the later of its own retention window and '
  'the grace-period end. Only the two two-phase classes use it: booking photos '
  'and messages, whose content outlives the identity by design.';

-- ── The canonical step list, in the order it must run ────────────────────
create or replace function public.account_deletion_step_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'provider_content',      -- J: media hidden at request, bytes go now
    'community_content',     -- K: hidden at request, deleted now with tombstones
    'booking_photos_sever',  -- D: identity off now, bytes on their own clock
    'messages_sever',        -- I: identity off now, content on its own clock
    'bookings',              -- B: anonymize, keep the operational record
    'reviews',               -- E: anonymize, keep the reputation
    'barter',                -- H: anonymize, keep terms and outcomes
    'accepted_contracts',    -- C: retain under restriction
    'reports_evidence',      -- F: retain under restriction
    'operator_audit',        -- G: retain, keep operator identity restricted
    'profile_account'        -- A: LAST. Everything above must have run first.
  ]::text[];
$$;
alter function public.account_deletion_step_keys() owner to postgres;

comment on function public.account_deletion_step_keys() is
  'The data classes, IN EXECUTION ORDER. `profile_account` is last and that is '
  'load-bearing: it deletes the auth row, and every preceding step exists to make '
  'sure the cascades that fires have nothing left to take with them.';

-- ── Helper: the pseudonym for an erasure in progress ─────────────────────
create or replace function public.erasure_pseudonym(p_subject uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_p uuid;
begin
  select pseudonym_id into v_p from public.erased_accounts where subject_id = p_subject;
  if v_p is null then
    insert into public.erased_accounts(subject_id) values (p_subject)
      on conflict (subject_id) do nothing;
    select pseudonym_id into v_p from public.erased_accounts where subject_id = p_subject;
  end if;
  return v_p;
end;
$$;
alter function public.erasure_pseudonym(uuid) owner to postgres;
revoke all on function public.erasure_pseudonym(uuid) from public, anon, authenticated;

comment on function public.erasure_pseudonym(uuid) is
  'The stable pseudonym for one erased account, allocated once. Idempotent by '
  'construction — every step calls it and they must all get the same value, or '
  'the same person would appear as several after erasure and the distinct-client '
  'rating rule (PD-091/092) would count them separately.';

-- ══ THE STEPS ═════════════════════════════════════════════════════════════
--
-- Every one returns a jsonb of COUNTS. Never content: an audit of a deletion
-- must not become a copy of what was deleted.

-- J. PROVIDER CONTENT — hidden at request, bytes deleted now.
create or replace function public.adel_provider_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_posts integer := 0; v_objects integer := 0; v_pid uuid;
begin
  select id into v_pid from public.providers where user_id = p_subject;
  if v_pid is null then return jsonb_build_object('posts', 0, 'objects', 0); end if;

  with d as (delete from public.posts where provider_id = v_pid returning 1)
  select count(*) into v_posts from d;

  -- The BYTES, not only the rows. A deleted row with a live object leaves the
  -- media reachable by anyone holding the URL, and for a public bucket that is
  -- everyone. Paths are `<user id>/<folder>/<file>` (lib/storage.ts), so the
  -- prefix is exact rather than a guess.
  with d as (
    delete from storage.objects
     where bucket_id in ('provider-media', 'posts-media')
       and name like p_subject::text || '/%'
    returning 1
  ) select count(*) into v_objects from d;

  return jsonb_build_object('posts', v_posts, 'objects', v_objects);
end $$;

-- K. COMMUNITY CONTENT — deleted, with a tombstone only where structure needs it.
create or replace function public.adel_community_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_deleted integer := 0; v_tombstoned integer := 0; v_replies integer := 0;
begin
  -- A post that other people have answered cannot simply vanish: the replies
  -- would be orphaned and the thread unreadable. Those become a neutral
  -- tombstone with no author link. Posts nobody answered are deleted outright.
  with t as (
    update public.community_posts cp
       set content = 'Content removed',
           user_id = null,
           provider_id = null,
           author_kind = 'client',
           service_tag = null, area = null, timing = null,
           tagged_provider_id = null, tagged_booking_id = null,
           intent = case when cp.intent = 'open_today' then 'need_advice' else cp.intent end,
           expires_at = null
     where cp.user_id = p_subject
       and exists (select 1 from public.community_replies r
                    where r.post_id = cp.id and r.user_id is distinct from p_subject)
    returning 1
  ) select count(*) into v_tombstoned from t;

  with d as (delete from public.community_replies where user_id = p_subject returning 1)
  select count(*) into v_replies from d;

  with d as (delete from public.community_posts where user_id = p_subject returning 1)
  select count(*) into v_deleted from d;

  return jsonb_build_object('posts_deleted', v_deleted, 'tombstoned', v_tombstoned,
                            'replies_deleted', v_replies);
end $$;

-- D. BOOKING PHOTOS, phase 1 — identity off now.
create or replace function public.adel_booking_photos_sever(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_pseudo uuid := public.erasure_pseudonym(p_subject);
begin
  with u as (
    update public.booking_reference_photos
       set uploaded_by_user_id = v_pseudo
     where uploaded_by_user_id = p_subject
    returning 1
  ) select count(*) into v_n from u;
  return jsonb_build_object('severed', v_n);
end $$;

-- D. BOOKING PHOTOS, phase 2 — the bytes, on their own clock.
create or replace function public.adel_booking_photos_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows integer := 0; v_objects integer := 0; v_pseudo uuid;
begin
  select pseudonym_id into v_pseudo from public.erased_accounts where subject_id = p_subject;
  if v_pseudo is null then return jsonb_build_object('rows', 0, 'objects', 0); end if;

  with d as (
    delete from storage.objects o
     where o.bucket_id = 'booking-photos'
       and exists (select 1 from public.booking_reference_photos p
                    where p.uploaded_by_user_id = v_pseudo and p.storage_path = o.name)
    returning 1
  ) select count(*) into v_objects from d;

  with d as (
    delete from public.booking_reference_photos where uploaded_by_user_id = v_pseudo returning 1
  ) select count(*) into v_rows from d;

  return jsonb_build_object('rows', v_rows, 'objects', v_objects);
end $$;

-- I. MESSAGES, phase 1 — identity off now.
create or replace function public.adel_messages_sever(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_m integer := 0; v_c integer := 0; v_pseudo uuid := public.erasure_pseudonym(p_subject);
begin
  with u as (update public.messages set sender_id = v_pseudo
              where sender_id = p_subject returning 1)
  select count(*) into v_m from u;
  with u as (update public.conversation set client_id = v_pseudo
              where client_id = p_subject returning 1)
  select count(*) into v_c from u;
  return jsonb_build_object('messages', v_m, 'conversations', v_c);
end $$;

-- I. MESSAGES, phase 2 — the content, on its own clock.
create or replace function public.adel_messages_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_pseudo uuid;
begin
  select pseudonym_id into v_pseudo from public.erased_accounts where subject_id = p_subject;
  if v_pseudo is null then return jsonb_build_object('messages', 0); end if;
  with d as (delete from public.messages where sender_id = v_pseudo returning 1)
  select count(*) into v_n from d;
  return jsonb_build_object('messages', v_n);
end $$;

-- B. BOOKINGS — anonymize. The operational record survives; the person does not.
create or replace function public.adel_bookings(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_pseudo uuid := public.erasure_pseudonym(p_subject);
begin
  -- `user_id` becomes the pseudonym rather than NULL: the booking must still be
  -- distinguishable from every OTHER erased client's booking, or a provider's
  -- history collapses into one anonymous customer. Status, service snapshot and
  -- timestamps are untouched — that is the operational record policy B keeps.
  with u as (
    update public.bookings
       set user_id = v_pseudo,
           message = null,                 -- free text the client wrote
           client_safety_notes = null,     -- may name them
           cancellation_reason = case when cancellation_actor = 'client'
                                      then null else cancellation_reason end
     where user_id = p_subject
    returning 1
  ) select count(*) into v_n from u;
  return jsonb_build_object('bookings', v_n);
end $$;

-- E. REVIEWS — anonymize. The reputation survives; the author becomes nobody.
create or replace function public.adel_reviews(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_p integer := 0; v_c integer := 0; v_pseudo uuid := public.erasure_pseudonym(p_subject);
begin
  -- THE PSEUDONYM IS LOAD-BEARING HERE. The public rating is the mean of the
  -- latest review from each DISTINCT client (PD-091/PD-092). Nulling the reviewer
  -- would merge every erased reviewer into one voice and silently move the rating
  -- of every provider they had reviewed — an erasure must not rewrite somebody
  -- else's reputation.
  with u as (
    update public.provider_reviews
       set reviewer_user_id = v_pseudo,
           reviewer_display_name = 'Former member'
     where reviewer_user_id = p_subject
    returning 1
  ) select count(*) into v_p from u;

  with u as (
    update public.client_reviews
       set client_user_id = v_pseudo,
           private_note = null            -- a provider's note about the person
     where client_user_id = p_subject
    returning 1
  ) select count(*) into v_c from u;

  return jsonb_build_object('provider_reviews', v_p, 'client_reviews', v_c);
end $$;

-- H. BARTER — anonymize. Terms, status and outcomes survive.
create or replace function public.adel_barter(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare n integer := 0; total integer := 0; v_pseudo uuid := public.erasure_pseudonym(p_subject);
begin
  update public.barter_offers set user_id = v_pseudo where user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_interests set interested_user_id = v_pseudo
   where interested_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposals set owner_user_id = v_pseudo where owner_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposals set responder_user_id = v_pseudo
   where responder_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposal_versions set author_user_id = v_pseudo
   where author_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposal_terms set provider_user_id = v_pseudo
   where provider_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_version_acceptances set participant_user_id = v_pseudo
   where participant_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_agreements set owner_user_id = v_pseudo where owner_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_agreements set responder_user_id = v_pseudo
   where responder_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligations set deliverer_user_id = v_pseudo
   where deliverer_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligations set receiver_user_id = v_pseudo
   where receiver_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_agreement_cancellations set actor_user_id = v_pseudo
   where actor_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligation_no_show_reports set reporter_user_id = v_pseudo
   where reporter_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligation_review_requests set requested_by_user_id = v_pseudo
   where requested_by_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  -- Adjudications are OPERATOR records and follow policy G, not H: the
  -- adjudicator identity is severed to a restricted subject, not pseudonymised.
  update public.barter_obligation_adjudications set adjudicator_user_id = null
   where adjudicator_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  return jsonb_build_object('rows', total);
end $$;

-- C. ACCEPTED CONTRACTS — retained under restriction. Never deleted here.
create or replace function public.adel_accepted_contracts(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  -- The restricted subject is written BEFORE the live id is dropped, so the
  -- signer-identified constraint is never momentarily unsatisfied.
  with u as (
    update public.contract_signatures
       set signer_subject_id = coalesce(signer_subject_id, p_subject),
           client_user_id = null
     where client_user_id = p_subject
    returning 1
  ) select count(*) into v_n from u;
  return jsonb_build_object('retained', v_n);
end $$;

-- F. REPORTS AND SAFETY EVIDENCE — retained under restriction. Never deleted here.
create or replace function public.adel_reports_evidence(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_r integer := 0; v_t integer := 0;
begin
  with u as (
    update public.reports
       set reporter_subject_id = coalesce(reporter_subject_id, p_subject),
           reporter_user_id = null
     where reporter_user_id = p_subject
    returning 1
  ) select count(*) into v_r from u;

  with u as (
    update public.reports
       set reported_subject_id = coalesce(reported_subject_id, p_subject),
           reported_user_id = null
     where reported_user_id = p_subject
    returning 1
  ) select count(*) into v_t from u;

  return jsonb_build_object('as_reporter', v_r, 'as_subject', v_t);
end $$;

-- G. OPERATOR AUDIT — retained. Identity moves to the restricted column.
create or replace function public.adel_operator_audit(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_e integer := 0; v_m integer := 0; v_c integer := 0;
begin
  with u as (
    update public.operator_case_events
       set actor_subject_id = coalesce(actor_subject_id, p_subject),
           actor_user_id = null
     where actor_user_id = p_subject
    returning 1
  ) select count(*) into v_e from u;

  with u as (
    update public.community_moderation_actions
       set actor_subject_id = coalesce(actor_subject_id, p_subject),
           actor_user_id = null
     where actor_user_id = p_subject
    returning 1
  ) select count(*) into v_m from u;

  with u as (
    update public.operator_cases
       set requested_by_user_id = case when requested_by_user_id = p_subject
                                       then null else requested_by_user_id end,
           resolved_by_user_id  = case when resolved_by_user_id = p_subject
                                       then null else resolved_by_user_id end
     where requested_by_user_id = p_subject or resolved_by_user_id = p_subject
    returning 1
  ) select count(*) into v_c from u;

  return jsonb_build_object('case_events', v_e, 'moderation_actions', v_m, 'cases', v_c);
end $$;

-- A. PROFILE / ACCOUNT — last, and the only step that deletes an identity.
create or replace function public.adel_profile_account(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_prov integer := 0; v_client integer := 0; v_auth integer := 0; v_misc integer := 0;
begin
  -- The PROVIDER ROW IS KEPT AND EMPTIED, not deleted. Deleting it would cascade
  -- into `bookings`, and policy B says the operational booking record survives.
  -- What goes is everything that identifies a person: name, contact, imagery,
  -- bio, handle, location. What stays is a business shell the bookings still
  -- point at, owned by nobody and visible to no one.
  with u as (
    update public.providers
       set user_id = null,
           display_name = 'Former member',
           business_name = null, username = null, bio = null,
           location = null, neighborhood = null,
           profile_photo_url = null, cover_image_url = null,
           specialties = null, custom_category = null,
           is_approved = false, is_featured = false, is_trending = false,
           next_available = null
     where user_id = p_subject
    returning 1
  ) select count(*) into v_prov from u;

  -- The client profile IS deleted: name, avatar, notes, neighbourhood. Bookings
  -- do not reference it by key, so nothing is orphaned.
  with d as (delete from public.clients where id = p_subject returning 1)
  select count(*) into v_client from d;

  -- Everything that is purely a personal artefact of using the product.
  delete from public.saved_providers  where user_id = p_subject;
  delete from public.provider_follows where follower_user_id = p_subject;
  delete from public.post_likes       where user_id = p_subject;
  delete from public.post_saves       where user_id = p_subject;
  delete from public.community_post_likes where user_id = p_subject;
  delete from public.community_bookmarks  where user_id = p_subject;
  delete from public.care_reminders   where client_user_id = p_subject;
  delete from public.feature_interest where user_id = p_subject;
  delete from public.rate_limit_log   where user_id = p_subject;
  delete from public.user_blocks      where blocker_user_id = p_subject
                                          or blocked_user_id = p_subject;
  get diagnostics v_misc = row_count;

  -- Analytics identity: the rows are aggregate, the viewer id is not.
  update public.post_views              set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_booking_clicks set viewer_user_id = null where viewer_user_id = p_subject;

  -- THE CREDENTIALS, LAST. Every cascade this fires now has nothing left to take:
  -- that is what the ten preceding steps were for. Deleting the auth row is also
  -- what revokes the sessions — GoTrue refresh tokens cascade from it, so an old
  -- access token cannot be renewed once it expires.
  with d as (delete from auth.users where id = p_subject returning 1)
  select count(*) into v_auth from d;

  return jsonb_build_object('providers_emptied', v_prov, 'clients_deleted', v_client,
                            'auth_deleted', v_auth, 'personal_rows', v_misc);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'adel_provider_content', 'adel_community_content', 'adel_booking_photos_sever',
    'adel_booking_photos_purge', 'adel_messages_sever', 'adel_messages_purge',
    'adel_bookings', 'adel_reviews', 'adel_barter', 'adel_accepted_contracts',
    'adel_reports_evidence', 'adel_operator_audit', 'adel_profile_account'
  ] loop
    execute format('alter function public.%I(uuid) owner to postgres', fn);
    execute format('revoke all on function public.%I(uuid) from public, anon, authenticated', fn);
  end loop;
end $$;

comment on function public.adel_profile_account(uuid) is
  'The LAST step, and the only one that removes an identity. The provider row is '
  'EMPTIED rather than deleted — deleting it would cascade into bookings, and '
  'policy B keeps the operational record. Deleting the auth row is also what '
  'revokes sessions: refresh tokens cascade from it, so an existing access token '
  'cannot be renewed past its expiry.';
