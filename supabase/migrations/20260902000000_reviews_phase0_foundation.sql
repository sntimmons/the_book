-- Structured Two-Sided Reviews — Phase 0 foundation hardening.
--
-- This does NOT build the structured-review UI/schema. It hardens the EXISTING
-- review foundation so later phases build on a server-authoritative contract, and
-- fixes the pre-Phase-0 audit findings:
--   SEC-DATA-001 (HIGH)  provider→client review did not bind client_user_id to the booking.
--   SEC-DATA-002 (MED)   providers.average_rating/review_count leaked blind reviews.
--   SEC-DATA-003 (MED)   completed_at was provider-settable → reveal-clock manipulation.
--   SEC-RLS-001  (MED)   client_reviews reveal was TS-only (leak risk on any future read path).
--   CODE-DUP-001 (HIGH)  reveal predicate triplicated (TS + fn + redundant policy), < vs <=.
--   CODE-ARCH-002 (MED)  eligibility duplicated across two INSERT policies, no shared truth.
--   SEC-TRUTH-001 (LOW)  under_review did not actually block review submission.
--
-- Approved product model enforced here (DB is authoritative):
--   * eligibility = booking completed AND not under_review AND review window open;
--   * review window = 7 DAYS from the server-authoritative completed_at (ONE definition,
--     one boundary operator `<=`); after close, no new review may be submitted;
--   * blind reveal = counterpart review exists OR the 7-day window has closed,
--     AND the booking is eligible (completed, not under_review) — so under_review HOLDS reveal;
--   * completed_at is server-stamped on the completion transition and immutable thereafter;
--   * per-booking reviews (unique per direction) — repeat bookings review independently;
--   * providers.average_rating/review_count reflect REVEALED reviews only.

-- ── 1. Canonical review predicates (single source of truth) ───────────────────
-- One 7-day window definition, one `<=` boundary. All reveal/eligibility logic
-- derives from these; TypeScript no longer decides visibility of hidden reviews.

create or replace function public.review_window_closed(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and b.completed_at is not null
      and b.completed_at <= now() - interval '7 days'
  );
$$;
alter function public.review_window_closed(uuid) owner to postgres;
revoke all on function public.review_window_closed(uuid) from public;

-- Is this booking reviewable right now? Anchored on the immutable, server-stamped
-- completed_at (NOT live status) so a provider cannot block/suppress a review by
-- transitioning a completed booking to cancelled/no_show (SEC-DATA-101). A genuine
-- void is expressed via under_review (dispute hold), which is service_role-only.
create or replace function public.review_eligible(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and b.completed_at is not null
      and b.under_review = false
  ) and not public.review_window_closed(p_booking_id);
$$;
alter function public.review_eligible(uuid) owner to postgres;
revoke all on function public.review_eligible(uuid) from public;

-- Reveal for a client→provider (public reputation) review on this booking.
-- Held while under_review; revealed on counterpart OR window close.
create or replace function public.provider_review_revealed(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  -- Anchored on completed_at (latched, immutable) not live status, so reveal cannot
  -- regress once earned; held only by under_review (dispute, service_role-only).
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id and b.completed_at is not null and b.under_review = false
  )
  and (
    exists (select 1 from public.client_reviews cr where cr.booking_id = p_booking_id)
    or public.review_window_closed(p_booking_id)
  );
$$;
alter function public.provider_review_revealed(uuid) owner to postgres;
revoke all on function public.provider_review_revealed(uuid) from public;

-- Reveal for a provider→client (conduct reputation) review on this booking.
-- Symmetric counterpart is the provider_reviews row. Provided so any FUTURE
-- cross-provider read path is DB-gated (Phase 0 keeps client_reviews author-only).
create or replace function public.client_review_revealed(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id and b.completed_at is not null and b.under_review = false
  )
  and (
    exists (select 1 from public.provider_reviews pr where pr.booking_id = p_booking_id)
    or public.review_window_closed(p_booking_id)
  );
$$;
alter function public.client_review_revealed(uuid) owner to postgres;
revoke all on function public.client_review_revealed(uuid) from public;

-- ── 2. INSERT policies: bind participant + direction + eligibility ────────────
-- Eligibility (completed / not under_review / window open) is centralized in
-- review_eligible(); the policies add the per-direction participant binding.

