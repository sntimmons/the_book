-- FORWARD CORRECTION to 20261128000000. Both found by the B5B suite on its first
-- run against the new assertions.
--
-- ══ 1. THE PATH RULE SPOKE BEFORE THE OWNERSHIP RULE ══════════════════════
--
-- `a_booking_photos_path_is_own` was a BEFORE INSERT trigger, and **every BEFORE
-- trigger runs before the RLS `WITH CHECK`** — name ordering has nothing to do
-- with it. So a provider trying to attach a "reference photo" to a client's
-- request stopped getting `42501` from `booking_photos_client_insert` and started
-- getting `23514` from the path check, and
-- `supabase/tests/booking_integrity.test.sql:207` said so immediately.
--
-- That assertion is right and the trigger was wrong. The two rules answer
-- different questions and they have an order: **RLS decides whether you may write
-- this row at all; the path rule then decides whether the object you named is
-- yours.** A caller who may not write the row should never hear about the path,
-- and `20261058000000` is this repo's precedent for caring which rule speaks —
-- the ordering there decides which SQLSTATE a write returns, and two suites pin it.
--
-- AFTER INSERT is what puts them in that order: the RLS `WITH CHECK` is evaluated
-- as part of the INSERT, before any AFTER row trigger fires, and a RAISE in an
-- AFTER trigger still rolls the statement back. The rule is not weakened; it is
-- moved behind the rule that outranks it.
drop trigger if exists a_booking_photos_path_is_own on public.booking_reference_photos;
drop trigger if exists zz_booking_photos_path_is_own on public.booking_reference_photos;
create trigger zz_booking_photos_path_is_own
  after insert on public.booking_reference_photos
  for each row execute function public.enforce_booking_photo_path_is_own();

comment on function public.enforce_booking_photo_path_is_own() is
  'A reference photo row may only name an object in the caller''s own storage '
  'folder — the same rule every storage.objects write policy applies to the object '
  'itself, which the row that NAMES the object never had. Attached AFTER INSERT '
  'deliberately: a BEFORE trigger pre-empts the RLS WITH CHECK, so a provider '
  'attaching to somebody else''s request would hear about the path instead of '
  'being told they may not write the row (booking_integrity.test.sql:207).';

-- ══ 2. AN UNBOUND ACCEPTANCE POINTS AT NO VERSION, SO EVERY VERSION LOOKED
--       UNACCEPTED ═══════════════════════════════════════════════════════
--
-- `adel_contract_artifacts` step (b) deletes a version that no signature points
-- at. `contract_signatures.contract_version_id` is held NOT NULL by a TRIGGER and
-- a one-off backfill (`20261070000000:86`, `20261068000000:209-213`) — not by a
-- column constraint — so an unbound row is possible, and an unbound row points at
-- NO version. For a contract carrying one, every version of that contract looks
-- unaccepted and the step would delete **the exact frozen version PD-107 exists
-- to keep**, while the acceptance row survives pointing at nothing.
--
-- Live data currently holds none of these. That is a fact about today, not a
-- property of the schema, and "the evidence survives" must not depend on it.
--
-- **When we cannot tell WHICH version an acceptance accepted, we keep them all.**
-- That is the same instinct as `20261112000000`: do not delete evidence to make
-- an erasure succeed. The cost is a departing provider retaining a few superseded
-- versions on a contract somebody signed without a binding; the alternative is
-- destroying a client's record of terms they agreed to.
create or replace function public.adel_contract_artifacts(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_contracts integer := 0; v_versions integer := 0; v_queued integer := 0;
        v_unbound integer := 0;
begin
  with d as (
    delete from public.contracts c
     where c.user_id = p_subject
       and not exists (select 1 from public.contract_signatures s where s.contract_id = c.id)
    returning 1
  ) select count(*) into v_contracts from d;

  select count(*) into v_unbound
    from public.contract_signatures s
    join public.contracts c on c.id = s.contract_id
   where c.user_id = p_subject and s.contract_version_id is null;

  with d as (
    delete from public.contract_versions v
     where exists (select 1 from public.contracts c
                    where c.id = v.contract_id and c.user_id = p_subject)
       and not exists (select 1 from public.contract_signatures s
                        where s.contract_version_id = v.id)
       -- AND NOTHING ON THIS CONTRACT ACCEPTED WITHOUT SAYING WHAT. One unbound
       -- acceptance makes every version of its contract undeletable, because any
       -- of them could be the one that was accepted.
       and not exists (select 1 from public.contract_signatures s
                        where s.contract_id = v.contract_id
                          and s.contract_version_id is null)
    returning 1
  ) select count(*) into v_versions from d;

  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select o.bucket_id, o.name, p_subject
      from storage.objects o
     where o.bucket_id in ('contract-pdfs', 'contract-signatures')
       and o.name like p_subject::text || '/%'
       and not exists (
         select 1 from public.contract_versions v
           join public.contracts c on c.id = v.contract_id
          where c.user_id = p_subject
            and v.pdf_url is not null
            and split_part(split_part(v.pdf_url, '/contract-pdfs/', 2), '?', 1) = o.name)
       and not exists (
         select 1 from public.contracts c
          where c.user_id = p_subject
            and c.pdf_url is not null
            and split_part(split_part(c.pdf_url, '/contract-pdfs/', 2), '?', 1) = o.name)
       and not exists (
         select 1 from public.contract_signatures s
          where s.client_user_id = p_subject
            and s.signature_url is not null
            and split_part(split_part(s.signature_url, '/contract-signatures/', 2), '?', 1) = o.name)
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  -- REPORTED, not silent. A retained superseded version is a deliberate outcome
  -- and the step result is where an operator can see it happened.
  return jsonb_build_object('drafts_deleted', v_contracts,
                            'unaccepted_versions_deleted', v_versions,
                            'objects_queued', v_queued,
                            'unbound_acceptances_forcing_retention', v_unbound);
end $$;
alter function public.adel_contract_artifacts(uuid) owner to postgres;
revoke all on function public.adel_contract_artifacts(uuid) from public, anon, authenticated;
