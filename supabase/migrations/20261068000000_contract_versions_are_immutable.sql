-- Booking & Onboarding Integrity — requirement A. A CONTRACT ACCEPTANCE IS A
-- DURABLE TRANSACTION RECORD.
--
-- ══ THE DEFECT, WHICH IS NOT A MISSING FEATURE BUT A SILENT REWRITE ═══════
--
-- `public.contracts` is MUTABLE: a provider edits their agreement in place, and
-- `title`, `body`, `contract_type`, `pdf_url` and `pdf_filename` all change on
-- the same row. `contract_signatures.contract_id` points at that row.
--
-- So today, a provider who edits their contract **retroactively changes what
-- every past client is recorded as having accepted.** Nothing is logged, nothing
-- is versioned, and the acceptance row still says "signed" — of a document that
-- no longer exists in the form it was accepted in. `contract_for_booking`
-- (`20261038000000`) makes it visible: it joins `c.is_active`, so revisiting an
-- old booking shows TODAY'S contract, not the one that was agreed.
--
-- That is the opposite of what an acceptance record is for. The whole value of
-- one is that it says what was true at a moment and keeps saying it.
--
-- ══ THE FIX: VERSIONS, APPEND-ONLY, BOUND AT ACCEPTANCE ═══════════════════
--
-- `contract_versions` is an immutable snapshot of a contract's content. A new
-- row appears whenever the content actually changes — not on every UPDATE, so
-- toggling `is_active` or touching `updated_at` does not manufacture versions.
-- An acceptance binds to a VERSION, and that binding is immutable.
--
-- **A provider may still edit their contract freely.** Nothing here restricts
-- them. What changes is that editing creates a new version and leaves every
-- prior acceptance pointing at the version it actually accepted.
--
-- ── ON PDFs, WHICH COULD HAVE UNDONE THIS QUIETLY ─────────────────────────
--
-- A snapshot of `pdf_url` is only durable if the FILE it names is durable.
-- `uploadContractPdf` writes `<user>/contract_<timestamp>.pdf`, so a replacement
-- lands at a NEW path and the old object survives; no code deletes it. That is
-- what makes the snapshot honest, and it is a property to preserve — **if a
-- future change starts overwriting or cleaning up contract PDFs, this table
-- keeps a URL that no longer resolves and the acceptance record becomes a
-- promise the storage bucket cannot keep.**
--
-- ══ WHAT THIS DELIBERATELY DOES NOT CLAIM ═════════════════════════════════
--
-- This is DURABLE DOCUMENT ACCEPTANCE. It is not DocuSign-equivalent
-- infrastructure, not a verified legal e-signature, not a guarantee of
-- enforceability, and it does not prove the client read every word. It records
-- WHO accepted WHICH EXACT DOCUMENT and WHEN, durably, and that is the whole
-- claim — the beta copy must not exceed it.

-- ── 1. The immutable snapshot ─────────────────────────────────────────────
create table if not exists public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  version_no integer not null,

  -- The snapshot. Deliberately a COPY and not a reference: a contract that
  -- points at its source cannot survive the source changing, which is the whole
  -- defect being fixed.
  title text not null,
  body text not null default '',
  contract_type text not null,
  pdf_url text,
  pdf_filename text,

  created_at timestamptz not null default clock_timestamp(),

  constraint contract_versions_one_per_number unique (contract_id, version_no)
);

create index if not exists contract_versions_contract_idx
  on public.contract_versions (contract_id, version_no desc);

comment on table public.contract_versions is
  'An immutable snapshot of a provider contract''s content at a point in time. '
  'An acceptance binds to a VERSION, not to the mutable contracts row, so a '
  'provider editing their agreement can never retroactively change what a past '
  'client is recorded as having accepted. Append-only: no UPDATE for anyone, '
  'DELETE only for service_role and a no-claims session so account erasure still '
  'cascades. NOTE the storage dependency — pdf_url is durable only because '
  'contract PDFs are written to a timestamped path and never overwritten or '
  'cleaned up; if that changes, this table holds URLs that no longer resolve.';

alter table public.contract_versions enable row level security;
revoke all on public.contract_versions from public, anon, authenticated;
grant select on public.contract_versions to authenticated;
grant select, insert, update, delete on public.contract_versions to service_role;

