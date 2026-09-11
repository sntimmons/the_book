-- COMMUNITY RESHAPE — the post model becomes a SERVICE community.
--
-- ══ WHAT COMMUNITY IS, AND WHAT IT IS NOT ═════════════════════════════════
--
-- Community exists so people can FIND providers, ask service questions,
-- recommend providers they trust, and so providers can say something useful
-- about their business. It is not a status feed, not lifestyle posting, not a
-- follower economy and not an engagement contest. Every column below exists
-- because one of those four jobs needs it; nothing here counts attention.
--
-- ══ THE BLOCKER THIS REMOVES ══════════════════════════════════════════════
--
-- `community_posts.provider_id` was `NOT NULL REFERENCES providers(id)`, and both
-- the INSERT policy and the read view required the caller to be in `providers`.
-- A client has no provider row, so a client could not post, reply or read — not
-- by policy choice but by table shape. Community was provider-only in the
-- strongest possible sense: **no client could ever be represented in it.**
--
-- ══ THE ACTOR MODEL ═══════════════════════════════════════════════════════
--
-- `author_kind` is an EXPLICIT discriminator rather than "provider_id is null".
-- The two would agree today and drift the first time someone posts as a person
-- while owning a business — which is the normal case for a provider asking
-- another provider for a recommendation. NAVIGATION.md's rule is that one
-- account acts and the role is contextual; the context has to be recorded, not
-- inferred from a foreign key.
--
--   author_kind = 'provider'  → provider_id is the business they posted AS.
--                               Bound by the server to an APPROVED provider they
--                               own; a deapproved provider cannot post at all.
--   author_kind = 'client'    → provider_id is null. Any authenticated person,
--                               including someone who also owns a business.
--
-- ══ INTENTS, AND WHY THERE IS NO BLANK COMPOSER ═══════════════════════════
--
-- A client sees four things they might want, not an empty box:
--
--   looking_for   "Looking for someone" — a request for a provider.
--   need_advice   "Need advice"         — a service question.
--   who_does_this "Who does this style?"— a style-reference question.
--   shoutout      "Recommend a provider"— a named recommendation.
--
-- A provider gets three ways to say something useful about their business, and
-- the fourth provider action — ANSWERING a client — is a reply, not a post
-- (20261089000000), because an answer that is not attached to the question is
-- how a service community turns into a feed.
--
--   open_today    a time-bounded note that rides on REAL availability.
--   update        something that changed.
--   announcement  something new.
--
-- The vocabulary is closed in the DATABASE and not only in TypeScript. The
-- existing `category` column is free text with no CHECK, and `categoryLabel()`
-- maps anything unrecognised to "Other" — so a typo or a stale client writes a
-- value that renders as Other forever and filters into nothing, with no error at
-- any layer. This does not repeat that.
--
-- ══ OPEN TODAY IS A PROJECTION WITH A NOTE ON IT, NOT A POST ══════════════
--
-- **The availability tables are the truth about whether a provider is open.**
-- `providers_open_today()` (20261044000000) already answers it from published
-- working hours and blocked dates, in each provider's own timezone, against
-- SERVER time. A stored "I'm open today" post would be a second source of truth
-- that can contradict the first, and a permanent text post saying "open today"
-- forever is exactly the failure this must not ship.
--
-- So the provider does not assert being open. They attach a NOTE to a day they
-- are ALREADY published as open, and:
--
--   * the write is REFUSED if `providers_open_today()` does not contain them —
--     the composer sends them to set their hours instead of letting them claim
--     it (PT430);
--   * `expires_at` is stamped by the SERVER to the end of that day in their own
--     timezone, never supplied by the client;
--   * the surfacing view requires BOTH `expires_at > now()` AND current
--     membership of `providers_open_today()`, so a note stops surfacing when the
--     day ends OR when the provider blocks the date — without anyone deleting
--     anything, and without history being rewritten.
--
-- That last property is the requirement: it disappears from "Open Today" on
-- expiry, and it does not require deleting history to stop surfacing.
--
-- ══ SHOUTOUTS ARE NOT REVIEWS, AND THE SCHEMA SAYS SO ═════════════════════
--
-- A shoutout names a real, approved provider and **touches nothing in the review
-- or reputation system**. It is not in `provider_reviews`, it carries no rating
-- column, and `provider_reputation_canonical()` reads neither this table nor any
-- column of it. Review = transaction reputation. Shoutout = social recommendation.
--
-- `tagged_booking_id` is OPTIONAL and this is a deliberate, surfaced trade-off.
-- REQUIRING a completed booking would make the feature dead on arrival in a
-- 25-30 person beta — almost nobody has a completed booking with the provider
-- they want to recommend yet — and it would rebuild the review system's evidence
-- requirement on a surface that is explicitly not a review. So linkage is
-- optional, and when it IS present the server verifies it (the caller's own
-- COMPLETED booking with that exact provider) so a surface can say so honestly.
-- Filed as an open question rather than settled here.

