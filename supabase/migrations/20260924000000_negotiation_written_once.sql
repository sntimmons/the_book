-- Say "written once" in a way that means it, and stop overstating what guards it.
--
-- 20260923000000 enforced write-once with a unique index on (version_id, sort_order). That
-- stops a second write ONLY because `write_barter_proposal_terms` happens to number terms from
-- zero: a writer holding the marker and starting at max+1 appends cleanly and collides with
-- nothing. And the marker itself is not an authorization boundary — `set_config` is callable by
-- anyone with a SQL session, so a future in-database SECURITY DEFINER helper can publish its
-- own marker. Over PostgREST neither is reachable (set_config is in pg_catalog, and one request
-- is one transaction with one statement), but that is a property of the transport, not of the
-- guard.
--
-- CORRECTED CLAIM. 20260921000000 and the ledger said the grant and the guard were two
-- independent boundaries, "neither load-bearing alone". For an authenticated PostgREST caller
-- that is true — the EXECUTE revoke, the absent INSERT grant and the marker each refuse
-- independently. For an in-database caller it was not: the grant and table privileges were the
-- real boundary and the marker was hardening. This migration makes the write-once half
-- genuinely independent, so the claim becomes true for both profiles rather than being softened.
--
-- A STATEMENT-level trigger with a transition table is what can express "this version already
-- had terms before this statement" — the thing a per-row count cannot see (it trips on the
-- second row of its own insert) and a unique index can only approximate.
create or replace function public.enforce_barter_terms_written_once()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad integer;
begin
  -- Count versions where the rows now present exceed the rows this statement inserted: that is
  -- exactly "terms already existed for this version".
  select count(*) into v_bad
    from (
      select i.version_id, count(*) as inserted_now
        from inserted i group by i.version_id
    ) g
    join lateral (
      select count(*) as total from public.barter_proposal_terms t
       where t.version_id = g.version_id
    ) tot on true
   where tot.total > g.inserted_now;

  if v_bad > 0 then
    raise exception 'A version''s terms are written once and cannot be added to.'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

alter function public.enforce_barter_terms_written_once() owner to postgres;
revoke all on function public.enforce_barter_terms_written_once()
  from public, anon, authenticated;

drop trigger if exists barter_proposal_terms_written_once on public.barter_proposal_terms;
create trigger barter_proposal_terms_written_once
  after insert on public.barter_proposal_terms
  referencing new table as inserted
  for each statement execute function public.enforce_barter_terms_written_once();

-- The sort_order index stays: it is a cheap structural backstop and it also keeps term ordering
-- unambiguous within a version. It is no longer the thing write-once rests on.

-- ── The stale lock-order comment inside submit_barter_counter ───────────────
-- 20260921000000 corrected the ORDER but left a comment in the body saying "Same lock ORDER as
-- every other RPC here: interest, then offer, then proposal" — the exact claim its own header
-- identifies as false and as the cause of the deadlock. Comments in a function body land in
-- prosrc, so this is the text the next author reads.
create or replace function public.submit_barter_counter(p_proposal_id uuid, p_terms jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_proposal public.barter_proposals%rowtype;
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_role text;
  v_next integer;
  v_version_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- LOCK ORDER: offer, then interest, then proposal -- matching release_barter_interest and
  -- accept_barter_interest, which take the offer first. Taking them in opposite orders is what
  -- allowed a deadlock (40P01) against a concurrent release.
  select p.* into v_proposal from public.barter_proposals p where p.id = p_proposal_id;
  if not found then
    raise exception 'That negotiation no longer exists.' using errcode = 'check_violation';
  end if;

  select o.* into v_offer from public.barter_offers o
   where o.id = v_proposal.offer_id for update;
  if not found then
    raise exception 'That post no longer exists.' using errcode = 'check_violation';
  end if;
  select i.* into v_interest from public.barter_interests i
   where i.id = v_proposal.interest_id for update;
  -- FAIL CLOSED STRUCTURALLY. Without this the composite is all-NULL and the liveness gate
  -- below evaluates to NULL -- which is not TRUE, so the `if` is skipped and execution
  -- continues. The guard would fail OPEN by arrangement rather than by construction.
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can propose terms.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be proposed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- THE serialisation point. Two simultaneous counters both reach here; one waits, then reads
  -- the other's committed current_version_no and takes the next number after it. Without this
  -- both would compute the same next number and the unique index would turn a legitimate
  -- counter into an error the user cannot act on.
  select p.* into v_proposal from public.barter_proposals p
   where p.id = p_proposal_id for update;

  perform public.assert_barter_version_budget(p_proposal_id, v_uid);

  v_next := v_proposal.current_version_no + 1;

  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (p_proposal_id, v_next, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  perform set_config('app.barter_terms_write', v_version_id::text, true);
  perform public.write_barter_proposal_terms(v_version_id, p_terms);
  perform set_config('app.barter_terms_write', '', true);

  -- Advancing the pointer is what INVALIDATES prior acceptances (rule 5). The acceptance rows
  -- are not touched -- they remain the true record of who accepted version N -- they simply
  -- stop being acceptances of the CURRENT version.
  update public.barter_proposals set current_version_no = v_next where id = p_proposal_id;

  return v_next;
end;
$$;

alter function public.submit_barter_counter(uuid, jsonb) owner to postgres;
revoke all on function public.submit_barter_counter(uuid, jsonb) from public, anon;
grant execute on function public.submit_barter_counter(uuid, jsonb) to authenticated;
