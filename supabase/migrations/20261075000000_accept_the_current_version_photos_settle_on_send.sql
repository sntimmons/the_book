-- Final contract-integrity rulings, Booking & Onboarding Integrity.
--
-- ══ RULING A — A STALE ACCEPTANCE IS REFUSED ══════════════════════════════
--
-- `20261070000000` required an acceptance to NAME a version belonging to the
-- contract, and deliberately stopped there: binding to the version the client
-- SAW avoids a read/write race, and the security review of that branch recorded
-- the cost as SEC-DATA-004 — a repeat client of the same provider could re-use a
-- version uuid they already held and bind a NEW booking to OLD terms.
--
-- The ruling closes it: **a client may not newly accept an outdated version.**
-- If the provider changed the contract after the client opened it, the
-- acceptance is refused and the client must reload and accept the current one.
--
-- `PT429` is its own SQLSTATE so the client can say *the agreement changed* and
-- send them back to re-read it, rather than reporting a generic failure for
-- something that is neither the client's fault nor retryable as-is.
--
-- **WHAT THIS DOES NOT TOUCH.** Once accepted, the binding is permanent: later
-- provider edits never alter a historical acceptance. That is the opposite rule
-- and both are true — the newest version is required to ENTER an agreement, and
-- the accepted version is frozen the moment you do.
create or replace function public.enforce_signature_names_a_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.contract_version_id is null then
    raise exception 'A contract acceptance must record which version was accepted.'
      using errcode = 'check_violation';
  end if;

  select v.id into v_current
    from public.contract_versions v
   where v.contract_id = new.contract_id
   order by v.version_no desc
   limit 1;

  if v_current is null then
    raise exception 'That contract has no recorded version.' using errcode = 'check_violation';
  end if;

  -- Belongs to this contract AND is the current one. The first test alone let a
  -- repeat client name a version they held from an earlier booking.
  if new.contract_version_id is distinct from v_current then
    raise exception 'This agreement changed while you were reading it. '
                    'Please reopen it and accept the current version.'
      using errcode = 'PT429';
  end if;
  return new;
end;
$$;

alter function public.enforce_signature_names_a_version() owner to postgres;
revoke all on function public.enforce_signature_names_a_version()
  from public, anon, authenticated;

comment on function public.enforce_signature_names_a_version() is
  'An acceptance must name the CURRENT version of the contract it accepts '
  '(PT429 otherwise). Ruling A: a client may not newly bind a booking to stale '
  'terms, whether by racing a provider edit or by re-using a version uuid held '
  'from an earlier booking with the same provider. This is the ENTRY rule only — '
  'once accepted, the binding is permanent and later provider edits never alter '
  'a historical acceptance.';

-- ══ RULING B — PHOTOS SETTLE WHEN THE REQUEST IS SENT ═════════════════════
--
-- Before submission the client is still composing: add, remove and replace are
-- all theirs. **After the request is sent the photos are part of the
-- transaction record** the provider is deciding on, and pulling them out from
-- under that decision is not a composition act.
--
-- The DELETE policy allowed removal at any time, so a client could send a
-- request, let the provider read it, and then strip the evidence — leaving the
-- provider's accept or decline attached to context no longer in the record.
--
-- NO RETENTION PERIOD IS INVENTED here (Ruling C). This says only WHO may remove
-- a photo and WHEN, not how long the row lives.
drop policy if exists "booking_photos_client_delete" on public.booking_reference_photos;
create policy "booking_photos_client_delete" on public.booking_reference_photos
  for delete to authenticated
  using (
    uploaded_by_user_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
       where b.id = booking_id
         and b.user_id = (select auth.uid())
         -- STILL A DRAFT. `submitted_at` is the exact line between composing a
         -- request and having sent one (PD-071), which is the same line the
         -- provider's own visibility uses.
         and b.submitted_at is null
    )
  );

-- Belt and braces, because a policy can be widened by someone who does not know
-- this depends on it, and because the storage object must settle with the row.
create or replace function public.enforce_booking_photo_settles_on_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return old;
  end if;
  if exists (select 1 from public.bookings b
              where b.id = old.booking_id and b.submitted_at is not null) then
    raise exception 'This photo is part of a booking request that has been sent '
                    'and can no longer be removed.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

alter function public.enforce_booking_photo_settles_on_send() owner to postgres;
revoke all on function public.enforce_booking_photo_settles_on_send()
  from public, anon, authenticated;

drop trigger if exists zz_booking_photo_settles on public.booking_reference_photos;
create trigger zz_booking_photo_settles
  before delete on public.booking_reference_photos
  for each row execute function public.enforce_booking_photo_settles_on_send();

comment on table public.booking_reference_photos is
  'Reference photos a client attached to a booking request, so the PROVIDER can '
  'see them before deciding. At most three, server-enforced. **Before the request '
  'is sent the client may add, remove and replace freely; once sent they are part '
  'of the transaction record and cannot be removed** (Ruling B) — a provider''s '
  'accept or decline must not end up attached to context that was withdrawn '
  'afterwards. Erasure and retention are DELIBERATELY UNRESOLVED (Ruling C): '
  'rows cascade from bookings and auth.users, storage objects do not, and the '
  'final treatment is a decision for Operations, legal and account-deletion '
  'policy — not one to invent here.';
