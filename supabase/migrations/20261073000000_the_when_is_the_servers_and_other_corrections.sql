-- FORWARD CORRECTION to 20261068000000 … 20261072000000.
--
-- From the focused security review of this branch. Every item below is a defect
-- introduced by this branch, and two of them sit inside the requirement the
-- branch is named for.
--
-- ══ 1. THE "WHEN" WAS THE ONLY PART THE CLIENT CHOSE ══════════════════════
--
-- `20261068000000` says the record holds *"WHO accepted WHICH EXACT DOCUMENT and
-- WHEN"*. The who is pinned by RLS, the which by an immutable version binding —
-- and the WHEN was `new Date().toISOString()` sent from the phone, with nothing
-- stamping, clamping or checking it.
--
-- This codebase server-stamps every comparable field: `messages.created_at`,
-- `conversation.request_opened_at`, `bookings.submitted_at`,
-- `no_show_reports.created_at`, `barter_obligations.delivered_at`. Even the two
-- tables added in THIS branch default their own `created_at` to
-- `clock_timestamp()`. The acceptance's own timestamp was the one that did not.
--
-- A backdated acceptance is not a cosmetic problem: it can be made to look
-- contemporaneous with — or older than — a contract version it actually
-- post-dates, which is precisely the comparison the whole record exists to
-- support.
create or replace function public.enforce_signature_signed_at_is_the_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `service_role` and no-claims sessions keep the column as given: backfills,
  -- support corrections and erasure paths legitimately write historical values,
  -- and this codebase's own erasure carve-outs depend on that shape.
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.signed_at := clock_timestamp();
  elsif new.signed_at is distinct from old.signed_at then
    raise exception 'The time an agreement was accepted cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_signature_signed_at_is_the_server() owner to postgres;
revoke all on function public.enforce_signature_signed_at_is_the_server()
  from public, anon, authenticated;

-- `a_` so it sorts EARLY — before the version check and before the immutability
-- check, both of which should see the stamped value. Trigger order is name
-- order, and `20261058000000` is the record of what happens when that is assumed
-- rather than arranged.
drop trigger if exists a_signature_signed_at_server on public.contract_signatures;
create trigger a_signature_signed_at_server
  before insert or update on public.contract_signatures
  for each row execute function public.enforce_signature_signed_at_is_the_server();

-- ══ 2. A DRAFT'S PHOTOS ARE NOT THE PROVIDER'S TO SEE ═════════════════════
--
-- `booking_photos_participants_read` is SECURITY INVOKER, so its `bookings` join
-- runs under the provider's own RLS — which requires `submitted_at is not null`
-- (`20261037000000`), because a draft is invisible to the provider by design.
-- `can_read_booking_photo` is SECURITY DEFINER and made the identical join with
-- RLS bypassed, so the TABLE said no and the BUCKET said yes.
--
-- Reachable without any crafted client: photos upload BEFORE the request is
-- submitted, so a send refused by a block, a de-approval or a write failure
-- leaves them attached to a draft that was never sent — including one from a
-- person who blocked that provider.
create or replace function public.can_read_booking_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.booking_reference_photos rp
      join public.bookings b on b.id = rp.booking_id
     where rp.storage_path = object_name
       and (
         -- The client sees their own attachments at any stage, including on a
         -- draft they have not sent — they are the person who chose them.
         b.user_id = (select auth.uid())
         or (
           -- The provider sees them only once the request has actually been
           -- SENT, matching what the bookings policy already tells them.
           b.submitted_at is not null
           and exists (select 1 from public.providers p
                        where p.id = b.provider_id and p.user_id = (select auth.uid()))
         )
       )
  );
$$;

alter function public.can_read_booking_photo(text) owner to postgres;
revoke all on function public.can_read_booking_photo(text) from public, anon;
grant execute on function public.can_read_booking_photo(text) to authenticated;

