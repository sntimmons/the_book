-- FORWARD CORRECTION to 20261088000000 / 20261090000000 / 20261091000000.
--
-- ══ I FIXED THE TRIGGER AND LEFT THE CONSTRAINT ═══════════════════════════
--
-- `20261090000000` exists because `tagged_provider_id` is
-- `ON DELETE SET NULL` — a set-null referential action is an UPDATE on
-- `community_posts`, and the integrity trigger raised on it, so deleting a
-- recommended provider would have failed outright. That migration moved the
-- service_role carve-out first and declared the case closed. Its header says so.
-- `MIGRATION_LEDGER.md` says so.
--
-- **The CHECK constraint fails on exactly the same UPDATE, and a CHECK has no
-- carve-out to move.**
--
--     check ((intent = 'shoutout') = (tagged_provider_id is not null))
--
-- After the SET NULL: `true = false` → `23514` → the whole DELETE aborts. So
-- deleting a provider who has ever been named in a shoutout still fails — with a
-- different error code than before, which is the only thing that changed.
--
-- **AND IT IS GRIEFABLE.** Any authenticated client can make any approved
-- provider permanently undeletable by posting one recommendation of them. That
-- is a right-to-erasure failure that a stranger can inflict, which is worse than
-- the two OQ-077 defects it resembles — those need the deleted party to have
-- done something.
--
-- I fixed the half I had just been thinking about and did not go looking for the
-- other half. The lesson worth keeping: when a referential action turns out to
-- fire a rule, enumerate EVERY rule it fires — the triggers AND the constraints.
--
-- ── THE RESOLUTION, AND WHY IT IS NOT A RETENTION POLICY ──────────────────
--
-- Three options: cascade the shoutout away with the provider, keep it and relax
-- the constraint to allow an orphan, or retarget it somehow.
--
-- **CASCADE**, because a shoutout's entire subject is the provider it names. The
-- constraint already says a shoutout must name someone — that is the product
-- rule (PD-097), not an implementation detail — so a shoutout with nobody in it
-- is not a degraded recommendation, it is not a recommendation. Keeping it would
-- mean publishing "someone recommends —" on a surface whose only purpose is to
-- point at a provider.
--
-- This is NOT the OQ-077 question and does not pre-empt it. OQ-077 is about
-- TRANSACTION EVIDENCE — booking photos, contract text, booking records a
-- counterparty may need to rely on. A public recommendation of a business that
-- no longer exists is none of those things: nobody's claim rests on it, and it
-- is already deletable by its own author at any time.
alter table public.community_posts
  drop constraint if exists community_posts_tagged_provider_id_fkey;

alter table public.community_posts
  add constraint community_posts_tagged_provider_id_fkey
  foreign key (tagged_provider_id) references public.providers(id) on delete cascade;

comment on column public.community_posts.tagged_provider_id is
  'The provider a shoutout names. Required for shoutout and forbidden otherwise. '
  'ON DELETE CASCADE, not SET NULL: the CHECK says a shoutout must name someone '
  '(PD-097), so nulling it on erasure made the provider UNDELETABLE — and any '
  'client could inflict that on any provider with one post. A shoutout''s whole '
  'subject is the provider, so it goes with them. A shoutout is not transaction '
  'evidence and this does not pre-empt OQ-077.';

-- `tagged_booking_id` stays SET NULL and is correct as it is: its CHECK is
-- `tagged_booking_id is null or intent = 'shoutout'`, which a null satisfies. A
-- deleted booking removes the "Worked together" badge and leaves the
-- recommendation standing, which is exactly right — the recommendation was never
-- about the booking.

-- ══ 2. AN AUTHOR CAN SET THEIR OWN ENGAGEMENT NUMBERS ════════════════════
--
-- The UPDATE branch pins the nine fields that decide what a post IS and who said
-- it. It does not pin `like_count`, `reply_count` or `is_active` — and the INSERT
-- path clamps all three while the UPDATE path does not. `authenticated` keeps
-- table-level UPDATE, and the policy is `auth.uid() = user_id`, so:
--
--     PATCH /rest/v1/community_posts?id=eq.<own post>   { "like_count": 999999 }
--
-- is accepted. `20261089000000` re-derived every count precisely because they had
-- all been wrong, and then left the author able to make their own wrong again.
--
-- The impact today is a vanity number — these rank nothing, which is asserted
-- from both sides. `is_active` is the one that matters later: it is documented as
-- the reserved take-down mechanism (OQ-082), and an author who can flip it back
-- would undo a take-down the moment one is built.
create or replace function public.enforce_community_post_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligible uuid;
  v_tz       text;
  v_end      timestamptz;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
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
    -- SERVER-MAINTAINED, so carried over rather than refused: a client that
    -- round-trips a row it read should not be rejected for sending back the
    -- values it was given. What it sends is simply not what is stored.
    new.like_count  := old.like_count;
    new.reply_count := old.reply_count;
    new.is_active   := old.is_active;
    new.updated_at  := now();
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to post.' using errcode = '42501';
  end if;

  if not (
    (new.author_kind = 'client'
       and new.intent in ('looking_for', 'need_advice', 'who_does_this', 'shoutout'))
    or (new.author_kind = 'provider'
       and new.intent in ('open_today', 'update', 'announcement'))
  ) then
    raise exception 'That is not something a % can post.', new.author_kind
      using errcode = 'check_violation';
  end if;

  if new.intent = 'shoutout' and new.tagged_provider_id is null then
    raise exception 'Name the provider you are recommending.'
      using errcode = 'check_violation';
  end if;

  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.like_count  := 0;
  new.reply_count := 0;
  new.is_active   := true;

  if new.author_kind = 'provider' then
    v_eligible := public.caller_eligible_provider_id();
    if v_eligible is null then
      raise exception 'This account cannot post as a provider right now.'
        using errcode = 'PT431';
    end if;
    new.provider_id := v_eligible;
  else
    new.provider_id := null;
  end if;

  if new.intent = 'open_today' then
    if not exists (
      select 1 from public.providers_open_today() t(id) where t.id = new.provider_id
    ) then
      raise exception 'Publish your hours for today before posting an Open Today note.'
        using errcode = 'PT430';
    end if;
    -- ORDERED, so a provider with rows carrying different zones gets a
    -- deterministic one rather than whichever the planner returned first.
    select coalesce(a.timezone, 'America/Chicago') into v_tz
      from public.provider_availability a
     where a.provider_id = new.provider_id and a.timezone is not null
     order by a.weekday, a.start_time
     limit 1;
    v_tz := coalesce(v_tz, 'America/Chicago');
    v_end := ((((now() at time zone v_tz)::date + 1)::timestamp) at time zone v_tz);
    -- CLAMPED TO 24 HOURS. The horizon is "the end of the provider's day", and
    -- the provider declares their own timezone — so an extreme zone stretched an
    -- "Open Today" note to 36-48 hours. It says TODAY; a day is not two days.
    new.expires_at := least(v_end, now() + interval '24 hours');
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
    if exists (
      select 1 from public.providers p
       where p.id = new.tagged_provider_id and p.user_id = (select auth.uid())
    ) then
      raise exception 'You cannot recommend your own business.' using errcode = 'PT432';
    end if;
    if public.contact_blocked_provider((select auth.uid()), new.tagged_provider_id) then
      raise exception 'That provider cannot be recommended.' using errcode = 'PT432';
    end if;
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

