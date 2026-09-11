-- FORWARD CORRECTION to 20261092000000 (Community Reshape).
--
-- ══ I BLOCKED THE FORGER AND THE ONLY LEGITIMATE WRITER WITH IT ═══════════
--
-- `20261092000000` stopped a post's author setting their own `like_count`,
-- `reply_count` and `is_active` by carrying those three over from `old` in the
-- UPDATE branch. That closed the forgery and closed the counters.
--
-- `update_community_like_count` is SECURITY DEFINER, so it runs as `postgres` —
-- but `auth.role()` is a JWT CLAIM, not the database role, and the liker's claim
-- is still `authenticated`. So the counter's own UPDATE took the ordinary UPDATE
-- branch, had its increment overwritten with the old value, and every count went
-- back to never moving. Which is the exact defect `20261089000000` existed to
-- fix, reintroduced one migration later by the fix for a different one.
--
-- ── THE RIGHT SHAPE IS THE ONE PD-094 ALREADY USED ────────────────────────
--
-- A carve-out keyed on WHO is writing was never going to work here, because the
-- legitimate writer and the forger present identically — same claim, same role,
-- same statement. The question is not who is writing but WHAT IS BEING STORED.
--
-- So the counters are checked the way `reputation_is_derived` checks a rating:
-- a changed counter must EQUAL the real count. The trigger recomputes it and
-- compares. There is no marker to forge, no role to impersonate and no session
-- setting to flip — a correct value is accepted from anyone because it is
-- correct, and an invented one is refused from everyone because it is invented.
--
-- `is_active` has no true value to compare against, so it stays pinned outright:
-- nothing writes it today, and it is the reserved take-down field (OQ-082) that
-- an author must not be able to flip back.
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
  v_likes    integer;
  v_replies  integer;
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

    -- A COUNTER MAY ONLY BE THE TRUTH. Checked, not carried over, so the
    -- counter triggers can still do their job; recomputed only when the value
    -- actually changes, so an ordinary text edit pays nothing.
    if new.like_count is distinct from old.like_count then
      select count(*)::integer into v_likes
        from public.community_post_likes l where l.post_id = new.id;
      if new.like_count is distinct from v_likes then
        raise exception 'A community post''s counts are derived, not set.'
          using errcode = 'check_violation';
      end if;
    end if;
    if new.reply_count is distinct from old.reply_count then
      select count(*)::integer into v_replies
        from public.community_replies r where r.post_id = new.id;
      if new.reply_count is distinct from v_replies then
        raise exception 'A community post''s counts are derived, not set.'
          using errcode = 'check_violation';
      end if;
    end if;

    -- No true value to compare against: nothing writes it, and an author who
    -- could flip it would undo a take-down the moment one is built (OQ-082).
    new.is_active  := old.is_active;
    new.updated_at := now();
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
    select coalesce(a.timezone, 'America/Chicago') into v_tz
      from public.provider_availability a
     where a.provider_id = new.provider_id and a.timezone is not null
     order by a.weekday, a.start_time
     limit 1;
    v_tz := coalesce(v_tz, 'America/Chicago');
    v_end := ((((now() at time zone v_tz)::date + 1)::timestamp) at time zone v_tz);
    -- It says TODAY; a day is not two days.
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

comment on function public.enforce_community_post_integrity() is
  'Binds a community post to its author and refuses everything a client could '
  'forge: the author, the business they claim to speak as, whether they may '
  'speak as one, the provider a shoutout names, the booking it cites, and when '
  'an open_today note ends (clamped to 24h — it says TODAY). On UPDATE a client '
  'role may change only the text and the optional service/area/timing fields. '
  'THE COUNTERS ARE CHECKED AGAINST THE TRUTH, NOT PINNED: pinning them blocked '
  'the counter triggers themselves, because a SECURITY DEFINER trigger still '
  'carries the caller''s JWT claim. A changed count must equal the real count — '
  'no marker to forge, no role to impersonate. service_role and no-claims '
  'sessions are carved out first, so erasure cascades work.';
