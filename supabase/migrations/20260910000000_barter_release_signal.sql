-- Barter Slice 3a-0b — the counterparty is told when a negotiation ends.
--
-- Scope: the release SIGNAL only. No proposal, agreement, obligation, acceptance, cancellation
-- or adjudication schema. No notification subsystem, no push, no My Trades, no expiry, no
-- re-response, no reputation, no production change.
--
-- THE DEFECT
-- `release_barter_interest` updated one row and returned. A negotiation was ANNOUNCED when it
-- started -- accept_barter_interest writes a message into the pair's thread -- and SILENT when
-- it ended. The counterparty's thread was unchanged and still open, so they could keep
-- messaging about a negotiation whose premise had been revoked, without being told.
--
-- THE REPRESENTATION: `sender_id IS NULL`
-- The Founder ruling forbids impersonating either participant as the author. `messages.sender_id`
-- is NULLABLE (20260829000000_canonical_live_baseline.sql:925), and every rule that matters
-- tolerates a null sender:
--   * "Participants can read messages" is CONVERSATION-scoped, not sender-scoped, so both
--     parties can read it (baseline:2281).
--   * "Participants can send messages" requires sender_id = auth.uid(), which a client cannot
--     satisfy with null -- so a client CANNOT forge a system message. This function is
--     SECURITY DEFINER and bypasses RLS, which is what makes the server the only author.
--   * (CORRECTED by 20260911000000: this header originally claimed
--     `participants_mark_messages_read` "pins sender_id = sender_id". It does NOT -- an RLS
--     policy cannot reference OLD, so that conjunct is a tautology that pinned nothing, and it
--     was NULL for a null sender, which made a platform notice unmarkable as read. The pin now
--     lives in a BEFORE UPDATE trigger. Do not cite the policy as evidence of immutability.)
--   * `enforce_prebooking_message_rules` returns early for an open conversation -- booking
--     -linked, null request_status, or 'accepted' (20260901000000:29-33). A barter thread opened
--     by accept_barter_interest is always one of those, and `accepted -> declined` is not a
--     legal transition, so it cannot later close underneath us.
-- NO SCHEMA CHANGE IS NEEDED. A system message is one whose author is nobody.

create or replace function public.release_barter_interest(p_interest_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_is_owner boolean;
  v_is_responder boolean;
  v_reason text;
  v_key text;
  v_conv_id uuid;
  v_copy text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  -- Lock the OFFER, not the interest: the invariant being protected is "one accepted response
  -- per offer", so the offer is the serialisation point -- the same reasoning by which
  -- accept_barter_interest locks the offer.
  select o.* into v_offer from public.barter_offers o
   where o.id = v_interest.offer_id for update;
  if not found then
    raise exception 'That offer no longer exists.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;

  v_is_owner := (v_offer.user_id = v_uid);
  v_is_responder := (v_interest.interested_user_id = v_uid);

  if not (v_is_owner or v_is_responder) then
    raise exception 'Only a participant can end this negotiation.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent where safe, and this is ALSO what stops the signal being written twice: a
  -- repeated call returns before the update and therefore before the message insert.
  if v_interest.status = 'released' then
    return v_interest.release_reason;
  end if;

  if v_interest.status <> 'accepted' then
    raise exception 'Only the response currently in negotiation can be released.'
      using errcode = 'check_violation';
  end if;

  -- A SEED, not the decision -- the trigger clamps all three release columns. See
  -- 20260909000000. The value returned below is read back from the row.
  v_reason := case when v_is_responder then 'responder_withdrew'
                   else 'owner_ended_negotiation' end;

  -- PRE-AGREEMENT ONLY. When the agreement schema lands, the "no official agreement exists"
  -- guard goes HERE -- and must also be enforced at the write boundary, not only in this body.
  perform set_config('app.barter_release', v_interest.id::text, true);
  update public.barter_interests
     set status = 'released',
         released_at = clock_timestamp(),
         released_by = v_uid,
         release_reason = v_reason
   where id = v_interest.id
  returning release_reason into v_reason;
  perform set_config('app.barter_release', '', true);

  -- ── The signal, in the SAME transaction ────────────────────────────────────
  -- Written here rather than by the client after the RPC returns, so the release and the
  -- notice cannot diverge: a client that crashes, loses connectivity, or simply omits the
  -- second call would otherwise leave the counterparty uninformed with no error anywhere.
  v_key := least(v_offer.provider_id, v_interest.interested_provider_id)::text || ':' ||
           greatest(v_offer.provider_id, v_interest.interested_provider_id)::text;

  select c.id into v_conv_id from public.conversation c
   where c.provider_pair_key = v_key
   order by c.id limit 1;

  if v_conv_id is null then
    -- Fall back to the literal orientations: a thread created before the canonical pair key
    -- existed can still be carrying a stale null key.
    select c.id into v_conv_id from public.conversation c
     where (c.client_id = v_interest.interested_user_id and c.provider_id = v_offer.provider_id)
        or (c.client_id = v_offer.user_id
            and c.provider_id = v_interest.interested_provider_id)
     order by c.id limit 1;
  end if;

  -- Only when the conversation exists, per the ruling. A pre-Slice-2 accepted interest may
  -- have been stranded without one; that is not a reason to refuse the release.
  if v_conv_id is not null then
    -- Neutral and role-based, never named: a display name would have to come from somewhere,
    -- and the only trustworthy source is the server -- so the simplest truthful thing is to
    -- name the ROLE, which is derived, not supplied.
    v_copy := case v_reason
                when 'responder_withdrew' then
                  'This trade negotiation was ended by the responding provider.'
                when 'owner_ended_negotiation' then
                  'This trade negotiation was ended by the post owner.'
                else 'This trade negotiation was ended.'
              end;

    -- sender_id NULL = authored by the platform, not by either participant.
    insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
    values (v_conv_id, null, v_copy, false, clock_timestamp());

    update public.conversation set last_message_at = clock_timestamp() where id = v_conv_id;
  end if;

  return v_reason;
end;
$$;

alter function public.release_barter_interest(uuid) owner to postgres;
revoke all on function public.release_barter_interest(uuid) from public, anon;
grant execute on function public.release_barter_interest(uuid) to authenticated;
