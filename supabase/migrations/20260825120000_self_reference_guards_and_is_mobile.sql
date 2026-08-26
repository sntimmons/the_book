-- Self-reference guards + providers.is_mobile
--
-- Investigation found that a user who owns a provider can act on their OWN
-- provider: self-follow, self-save, self-conversation, self-booking, and
-- (via a self-booking) self-review. None of the existing RLS policies check
-- whether the acting user owns the target provider — they only check that the
-- actor column equals auth.uid().
--
-- MECHANISM CHOICE — BEFORE INSERT/UPDATE trigger, not a CHECK and not RLS:
--   * A table CHECK constraint cannot express this rule: it requires looking up
--     providers.user_id for the row's provider_id, and CHECK constraints may not
--     contain subqueries / reference other tables.
--   * Tightening the RLS `with check` clauses would work for the normal client
--     path, but RLS is evaluated per-role and is BYPASSED by the service role
--     (the app has server code on the service-role key). It also couples the
--     rule to auth.uid() rather than to the data itself.
--   * A BEFORE INSERT/UPDATE trigger enforces the invariant unconditionally, for
--     every writer (authenticated, anon, and service role), keyed off the row's
--     own columns vs providers.user_id. That is "at the database, not just the
--     UI." One reusable function is parameterised by the actor column name.

-- ── is_mobile column ────────────────────────────────────────────────────────
-- AvailabilityEditor and go-live persist a "mobile provider" flag; the column
-- did not exist. Nullable-safe with a default so existing rows read as false.
alter table public.providers
  add column if not exists is_mobile boolean not null default false;

-- ── reusable self-reference guard ───────────────────────────────────────────
-- TG_ARGV[0] is the name of the column on the NEW row that holds the acting
-- user's id. We compare it to the owner (providers.user_id) of NEW.provider_id.
create or replace function public.reject_self_provider_action()
returns trigger
language plpgsql
as $$
declare
  actor_col text := tg_argv[0];
  actor_id  uuid;
  owner_id  uuid;
begin
  actor_id := (to_jsonb(new) ->> actor_col)::uuid;

  -- Nothing to compare against; let other constraints handle nulls.
  if actor_id is null or new.provider_id is null then
    return new;
  end if;

  select user_id into owner_id
  from public.providers
  where id = new.provider_id;

  if owner_id is not null and owner_id = actor_id then
    raise exception
      'self-referential row on % rejected: user % owns provider %',
      tg_table_name, actor_id, new.provider_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ── a) provider_follows: actor = follower_user_id ───────────────────────────
drop trigger if exists trg_no_self_follow on public.provider_follows;
create trigger trg_no_self_follow
  before insert or update on public.provider_follows
  for each row execute function public.reject_self_provider_action('follower_user_id');

-- ── b) saved_providers: actor = user_id ─────────────────────────────────────
drop trigger if exists trg_no_self_save on public.saved_providers;
create trigger trg_no_self_save
  before insert or update on public.saved_providers
  for each row execute function public.reject_self_provider_action('user_id');

-- ── c) conversation: actor = client_id ──────────────────────────────────────
drop trigger if exists trg_no_self_conversation on public.conversation;
create trigger trg_no_self_conversation
  before insert or update on public.conversation
  for each row execute function public.reject_self_provider_action('client_id');

-- ── d) bookings: actor = user_id (the client) ───────────────────────────────
drop trigger if exists trg_no_self_booking on public.bookings;
create trigger trg_no_self_booking
  before insert or update on public.bookings
  for each row execute function public.reject_self_provider_action('user_id');

-- ── e) provider_reviews: actor = reviewer_user_id ───────────────────────────
drop trigger if exists trg_no_self_review on public.provider_reviews;
create trigger trg_no_self_review
  before insert or update on public.provider_reviews
  for each row execute function public.reject_self_provider_action('reviewer_user_id');