-- The same conjunct on the acceptance record, for the same reason: a provider
-- has no business reading the contract record of a request that was never sent.
create or replace function public.booking_contract_record(p_booking_id uuid)
returns table (
  booking_id uuid, client_user_id uuid, provider_id uuid, contract_id uuid,
  contract_version_id uuid, version_no integer, title text, body text,
  contract_type text, pdf_url text, pdf_filename text, accepted_at timestamptz,
  status text, provider_contract_changed_since boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, s.client_user_id, b.provider_id, s.contract_id, s.contract_version_id,
    v.version_no, v.title, v.body, v.contract_type, v.pdf_url, v.pdf_filename,
    s.signed_at, s.status,
    exists (select 1 from public.contract_versions v2
             where v2.contract_id = s.contract_id
               and v2.version_no > coalesce(v.version_no, 0))
  from public.bookings b
  join public.contract_signatures s on s.booking_id = b.id
  left join public.contract_versions v on v.id = s.contract_version_id
  where b.id = p_booking_id
    and (
      s.client_user_id = (select auth.uid())
      or (
        b.submitted_at is not null
        and exists (select 1 from public.providers p
                     where p.id = b.provider_id and p.user_id = (select auth.uid()))
      )
    );
$$;

alter function public.booking_contract_record(uuid) owner to postgres;
revoke all on function public.booking_contract_record(uuid) from public, anon;
grant execute on function public.booking_contract_record(uuid) to authenticated, service_role;

-- ══ 3. "AT MOST THREE" MUST HOLD AGAINST A CONCURRENT CLIENT ══════════════
--
-- Count-then-insert with no lock: two concurrent inserts at n=2 both read 2,
-- both pass. The unique constraint is on `(booking_id, storage_path)`, which
-- distinct paths satisfy, so nothing behind it catches the race. A transaction
-- advisory lock keyed on the booking serialises inserts for ONE booking only.
create or replace function public.enforce_booking_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.booking_id::text, 0));
  select count(*) into v_n from public.booking_reference_photos
   where booking_id = new.booking_id;
  if v_n >= 3 then
    raise exception 'A booking request may have at most three reference photos.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_booking_photo_limit() owner to postgres;
revoke all on function public.enforce_booking_photo_limit()
  from public, anon, authenticated;

-- ══ 4. A CARVE-OUT I REMOVED WITHOUT SAYING SO ════════════════════════════
--
-- `20261069000000` claimed to carry the live body forward "with ONE conjunct
-- added". It also DROPPED the `service_role` early return that
-- `20261036000000` had deliberately kept, with its reasoning written out:
-- *"service_role keeps its escape so account-erasure and support paths are
-- unaffected."* Strictly stricter, so nothing was exposed — but an intentional
-- carve-out was deleted by a change that said it was adding one thing.
create or replace function public.enforce_signature_target_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.contract_id is distinct from old.contract_id
     or new.booking_id is distinct from old.booking_id
     or new.client_user_id is distinct from old.client_user_id
     or (old.contract_version_id is not null
         and new.contract_version_id is distinct from old.contract_version_id) then
    raise exception 'A signature cannot be moved to another contract, booking or signer.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_signature_target_immutable() owner to postgres;
revoke all on function public.enforce_signature_target_immutable()
  from public, anon, authenticated;

-- ══ 5. DELETING A CONTRACT WITH ACCEPTANCES, DECIDED RATHER THAN INHERITED ═
--
-- `contract_versions` cascades from `contracts`, and its immutability trigger
-- fires on the cascaded DELETE with the provider's JWT in scope — so a provider
-- deleting their own contract now fails with *"A contract version cannot be
-- changed once recorded."* That outcome is RIGHT (before this branch, that
-- delete cascaded away every client's acceptance row) but it arrived by accident
-- and the message names the wrong object.
--
-- Made deliberate, with a message that says what actually happened. A contract
-- nobody has accepted is still freely deletable.
create or replace function public.enforce_contract_delete_keeps_evidence()
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
  if exists (select 1 from public.contract_signatures s where s.contract_id = old.id) then
    raise exception 'This agreement has been accepted by a client and cannot be deleted. '
                    'Edit it instead — past bookings keep the version they accepted.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

alter function public.enforce_contract_delete_keeps_evidence() owner to postgres;
revoke all on function public.enforce_contract_delete_keeps_evidence()
  from public, anon, authenticated;

drop trigger if exists a_contract_delete_keeps_evidence on public.contracts;
create trigger a_contract_delete_keeps_evidence
  before delete on public.contracts
  for each row execute function public.enforce_contract_delete_keeps_evidence();

-- ══ 6. TABLE OWNERSHIP, PINNED LIKE THE FUNCTIONS ═════════════════════════
--
-- `snapshot_contract_version()` is pinned to `postgres`; the table it writes was
-- not. `contract_versions` has RLS on and NO insert policy, so the definer
-- insert works only because the function owner IS the table owner. If those ever
-- diverge, every contract create and edit fails.
alter table public.contract_versions owner to postgres;
alter table public.booking_reference_photos owner to postgres;