-- client→provider: reviewer is the booking's client; provider matches; eligible.
drop policy if exists "provider_reviews_insert_bound" on public.provider_reviews;
create policy "provider_reviews_insert_bound" on public.provider_reviews
  for insert to authenticated
  with check (
    auth.uid() = reviewer_user_id
    and exists (
      select 1 from public.bookings b
      where b.id = provider_reviews.booking_id
        and b.user_id = auth.uid()
        and b.provider_id = provider_reviews.provider_id
    )
    and public.review_eligible(provider_reviews.booking_id)
  );

-- provider→client: SEC-DATA-001 — client_user_id MUST equal the booking's user_id;
-- reviewer_provider_id is the booking's provider and owned by the caller; eligible.
drop policy if exists "client_reviews_insert_bound" on public.client_reviews;
create policy "client_reviews_insert_bound" on public.client_reviews
  for insert to authenticated
  with check (
    auth.uid() in (select p.user_id from public.providers p where p.id = client_reviews.reviewer_provider_id)
    and exists (
      select 1 from public.bookings b
      where b.id = client_reviews.booking_id
        and b.provider_id = client_reviews.reviewer_provider_id
        and b.user_id = client_reviews.client_user_id   -- ← binds the reviewed client (SEC-DATA-001)
    )
    and public.review_eligible(client_reviews.booking_id)   -- completed_at-anchored eligibility
  );

-- ── 3. provider_reviews SELECT: ONE authoritative reveal gate ─────────────────
-- CODE-DUP-001: drop the redundant inline policy so visibility is not widened by
-- an OR of two definitions; keep a single function-based gate.
drop policy if exists "provider_reviews_read_revealed" on public.provider_reviews;
drop policy if exists "provider_reviews_read" on public.provider_reviews;
create policy "provider_reviews_read" on public.provider_reviews
  for select
  using (auth.uid() = reviewer_user_id or public.provider_review_revealed(booking_id));

-- client_reviews SELECT stays AUTHOR-ONLY (a provider reads reviews they wrote;
-- clients never read this table). This is not a cross-user leak. A future
-- cross-provider client-reputation read path MUST gate on client_review_revealed()
-- — the DB (not TypeScript) is the privacy boundary. (SEC-RLS-001 prepared.)
-- provider_select_own_client_reviews is left as-is (author scope, already correct).

