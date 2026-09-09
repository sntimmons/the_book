-- Pre-Session-8 Correction 3 — contract access is scoped to the TRANSACTION.
--
-- ── WHAT CHANGED UNDER THIS, AND WHY IT MATTERS ───────────────────────────
--
-- Correction 2 added `provider_contract_for_booking(provider_id)` to unblock a
-- signing gate that had silently skipped for every client. It recorded its own
-- boundary honestly and said why it could not be narrower:
--
--   "Deliberately NOT booking-scoped: the booking row does not exist yet at that
--    point in the flow."
--
-- `20261037000000` removes that constraint. The booking now exists as a DRAFT
-- before the contract step, so the contract can be reached through the booking
-- the client actually holds — which is what item J asks for, and what Correction
-- 2 recorded as needing a product decision it was not authorised to take.
--
-- So the broad path is RETIRED, not merely supplemented. Keeping it would leave
-- "any authenticated user may read any live provider's contract" reachable
-- alongside a narrower path that nobody has to use.
--
-- ── WHAT THE NEW BOUNDARY IS ──────────────────────────────────────────────
--
--   the caller owns the booking  ->  they may read the contract of THAT
--                                    booking's provider, and no other.
--
-- Strictly narrower than what it replaces on every axis: it needs a real row the
-- caller owns rather than a provider id anyone can read off the public feed; it
-- cannot be enumerated, because guessing a booking id you do not own returns
-- nothing; and it drops the `is_approved` conjunct as unnecessary — the booking
-- IS the relationship, so a provider who has left the marketplace can still be
-- signed with by the clients who already booked them.
--
-- THAT ALSO CLOSES A DEFECT CORRECTION 2 SHIPPED. Its QA review found that
-- `and p.is_approved` reproduced the exact failure the RPC existed to fix — for a
-- de-approved provider the function returned zero rows and no error, so the flow
-- treated it as "no contract" and skipped signing again, silently, by the same
-- mechanism. There is no `is_approved` term here, so that cannot recur.

-- ── 1. The booking-scoped read ──────────────────────────────────────────────
create or replace function public.contract_for_booking(p_booking_id uuid)
returns table (
  id uuid,
  provider_id uuid,
  title text,
  body text,
  contract_type text,
  pdf_url text,
  pdf_filename text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_id, c.title, c.body, c.contract_type,
         c.pdf_url, c.pdf_filename, c.is_active, c.created_at, c.updated_at
    from public.bookings b
    join public.contracts c on c.provider_id = b.provider_id
   where b.id = p_booking_id
     -- THE WHOLE BOUNDARY. A definer function must re-establish its caller, and
     -- this one establishes them as the owner of the transaction rather than as
     -- merely authenticated. `auth.uid()` is null for anon and for a no-JWT
     -- request, so that case fails closed here as well as at the grant.
     and b.user_id = (select auth.uid())
     and c.is_active;
$$;

alter function public.contract_for_booking(uuid) owner to postgres;
revoke all on function public.contract_for_booking(uuid) from public, anon;
grant execute on function public.contract_for_booking(uuid) to authenticated;

comment on function public.contract_for_booking(uuid) is
  'The ACTIVE contract governing one booking, readable only by the client who '
  'owns that booking. Replaces provider_contract_for_booking, which was scoped to '
  'a provider id anyone could read off the public feed because the booking did '
  'not yet exist at that point in the flow; 20261037000000 creates the booking '
  'first, so the transaction is available to scope on. Returns no user_id.';

-- ── 2. Retire the broad path ────────────────────────────────────────────────
-- Dropped rather than left revoked. A retired function that still exists is a
-- function a later grant can quietly revive, and item J is explicit that the
-- broad provider-contract read path should not be retained once the flow can
-- scope through the booking.
drop function if exists public.provider_contract_for_booking(uuid);

-- ── 3. The PDF follows the same boundary ────────────────────────────────────
--
-- `20261036000000` widened `can_read_contract_pdf` to a prospective signer,
-- because the gate could otherwise be agreed to but not read. That disjunct was
-- bounded by "active contract of an approved provider" — the same broad shape
-- being retired above. It becomes booking-scoped for the same reason: the client
-- who must open this document is the one holding a booking with its provider.
--
-- Body taken from `20261036000000` § 2, which is its live definition, NOT the
-- `20260829060000` that created it — that file has no prospective-signer arm at
-- all and copying it forward would re-break the PDF gate.
create or replace function public.can_read_contract_pdf(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contracts c
    where c.pdf_url is not null
      and split_part(split_part(c.pdf_url, '/contract-pdfs/', 2), '?', 1) = object_name
      and (
        c.user_id = auth.uid()                 -- contract owner (provider)
        or public.is_contract_signer(c.id)     -- a client who signed THIS contract
        -- A PROSPECTIVE signer, now bound to a transaction rather than to any
        -- live provider: the caller holds a booking with this contract's
        -- provider, so this is the document they are actually being asked about.
        or (
          c.is_active
          and exists (
            select 1 from public.bookings b
            where b.provider_id = c.provider_id
              and b.user_id = (select auth.uid())
          )
        )
      )
  );
$$;

alter function public.can_read_contract_pdf(text) owner to postgres;
revoke all on function public.can_read_contract_pdf(text) from public, anon;
grant execute on function public.can_read_contract_pdf(text) to authenticated, service_role;

comment on function public.can_read_contract_pdf(text) is
  'Storage-policy helper for the private contract-pdfs bucket. Readable by the '
  'owning provider, by an existing signer, and — since 20261038000000 — by a '
  'client who holds a booking with that contract''s provider. The prospective-'
  'signer arm was previously bounded by "approved provider", which was broader '
  'than the transaction and shared the de-approved silent-skip defect.';
