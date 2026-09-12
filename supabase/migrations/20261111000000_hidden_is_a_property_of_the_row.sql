-- FORWARD CORRECTION to 20261102000000 (Account Erasure & Retention, PD-102).
-- Security review of 5977169: SEC-RLS-002 (HIGH), SEC-RLS-003 (HIGH),
-- SEC-AUTHZ-009, SEC-AUTHZ-010, SEC-DATA-011, and the honest part of SEC-AUTHZ-006.
--
-- ══ I ENFORCED "HIDDEN" IN THE VIEWS AND CALLED IT HIDDEN ═════════════════
--
-- `app/settings/delete-account.tsx` tells a person, in those words: *"Your
-- profile is hidden"* and *"Your posts, Reels and Community content are no
-- longer publicly visible."* `20261102000000` made that true of
-- `providers_visible`, `posts_visible`, `community_posts_visible`,
-- `community_replies_visible`, `barter_offers_visible` and `clients_public`.
--
-- It is not true of the tables underneath them:
--
--     providers      providers_public_read   FOR SELECT USING (true)
--     posts          posts_public_read       USING (is_active = true)
--     post_comments  comments_public_read    FOR SELECT USING (true)
--     community_*    *_read                  to authenticated using (is_active …)
--
-- `anon` and `authenticated` hold the public column grant on `providers`
-- (`20261030000000`), so one REST call returns the display name, business name,
-- username, bio, location and both photos of every provider who has asked to be
-- deleted. **The app itself does this**: `hooks/useProviders.ts:338` reads
-- `public.providers` for a directly-opened profile and `:217` for the portfolio,
-- deliberately (`:165-166` records the decision), because a directly-opened
-- profile was never an ordinary discovery surface. Correct for a PD-089 block —
-- where the rule is per-viewer — and wrong for a deletion request, where the rule
-- is about the row and applies to everyone.
--
-- **A guarantee enforced in the view and not in the table is a guarantee about
-- one query, not about the data.** `20261099000000` fixed exactly this shape for
-- moderation two weeks ago, for the same reason, and I did not carry it across.
--
-- ── WHAT MUST KEEP WORKING, AND WHY THE FIX IS NOT `USING (false)` ────────
--
-- PD-102 is explicit that erasure must not strand a counterparty: *"A person with
-- an active booking must still be able to see it, message about it, cancel or
-- complete it, and answer a dispute."* Sixteen screens read `public.providers`
-- directly to do precisely that — `app/bookings/[id]`, `app/messages/[id]`, every
-- `app/post-booking/*`, `lib/reviews.ts`, `hooks/useMessaging.ts`. Hiding the row
-- from them would replace a leak with a broken transaction.
--
-- So the row leaves PUBLIC access and stays visible to the three parties who are
-- not the public: its owner, an operator, and anyone who already has a booking or
-- a conversation with them.
--
-- ══ AND "PENDING DELETION" WAS THE WRONG QUESTION AFTER FINALISATION ══════
--
-- `account_pending_deletion` keys on `subject_user_id`, which is
-- `references auth.users(id) on delete set null`. The last thing the engine does
-- is delete that auth row — so the moment an account is ERASED, the predicate
-- that made it inactive **inverts to `false`** and the erased identity reads as a
-- perfectly ordinary live account (SEC-AUTHZ-009). An access token outliving the
-- final delete then writes to the five identity columns that carry no foreign key
-- (`bookings.user_id`, `conversation.client_id`, `messages.sender_id`, both
-- review tables) and nothing refuses it.
--
-- The durable fact is `erased_accounts.subject_id`, which exists for exactly this
-- reason and is never nulled. The predicate now asks the question it meant to ask
-- all along: **can this identity be interacted with at all** — pending, erased, or
-- ownerless. That single change also fixes SEC-AUTHZ-010 for free, because
-- `account_pending_deletion(null)` was `false` and an erased provider's barter
-- offers stayed on the board under the `former_…` shell.
create or replace function public.account_unavailable(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is null
      or exists (
           select 1 from public.account_deletion_requests r
            where r.subject_user_id = p_user_id
              and r.status in ('requested', 'grace_period', 'finalizing'))
      or exists (
           select 1 from public.erased_accounts e where e.subject_id = p_user_id);
$$;

alter function public.account_unavailable(uuid) owner to postgres;
grant execute on function public.account_unavailable(uuid) to anon, authenticated, service_role;

-- ON THE GRANT, PLAINLY. This function takes an id, and a function that takes an
-- id and answers a private question about its owner is an ORACLE. The security
-- review filed that as SEC-AUTHZ-006 against `account_pending_deletion(uuid)`,
-- and renaming it would be theatre, so:
--
--   * The grant is NECESSARY. An RLS policy is evaluated as the CALLER, and the
--     tables that hold the fact are RLS-protected, so a policy that inlines the
--     lookup sees nothing and hides nothing. A definer function is the only
--     mechanism, and `20261094000000` established that a definer VIEW does not
--     lend function privileges either.
--   * What this migration DOES close is the ENUMERATION. The attack was: list
--     `providers` as anon, collect every `user_id`, ask about each. After this
--     migration the listing no longer contains them, so the oracle can only be
--     asked about an id the caller already holds from an earlier session.
--   * The answer is also deliberately AMBIGUOUS: pending, erased and ownerless
--     are one boolean. "This account cannot be interacted with" is a fact a
--     counterparty needs; "this person is in the process of leaving" is not, and
--     the two are no longer distinguishable through this function.
--   * The residual is NOT closed and is not claimed to be. It is the same
--     question as OQ-076 — the base tables answering what the views hide — and
--     it is recorded there rather than declared solved.
comment on function public.account_unavailable(uuid) is
  'True when this identity cannot be interacted with: an open deletion request, '
  'an erased account, or a null owner (the emptied provider shell). Deliberately '
  'ONE boolean over three causes so it cannot be read as "this person is '
  'leaving". Supersedes account_pending_deletion(uuid) everywhere except the '
  'app''s own status read, because THAT predicate inverts to false at '
  'finalisation — subject_user_id is SET NULL by the auth delete — while '
  'erased_accounts.subject_id is durable. GRANTED to client roles because an RLS '
  'policy is evaluated as the caller; see 20261111000000 for why that is an '
  'oracle, what it no longer permits, and where the residual is recorded.';

create or replace function public.caller_account_unavailable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and public.account_unavailable((select auth.uid()));
$$;

alter function public.caller_account_unavailable() owner to postgres;
grant execute on function public.caller_account_unavailable() to authenticated, service_role;

-- The caller's own relationship with a provider, and nothing else. It discloses
-- only a fact the caller already holds — "I have a booking with them" — which is
-- why it can take an id where `account_unavailable` has to be argued for.
create or replace function public.caller_deals_with_provider(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bookings b
                  where b.provider_id = p_provider_id
                    and b.user_id = (select auth.uid()))
      or exists (select 1 from public.conversation c
                  where c.provider_id = p_provider_id
                    and c.client_id = (select auth.uid()));
$$;

alter function public.caller_deals_with_provider(uuid) owner to postgres;
grant execute on function public.caller_deals_with_provider(uuid) to anon, authenticated, service_role;

-- Whether a provider's CONTENT has left public access: their owner is
-- unavailable and the reader is not that owner. One function so `posts`, and any
-- future provider-content table, cannot drift apart.
create or replace function public.provider_content_hidden(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.providers p
     where p.id = p_provider_id
       and public.account_unavailable(p.user_id)
       and (p.user_id is null or p.user_id is distinct from (select auth.uid()))
  );
$$;

alter function public.provider_content_hidden(uuid) owner to postgres;
grant execute on function public.provider_content_hidden(uuid) to anon, authenticated, service_role;

-- ══ 1. THE BASE TABLES ════════════════════════════════════════════════════
--
-- `providers`. Public access ends; the owner, an operator and an existing
-- counterparty keep it. The predicate is ordered so the common path — an
-- ordinary live provider — costs one `account_unavailable` call and short-circuits
-- before either relationship lookup.
drop policy if exists providers_public_read on public.providers;
create policy providers_public_read on public.providers
  for select
  using (
    not public.account_unavailable(user_id)
    or user_id = (select auth.uid())
    or public.is_operator()
    or public.caller_deals_with_provider(id)
  );

comment on policy providers_public_read on public.providers is
  'Provider rows are public EXCEPT while their owner is unavailable — an open '
  'deletion request, an erased account, or the ownerless shell an erasure leaves '
  'behind. Then the row is readable only by its owner, by an operator, and by '
  'someone who already has a booking or a conversation with them, because PD-102 '
  'requires a live transaction to stay resolvable and sixteen screens read this '
  'table directly to resolve it. Before widening this back to USING (true), read '
  '20261111000000: the view alone was not enough, and the product copy says '
  '"hidden".';

-- `posts`. Portfolio and Reels leave public access with the profile.
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select
  using (is_active = true and not public.provider_content_hidden(provider_id));

-- `post_comments`. This table was missed entirely by 20261102000000 and by the
-- erasure engine (SEC-RLS-003), and it is the worst of the three misses: its
-- `user_id` has **no foreign key to auth.users** (baseline:935-942), so nothing
-- cascades and nothing severed it. An erased account's Reel comments survived
-- with the REAL account id, `USING (true)`, readable by `anon` — the join key
-- that makes every other anonymisation in this workstream reversible.
drop policy if exists comments_public_read on public.post_comments;
create policy comments_public_read on public.post_comments
  for select
  using (not public.account_unavailable(user_id) or user_id = (select auth.uid()));

-- Community content, the same rule the moderation flag already gets.
drop policy if exists community_posts_read on public.community_posts;
create policy community_posts_read on public.community_posts
  for select to authenticated
  using (
    (is_active and not public.account_unavailable(user_id))
    or (select auth.uid()) = user_id
    or public.is_operator()
  );

drop policy if exists community_replies_read on public.community_replies;
create policy community_replies_read on public.community_replies
  for select to authenticated
  using (
    (is_active and not public.account_unavailable(user_id))
    or (select auth.uid()) = user_id
    or public.is_operator()
  );

-- ══ 2. THE VIEWS ASK THE DURABLE QUESTION TOO ═════════════════════════════
--
-- Rebuilt in full rather than patched, because `20261066000000` exists for a view
-- that was rebuilt without restating a predicate it was carrying. Every filter
-- below was already there; the only change is `account_pending_deletion` →
-- `account_unavailable`, which additionally removes the ownerless shell from
-- `providers_visible` (already handled), `barter_offers_visible` and
-- `posts_visible` (SEC-AUTHZ-010).
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
   and not public.account_unavailable(p.user_id);

alter view public.providers_visible owner to postgres;

create or replace view public.clients_public
with (security_invoker = false) as
select c.id, c.name, c.avatar_url
  from public.clients c
 where not public.account_unavailable(c.id);

alter view public.clients_public owner to postgres;

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
   and not exists (
     select 1 from public.providers pr2
      where pr2.id = p.provider_id and public.account_unavailable(pr2.user_id)
   );

alter view public.posts_visible owner to postgres;

create or replace view public.post_comments_visible
with (security_invoker = false) as
select pc.id, pc.post_id, pc.user_id, pc.comment_text, pc.created_at
  from public.post_comments pc
 where not exists (
   select 1 from public.user_blocks b
    where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = pc.user_id)
       or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = pc.user_id)
 )
   and not public.account_unavailable(pc.user_id);

