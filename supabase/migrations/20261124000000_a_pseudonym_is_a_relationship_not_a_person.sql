-- ACCOUNT ERASURE — OQ-085 CLOSED. An anonymized row carries a RELATIONSHIP
-- pseudonym, not a person-wide one.
--
-- ══ THE QUESTION, AND THE RULING ══════════════════════════════════════════
--
-- `20261101000000` gave each erased account ONE pseudonym and wrote it into
-- every anonymized identity column. The security review of this branch showed
-- what that leaves standing: `provider_reviews` is readable by `anon` for
-- revealed reviews, so a provider who holds one booking row with pseudonym X can
-- follow X through the public review list and learn **every other provider that
-- person used, when, and what they wrote**. De-named, but not unlinkable.
--
-- The Founder ruling closing OQ-085: an anonymized historical record must not
-- remain resolvable to the deleted user through normal application data, an auth
-- id, a profile FK, email, phone, a public identifier, or ORDINARY OPERATOR
-- LOOKUP. Where historical integrity needs stable grouping, the grouping key
-- must be a **non-user pseudonymous RELATIONSHIP identifier** that preserves the
-- grouping, cannot resolve back to the erased account, and is not an auth or
-- profile identifier. That is specifically permitted for PD-091/PD-092
-- distinct-client reputation continuity. The only person-identifying exception
-- that survives is the separately restricted contract/report evidence store
-- under the interim retention policy (OQ-084).
--
-- ══ THE SCOPE IS THE COUNTERPARTY, AND THAT IS THE WHOLE DESIGN ═══════════
--
-- A pseudonym is allocated per **(subject, scope)**, where the scope is the
-- relationship the row belongs to:
--
--   * `provider` — a `public.providers.id`. Used for `bookings`,
--     `provider_reviews` and `client_reviews`. Within ONE provider's history the
--     erased client is still exactly one distinct person, which is precisely
--     what PD-091/PD-092 require: the public rating is the mean of the latest
--     review from each DISTINCT client, so merging erased reviewers would move
--     the rating of every provider they had reviewed. Across providers the ids
--     differ and share nothing, so the pivot above returns one provider and
--     stops.
--
--   * `conversation` — a `public.conversation.id`. Used for `conversation` and
--     `messages`, so a thread still reads as one consistent participant and two
--     threads cannot be joined. Strictly narrower than `provider`, because a
--     thread needs no grouping wider than itself.
--
--   * `none` — the all-zero uuid, for the one row shape that has no counterparty
--     (`conversation.provider_id` is nullable). Named rather than left implicit
--     so a NULL scope can never silently become a shared bucket.
--
-- Bookings and reviews deliberately SHARE the provider-scoped id. That discloses
-- nothing new — `provider_reviews.booking_id` already ties a review to its
-- booking — and keeping them consistent is what makes the retained operational
-- record coherent for the provider it belongs to.
--
-- ══ WHAT CAN STILL RESOLVE ONE, STATED PLAINLY ════════════════════════════
--
-- `erasure_relationship_pseudonyms` is the reverse index and it is permanent,
-- because the two SCHEDULED purge steps run up to 180 days after the account is
-- gone and have to find their rows again. It is RLS-enabled with every privilege
-- revoked from `public`, `anon` and `authenticated` — and an operator is an
-- `authenticated` caller, so operator lookup cannot reach it either. What can
-- read it is `service_role` and the definer functions in this file: the same
-- trust class as `erased_accounts`, which PD-101 records as trusted
-- infrastructure rather than a product surface.
--
-- **Do not "simplify" this by deleting the map when a request completes.** A
-- purge step that is resurrected from `failed` or released from `held` after the
-- map was dropped would find no rows, delete nothing, and report success — the
-- 180-day message window silently becoming forever, which is the exact failure
-- `20261114000000` was written to remove.

