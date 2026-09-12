-- ACCOUNT ERASURE — a deletion request takes effect IMMEDIATELY.
--
-- ══ WHAT "IMMEDIATELY" HAS TO MEAN ════════════════════════════════════════
--
-- The approved policy is explicit that on a verified request the account becomes
-- inactive **at once**, before any grace period elapses: profile hidden, no new
-- bookings, no new messages, no new posts or content, no normal marketplace
-- activity. Not "eventually", and not "at finalisation" — a person who has asked
-- to be deleted should not still be transacting for thirty days.
--
-- ══ TWO DECISIONS THAT SHAPE THIS FILE ════════════════════════════════════
--
-- **(1) Separate small triggers, not edits to the big write gates.** Eight write
-- paths need this refusal. `enforce_booking_write_integrity` is ~290 lines and
-- this repo has lost a rule to a copy-forward in it three times
-- (`20261055000000` documents two of them). Adding a one-line check to eight such
-- functions would be eight chances to drop something else. Each gate below is its
-- own trigger, a few lines long, firing beside what is already there.
--
-- **(2) The refusal is on the WRITE, and the hiding is in the VIEWS.** Those are
-- different jobs: a gate stops new activity, a view stops the account appearing.
-- Doing either one alone produces a half-deleted account — a hidden profile still
-- taking bookings, or a visible profile that cannot be booked.
--
-- **What is NOT gated, deliberately:** reading, and resolving what already
-- exists. A person with an active booking must still be able to see it, message
-- about it, cancel or complete it, and answer a dispute — the policy says so, and
-- an erasure that strands a counterparty mid-transaction is a worse outcome than
-- one that takes a few extra days. Reviews are also left alone during the grace
-- period: anonymising them early would be irreversible, and HIDING them would
-- move another provider's public rating because of a decision that provider had
-- no part in, which is the PD-093 mistake with a different noun.

-- ── 1. The refusals ──────────────────────────────────────────────────────
create or replace function public.refuse_write_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role and no-claims sessions are the erasure engine and migrations.
  -- They must be able to write while an account is inactive; that is the whole
  -- job they are doing.
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  if public.caller_pending_deletion() then
    raise exception 'This account is scheduled for deletion and cannot start new activity.'
      using errcode = 'PT440';
  end if;
  return new;
end;
$$;

alter function public.refuse_write_when_account_inactive() owner to postgres;
revoke all on function public.refuse_write_when_account_inactive()
  from public, anon, authenticated;

comment on function public.refuse_write_when_account_inactive() is
  'Refuses a NEW write from an account with an open deletion request (PT440). '
  'Attached as its own small trigger to each write path rather than added into '
  'the large write-integrity functions, because this repo has lost a rule to a '
  'copy-forward in those three times. Reads and the resolution of EXISTING '
  'transactions are deliberately untouched: an erasure that strands a '
  'counterparty mid-booking is worse than one that waits.';

-- Nobody may start something new WITH an account that is going away, either.
-- Without this, a provider who asked to be deleted keeps taking bookings from
-- clients who cannot tell.
create or replace function public.refuse_write_to_inactive_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  select p.user_id into v_owner from public.providers p where p.id = new.provider_id;
  if v_owner is not null and public.account_pending_deletion(v_owner) then
    -- Deliberately the same wording a client already sees for an unavailable
    -- provider. Telling them WHY would disclose someone else's account state.
    raise exception 'This provider is not currently available for new bookings.'
      using errcode = 'PT426';
  end if;
  return new;
end;
$$;

alter function public.refuse_write_to_inactive_provider() owner to postgres;
revoke all on function public.refuse_write_to_inactive_provider()
  from public, anon, authenticated;

comment on function public.refuse_write_to_inactive_provider() is
  'Refuses a new booking or conversation aimed at a provider whose owner has an '
  'open deletion request. Reuses the EXISTING unavailable-provider message and '
  'code (PT426) on purpose: a distinct error would tell a stranger that this '
  'person is deleting their account.';