alter view public.post_comments_visible owner to postgres;

comment on view public.post_comments_visible is
  'PD-089 plus PD-102. Comments on media posts, minus anyone the caller is '
  'blocked with, and minus any author who is unavailable. Comments are where a '
  'hidden person most easily reappears — they arrive under somebody else''s '
  'content — which is true of a block and equally true of a deletion request.';

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
   and not public.account_unavailable(o.user_id);

alter view public.barter_offers_visible owner to postgres;

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
   and not public.account_unavailable(cp.user_id)
   and (
     cp.intent <> 'open_today'
     or (cp.expires_at > now()
         and cp.provider_id in (select public.providers_open_today()))
   );

alter view public.community_posts_visible owner to postgres;
revoke all on public.community_posts_visible from public, anon;
grant select on public.community_posts_visible to authenticated;

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
   and not public.account_unavailable(cr.user_id);

alter view public.community_replies_visible owner to postgres;
revoke all on public.community_replies_visible from public, anon;
grant select on public.community_replies_visible to authenticated;

-- ══ 3. THE WRITE GATES ASK THE DURABLE QUESTION TOO ═══════════════════════
create or replace function public.refuse_write_when_account_inactive()
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
  -- `caller_account_unavailable`, not `caller_pending_deletion`: an ERASED
  -- identity holding an unexpired access token was reading as active
  -- (SEC-AUTHZ-009), and five of the tables these triggers guard carry no
  -- foreign key to auth.users, so referential integrity was not catching it
  -- either.
  if public.caller_account_unavailable() then
    raise exception 'This account is scheduled for deletion and cannot start new activity.'
      using errcode = 'PT440';
  end if;
  return new;
