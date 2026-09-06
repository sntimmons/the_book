-- Founder ruling: the second cancellation notice states a FACT, not an agreement.
--
-- FORWARD-ONLY. Every earlier migration on this branch is applied to non-production and is
-- append-only history. Production untouched.
--
-- COPY ONLY. No authority, state machine, lock order, classification, grant, policy or trigger
-- changes here. `cancel_barter_agreement` is replaced solely to change one sentence; the body
-- is otherwise identical to 20261009000000, which remains the live shape.
--
-- THE DEFECT. The second notice read "Both providers agreed to cancel the trade for …". That
-- is true of the sequence it was written for — A cancels, B later reads it and taps
-- "Agree to cancel" — and FALSE of the other sequence the server allows: A and B cancelling
-- concurrently, neither having seen the other's act, each ending a trade for their own reasons.
-- Both paths reach two acts and therefore both reached that sentence. Recording in a durable
-- thread message that two providers AGREED, when neither assented to anything, attributes a
-- meeting of minds that never happened — and this is the record either of them may later be
-- asked to stand behind.
--
--   'Both providers cancelled the trade for "X" for "Y".'
--
-- states only what the two acts prove: each of them cancelled. It is true of BOTH sequences,
-- which is what makes it the right sentence for a classification derived from a row count
-- rather than from anyone's assent.
--
-- UNCHANGED, deliberately:
--   * The agreement classification stays `mutually_cancelled`. Two explicit acts is still what
--     the product calls Mutually Cancelled; only the sentence in the thread changes.
--   * "Agree to cancel" stays as the UI action offered to a counterparty responding to an
--     existing cancellation. There, the viewer HAS seen the other act, so the word is accurate
--     about what that particular participant is doing.
--   * The first notice is untouched.
--   * Bounded, server-derived trade context via barter_terms_label — approved and retained, so
--     a notice in a thread carrying a pair's whole relationship still says WHICH trade.
--   * Exactly-once, best-effort delivery, the reason's absence from the notice, addressing to
--     the participant who did not act, and the pair_conversation_notice helper.

create or replace function public.cancel_barter_agreement(
  p_agreement_id uuid,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ag public.barter_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
  v_obligations integer;
  v_delivered integer;
  v_acts integer;
  v_class text;
  v_label text;
  v_offer public.barter_offers%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Keep the reason under 200 characters.' using errcode = 'invalid_parameter_value';
  end if;

  select ag.* into v_ag from public.barter_agreements ag where ag.id = p_agreement_id;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;
  if v_uid not in (v_ag.owner_user_id, v_ag.responder_user_id) then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  v_provider := case when v_uid = v_ag.owner_user_id
                     then v_ag.owner_provider_id else v_ag.responder_provider_id end;

  select ag.* into v_ag from public.barter_agreements ag
   where ag.id = p_agreement_id for update;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  select count(*) into v_obligations
    from (select o.id from public.barter_obligations o
           where o.agreement_id = p_agreement_id
           order by o.id for update) locked;
  if v_obligations <> 2 then
    raise exception 'That trade is not in a state that can be cancelled.'
      using errcode = 'internal_error';
  end if;

  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = p_agreement_id and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = p_agreement_id and c.actor_user_id = v_uid) then
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
  end if;

  insert into public.barter_agreement_cancellations
    (agreement_id, actor_user_id, actor_provider_id, reason)
  values (p_agreement_id, v_uid, v_provider, v_reason);

  select count(*) into v_acts from public.barter_agreement_cancellations c
   where c.agreement_id = p_agreement_id;
  -- Derived ONCE, then used for both the wording and the return, so the sentence the
  -- counterparty reads can never disagree with the answer the caller was given.
  v_class := case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;

  select o.* into v_offer from public.barter_offers o where o.id = v_ag.offer_id;
  v_label := public.barter_terms_label(v_offer.offering_service, v_offer.seeking_service);

  perform public.pair_conversation_notice(
    v_ag.owner_provider_id, v_ag.owner_user_id,
    v_ag.responder_provider_id, v_ag.responder_user_id,
    -- Says what the two acts PROVE -- each provider cancelled -- and nothing about whether
    -- either consented to the other's decision. True whether B answered A's cancellation or
    -- the two of them quit at the same moment without ever seeing each other's act.
    case when v_class = 'mutually_cancelled'
         then 'Both providers cancelled the trade for ' || v_label || '.'
         else 'The trade for ' || v_label || ' was cancelled by one provider.'
    end,
    -- Addressed to whoever did NOT just act.
    case when v_uid = v_ag.owner_user_id
         then v_ag.responder_user_id else v_ag.owner_user_id end);

  return v_class;
exception
  when unique_violation then
    -- Reachable only from the act insert: the notice contains its own failures, so nothing it
    -- does can land here and roll the act back while this returns a success.
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
end;
$$;

alter function public.cancel_barter_agreement(uuid, text) owner to postgres;
revoke all on function public.cancel_barter_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_barter_agreement(uuid, text) to authenticated;
