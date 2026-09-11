-- Reviews Phase 2 — PM ruling: **opening a dispute is not a reputation lever.**
--
-- ══ WHAT THE BRANCH SHIPPED, AND WHY PRODUCT REJECTED IT ══════════════════
--
-- `20261079000000` made the STORED rating recompute the moment a booking is
-- placed `under_review`, and `reviews_phase2.test.sql` § 5c pinned the result:
-- *"placing a booking under review drops it from the STORED rating too."* The
-- reasoning was that the row already vanished from reads, so the number people
-- see should vanish with it.
--
-- The reasoning was right about consistency and wrong about the product. It made
-- **filing a dispute** — an act, by one party, with no adjudication behind it yet
-- — into an immediate, unilateral reduction of another party's public rating. A
-- provider who disliked a 1-star could reach for the dispute path; so could a
-- client. Neither needs to be proven right. PD-068 is explicit that participants
-- never self-adjudicate, and this handed them an adjudication outcome for free.
--
-- ══ THE RULE ══════════════════════════════════════════════════════════════
--
--   * A review that is **NOT YET REVEALED** when a dispute opens **stays held**.
--     That is the blind window doing its job — nothing public is being retracted,
--     because nothing was public.
--   * A review that **WAS ALREADY REVEALED** when the dispute opened **stays
--     revealed and keeps counting**. Filing changes nothing.
--   * Only an operator RESOLUTION may later change eligibility or invalidate a
--     review, and only under an approved resolution rule. None exists yet, and
--     this migration deliberately does not invent one.
--
-- ══ HOW "ALREADY REVEALED" IS KNOWN WITHOUT STORING IT ════════════════════
--
-- Reveal is partly TIME-BASED — the 7-day window closing with no counterpart
-- review reveals a review with no write anywhere — so a `revealed_at` stamp
-- would be wrong the moment nobody happened to be writing. PD-070's shape
-- applies: **derive it from immutable facts, do not persist a verdict.**
--
-- The two facts that make a review revealed are both already immutable and
-- server-stamped: the counterpart review's `created_at` (`20261079000000`) and
-- the booking's `completed_at` (Phase 0). Add ONE more — the instant the hold
-- began — and "was it revealed when the dispute opened?" is a pure function of
-- the three. Nothing is cached, nothing can drift, and nothing about it is a
-- judgement call that could later be re-litigated.

-- ── 1. When the hold began ────────────────────────────────────────────────
alter table public.bookings
  add column if not exists under_review_at timestamptz;

comment on column public.bookings.under_review_at is
  'The instant this booking was placed under_review, stamped by the server. It '
  'is an INPUT TO REVEAL, not a status flag: a review already revealed when the '
  'hold began stays revealed, so filing a dispute cannot retract a public '
  'review. Cleared when the hold is lifted. Never client-settable — a chosen '
  'value would let a disputant pick which reviews their dispute suppresses.';

create or replace function public.stamp_under_review_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- NO service_role carve-out, deliberately, and against the local convention.
  -- Every neighbouring stamp lets service_role supply a value because backfills
  -- and erasure need it. This one decides which already-public reviews a dispute
  -- suppresses, and `under_review` is a service_role-only field to begin with —
  -- so the carve-out would hand the ONLY role that can open a hold the ability to
  -- choose its retroactive effect. There is nothing historical here to restore.
  if tg_op = 'INSERT' then
    new.under_review_at := case when new.under_review then pg_catalog.clock_timestamp() end;
    return new;
  end if;

  if new.under_review is distinct from old.under_review then
    new.under_review_at := case when new.under_review then pg_catalog.clock_timestamp() end;
  else
    -- Unchanged hold: the original instant survives any other booking write.
    new.under_review_at := old.under_review_at;
  end if;
  return new;
end;
$$;

alter function public.stamp_under_review_at() owner to postgres;
revoke all on function public.stamp_under_review_at() from public, anon, authenticated;

-- `zzz_` so it sorts AFTER `enforce_booking_write_integrity`, which forces
-- `under_review := false` for every non-service caller. Stamping before that
-- guard runs would record a hold that the guard then erases.
drop trigger if exists zzz_bookings_under_review_at_server on public.bookings;
create trigger zzz_bookings_under_review_at_server
  before insert or update on public.bookings
  for each row execute function public.stamp_under_review_at();