end;
$$;

-- Reel comments were never gated at all.
drop trigger if exists b_post_comments_refuse_when_inactive on public.post_comments;
create trigger b_post_comments_refuse_when_inactive
  before insert on public.post_comments
  for each row execute function public.refuse_write_when_account_inactive();

create or replace function public.refuse_write_to_inactive_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_found boolean := false;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  select p.user_id, true into v_owner, v_found
    from public.providers p where p.id = new.provider_id;
  if not coalesce(v_found, false) then
    return new;   -- No such provider. A foreign key, not this trigger's job.
  end if;

  -- An ownerless shell and an unavailable owner are the same answer, and it is
  -- deliberately the SAME message an ordinary unavailable provider gives: a
  -- distinct error would tell a stranger that this person is deleting their
  -- account.
  if public.account_unavailable(v_owner) then
    raise exception 'This provider is not currently accepting new requests.'
      using errcode = 'PT426';
  end if;
  return new;
end;
$$;

-- An erased provider's barter offers are off the board (the view), and nobody
-- can respond to one either. `enforce_barter_interest_write`'s own-offer check is
-- `o.user_id = v_uid`, which is NULL-false, so this was reachable.
drop trigger if exists b_barter_interests_refuse_to_inactive_offer on public.barter_interests;
create or replace function public.refuse_interest_in_unavailable_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_found boolean := false;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  select o.user_id, true into v_owner, v_found
    from public.barter_offers o where o.id = new.offer_id;
  if not coalesce(v_found, false) then
    return new;
  end if;
  if public.account_unavailable(v_owner) then
    raise exception 'This offer is no longer available.' using errcode = 'PT426';
  end if;
  return new;