-- ── 1. The columns ────────────────────────────────────────────────────────
alter table public.community_posts
  alter column provider_id drop not null;

alter table public.community_posts
  add column if not exists author_kind        text not null default 'provider',
  add column if not exists intent             text not null default 'update',
  add column if not exists service_tag        text,
  add column if not exists area               text,
  add column if not exists timing             text,
  add column if not exists tagged_provider_id uuid references public.providers(id) on delete set null,
  add column if not exists tagged_booking_id  uuid references public.bookings(id)  on delete set null,
  add column if not exists expires_at         timestamptz;

-- Every pre-existing row is a provider post. `update` is the honest intent for
-- it: it is a provider saying something, which is what the old composer was.
update public.community_posts
   set author_kind = 'provider', intent = 'update'
 where author_kind is null or intent is null;

-- The defaults existed ONLY to backfill. Leaving them would let an insert that
-- forgot to say who is speaking default to "a provider" — the one value a client
-- must never silently acquire.
alter table public.community_posts
  alter column author_kind drop default,
  alter column intent      drop default;

-- ── 2. The vocabulary, closed in the database ─────────────────────────────
alter table public.community_posts
  drop constraint if exists community_posts_author_kind_check,
  drop constraint if exists community_posts_intent_check,
  drop constraint if exists community_posts_intent_matches_actor_check,
  drop constraint if exists community_posts_provider_matches_actor_check,
  drop constraint if exists community_posts_shoutout_tags_provider_check,
  drop constraint if exists community_posts_booking_only_on_shoutout_check,
  drop constraint if exists community_posts_open_today_expires_check,
  drop constraint if exists community_posts_service_tag_check,
  drop constraint if exists community_posts_area_check,
  drop constraint if exists community_posts_timing_check;

alter table public.community_posts
  add constraint community_posts_author_kind_check
    check (author_kind in ('client', 'provider')),

  add constraint community_posts_intent_check
    check (intent in ('looking_for', 'need_advice', 'who_does_this', 'shoutout',
                      'open_today', 'update', 'announcement')),

  -- A client cannot post a provider intent and a provider cannot post as a
  -- client while carrying their business. This is the impersonation boundary
  -- expressed as data, underneath the trigger that also enforces it.
  add constraint community_posts_intent_matches_actor_check
    check (
      (author_kind = 'client'
         and intent in ('looking_for', 'need_advice', 'who_does_this', 'shoutout'))
      or
      (author_kind = 'provider'
         and intent in ('open_today', 'update', 'announcement'))
    ),

  add constraint community_posts_provider_matches_actor_check
    check ((author_kind = 'provider') = (provider_id is not null)),

  -- A recommendation that names nobody is not a recommendation.
  add constraint community_posts_shoutout_tags_provider_check
    check ((intent = 'shoutout') = (tagged_provider_id is not null)),

  add constraint community_posts_booking_only_on_shoutout_check
    check (tagged_booking_id is null or intent = 'shoutout'),

  -- The time bound is structural: an open_today row without an expiry cannot
  -- exist, so "a permanent post that says open today forever" is unrepresentable.
  add constraint community_posts_open_today_expires_check
    check ((intent = 'open_today') = (expires_at is not null)),

  add constraint community_posts_service_tag_check
    check (service_tag is null or service_tag in
      ('Hair', 'Lashes', 'Barber', 'Braider', 'Trainer', 'Nails', 'Makeup', 'Esthetics')),

  add constraint community_posts_area_check
    check (area is null or char_length(area) between 1 and 60),

  add constraint community_posts_timing_check
    check (timing is null or char_length(timing) between 1 and 60);

