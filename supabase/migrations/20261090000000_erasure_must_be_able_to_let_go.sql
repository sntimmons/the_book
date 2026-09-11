-- FORWARD CORRECTION to 20261088000000 (Community Reshape).
--
-- ══ I MADE A POST SO IMMUTABLE THAT DELETING AN ACCOUNT WOULD FAIL ════════
--
-- `enforce_community_post_integrity` checks its UPDATE branch FIRST and raises
-- before reaching the `service_role` carve-out every neighbouring guard in this
-- repo has. That is stricter, and I wrote it that way on purpose — but the
-- strictness lands somewhere I did not intend.
--
-- `tagged_provider_id` is `references public.providers(id) ON DELETE SET NULL`.
-- A set-null referential action is an **UPDATE on `community_posts`**, so it
-- fires this trigger, which sees `tagged_provider_id` changing and raises
-- `check_violation`. **Deleting a provider who has ever been recommended would
-- fail outright** — and so would deleting the account behind them, because the
-- providers row cascades from `auth.users`.
--
-- That is the same shape as the two account-erasure defects already recorded
-- under OQ-077 (deleting a user who is the target of a report; deleting an
-- operator). This session should not add a third.
--
-- ── WHY THE CARVE-OUT, AND WHY IT IS NOT THE PD-093 CASE ──────────────────
--
-- `20261082000000` deliberately gave `bookings.under_review_at` NO service_role
-- carve-out, and the reasoning there does not transfer here. That field decides
-- WHICH ALREADY-PUBLIC REVIEWS A DISPUTE SUPPRESSES, and `under_review` is a
-- service_role-only field — so the carve-out would have handed the only role
-- that can open a hold the ability to choose its retroactive effect. There was a
-- participant-visible power on the other side of it.
--
-- Nothing here has that shape. These columns decide who is speaking and how long
-- a note surfaces; no participant can reach `service_role`, and erasure and
-- backfills genuinely need to write them. So this takes the ordinary carve-out,
-- in the ordinary place — first, before any other branch — and the immutability
-- that matters, the one a CLIENT ROLE faces, is unchanged: a client still cannot
-- promote their own question into a provider announcement, re-point a shoutout
-- after people have answered it, or grant themselves an expiry.
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
  -- FIRST, and before the UPDATE branch: erasure cascades (ON DELETE SET NULL on
  -- tagged_provider_id / tagged_booking_id), backfills and fixtures. A no-claims
  -- session is the erasure path this repo has been bitten by before
  -- (20261053000000 exists because that case was forgotten once).
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- ONLY the text may be edited. Everything that decides what a post IS, who
    -- said it and where it surfaces is immutable — otherwise a post could be
    -- written as a harmless client question and edited into a provider
    -- announcement, or a shoutout re-pointed at a different provider after
    -- people had already responded to it.
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

  -- THE AUTHOR IS THE CALLER. Not a field they send.
  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.like_count  := 0;
  new.reply_count := 0;
  new.is_active   := true;

  if new.author_kind = 'provider' then
    -- SPEAKING AS A BUSINESS REQUIRES BEING AN ELIGIBLE ONE.
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

comment on function public.enforce_community_post_integrity() is
  'Binds a community post to its author and refuses everything a client could '
  'otherwise forge: the author id, the business they claim to speak as, whether '
  'they may speak as one at all, the provider a shoutout names, the booking it '
  'cites, and when an open_today note ends. For a CLIENT ROLE, an UPDATE may '
  'change only the text. service_role and no-claims sessions are carved out '
  'FIRST — erasure''s ON DELETE SET NULL on tagged_provider_id is an UPDATE on '
  'this table, and without the carve-out deleting a provider who had ever been '
  'recommended would fail outright (the shape of the OQ-077 erasure defects). '
  'This is NOT the 20261082000000 case: nothing here decides what a participant '
  'can suppress, so the ordinary carve-out is correct.';

-- The reply trigger has the same hole in a milder form: it raises on ANY update,
-- and `community_replies` has no set-null FK today — but it also raises for
-- service_role, which means a backfill or an erasure path that ever needs to
-- touch a reply cannot. Same fix, same reasoning, same place.
create or replace function public.enforce_community_reply_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_eligible uuid;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'A community reply cannot be edited.'
      using errcode = 'check_violation';
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to reply.' using errcode = '42501';
  end if;

  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();

  if new.author_kind = 'provider' then
    v_eligible := public.caller_eligible_provider_id();
    if v_eligible is null then
      raise exception 'This account cannot reply as a provider right now.'
        using errcode = 'PT431';
    end if;
    new.provider_id := v_eligible;
  else
    new.provider_id := null;
  end if;

  if exists (
    select 1 from public.community_posts cp
      join public.user_blocks b
        on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
        or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
     where cp.id = new.post_id
  ) then
    raise exception 'This post is not available.' using errcode = 'PT427';
  end if;

  return new;
end;
$$;

alter function public.enforce_community_reply_integrity() owner to postgres;
revoke all on function public.enforce_community_reply_integrity()
  from public, anon, authenticated;
