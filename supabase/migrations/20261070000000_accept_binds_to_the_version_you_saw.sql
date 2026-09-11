-- Booking & Onboarding Integrity — requirement A, closing the last gap.
--
-- ══ THE GAP ═══════════════════════════════════════════════════════════════
--
-- `20261068000000` gave acceptances a version to bind to, and `20261069000000`
-- gave both parties a way to revisit it. Neither tells the CLIENT which version
-- it is looking at, so the acceptance write had nothing to bind.
--
-- Without this the binding would have to be inferred at write time — "the latest
-- version of this contract" — which is a race: a provider editing their contract
-- between the client reading it and accepting it would bind the acceptance to a
-- document the client never saw. Narrow, but it is the exact failure this whole
-- requirement exists to prevent, so the version travels with the document.
--
-- The function is DROPPED and recreated because its return type changes; the
-- body is otherwise carried forward unchanged from `20261038000000`, including
-- the boundary that is the point of it — `b.user_id = auth.uid()`, which fails
-- closed for anon and for a no-JWT request.
drop function if exists public.contract_for_booking(uuid);

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
  updated_at timestamptz,
  current_version_id uuid,
  current_version_no integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_id, c.title, c.body, c.contract_type,
         c.pdf_url, c.pdf_filename, c.is_active, c.created_at, c.updated_at,
         v.id, v.version_no
    from public.bookings b
    join public.contracts c on c.provider_id = b.provider_id
    -- The newest version, which is the one whose content `c` currently holds.
    left join lateral (
      select cv.id, cv.version_no from public.contract_versions cv
       where cv.contract_id = c.id
       order by cv.version_no desc limit 1
    ) v on true
   where b.id = p_booking_id
     and b.user_id = (select auth.uid())
     and c.is_active;
$$;

alter function public.contract_for_booking(uuid) owner to postgres;
revoke all on function public.contract_for_booking(uuid) from public, anon;
grant execute on function public.contract_for_booking(uuid) to authenticated, service_role;

comment on function public.contract_for_booking(uuid) is
  'LIVE DEFINITION: 20261070000000. The contract this client must accept to book '
  'NOW — necessarily the current active one — plus the id of the version whose '
  'content it is returning, so the acceptance binds to the document the client '
  'actually saw rather than to whatever is latest at write time. To read what was '
  'ALREADY accepted, use booking_contract_record: this one deliberately follows '
  'the provider''s edits and that one deliberately does not.';

-- ── An acceptance must name the version it accepted ───────────────────────
--
-- Enforced rather than left to the client, because a client that forgets is a
-- record with no document attached, and the whole requirement is that the record
-- says what was accepted. Pre-existing rows are exempt: they were backfilled and
-- the column is already set, and rows created before this migration cannot
-- retroactively be made to know something nothing recorded.
create or replace function public.enforce_signature_names_a_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.contract_version_id is null then
    raise exception 'A contract acceptance must record which version was accepted.'
      using errcode = 'check_violation';
  end if;
  -- And the version must belong to the contract being accepted. Binding an
  -- acceptance to another provider's version would produce a record that reads
  -- correctly and points at the wrong document.
  if not exists (
    select 1 from public.contract_versions v
     where v.id = new.contract_version_id and v.contract_id = new.contract_id
  ) then
    raise exception 'That contract version does not belong to this contract.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_signature_names_a_version() owner to postgres;
revoke all on function public.enforce_signature_names_a_version()
  from public, anon, authenticated;

drop trigger if exists zz_signature_names_a_version on public.contract_signatures;
create trigger zz_signature_names_a_version
  before insert on public.contract_signatures
  for each row execute function public.enforce_signature_names_a_version();