comment on column public.community_posts.author_kind is
  'Who is speaking: ''client'' (a person) or ''provider'' (a business). EXPLICIT '
  'rather than inferred from provider_id, because the two agree today and drift '
  'the first time someone who owns a business posts as a person — which is the '
  'ordinary case for a provider asking for a recommendation. Server-bound: a '
  '''provider'' post is rewritten to the caller''s own APPROVED provider, and a '
  'caller with no eligible provider cannot write one at all.';

comment on column public.community_posts.intent is
  'What this post is FOR. Closed vocabulary, paired with author_kind by CHECK: '
  'clients post looking_for / need_advice / who_does_this / shoutout; providers '
  'post open_today / update / announcement. Answering a client question is a '
  'REPLY, not a post. There is deliberately no generic "what''s on your mind" '
  'intent — a blank composer is how a service community becomes a status feed.';

comment on column public.community_posts.expires_at is
  'When an open_today note stops surfacing, stamped by the SERVER to the end of '
  'that day in the provider''s own timezone. Never supplied by the client. Only '
  'open_today has one, and it MUST have one — a permanent post that says "open '
  'today" forever is unrepresentable here by CHECK constraint.';

comment on column public.community_posts.tagged_provider_id is
  'The provider a shoutout names. Required for shoutout and forbidden otherwise. '
  'A shoutout is a SOCIAL RECOMMENDATION and changes NOTHING in reviews or '
  'reputation: it is not in provider_reviews, it has no rating, and '
  'provider_reputation_canonical() reads neither this table nor any column of '
  'it. Review = transaction reputation; shoutout = recommendation.';

comment on column public.community_posts.tagged_booking_id is
  'OPTIONAL evidence that the author actually used the provider they are '
  'recommending: their own COMPLETED booking with that exact provider, verified '
  'by the server. Optional on purpose — requiring it would make shoutouts '
  'unusable in a 25-30 person beta where almost nobody has a completed booking '
  'with the provider they want to recommend, and would rebuild the review '
  'system''s evidence bar on a surface that is explicitly not a review. See '
  'OQ-081.';

comment on column public.community_posts.is_active is
  'RESERVED AND UNUSED. Nothing writes it — not the app, not an operator RPC, '
  'not a migration — and the only removal path is the author''s own DELETE. It '
  'reads like a working take-down mechanism and is not one. Do not wire a button '
  'to it without also adding the operator RPC and the UPDATE policy that would '
  'let an operator write it; today the only UPDATE policy is the author''s own, '
  'so such a button would fail silently through PostgREST row filtering.';

-- ── 3. The integrity trigger ──────────────────────────────────────────────
--
-- Everything a client could otherwise forge lives here: who they are, which
-- business they claim to be, whether they may speak as a business at all,
-- whether the provider they tagged exists, and when an open_today note ends.
create or replace function public.enforce_community_post_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligible uuid;
  v_tz       text;
begin
  if tg_op = 'UPDATE' then
    -- ONLY the text may be edited. Everything that decides what a post IS, who
    -- said it and where it surfaces is immutable — otherwise a post could be
    -- written as a harmless client question and edited into a provider
    -- announcement, or a shoutout re-pointed at a different provider after
    -- people had responded to it.
    if new.id                 is distinct from old.id
       or new.user_id            is distinct from old.user_id
       or new.provider_id        is distinct from old.provider_id
       or new.author_kind        is distinct from old.author_kind
       or new.intent             is distinct from old.intent
       or new.tagged_provider_id is distinct from old.tagged_provider_id
       or new.tagged_booking_id  is distinct from old.tagged_booking_id
       or new.expires_at         is distinct from old.expires_at
       or new.created_at         is distinct from old.created_at
    then
      raise exception 'A community post''s author, intent and links cannot be changed.'
        using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- service_role keeps the supplied row: backfills, fixtures and erasure.
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to post.' using errcode = '42501';
  end if;

  -- THE AUTHOR IS THE CALLER. Not a field they send.
  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.like_count  := 0;
  new.reply_count := 0;
  new.is_active   := true;

  if new.author_kind = 'provider' then
    -- SPEAKING AS A BUSINESS REQUIRES BEING AN ELIGIBLE ONE. `caller_eligible_provider_id()`
    -- returns null for a caller who is not a provider AND for one whose
    -- `is_approved` an operator has withdrawn — so a restricted or deapproved
    -- provider cannot create new provider Community activity, which the barter
    -- writes have required since 20261048000000 and these never did.
    v_eligible := public.caller_eligible_provider_id();
    if v_eligible is null then
      raise exception 'This account cannot post as a provider right now.'
        using errcode = 'PT431';
    end if;
    -- Their own business, whatever they sent. This is the impersonation gate.
    new.provider_id := v_eligible;
  else
    new.provider_id := null;
  end if;

  if new.intent = 'open_today' then
    -- DO NOT INVENT AVAILABILITY TRUTH. The published hours decide whether a
    -- provider is open; this note only rides along.
    if not exists (
      select 1 from public.providers_open_today() t(id) where t.id = new.provider_id
    ) then
      raise exception 'Publish your hours for today before posting an Open Today note.'
        using errcode = 'PT430';
    end if;
    -- End of THIS day in the provider's own timezone, from the server clock.
    select coalesce(a.timezone, 'America/Chicago') into v_tz
      from public.provider_availability a
     where a.provider_id = new.provider_id and a.timezone is not null
     limit 1;
    v_tz := coalesce(v_tz, 'America/Chicago');
    new.expires_at :=
      ((((now() at time zone v_tz)::date + 1)::timestamp) at time zone v_tz);
  else
    new.expires_at := null;
  end if;

  if new.intent = 'shoutout' then
    if not exists (
      select 1 from public.providers p
       where p.id = new.tagged_provider_id and p.is_approved
    ) then
      raise exception 'That provider cannot be recommended.' using errcode = 'PT432';
    end if;
    -- No recommending yourself, and none across a block in either direction.
    if exists (
      select 1 from public.providers p
       where p.id = new.tagged_provider_id and p.user_id = (select auth.uid())
    ) then
      raise exception 'You cannot recommend your own business.' using errcode = 'PT432';
    end if;
    if public.contact_blocked_provider((select auth.uid()), new.tagged_provider_id) then
      raise exception 'That provider cannot be recommended.' using errcode = 'PT432';
    end if;
    -- Optional evidence, verified when offered. A surface may say "worked with
    -- them" only because the server checked it — never because the client said so.
    if new.tagged_booking_id is not null then
      if not exists (
        select 1 from public.bookings b
         where b.id = new.tagged_booking_id
           and b.user_id = (select auth.uid())
           and b.provider_id = new.tagged_provider_id
           and b.completed_at is not null
      ) then
        raise exception 'That booking does not support this recommendation.'
          using errcode = 'PT433';
      end if;
    end if;
  else
    new.tagged_provider_id := null;
    new.tagged_booking_id  := null;
  end if;

  return new;
end;
$$;

alter function public.enforce_community_post_integrity() owner to postgres;
revoke all on function public.enforce_community_post_integrity()
  from public, anon, authenticated;

comment on function public.enforce_community_post_integrity() is
  'Binds a community post to its author and refuses everything a client could '
  'otherwise forge: the author id, the business they claim to speak as, whether '
  'they may speak as one at all (an eligible, approved provider they own), the '
  'provider a shoutout names, the booking a shoutout cites, and when an '
  'open_today note ends. On UPDATE only the text may change — otherwise a '
  'harmless client question could be edited into a provider announcement, or a '
  'shoutout re-pointed after people responded to it.';

drop trigger if exists a_community_posts_integrity on public.community_posts;
create trigger a_community_posts_integrity
  before insert or update on public.community_posts
  for each row execute function public.enforce_community_post_integrity();

-- ── 4. Policies: Community is for people who need a service ───────────────
drop policy if exists community_posts_provider_read   on public.community_posts;
drop policy if exists community_posts_provider_insert on public.community_posts;
drop policy if exists community_posts_owner_update    on public.community_posts;
drop policy if exists community_posts_owner_delete    on public.community_posts;

-- READ: any signed-in person. The provider-only gate is what this session
-- removes — a client asking "who does braids in the Heights" is the primary
-- reason the surface exists. Still NOT `anon`: the block filter is per-viewer and
-- there is no viewer to filter for. Signed-out Discover shows an honest prompt.
create policy community_posts_read on public.community_posts
  for select to authenticated
  using (true);

-- WRITE: the caller writes as themselves. Everything else — which business, and
-- whether they may claim one — is decided by the trigger, not by a predicate
-- that would have to duplicate it.
create policy community_posts_insert on public.community_posts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy community_posts_owner_update on public.community_posts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy community_posts_owner_delete on public.community_posts
  for delete to authenticated
  using (auth.uid() = user_id);

-- ── 5. The read view: blocks, expiry and availability, all in one place ───
--
-- `20261066000000` exists because `20261064000000` shipped these views without
-- restating the base policy and granted them to `anon`, exposing the whole hub.
-- The lesson is restated rather than assumed: THE VIEW CARRIES THE POLICY TOO.
drop view if exists public.community_posts_visible;
create or replace view public.community_posts_visible
with (security_invoker = false) as
select cp.id, cp.provider_id, cp.user_id, cp.author_kind, cp.intent,
       cp.content, cp.category, cp.service_tag, cp.area, cp.timing,
       cp.tagged_provider_id, cp.tagged_booking_id, cp.expires_at,
       cp.like_count, cp.reply_count, cp.created_at, cp.is_active
  from public.community_posts cp
 where cp.is_active
   -- PD-089: blocked users leave each other's ordinary surfaces, both ways.
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
   )
   -- An open_today note surfaces only while BOTH are still true: its day has not
   -- ended, and the provider is STILL published as open today. The second half
   -- matters — a provider who blocks the date after posting stops surfacing
   -- immediately, without the note being deleted and without availability having
   -- to be re-asserted anywhere.
   and (
     cp.intent <> 'open_today'
     or (cp.expires_at > now()
         and cp.provider_id in (select public.providers_open_today()))
   );

revoke all on public.community_posts_visible from public, anon;
grant select on public.community_posts_visible to authenticated;

comment on view public.community_posts_visible is
  'The community feed as one viewer sees it. Carries THREE rules the base table '
  'cannot: the bidirectional block filter (PD-089), the open_today time bound, '
  'and the requirement that an open_today note''s provider is STILL published as '
  'open today. Definer view, granted to authenticated only — 20261064000000 '
  'granted its predecessor to anon and exposed the whole hub, which is why this '
  'comment exists. Columns are listed EXPLICITLY: a column added to '
  'community_posts is not published here by accident.';

-- ── 6. Indexes the feed actually needs ────────────────────────────────────
--
-- The community tables had NO index beyond their primary keys, and the feed
-- orders by created_at with offset paging. Beta volume hides that; opening the
-- surface to clients multiplies both rows and readers.
create index if not exists community_posts_feed_idx
  on public.community_posts (is_active, created_at desc);
create index if not exists community_posts_intent_idx
  on public.community_posts (intent, created_at desc);
create index if not exists community_posts_tagged_provider_idx
  on public.community_posts (tagged_provider_id) where tagged_provider_id is not null;
create index if not exists community_posts_open_today_idx
  on public.community_posts (expires_at) where intent = 'open_today';