-- ── 4. Revealed-only provider aggregate (SEC-DATA-002) ───────────────────────
-- Recompute providers.average_rating/review_count over REVEALED provider_reviews
-- only, so a blind review never changes the publicly-consumable aggregate. A
-- counterpart client_review (which reveals the provider review) triggers a
-- recompute; purely time-based (window-close) reveal makes the stored value
-- conservative until the next write — the display path derives from revealed rows.
create or replace function public.recompute_provider_rating_for(p_provider_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.providers
  set average_rating = coalesce(
        (select round(avg(pr.rating)::numeric, 2)
           from public.provider_reviews pr
          where pr.provider_id = p_provider_id
            and public.provider_review_revealed(pr.booking_id)), 0),
      review_count = (
        select count(*) from public.provider_reviews pr
         where pr.provider_id = p_provider_id
           and public.provider_review_revealed(pr.booking_id))
  where id = p_provider_id;
end;
$$;
alter function public.recompute_provider_rating_for(uuid) owner to postgres;
revoke all on function public.recompute_provider_rating_for(uuid) from public;

create or replace function public.recompute_provider_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_provider_rating_for(coalesce(new.provider_id, old.provider_id));
  return coalesce(new, old);
end;
$$;
alter function public.recompute_provider_rating() owner to postgres;
revoke all on function public.recompute_provider_rating() from public;  -- SEC-TRIGGER-201 (trigger fn; not directly callable, revoked for consistency)

-- A client_review insert/delete reveals/unreveals the counterpart provider review,
-- so refresh that booking's provider aggregate too.
create or replace function public.recompute_provider_rating_on_client_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_provider_id uuid;
begin
  select b.provider_id into v_provider_id
  from public.bookings b
  where b.id = coalesce(new.booking_id, old.booking_id);
  if v_provider_id is not null then
    perform public.recompute_provider_rating_for(v_provider_id);
  end if;
  return coalesce(new, old);
end;
$$;
alter function public.recompute_provider_rating_on_client_review() owner to postgres;
revoke all on function public.recompute_provider_rating_on_client_review() from public;

drop trigger if exists client_reviews_recompute_provider_rating on public.client_reviews;
create trigger client_reviews_recompute_provider_rating
  after insert or delete on public.client_reviews
  for each row execute function public.recompute_provider_rating_on_client_review();

-- ── 5. Server-authoritative completed_at (SEC-DATA-003) ──────────────────────
-- Extend the SB3b booking write-integrity trigger: on the completion transition a
-- non-service_role write has completed_at SERVER-STAMPED (client value ignored),
-- and once completed the timestamp is immutable (no backdate/future-date/mutate/
-- clear). All other SB3b behavior is preserved verbatim.
create or replace function public.enforce_booking_write_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_client   boolean;
  is_provider boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status                     := 'pending';
    new.payment_status             := 'unpaid';
    new.completed_at               := null;
    new.client_checked_in_at       := null;
    new.provider_confirmed_at      := null;
    new.provider_first_response_at := null;
    new.no_show_flag               := false;
    new.payment_finalized          := false;
    new.payment_authorized_at      := null;
    new.payment_captured_at        := null;
    new.capture_scheduled_for      := null;
    new.refund_status              := 'none';
    new.under_review               := false;
    new.dispute_flag               := false;
    new.cancelled_at               := null;
    new.cancelled_by               := null;
    new.cancellation_actor         := null;
    new.cancellation_reason        := null;
    new.stripe_payment_intent_id   := null;
    new.stripe_last_event_id       := null;
    new.stripe_last_event_at       := null;
    new.admin_resolution_notes     := null;
    new.issue_reported             := false;
    new.issue_reported_at          := null;
    new.issue_reason               := null;
    new.provider_safety_notes      := null;
    new.client_safety_notes        := null;
    return new;
  end if;

  -- tg_op = 'UPDATE'
  is_client   := (auth.uid() = old.user_id);
  is_provider := exists (
    select 1 from public.providers p
    where p.id = old.provider_id and p.user_id = auth.uid()
  );

  if new.id                       is distinct from old.id
     or new.user_id               is distinct from old.user_id
     or new.provider_id           is distinct from old.provider_id
     or new.service_id            is distinct from old.service_id
     or new.service_name          is distinct from old.service_name
     or new.requested_date        is distinct from old.requested_date
     or new.requested_time        is distinct from old.requested_time
     or new.appointment_time      is distinct from old.appointment_time
     or new.message               is distinct from old.message
     or new.created_at            is distinct from old.created_at
     or new.payment_amount        is distinct from old.payment_amount
     or new.payment_status        is distinct from old.payment_status
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.payment_authorized_at is distinct from old.payment_authorized_at
     or new.payment_captured_at   is distinct from old.payment_captured_at
     or new.stripe_last_event_id  is distinct from old.stripe_last_event_id
     or new.stripe_last_event_at  is distinct from old.stripe_last_event_at
     or new.capture_scheduled_for is distinct from old.capture_scheduled_for
     or new.payment_finalized     is distinct from old.payment_finalized
     or new.refund_status         is distinct from old.refund_status
     or new.under_review          is distinct from old.under_review
     or new.dispute_flag          is distinct from old.dispute_flag
     or new.admin_resolution_notes is distinct from old.admin_resolution_notes
     or new.client_checked_in_at  is distinct from old.client_checked_in_at
     or new.cancellation_reason   is distinct from old.cancellation_reason
     or new.provider_safety_notes is distinct from old.provider_safety_notes
     or new.client_safety_notes   is distinct from old.client_safety_notes
     or new.issue_reported        is distinct from old.issue_reported
     or new.issue_reported_at     is distinct from old.issue_reported_at
     or new.issue_reason          is distinct from old.issue_reason
  then
    raise exception 'Booking field is not user-editable'
      using errcode = 'check_violation';
  end if;

  if is_client and not is_provider then
    if new.status is distinct from old.status and new.status <> 'cancelled_by_client' then
      raise exception 'Clients may only author status cancelled_by_client'
        using errcode = 'check_violation';
    end if;
    if new.provider_confirmed_at      is distinct from old.provider_confirmed_at
       or new.provider_first_response_at is distinct from old.provider_first_response_at
       or new.completed_at            is distinct from old.completed_at
       or new.no_show_flag            is distinct from old.no_show_flag
    then
      raise exception 'Clients may not set provider-controlled booking fields'
        using errcode = 'check_violation';
    end if;
    if new.status = 'cancelled_by_client' then
      if new.cancellation_actor is distinct from 'client' then
        raise exception 'cancellation_actor must be client' using errcode = 'check_violation';
      end if;
      if new.cancelled_by is not null and new.cancelled_by <> auth.uid()::text then
        raise exception 'cancelled_by must be the cancelling client' using errcode = 'check_violation';
      end if;
    end if;

  elsif is_provider then
    if new.status is distinct from old.status
       and new.status not in ('accepted', 'cancelled_by_provider', 'completed', 'no_show') then
      raise exception 'Providers may not author status %', new.status
        using errcode = 'check_violation';
    end if;
    if new.status = 'accepted' then
      if new.completed_at        is distinct from old.completed_at
         or new.cancelled_at     is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'Only accept fields may change when accepting' using errcode = 'check_violation'; end if;

    elsif new.status = 'cancelled_by_provider' then
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.completed_at     is distinct from old.completed_at
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'Only provider-cancel fields may change when cancelling' using errcode = 'check_violation'; end if;
      if new.cancellation_actor is distinct from 'provider' then
        raise exception 'cancellation_actor must be provider' using errcode = 'check_violation'; end if;
      if new.cancelled_by is not null and new.cancelled_by <> auth.uid()::text then
        raise exception 'cancelled_by must be the cancelling provider' using errcode = 'check_violation'; end if;

    elsif new.status = 'completed' then
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.cancelled_at     is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'Only completed_at may change when completing' using errcode = 'check_violation'; end if;
      -- SEC-DATA-003 / SEC-DATA-201: completed_at is SERVER-authoritative and
      -- stamped exactly ONCE — on the FIRST-EVER completion. Keying on
      -- `old.completed_at is null` (not `old.status <> 'completed'`) means a status
      -- round-trip (completed → accepted/no_show → completed) can NOT re-stamp it:
      -- completed_at survives those transitions (each branch forbids changing it), so
      -- on any later re-completion it is already set and is held immutable. This keeps
      -- the review window and any achieved reveal from being reset by a provider.
      if old.completed_at is null then
        -- first completion: stamp server time, ignore any supplied value.
        new.completed_at := now();
      else
        -- already completed at some point: the review-clock anchor is immutable.
        if new.completed_at is distinct from old.completed_at then
          raise exception 'completed_at is immutable once set' using errcode = 'check_violation';
        end if;
      end if;

    elsif new.status = 'no_show' then
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.completed_at     is distinct from old.completed_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
      then raise exception 'Only no_show fields may change on no_show' using errcode = 'check_violation'; end if;
      if new.no_show_flag is not true then
        raise exception 'no_show requires no_show_flag = true' using errcode = 'check_violation'; end if;

    else
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.completed_at     is distinct from old.completed_at
         or new.cancelled_at     is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'No valid provider action for this update' using errcode = 'check_violation'; end if;
    end if;
  end if;

  return new;
end;
$$;
alter function public.enforce_booking_write_integrity() owner to postgres;
revoke all on function public.enforce_booking_write_integrity() from public;

-- ── 6. Explicit EXECUTE grants (do not rely on default privileges) ───────────
-- Functions referenced directly in a caller-context RLS policy must be EXECUTE-able
-- by the calling role, or the guarded read/write fails closed (SEC-TRIGGER-102).
-- Internal helpers (called only from SECURITY DEFINER functions) get no direct
-- role grant, closing the anon existence-probe surface (SEC-RLS-103).
revoke execute on function public.review_window_closed(uuid) from anon, authenticated;
revoke execute on function public.client_review_revealed(uuid) from anon, authenticated;
grant execute on function public.review_eligible(uuid) to authenticated;               -- INSERT WITH CHECK policies
revoke execute on function public.review_eligible(uuid) from anon;
grant execute on function public.provider_review_revealed(uuid) to authenticated, anon; -- provider_reviews_read (public reputation)
