-- Booking & Onboarding Integrity — requirement A, the read half.
--
-- ══ WHY A NEW FUNCTION AND NOT A FIX TO THE OLD ONE ═══════════════════════
--
-- `contract_for_booking` (`20261038000000`) answers a DIFFERENT question, and it
-- is still the right answer to it: *"which contract must this client accept
-- before booking?"* That is necessarily the CURRENT active contract, and it is
-- client-only because a provider does not need it.
--
-- What was missing is the other question: *"what did this client actually
-- accept?"* — which must return the exact version, must keep returning it after
-- the provider edits their contract, and must be answerable by BOTH parties,
-- because an acceptance record only one side can see is not a record either can
-- rely on.
--
-- Two questions, two functions. Folding them together would mean one of the two
-- callers silently getting the wrong document.

create or replace function public.booking_contract_record(p_booking_id uuid)
returns table (
  booking_id uuid,
  client_user_id uuid,
  provider_id uuid,
  contract_id uuid,
  contract_version_id uuid,
  version_no integer,
  title text,
  body text,
  contract_type text,
  pdf_url text,
  pdf_filename text,
  accepted_at timestamptz,
  status text,
  provider_contract_changed_since boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    s.client_user_id,
    b.provider_id,
    s.contract_id,
    s.contract_version_id,
    v.version_no,
    v.title,
    v.body,
    v.contract_type,
    v.pdf_url,
    v.pdf_filename,
    s.signed_at,
    s.status,
    -- AUDITABILITY, stated as a fact rather than implied by a version number.
    -- True when the provider has edited their contract since this acceptance, so
    -- a surface can say "the provider's current agreement differs from the one
    -- accepted here" instead of leaving both parties to compare two documents.
    exists (
      select 1 from public.contract_versions v2
       where v2.contract_id = s.contract_id
         and v2.version_no > coalesce(v.version_no, 0)
    )
  from public.bookings b
  join public.contract_signatures s on s.booking_id = b.id
  left join public.contract_versions v on v.id = s.contract_version_id
  where b.id = p_booking_id
    -- BOTH PARTIES, and nobody else. The client who accepted, and the provider
    -- whose contract it is — established from the transaction, never from a role.
    and (
      s.client_user_id = (select auth.uid())
      or exists (select 1 from public.providers p
                  where p.id = b.provider_id and p.user_id = (select auth.uid()))
    );
$$;

alter function public.booking_contract_record(uuid) owner to postgres;
revoke all on function public.booking_contract_record(uuid) from public, anon;
grant execute on function public.booking_contract_record(uuid) to authenticated, service_role;

comment on function public.booking_contract_record(uuid) is
  'What was ACTUALLY accepted for this booking: the exact contract version, who '
  'accepted it and when, readable by BOTH the client who accepted and the '
  'provider whose contract it is. Distinct from contract_for_booking, which '
  'answers "what must be accepted to book NOW" and therefore returns the current '
  'active contract — folding the two together would hand one caller the wrong '
  'document. Returns provider_contract_changed_since so a surface can say the '
  'provider has edited their agreement since, rather than leaving two people to '
  'diff it themselves.';

-- ── The acceptance's version binding is immutable, like its other targets ──
--
-- `enforce_signature_target_immutable` (`20261036000000`) already pins
-- contract_id, booking_id and client_user_id. The version is the same kind of
-- fact and needs the same protection: an acceptance that could be re-pointed at
-- a different version is not a record of anything.
--
-- Carried forward from the live body with ONE conjunct added.
create or replace function public.enforce_signature_target_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contract_id is distinct from old.contract_id
     or new.booking_id is distinct from old.booking_id
     or new.client_user_id is distinct from old.client_user_id
     -- ADDED 20261069000000. Null -> non-null is permitted exactly once, so the
     -- backfill and a late binding can complete; non-null -> anything else is
     -- refused, which is the property that matters.
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

comment on function public.enforce_signature_target_immutable() is
  'LIVE DEFINITION: 20261069000000. Pins contract_id, booking_id, client_user_id '
  'and — since Session "Booking & Onboarding Integrity" — contract_version_id, '
  'which may go from null to a value once (the backfill) and never change after. '
  'An acceptance that can be re-pointed at a different version records nothing.';
