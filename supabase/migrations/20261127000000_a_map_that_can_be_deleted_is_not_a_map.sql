-- FORWARD CORRECTION to 20261124000000 / 20261125000000 (OQ-085, OQ-086).
-- Both were found by the B5B suite on its first run against the new assertions.
--
-- ══ 1. THE RELATIONSHIP MAP COULD BE DELETED, AND THE MAP IS THE PURGE ════
--
-- `enforce_erasure_link_append_only` refused a re-key and then returned
-- `coalesce(new, old)` — which permits a DELETE. That is the identical defect
-- `20261114000000` had to correct on `erased_accounts`, written again in the
-- same shape, two files later, in the same branch.
--
-- It matters more here than it did there. `adel_messages_purge` and the
-- later-of calculation in `finalize_account_deletion` find their rows through
-- this map, and the message purge runs up to **180 days after the account is
-- gone**. Delete the map and a purge step that is retried from `failed`, or
-- released from `held`, finds no pseudonyms, deletes nothing, and reports
-- `completed` — the retention window silently becoming forever, with every
-- surface still saying success. That is precisely the failure mode
-- `20261114000000` was written to remove, reintroduced through a different door.
--
-- The file's own header says "do not simplify this by deleting the map when a
-- request completes." The guard now enforces what the header asserts.
create or replace function public.enforce_erasure_link_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    if tg_op = 'DELETE' then
      raise exception 'A relationship pseudonym cannot be deleted; the remaining purges find their rows through it.'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE'
       and (new.subject_id   is distinct from old.subject_id
         or new.scope_kind   is distinct from old.scope_kind
         or new.scope_id     is distinct from old.scope_id
         or new.pseudonym_id is distinct from old.pseudonym_id) then
      raise exception 'A relationship pseudonym cannot be re-keyed.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  raise exception 'Relationship pseudonyms are not client-writable.' using errcode = '42501';
end;
$$;
alter function public.enforce_erasure_link_append_only() owner to postgres;
revoke all on function public.enforce_erasure_link_append_only()
  from public, anon, authenticated;

-- ══ 2. A REDUNDANT GATE THAT COST A PINNED ASSERTION ══════════════════════
--
-- `20261125000000` put a deactivation gate on `barter_obligations` as defence in
-- depth. It adds no coverage: obligations are written only by
-- `finalize_barter_agreement`, in the same transaction as the
-- `barter_agreements` row that IS gated, and that table has no write policy for
-- any client role.
--
-- It does have a cost. THREE suites pin "no new trigger on `barter_obligations`"
-- (`receiver_window.test.sql:917`, `no_show_under_review.test.sql`,
-- `adjudication.test.sql`), and they pin it for a reason that has nothing to do
-- with erasure: an obligation's state must never be moved by anything other than
-- a participant acting, so a new trigger on that table is the shape a clock would
-- take. Editing three pins to admit a trigger that protects nothing is a bad
-- trade — it spends the signal that would catch the thing they were written for.
drop trigger if exists b_barter_obligations_refuse_when_inactive on public.barter_obligations;