-- ── 2. Attached to every path that STARTS something ──────────────────────
--
-- `b_` so each sorts after the `a_`-prefixed stamping triggers and before the
-- `zz_` gates, and so the refusal is visible in a trigger listing next to the
-- rule it enforces.
drop trigger if exists b_bookings_refuse_when_inactive on public.bookings;
create trigger b_bookings_refuse_when_inactive
  before insert on public.bookings
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_bookings_refuse_inactive_provider on public.bookings;
create trigger b_bookings_refuse_inactive_provider
  before insert on public.bookings
  for each row execute function public.refuse_write_to_inactive_provider();

drop trigger if exists b_conversation_refuse_when_inactive on public.conversation;
create trigger b_conversation_refuse_when_inactive
  before insert on public.conversation
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_conversation_refuse_inactive_provider on public.conversation;
create trigger b_conversation_refuse_inactive_provider
  before insert on public.conversation
  for each row execute function public.refuse_write_to_inactive_provider();

drop trigger if exists b_messages_refuse_when_inactive on public.messages;
create trigger b_messages_refuse_when_inactive
  before insert on public.messages
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_provider_reviews_refuse_when_inactive on public.provider_reviews;
create trigger b_provider_reviews_refuse_when_inactive
  before insert on public.provider_reviews
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_client_reviews_refuse_when_inactive on public.client_reviews;
create trigger b_client_reviews_refuse_when_inactive
  before insert on public.client_reviews
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_community_posts_refuse_when_inactive on public.community_posts;
create trigger b_community_posts_refuse_when_inactive
  before insert on public.community_posts
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_community_replies_refuse_when_inactive on public.community_replies;
create trigger b_community_replies_refuse_when_inactive
  before insert on public.community_replies
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_posts_refuse_when_inactive on public.posts;
create trigger b_posts_refuse_when_inactive
  before insert on public.posts
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_barter_offers_refuse_when_inactive on public.barter_offers;
create trigger b_barter_offers_refuse_when_inactive
  before insert on public.barter_offers
  for each row execute function public.refuse_write_when_account_inactive();

drop trigger if exists b_barter_interests_refuse_when_inactive on public.barter_interests;
create trigger b_barter_interests_refuse_when_inactive
  before insert on public.barter_interests
  for each row execute function public.refuse_write_when_account_inactive();

-- Going live, or editing a public profile, while scheduled for deletion.
drop trigger if exists b_providers_refuse_when_inactive on public.providers;
create trigger b_providers_refuse_when_inactive
  before insert or update on public.providers
  for each row execute function public.refuse_write_when_account_inactive();

-- ── 3. The profile leaves the public surfaces, at once ───────────────────
--
-- Every view below already carries the PD-089 block filter, and each is rebuilt
-- with that filter INTACT plus the new one. `20261066000000` exists because a
-- view was rebuilt once without restating a policy it was carrying; that lesson
-- is why these are written out in full rather than patched.
create or replace view public.providers_visible
with (security_invoker = false) as
select p.id, p.user_id, p.display_name, p.business_name, p.username, p.category_id,
       p.custom_category, p.bio, p.location, p.neighborhood, p.profile_photo_url,
       p.cover_image_url, p.rating, p.average_rating, p.review_count, p.total_bookings,
       p.repeat_client_rate, p.follower_count, p.next_available, p.is_trending,
       p.is_featured, p.is_approved, p.is_demo, p.years_experience, p.specialties,
       p.created_at, p.is_mobile, p.completed_count, p.rating_client_count
  from public.providers p
 where not exists (
   select 1 from public.user_blocks b
    where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
       or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
 )
   -- A provider who asked to be deleted leaves discovery, search and every feed
   -- immediately. Not at finalisation: for thirty days they would otherwise be a
   -- bookable business that intends to stop existing.
   and not public.account_pending_deletion(p.user_id);

alter view public.providers_visible owner to postgres;

comment on view public.providers_visible is
  'Providers as one viewer sees them: the bidirectional block filter (PD-089) and, '
  'since 20261102000000, the exclusion of any provider with an open account '
  'deletion request. Both are per-viewer-independent absences — a missing card is '
  'not a statement about why.';

create or replace view public.clients_public
with (security_invoker = false) as
select c.id, c.name, c.avatar_url
  from public.clients c
 where not public.account_pending_deletion(c.id);

alter view public.clients_public owner to postgres;