-- The acceptance's binding column is added HERE, before the policy below, because
-- that policy references it. Ordering inside one migration is as real as
-- ordering between migrations, and the first version of this file put the
-- ALTER after the policy and failed to apply at all.
alter table public.contract_signatures
  add column if not exists contract_version_id uuid references public.contract_versions(id);

-- WHO MAY READ A VERSION: the provider who owns the contract, and any client who
-- ACCEPTED that version. Not "any client of that provider" — accepting one
-- version does not entitle you to read the others, because the others are not
-- your transaction.
drop policy if exists "contract_versions_owner_read" on public.contract_versions;
create policy "contract_versions_owner_read" on public.contract_versions
  for select to authenticated
  using (
    exists (select 1 from public.contracts c
             where c.id = contract_id and c.user_id = (select auth.uid()))
    or exists (select 1 from public.contract_signatures s
                where s.contract_version_id = contract_versions.id
                  and s.client_user_id = (select auth.uid()))
  );

-- ── 2. Append-only ────────────────────────────────────────────────────────
create or replace function public.enforce_contract_version_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Erasure cascades: a deleted provider or auth user must still be removable.
  -- Same carve-out as every other append-only table here (20261053000000
  -- exists because it was once forgotten and made provider deletion impossible).
  if tg_op = 'DELETE' and (select auth.role()) = 'service_role' then
    return old;
  end if;
  if tg_op = 'DELETE'
     and (select auth.role()) is null and (select auth.uid()) is null then
    return old;
  end if;
  raise exception 'A contract version cannot be changed once recorded.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_contract_version_immutable() owner to postgres;
revoke all on function public.enforce_contract_version_immutable()
  from public, anon, authenticated;

drop trigger if exists contract_versions_immutable on public.contract_versions;
create trigger contract_versions_immutable
  before update or delete on public.contract_versions
  for each row execute function public.enforce_contract_version_immutable();

-- ── 3. A version appears when CONTENT changes, and only then ──────────────
create or replace function public.snapshot_contract_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  -- CONTENT only. `is_active`, `updated_at` and any future bookkeeping column
  -- must not manufacture a version — a version is a statement that the terms
  -- changed, and a table full of identical versions says nothing.
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.body is not distinct from old.body
     and new.contract_type is not distinct from old.contract_type
     and new.pdf_url is not distinct from old.pdf_url
     and new.pdf_filename is not distinct from old.pdf_filename then
    return new;
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next
    from public.contract_versions where contract_id = new.id;

  insert into public.contract_versions
    (contract_id, version_no, title, body, contract_type, pdf_url, pdf_filename)
  values (new.id, v_next, new.title, coalesce(new.body, ''), new.contract_type,
          new.pdf_url, new.pdf_filename);
  return new;
end;
$$;

alter function public.snapshot_contract_version() owner to postgres;
revoke all on function public.snapshot_contract_version()
  from public, anon, authenticated;

drop trigger if exists contracts_snapshot_version on public.contracts;
create trigger contracts_snapshot_version
  after insert or update on public.contracts
  for each row execute function public.snapshot_contract_version();

-- ── 4. The acceptance binds to a version (column added in § 1) ────────────
comment on column public.contract_signatures.contract_version_id is
  'The EXACT contract version this client accepted. Immutable once set. Null only '
  'for acceptances recorded before 20261068000000, which were backfilled to the '
  'contract''s version 1 — the best available truth, and honestly not proof of '
  'what was on screen at the time, because before this migration nothing recorded '
  'it.';

-- ── 5. Backfill, and it is honest about what it can and cannot know ───────
--
-- Every existing contract gets a version 1 holding its CURRENT content, and
-- every existing signature is bound to it. **That is the best available truth
-- and not the real truth:** if a provider edited their contract between a
-- client's acceptance and this migration, version 1 holds the EDITED text and
-- the original is gone. Nothing recorded it, so nothing can recover it.
--
-- Recorded here rather than papered over, because an acceptance record that
-- silently presents a reconstruction as evidence is worse than one that says
-- what it knows.
insert into public.contract_versions
  (contract_id, version_no, title, body, contract_type, pdf_url, pdf_filename)
select c.id, 1, c.title, coalesce(c.body, ''), c.contract_type, c.pdf_url, c.pdf_filename
  from public.contracts c
 where not exists (select 1 from public.contract_versions v where v.contract_id = c.id);

update public.contract_signatures s
   set contract_version_id = v.id
  from public.contract_versions v
 where v.contract_id = s.contract_id
   and v.version_no = 1
   and s.contract_version_id is null;