-- Holds that predate this column have no recorded start. Anchoring them at
-- `completed_at` makes the latch below evaluate FALSE for every one of them — a
-- counterpart review cannot pre-date completion and the 7-day window cannot have
-- closed before it — so each stays exactly as hidden as it is today. This
-- migration publishes nothing retroactively; that is the only safe direction when
-- the real instant is unknown.
update public.bookings
   set under_review_at = coalesce(completed_at, created_at)
 where under_review = true and under_review_at is null;

-- ── 2. Reveal latches ─────────────────────────────────────────────────────
--
-- Structure: reveal is the ordinary rule while there is no hold, and while there
-- IS a hold it is the ordinary rule **evaluated at the instant the hold began**.
-- Both branches read the same three immutable facts.
create or replace function public.provider_review_revealed(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
     where b.id = p_booking_id
       and b.completed_at is not null
       and (
         case when b.under_review then
           -- HELD. Only what was already public stays public. `under_review_at`
           -- is never null here (stamped by trigger, backfilled above), but the
           -- explicit test keeps a null failing CLOSED rather than comparing
           -- against null and silently revealing nothing — or everything.
           b.under_review_at is not null
           and (
             exists (select 1 from public.client_reviews cr
                      where cr.booking_id = b.id
                        and cr.created_at <= b.under_review_at)
             or b.completed_at <= b.under_review_at - interval '7 days'
           )
         else
           exists (select 1 from public.client_reviews cr where cr.booking_id = b.id)
           or public.review_window_closed(b.id)
         end
       )
  );
$$;
alter function public.provider_review_revealed(uuid) owner to postgres;
revoke all on function public.provider_review_revealed(uuid) from public;
grant execute on function public.provider_review_revealed(uuid) to authenticated, anon;

comment on function public.provider_review_revealed(uuid) is
  'Is the client''s review of this booking public? Revealed by the counterpart '
  'review or by the 7-day window closing. A dispute (`under_review`) HOLDS a '
  'review that was not yet revealed, and CANNOT retract one that was: while held, '
  'the same rule is evaluated as of `under_review_at`. Filing a dispute is '
  'therefore never a way to remove a public review or move a rating — only an '
  'operator resolution could be, and no resolution rule does so today.';

create or replace function public.client_review_revealed(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
     where b.id = p_booking_id
       and b.completed_at is not null
       and (
         case when b.under_review then
           b.under_review_at is not null
           and (
             exists (select 1 from public.provider_reviews pr
                      where pr.booking_id = b.id
                        and pr.created_at <= b.under_review_at)
             or b.completed_at <= b.under_review_at - interval '7 days'
           )
         else
           exists (select 1 from public.provider_reviews pr where pr.booking_id = b.id)
           or public.review_window_closed(b.id)
         end
       )
  );
$$;
alter function public.client_review_revealed(uuid) owner to postgres;
revoke all on function public.client_review_revealed(uuid) from public;

comment on function public.client_review_revealed(uuid) is
  'Symmetric counterpart of provider_review_revealed for the provider→client '
  'direction, latched the same way: a dispute holds what was not yet revealed and '
  'cannot retract what was. Phase 0 keeps client_reviews author-only, so this '
  'gates no read path today and exists so a future one is DB-gated rather than '
  'gated in TypeScript.';

-- ── 3. What this deliberately leaves alone ────────────────────────────────
--
-- `review_eligible` still refuses a NEW review while a booking is under_review.
-- That is not the same lever: it stops a fresh statement being added to a
-- contested record, and it takes nothing away from anyone. The ruling is about
-- retracting what is already published.
--
-- `zz_bookings_recompute_rating_on_hold` stays too. Under the latch, opening a
-- hold can no longer change the rating — an unrevealed review contributed
-- nothing, and a revealed one keeps contributing — so the recompute on that edge
-- is now a no-op that costs one statement. It is kept because LIFTING a hold
-- genuinely does change what is revealed, and because `completed_at` moving still
-- must recompute. The test suite pins the no-op, so a future change that makes
-- the hold move the number again fails rather than passes quietly.
comment on function public.recompute_rating_on_review_hold() is
  'Keeps the STORED provider reputation in step when a booking''s under_review or '
  'completed_at changes. NOTE since 20261082000000: OPENING a hold no longer '
  'changes the rating — reveal latches, so a published review keeps counting and '
  'an unpublished one was counting nothing. This trigger is here for the LIFT '
  'edge and for completed_at changes. If a change to it starts making the number '
  'drop when a dispute is filed, that is the ruling being reversed, not a bug fix.';