-- ── 1. The relationship map ──────────────────────────────────────────────
create table if not exists public.erasure_relationship_pseudonyms (
  subject_id   uuid not null,
  scope_kind   text not null,
  scope_id     uuid not null,
  pseudonym_id uuid not null unique default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  primary key (subject_id, scope_kind, scope_id),
  constraint erasure_relationship_pseudonyms_scope_kind_check
    check (scope_kind in ('provider', 'conversation', 'none'))
);

create index if not exists erasure_relationship_pseudonyms_subject_idx
  on public.erasure_relationship_pseudonyms (subject_id);

comment on table public.erasure_relationship_pseudonyms is
  'OQ-085. The pseudonym an anonymized row carries INSTEAD of a user id, '
  'allocated per (subject, scope) where the scope is the RELATIONSHIP the row '
  'belongs to — a provider, or a conversation. Preserves the grouping history '
  'needs (PD-091/PD-092 count one review per DISTINCT client, so erased '
  'reviewers must stay distinct within one provider) while sharing nothing '
  'between relationships, so an anonymized row in one provider''s history '
  'cannot be joined to the same person''s row in another''s. Unreadable by '
  'anon, authenticated and therefore by operators; readable only by '
  'service_role and the erasure definer functions. PERMANENT by necessity: the '
  'scheduled booking-photo and message purges run up to 180 days after the '
  'account is gone and locate their rows through this map.';

comment on column public.erasure_relationship_pseudonyms.scope_kind is
  'provider | conversation | none. `none` pairs with the all-zero scope id for '
  'the one shape with no counterparty (conversation.provider_id is nullable) — '
  'named rather than left as NULL so a missing scope cannot silently become a '
  'bucket several relationships share.';

alter table public.erasure_relationship_pseudonyms enable row level security;
revoke all on public.erasure_relationship_pseudonyms from public, anon, authenticated;

-- Append-only, and never re-keyed: re-pointing a pseudonym would reattach one
-- person's retained history to another's identity, and minting a second one for
-- the same relationship would split one person into several inside a single
-- provider's review set — the rating move PD-091/PD-092 forbid.
create or replace function public.enforce_erasure_link_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    if tg_op = 'UPDATE'
       and (new.subject_id   is distinct from old.subject_id
         or new.scope_kind   is distinct from old.scope_kind
         or new.scope_id     is distinct from old.scope_id
         or new.pseudonym_id is distinct from old.pseudonym_id) then
      raise exception 'A relationship pseudonym cannot be re-keyed.'
        using errcode = 'check_violation';
    end if;
    return coalesce(new, old);
  end if;
  raise exception 'Relationship pseudonyms are not client-writable.' using errcode = '42501';
end;
$$;
alter function public.enforce_erasure_link_append_only() owner to postgres;
revoke all on function public.enforce_erasure_link_append_only()
  from public, anon, authenticated;

drop trigger if exists erasure_link_append_only on public.erasure_relationship_pseudonyms;
create trigger erasure_link_append_only
  before insert or update or delete on public.erasure_relationship_pseudonyms
  for each row execute function public.enforce_erasure_link_append_only();