-- ══ 3. THE LEGACY `category` COLUMN IS AN UNBOUNDED WRITABLE TEXT FIELD ══
--
-- `content` is bounded at 1000 and a reply at 500; `area` and `timing` at 60.
-- `category` — free text, `DEFAULT 'general'`, no CHECK — is the one hole in an
-- otherwise complete set, and the reshape stopped WRITING it without stopping
-- anyone else. A crafted client can store a megabyte there.
alter table public.community_posts
  drop constraint if exists community_posts_category_check;
alter table public.community_posts
  add constraint community_posts_category_check
    check (char_length(category) <= 40);

comment on column public.community_posts.category is
  'LEGACY. The pre-reshape free-text grouping, superseded by `intent` (which is '
  'CHECK-constrained and paired with the actor). Nothing writes it and nothing '
  'reads it; new rows take the default. Bounded here only because it remained '
  'client-writable while being read by nobody. Do not build on it.';

-- ══ 4. A SHOUTOUT NAMING SOMEONE YOU BLOCKED ═════════════════════════════
--
-- The view filtered on the post's AUTHOR and not on the provider a shoutout
-- NAMES. So a provider you had blocked — or who had blocked you — was praised by
-- name in your feed by a third party. `fetchProviderInfoMap` reads
-- `providers_visible`, so the name resolved to nothing and the card rendered
-- "A provider"... **with a working tap-through to their profile.**
--
-- `20261066000000` names that exact shape as WORSE than no filtering at all: a
-- nameless card that still offers the action. PD-089 says blocked users leave
-- each other's ordinary surfaces, and a recommendation of someone on a community
-- feed is their presence on an ordinary surface.
--
-- The view is DROPPED rather than replaced because `category` also leaves it: it
-- is read by nobody and published to everybody.
drop view if exists public.community_posts_visible;
create view public.community_posts_visible
with (security_invoker = false) as
select cp.id, cp.provider_id, cp.user_id, cp.author_kind, cp.intent,
       cp.content, cp.service_tag, cp.area, cp.timing,
       cp.tagged_provider_id, cp.tagged_booking_id, cp.expires_at,
       cp.like_count, cp.reply_count, cp.created_at, cp.is_active
  from public.community_posts cp
 where cp.is_active
   -- PD-089, on the AUTHOR.
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
   )
   -- PD-089, on the provider a shoutout NAMES. Both directions, same rule.
   and (
     cp.tagged_provider_id is null
     or not public.contact_blocked_provider((select auth.uid()), cp.tagged_provider_id)
   )
   -- The open_today time bound, and the requirement that the provider is STILL
   -- published as open.
   and (
     cp.intent <> 'open_today'
     or (cp.expires_at > now()
         and cp.provider_id in (select public.providers_open_today()))
   );

-- OWNERSHIP IS THE SECURITY CONTEXT of a definer view — it is what lets the view
-- read `user_blocks` rows the caller cannot. Every predecessor states it
-- explicitly and 20261088000000 left it implicit, which made the one
-- load-bearing property depend on who happened to run the migration.
alter view public.community_posts_visible owner to postgres;
revoke all on public.community_posts_visible from public, anon;
grant select on public.community_posts_visible to authenticated;

comment on view public.community_posts_visible is
  'The community feed as ONE VIEWER sees it. Carries four rules the base table '
  'cannot: the bidirectional block filter on the AUTHOR, the same filter on the '
  'provider a SHOUTOUT NAMES (a nameless card that still offers the action is '
  'worse than no filter — 20261066000000), the open_today time bound, and the '
  'requirement that an open_today note''s provider is still published as open. '
  'Definer view OWNED BY postgres — the ownership is the security context, not a '
  'formality. Columns listed EXPLICITLY, and the legacy `category` is not among '
  'them.';

alter view public.community_replies_visible owner to postgres;
