-- FORWARD CORRECTION to 20261088000000 / 20261089000000 (Community Reshape).
--
-- ══ 1. `anon` STILL HOLDS TABLE-LEVEL SELECT ON THE COMMUNITY TABLES ══════
--
-- The new read policies are `TO authenticated`, so a signed-out caller is
-- refused by RLS and reads nothing — that part is correct and is asserted
-- behaviourally. But `anon` retains the baseline's table-level `SELECT` grant on
-- `community_posts` and `community_replies`, so the refusal rests on ONE
-- mechanism.
--
-- This repo's standard is two. `20261034000000` narrowed these tables' grants
-- and left SELECT; `20261058000000` revoked the community report table's writes
-- outright rather than relying on a dropped policy. The same treatment here
-- makes a future policy edit that accidentally widens `TO public` a privilege
-- error rather than a data leak — which matters more now than it did, because
-- the surface just grew from ~30 providers to everyone with an account.
revoke select on public.community_posts   from anon;
revoke select on public.community_replies from anon;
revoke select on public.community_post_likes from anon;
revoke select on public.community_bookmarks  from anon;

comment on table public.community_posts is
  'The service community. Read by any signed-in person and written under '
  'enforce_community_post_integrity, which binds the author and decides whether '
  'they may speak as a business. NOT readable by anon — refused twice, by a '
  'TO authenticated policy and by the absence of a grant, because one refusal is '
  'one edit away from none.';

-- ══ 2. TWO REFUSALS THAT ARRIVED WITH THE WRONG REASON ════════════════════
--
-- The CHECK constraints are the structural guarantee and they work — but the
-- TRIGGER runs first, so the message a person actually receives came from
-- whichever intent-specific branch happened to run:
--
--   * a client posting `open_today` fell into the availability branch, looked up
--     `providers_open_today()` for a null provider, and was told
--     **"Publish your hours for today"** — advice that is impossible for them to
--     act on, because they do not have hours.
--   * a shoutout with no provider named fell into the shoutout branch, failed
--     `exists(… where p.id = null)`, and was told **"That provider cannot be
--     recommended"** — about a provider they never named.
--
-- Both were refused, so nothing was unsafe. But a refusal that misdescribes
-- itself is how a user concludes the product is broken, and how the next
-- engineer debugs the wrong branch. The trigger now checks the two structural
-- facts FIRST, in the order the constraints state them, and says what is wrong.
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
  -- Erasure cascades (ON DELETE SET NULL is an UPDATE here), backfills, fixtures.
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
    new.updated_at := now();
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to post.' using errcode = '42501';
  end if;

  -- THE TWO STRUCTURAL FACTS, CHECKED FIRST so the refusal describes itself.
  -- Both are also CHECK constraints; these exist for the MESSAGE, and the
  -- constraints exist because a message is not a guarantee.
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

  -- THE AUTHOR IS THE CALLER. Not a field they send.
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
    -- DO NOT INVENT AVAILABILITY TRUTH.
    if not exists (
      select 1 from public.providers_open_today() t(id) where t.id = new.provider_id
    ) then
      raise exception 'Publish your hours for today before posting an Open Today note.'
        using errcode = 'PT430';
    end if;
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