comment on view public.clients_public is
  'The narrow public client identity (name and avatar) used by review lists and '
  'community authorship. Excludes accounts with an open deletion request, so a '
  'name stops appearing the moment its owner asks to go. Callers already render '
  'an unresolved author as "Former member", which is what an inactive account '
  'reads as during the grace period and what an erased one reads as for good.';

create or replace view public.posts_visible
with (security_invoker = false) as
select p.id, p.provider_id, p.media_url, p.media_type, p.caption, p.category_id,
       p.content_type, p.is_active, p.is_demo, p.created_at, p.like_count,
       p.comment_count, p.thumbnail_url, p.service_type
  from public.posts p
 where p.is_active = true
   and not exists (
     select 1 from public.providers pr
       join public.user_blocks b
         on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = pr.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = pr.user_id)
      where pr.id = p.provider_id
   )
   -- Provider content — portfolio, Reels, captions — leaves public access on the
   -- request, which is the "immediately" half of policy J. The bytes go after the
   -- grace period; the visibility goes now.
   and not exists (
     select 1 from public.providers pr2
      where pr2.id = p.provider_id and public.account_pending_deletion(pr2.user_id)
   );

alter view public.posts_visible owner to postgres;

comment on view public.posts_visible is
  'Provider media as one viewer sees it: active only, the PD-089 block filter, '
  'and no content from a provider with an open deletion request. Policy J''s two '
  'halves are separate on purpose — visibility ends at the request, the bytes end '
  'after the grace period, because the grace period is a restoration window and '
  'deleted bytes cannot be restored.';

create or replace view public.barter_offers_visible
with (security_invoker = false) as
select o.id, o.provider_id, o.user_id, o.offering_service, o.seeking_service,
       o.notes, o.is_active, o.created_at
  from public.barter_offers o
 where exists (select 1 from public.providers pr where pr.user_id = (select auth.uid()))
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = o.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = o.user_id)
   )
   and not public.account_pending_deletion(o.user_id);

alter view public.barter_offers_visible owner to postgres;

-- Community content is hidden by the same rule, added to the view that already
-- carries the block filter, the Open Today bound and the moderation flag.
drop view if exists public.community_posts_visible;
create view public.community_posts_visible
with (security_invoker = false) as
select cp.id, cp.provider_id, cp.user_id, cp.author_kind, cp.intent,
       cp.content, cp.service_tag, cp.area, cp.timing,
       cp.tagged_provider_id, cp.tagged_booking_id, cp.expires_at,
       cp.like_count, cp.reply_count, cp.created_at, cp.is_active
  from public.community_posts cp
 where cp.is_active
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
   )
   and not exists (
     select 1
       from public.providers p
       join public.user_blocks b
         on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
      where p.id = cp.tagged_provider_id
   )
   -- Policy K: the author's Community content leaves ordinary access at once.
   and not public.account_pending_deletion(cp.user_id)
   and (
     cp.intent <> 'open_today'
     or (cp.expires_at > now()
         and cp.provider_id in (select public.providers_open_today()))
   );

alter view public.community_posts_visible owner to postgres;
revoke all on public.community_posts_visible from public, anon;
grant select on public.community_posts_visible to authenticated;

comment on view public.community_posts_visible is
  'The community feed as ONE VIEWER sees it. Five rules the base table cannot '
  'carry: the block filter on the author, the same filter on the provider a '
  'shoutout names, the operator moderation flag, the open_today time bound, and '
  'the exclusion of authors with an open account deletion request (policy K). '
  'Definer view owned by postgres — the ownership is the security context.';

drop view if exists public.community_replies_visible;
create view public.community_replies_visible
with (security_invoker = false) as
select cr.id, cr.post_id, cr.provider_id, cr.user_id, cr.author_kind,
       cr.kind, cr.content, cr.created_at
  from public.community_replies cr
 where cr.is_active
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cr.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cr.user_id)
   )
   and not public.account_pending_deletion(cr.user_id);

alter view public.community_replies_visible owner to postgres;
revoke all on public.community_replies_visible from public, anon;
grant select on public.community_replies_visible to authenticated;

comment on view public.community_replies_visible is
  'Thread replies as one viewer sees them: the block filter, the operator '
  'moderation flag, and the exclusion of authors with an open deletion request.';