-- ── 2. Allocation, idempotent by construction ────────────────────────────
create or replace function public.erasure_relationship_pseudonym(
  p_subject uuid, p_scope_kind text, p_scope uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_kind text; v_scope uuid; v_p uuid;
begin
  if p_subject is null then
    raise exception 'A relationship pseudonym needs a subject.' using errcode = 'check_violation';
  end if;
  -- A missing scope is the `none` relationship, never a NULL that would collide
  -- in the primary key or be silently shared.
  if p_scope is null then
    v_kind := 'none'; v_scope := '00000000-0000-0000-0000-000000000000'::uuid;
  else
    v_kind := p_scope_kind; v_scope := p_scope;
  end if;

  select pseudonym_id into v_p from public.erasure_relationship_pseudonyms
   where subject_id = p_subject and scope_kind = v_kind and scope_id = v_scope;
  if v_p is null then
    insert into public.erasure_relationship_pseudonyms(subject_id, scope_kind, scope_id)
    values (p_subject, v_kind, v_scope)
    on conflict (subject_id, scope_kind, scope_id) do nothing;
    select pseudonym_id into v_p from public.erasure_relationship_pseudonyms
     where subject_id = p_subject and scope_kind = v_kind and scope_id = v_scope;
  end if;
  return v_p;
end;
$$;
alter function public.erasure_relationship_pseudonym(uuid, text, uuid) owner to postgres;
revoke all on function public.erasure_relationship_pseudonym(uuid, text, uuid)
  from public, anon, authenticated;

comment on function public.erasure_relationship_pseudonym(uuid, text, uuid) is
  'The stable pseudonym for one erased account WITHIN one relationship, '
  'allocated once. Every step must get the same value for the same (subject, '
  'scope) or one person would appear as several inside a single provider''s '
  'review set and the distinct-client rating rule (PD-091/PD-092) would count '
  'them separately.';

-- Every pseudonym read since 20261101000000 goes through the map above.
-- `public.erasure_relationship_pseudonyms_for` is the ONE place that expands a
-- subject to its pseudonyms, so a purge cannot accidentally scope itself to a
-- single relationship and leave the rest behind.
create or replace function public.erasure_pseudonyms_for(p_subject uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pseudonym_id from public.erasure_relationship_pseudonyms
   where subject_id = p_subject;
$$;
alter function public.erasure_pseudonyms_for(uuid) owner to postgres;
revoke all on function public.erasure_pseudonyms_for(uuid) from public, anon, authenticated;

comment on function public.erasure_pseudonyms_for(uuid) is
  'Every pseudonym an erased account was given, across all of its relationships. '
  'The only expansion point: a purge that scoped itself to one relationship '
  'would leave the other relationships'' rows behind forever, and that failure '
  'is invisible from the request row.';

-- ── 3. The erasure record itself, now that nothing allocates it as a side effect
--
-- `erasure_pseudonym()` inserted the `erased_accounts` row on its way to minting
-- the person-wide pseudonym, and it was called unconditionally in three steps'
-- DECLARE blocks — so the row always appeared. The relationship allocator is
-- called PER ROW instead, so an account with no bookings, reviews or messages
-- would never have been recorded, and `account_unavailable()` reads that record
-- as the durable fact that somebody is gone (`20261111000000`). Recording it is
-- therefore explicit and unconditional rather than a side effect of anonymizing
-- something.
create or replace function public.record_erased_account(p_subject uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.erased_accounts(subject_id) values (p_subject)
  on conflict (subject_id) do nothing;
end;
$$;
alter function public.record_erased_account(uuid) owner to postgres;
revoke all on function public.record_erased_account(uuid) from public, anon, authenticated;

comment on function public.record_erased_account(uuid) is
  'Records that an account has been erased. The row is what account_unavailable() '
  'reads, and it is the minimum party identity the retained contract and report '
  'evidence is allowed to keep (OQ-084). It no longer carries a person-wide '
  'pseudonym: grouping lives in erasure_relationship_pseudonyms, per relationship.';

-- ── 4. The steps that were writing ONE id across every relationship ──────

create or replace function public.adel_bookings(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  perform public.record_erased_account(p_subject);
  -- Scoped to the PROVIDER. The booking must still be distinguishable from every
  -- other erased client's booking in THAT provider's history — otherwise their
  -- record collapses into one anonymous customer — and must share nothing with
  -- the same person's booking at a different provider, which is OQ-085.
  with u as (
    update public.bookings b
       set user_id = public.erasure_relationship_pseudonym(p_subject, 'provider', b.provider_id),
           message = null,                 -- free text the client wrote
           client_safety_notes = null,     -- may name them
           cancellation_reason = case when b.cancellation_actor = 'client'
                                      then null else b.cancellation_reason end
     where b.user_id = p_subject
    returning 1
  ) select count(*) into v_n from u;
  return jsonb_build_object('bookings', v_n);
end $$;

create or replace function public.adel_reviews(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_p integer := 0; v_c integer := 0;
begin
  perform public.record_erased_account(p_subject);
  -- THE SCOPE IS LOAD-BEARING HERE. The public rating is the mean of the latest
  -- review from each DISTINCT client (PD-091/PD-092). Within one provider the
  -- erased reviewer stays exactly one distinct person, so no rating moves;
  -- across providers the ids share nothing, so the public review list can no
  -- longer be walked to recover one person's whole service history — which is
  -- the correlation OQ-085 was raised about.
  with u as (
    update public.provider_reviews r
       set reviewer_user_id = public.erasure_relationship_pseudonym(p_subject, 'provider', r.provider_id),
           reviewer_display_name = 'Former member'
     where r.reviewer_user_id = p_subject
    returning 1
  ) select count(*) into v_p from u;

  with u as (
    update public.client_reviews r
       set client_user_id = public.erasure_relationship_pseudonym(p_subject, 'provider', r.reviewer_provider_id),
           private_note = null            -- a provider's note about the person
     where r.client_user_id = p_subject
    returning 1
  ) select count(*) into v_c from u;

  return jsonb_build_object('provider_reviews', v_p, 'client_reviews', v_c);
end $$;

create or replace function public.adel_messages_sever(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_m integer := 0; v_c integer := 0;
begin
  perform public.record_erased_account(p_subject);
  -- Scoped to the CONVERSATION, which is narrower than the provider scope and is
  -- all a thread needs: the same participant reads consistently within one
  -- thread, and two threads cannot be joined to each other. The message and the
  -- conversation row take the same id for the same thread, so a reader does not
  -- see the thread's client and its sender as two different strangers.
  with u as (
    update public.messages m
       set sender_id = public.erasure_relationship_pseudonym(
                         p_subject, 'conversation', m.conversation_id)
     where m.sender_id = p_subject
    returning 1
  ) select count(*) into v_m from u;

  with u as (
    update public.conversation c
       set client_id = public.erasure_relationship_pseudonym(p_subject, 'conversation', c.id)
     where c.client_id = p_subject
    returning 1
  ) select count(*) into v_c from u;

  return jsonb_build_object('messages', v_m, 'conversations', v_c);
end $$;

create or replace function public.adel_messages_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  -- EVERY pseudonym, not one. Scoping this to a single relationship would leave
  -- the other threads' bodies in place past their retention window, and the
  -- request row would still say completed.
  with d as (
    delete from public.messages
     where sender_id in (select pid from public.erasure_pseudonyms_for(p_subject) pid)
    returning 1
  ) select count(*) into v_n from d;
  return jsonb_build_object('messages', v_n);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['adel_bookings', 'adel_reviews',
                            'adel_messages_sever', 'adel_messages_purge'] loop
    execute format('alter function public.%I(uuid) owner to postgres', fn);
    execute format('revoke all on function public.%I(uuid) from public, anon, authenticated', fn);
  end loop;
end $$;

-- ── 5. `adel_profile_account` records the erasure even for an empty account ──
--
-- Body taken from the LAST definition (`20261123000000:102`) and changed in one
-- place only: the `record_erased_account` call at the top. Reconstructing it from
-- an older copy is the mistake `20261119000000` had to correct.
create or replace function public.adel_profile_account(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_prov integer := 0; v_client integer := 0; v_auth integer := 0; v_misc integer := 0;
begin
  perform public.record_erased_account(p_subject);
  with u as (
    update public.providers
       set user_id = null,
           display_name = 'Former member',
           username = 'former_' || left(replace(id::text, '-', ''), 23),
           specialties = '{}'::text[],
           business_name = null, bio = null,
           location = null, neighborhood = null,
           profile_photo_url = null, cover_image_url = null,
           custom_category = null,
           is_approved = false, is_featured = false, is_trending = false,
           next_available = null
     where user_id = p_subject
    returning 1
  ) select count(*) into v_prov from u;

  with d as (delete from public.clients where id = p_subject returning 1)
  select count(*) into v_client from d;

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

  -- ANALYTICS IDENTITY. The rows are aggregate, the viewer is not. All THREE
  -- tables that name a viewer — provider_profile_views was missed until the
  -- catalogue-driven assertion in 20261123000000 went looking.
  update public.post_views              set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_booking_clicks set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_profile_views  set viewer_user_id = null where viewer_user_id = p_subject;

  -- THE CREDENTIALS, LAST. Every cascade this fires now has nothing left to take:
  -- that is what the preceding steps were for. Deleting the auth row is also what
  -- revokes the sessions — GoTrue refresh tokens cascade from it, so an old access
  -- token cannot be renewed once it expires.
  with d as (delete from auth.users where id = p_subject returning 1)
  select count(*) into v_auth from d;

  return jsonb_build_object('providers_emptied', v_prov, 'clients_deleted', v_client,
                            'auth_deleted', v_auth, 'personal_rows', v_misc);
end $$;

alter function public.adel_profile_account(uuid) owner to postgres;
revoke all on function public.adel_profile_account(uuid) from public, anon, authenticated;

-- ── 6. The later-of calculation looked the pseudonym up as a scalar ──────
--
-- Body taken from the LAST definition (`20261114000000:292`) and changed in ONE
-- place: the message-purge due date is computed over EVERY pseudonym the subject
-- was given rather than a single one. A scalar subquery against a subject that
-- now has several rows would have raised `21000: more than one row returned by a
-- subquery` and failed finalisation outright — visibly, which is the better of
-- the two ways to get this wrong, but still wrong.
create or replace function public.finalize_account_deletion(p_request_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_req         public.account_deletion_requests%rowtype;
  v_key         text;
  v_pending     integer;
  v_failed      integer;
  v_photo_due   timestamptz;
  v_msg_due     timestamptz;
  v_photo_days  integer := public.retention_days('booking_photos');
  v_msg_days    integer := public.retention_days('messages');
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Finalisation is not client-callable.' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'No such deletion request.' using errcode = 'check_violation';
  end if;
  if v_req.status = 'completed' then return 'completed'; end if;
  if v_req.status = 'cancelled' then return 'cancelled'; end if;
  -- THE DATE, in every non-terminal state.
  if v_req.grace_ends_at > now() then
    return 'grace_period';
  end if;

  update public.account_deletion_requests
     set status = 'finalizing',
         finalizing_started_at = coalesce(finalizing_started_at, now()),
         attempts = attempts + 1
   where id = p_request_id;

  foreach v_key in array public.account_deletion_step_keys() loop
    perform public.run_account_deletion_step(p_request_id, v_key);
  end loop;

  if v_photo_days is not null then
    select max(greatest(
             coalesce(b.completed_at, b.cancelled_at, b.created_at)
               + make_interval(days => v_photo_days),
             v_req.grace_ends_at))
      into v_photo_due
      from public.booking_reference_photos p
      join public.bookings b on b.id = p.booking_id
     where p.uploader_subject_id = v_req.subject_id;
  end if;

  if v_msg_days is not null then
    select max(greatest(
             coalesce(c.last_message_at, c.created_at)
               + make_interval(days => v_msg_days),
             v_req.grace_ends_at))
      into v_msg_due
      from public.messages m
      join public.conversation c on c.id = m.conversation_id
     where m.sender_id in (select pid from public.erasure_pseudonyms_for(v_req.subject_id) pid);
  end if;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'booking_photos_purge',
          case when v_photo_days is null then 'held'
               when v_photo_due  is null then 'completed'
               else 'scheduled' end,
          v_photo_due,
          case when v_photo_days is null
               then 'retention_policy.booking_photos has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'messages_purge',
          case when v_msg_days is null then 'held'
               when v_msg_due  is null then 'completed'
               else 'scheduled' end,
          v_msg_due,
          case when v_msg_days is null
               then 'retention_policy.messages has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  select count(*) filter (where status in ('pending', 'running')),
         count(*) filter (where status = 'failed')
    into v_pending, v_failed
    from public.account_deletion_steps where request_id = p_request_id;

  if v_failed > 0 or v_pending > 0 then
    update public.account_deletion_requests
       set status = 'failed',
           last_error = format('%s step(s) failed, %s still pending', v_failed, v_pending)
     where id = p_request_id;
    return 'failed';
  end if;

  update public.account_deletion_requests
     set status = 'completed', completed_at = now(), last_error = null
   where id = p_request_id;
  return 'completed';
end;
$$;

alter function public.finalize_account_deletion(uuid) owner to postgres;
revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;

-- ── 7. Re-scope anything a previous run already wrote ────────────────────
--
-- Production has never run this engine, but a non-production project has. Any
-- row still carrying the person-wide pseudonym is rewritten to the relationship
-- pseudonym for the relationship it actually belongs to, BEFORE the column that
-- holds the old value is dropped — otherwise those rows keep exactly the
-- cross-provider linkability OQ-085 closed, and nothing would ever find them
-- again.
do $$
declare e record;
begin
  for e in select subject_id, pseudonym_id from public.erased_accounts
            where pseudonym_id is not null loop
    update public.bookings b
       set user_id = public.erasure_relationship_pseudonym(e.subject_id, 'provider', b.provider_id)
     where b.user_id = e.pseudonym_id;

    update public.provider_reviews r
       set reviewer_user_id = public.erasure_relationship_pseudonym(e.subject_id, 'provider', r.provider_id)
     where r.reviewer_user_id = e.pseudonym_id;

    update public.client_reviews r
       set client_user_id = public.erasure_relationship_pseudonym(e.subject_id, 'provider', r.reviewer_provider_id)
     where r.client_user_id = e.pseudonym_id;

    update public.messages m
       set sender_id = public.erasure_relationship_pseudonym(e.subject_id, 'conversation', m.conversation_id)
     where m.sender_id = e.pseudonym_id;

    update public.conversation c
       set client_id = public.erasure_relationship_pseudonym(e.subject_id, 'conversation', c.id)
     where c.client_id = e.pseudonym_id;
  end loop;
end $$;

-- ── 8. The person-wide pseudonym is removed, not left dormant ────────────
--
-- Leaving the column in place would leave a working person-wide grouping key one
-- `create or replace` away from being written again, and this repo's own history
-- is a list of dormant things that came back (`posts.is_active`,
-- `20261088000000`). The erasure record keeps `subject_id` — the minimum party
-- identity the retained contract and report evidence is allowed to hold, and the
-- durable fact `account_unavailable()` reads — and nothing else.
--
-- The append-only guard is redefined FIRST: it names `new.pseudonym_id`, and a
-- plpgsql body referencing a dropped column fails at runtime, on every insert,
-- for the whole life of the trigger.
create or replace function public.enforce_erased_accounts_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    if tg_op = 'DELETE' then
      raise exception 'An erasure record cannot be deleted; it is the durable fact that this account is gone.'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and new.subject_id is distinct from old.subject_id then
      raise exception 'An erasure record cannot be re-keyed.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  raise exception 'Erasure records are not client-writable.' using errcode = '42501';
end;
$$;
alter function public.enforce_erased_accounts_append_only() owner to postgres;
revoke all on function public.enforce_erased_accounts_append_only()
  from public, anon, authenticated;

drop function if exists public.erasure_pseudonym(uuid);
alter table public.erased_accounts drop column if exists pseudonym_id;

comment on table public.erased_accounts is
  'The durable record that an account was erased, and the ONLY person-identifying '
  'thing an erasure leaves behind: `subject_id` is the minimum party identity the '
  'retained accepted-contract and report evidence may keep (PD-102 policies C and '
  'F, duration unset pending OQ-084), and it is what account_unavailable() reads. '
  'Restricted to service_role — no client role and therefore no operator can '
  'select from it. It NO LONGER carries a person-wide pseudonym: grouping for '
  'anonymized history lives in erasure_relationship_pseudonyms, one id per '
  'relationship, so an anonymized row in one provider''s records shares nothing '
  'with the same person''s row in another''s (OQ-085).';