end;
$$;

alter function public.refuse_interest_in_unavailable_offer() owner to postgres;
revoke all on function public.refuse_interest_in_unavailable_offer()
  from public, anon, authenticated;

create trigger b_barter_interests_refuse_to_inactive_offer
  before insert on public.barter_interests
  for each row execute function public.refuse_interest_in_unavailable_offer();

-- ══ 4. THE GUARD THAT STRANDED THE COUNTERPARTY IT PROTECTS (SEC-DATA-011) ═
--
-- `b_providers_refuse_when_inactive` is `before insert or update`, and it tests
-- the CALLER, not the row. Completing a booking writes `bookings.completed_at`,
-- which fires `zz_bookings_recompute_rating_on_hold` →
-- `recompute_provider_rating_for` → **`update public.providers`**. A SECURITY
-- DEFINER function does not change `auth.uid()`, so that inner update arrives
-- under the same JWT — and a provider with an open deletion request got PT440
-- for **completing their own client's booking**.
--
-- That is the exact outcome PD-102 says the design exists to prevent: *"An
-- erasure that strands a counterparty mid-transaction is a worse outcome than
-- one that waits."* The client could then never review, because a review needs a
-- completed booking. Fail-closed, so not a bypass — but a broken promise, and
-- one no test caught because no test completes a booking as a pending-deletion
-- provider.
--
-- The rule the trigger was reaching for is "you may not maintain a PUBLIC
-- PROFILE while leaving", not "no row on this table may change while you are
-- leaving". So: an insert is always refused, an update to somebody else's row is
-- none of this trigger's business, and an update to your own row is refused only
-- if it touches something a PERSON chose. The server's own derived reputation
-- and activity counters are excluded by name.
create or replace function public.refuse_provider_write_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  -- Columns no person sets: every one is written by a server-side recompute or
  -- an operator flag. Changing ONLY these is not "starting new activity".
  v_derived constant text[] := array[
    'rating', 'average_rating', 'review_count', 'rating_client_count',
    'total_bookings', 'completed_count', 'repeat_client_rate',
    'follower_count', 'next_available', 'is_trending', 'is_featured',
    'is_approved', 'updated_at'
  ];
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and v_uid is null) then
    return new;
  end if;
  if not public.caller_account_unavailable() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'This account is scheduled for deletion and cannot start new activity.'
      using errcode = 'PT440';
  end if;

  -- Somebody else's business. Their row, their rules; this trigger is about the
  -- caller's own public presence, and the recompute of another provider's
  -- reputation runs under whichever JWT happened to complete the booking.
  if old.user_id is distinct from v_uid then
    return new;
  end if;

  -- Their own row: only the derived columns may move.
  if (to_jsonb(new) - v_derived) = (to_jsonb(old) - v_derived) then
    return new;
  end if;

  raise exception 'This account is scheduled for deletion and cannot start new activity.'
    using errcode = 'PT440';
end;
$$;

alter function public.refuse_provider_write_when_account_inactive() owner to postgres;
revoke all on function public.refuse_provider_write_when_account_inactive()
  from public, anon, authenticated;

comment on function public.refuse_provider_write_when_account_inactive() is
  'Refuses a pending-deletion or erased caller a NEW provider row, or any change '
  'to their own row beyond the server-derived reputation and activity counters. '
  'The carve-outs are load-bearing, not convenience: completing a booking '
  'recomputes a rating through an UPDATE on providers under the caller''s own '
  'JWT, and blanket-refusing that stopped a departing provider from finishing '
  'their client''s booking (SEC-DATA-011). Adding a person-set column to the '
  'derived list would reopen the hole this closes.';

drop trigger if exists b_providers_refuse_when_inactive on public.providers;
create trigger b_providers_refuse_when_inactive
  before insert or update on public.providers
  for each row execute function public.refuse_provider_write_when_account_inactive();
