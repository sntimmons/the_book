-- Slice 3a-0c corrections. Three defects found by the re-review of 20260913000000, plus the
-- Founder-ruled closed-post rule.
--
-- A SEPARATE file rather than an edit to 20260913000000: that migration has already been
-- applied to the non-production database, and an applied migration does not re-run. Editing it
-- in place would have left the file and the database disagreeing, with only a history repair to
-- reconcile them -- the drift MIGRATION_LEDGER.md exists to prevent. Forward-only is the same
-- rule the repo already applies to merged migrations, for the same reason.
--
-- Scope: restore a lock that a redefinition deleted, close a text-injection boundary, and stop
-- a closed post selecting a new response. No new table, no proposal/agreement/obligation schema.

-- ── 1. RESTORE the pending-cycle row lock (SEC-DATA-306) ─────────────────────
-- 20260901010000 added `select ... for update` to this function for one reason: to close the
-- SEC-DATA-001 read-then-insert race on the "one message per pending request cycle" rule.
-- 20260913000000 redefined the function to add the system_recipient_id clamp, and wrote the new
-- body from 20260901000000 -- the migration that CREATED the function -- rather than from
-- 20260901010000, the one that was actually live. `create or replace function` replaces the
-- WHOLE body, so every correction made since the version you copied is deleted, silently.
--
-- Nothing could catch it: the B5B harness runs in a single transaction and cannot stage two
-- concurrent sessions, so no behavioural assertion can observe the race. messaging.test.sql now
-- carries a SOURCE assertion that the lock is present, which is the only check that survives a
-- future rewrite.
--
-- Under READ COMMITTED, two concurrent inserts on one conversation both read v_since_count = 0
-- and both commit. The lock makes the second block on the conversation row until the first
-- commits, then re-read and be refused.
create or replace function public.enforce_prebooking_message_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversation%rowtype;
  v_since_count integer;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Addressing is a SERVER concept: only a definer function may say who a platform notice is
  -- for. Clamped for any message that HAS an author -- i.e. every client insert, since the
  -- INSERT policy requires sender_id = auth.uid() and null can never satisfy it, so a
  -- null-sender row can only come from a definer function.
  --
  -- Scoping it this way is load-bearing: SECURITY DEFINER does not change auth.role(), so an
  -- unconditional clamp fires inside release_barter_interest too and silently wipes the
  -- addressing it just computed -- defeating the "do not badge the actor" rule via the very
  -- guard meant to protect it.
  if new.sender_id is not null then
    new.system_recipient_id := null;
  end if;

  -- created_at is an enforcement boundary (the one-message-per-pending-cycle rule reads it), so
  -- it is server-authoritative and a client-supplied value is discarded.
  new.created_at := clock_timestamp();

  -- LOCK, then read. Added by 20260901010000 to close SEC-DATA-001 and RESTORED here after
  -- this migration's first draft dropped it: the body was written from 20260901000000, the
  -- migration that CREATED this function, rather than 20260901010000, the one that was live.
  -- `create or replace` replaces the whole body, so writing from a superseded copy deletes
  -- every later correction silently -- and a single-transaction harness cannot stage the race
  -- that would reveal it. Under READ COMMITTED two concurrent inserts on one conversation both
  -- read v_since_count = 0 and both commit; the lock makes the second block, then re-read.
  select c.* into v_conv from public.conversation c where c.id = new.conversation_id
  for update;
  if not found then
    raise exception 'That conversation does not exist.' using errcode = 'check_violation';
  end if;

  -- Open conversations: booking-linked, legacy (no request state), or accepted.
  if v_conv.booking_id is not null
     or v_conv.request_status is null
     or v_conv.request_status = 'accepted' then
    return new;
  end if;

  if v_conv.request_status = 'declined' then
    raise exception 'This request has been declined; no further messages are allowed.'
      using errcode = 'check_violation';
  end if;

  -- request_status = 'pending': only the client may send, and only the single initial message.
  if new.sender_id is distinct from v_conv.client_id then
    raise exception 'The provider must accept the request before messaging.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_since_count
  from public.messages m
  where m.conversation_id = new.conversation_id
    and (v_conv.request_opened_at is null or m.created_at >= v_conv.request_opened_at);
  if v_since_count > 0 then
    raise exception 'Only one message may be sent while a request is pending.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

alter function public.enforce_prebooking_message_rules() owner to postgres;
revoke all on function public.enforce_prebooking_message_rules() from public, anon;

-- ── 2. Participant text cannot break out of the platform's quoting ───────────
-- 20260913000000 quoted, capped and control-stripped the offer terms so an owner could not
-- publish free text in the platform's voice. The QUOTE CHARACTER ITSELF was not removed, so the
-- boundary the quotes draw is one the quoted text can erase.
--
-- The QUOTE character must itself be removed, or the boundary the quotes draw is one the
-- quoted text can erase: `x" -- ACCOUNT SUSPENDED, contact support` closes the platform's
-- quote and opens free prose mid-sentence. Same for the Unicode bidi overrides and zero-width
-- marks -- whether `[[:cntrl:]]` classes them depends on the database ctype, and a surviving
-- U+202E can reorder the closing clause itself, defeating the "platform closes the sentence"
-- mitigation. `translate` deletes them by exact codepoint, so nothing rests on regex class
-- semantics or on locale.
--
-- Sanitise BEFORE the empty test: a value of nothing but control characters must reach the
-- 'a service' fallback rather than render as a quoted blank.
create or replace function public.barter_terms_sanitize(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          regexp_replace(
            -- quote, then the bidi overrides/isolates, zero-width marks and BOM
            translate(coalesce(p_text, ''),
                      U&'"\200b\200c\200d\200e\200f\202a\202b\202c\202d\202e'
                      || U&'\2066\2067\2068\2069\feff',
                      ''),
            '[[:cntrl:]]', ' ', 'g'),
          '\s+', ' ', 'g')),
      ''),
    'a service');
$$;

alter function public.barter_terms_sanitize(text) owner to postgres;
revoke all on function public.barter_terms_sanitize(text) from public, anon;
grant execute on function public.barter_terms_sanitize(text) to authenticated;

create or replace function public.barter_terms_label(p_offering text, p_seeking text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '"' || substr(public.barter_terms_sanitize(p_offering), 1, 40)
      || '" for "' || substr(public.barter_terms_sanitize(p_seeking), 1, 40)
      || '"';
$$;

alter function public.barter_terms_label(text, text) owner to postgres;
revoke all on function public.barter_terms_label(text, text) from public, anon;
grant execute on function public.barter_terms_label(text, text) to authenticated;

-- ── 3. A closed post cannot select a new response ────────────────────────────
-- Trade Activity makes an owner's PENDING responses reachable after the post leaves the
-- newest-50 discovery feed, which is the point of the surface. That reachability must not
-- silently re-open a post the owner deliberately CLOSED: closing is the owner's statement
-- that they are done, and an accept afterwards would match a provider to a post that is no
-- longer on the board. An aged-out but still-active post is the opposite case and must stay
-- fully actionable.
--
-- Added as its own trigger rather than by redefining accept_barter_interest. `create or
-- replace function` replaces the WHOLE body, so every such rewrite risks carrying a
-- superseded copy forward -- which is exactly how this migration's first draft deleted the
-- FOR UPDATE lock restored in section 1. An additive trigger cannot delete anything, and it
-- binds the rule to the TRANSITION rather than to one caller, so a future second accept path
-- inherits it. Triggers fire even for SECURITY DEFINER callers, so the RPC is covered.
create or replace function public.enforce_barter_accept_open_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  -- Only the transition INTO accepted. An already-accepted row whose post is later closed
  -- keeps working: the negotiation survives the post, which is PD-049 and the reason Trade
  -- Activity exists. Re-running accept on such a row returns its conversation unchanged.
  if new.status is distinct from 'accepted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'accepted' then
    return new;
  end if;

  select o.is_active into v_active
    from public.barter_offers o where o.id = new.offer_id;
  if v_active is false then
    -- DISTINCT sqlstate. check_violation is this table's general refusal code and the client
    -- maps it, for accept, to "already answered" -- a false statement about the responder,
    -- who has done nothing. 55000 (object_not_in_prerequisite_state) says what is actually
    -- wrong: the POST is closed.
    raise exception 'This post is closed, so responses to it can no longer be accepted.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_accept_open_offer() owner to postgres;
revoke all on function public.enforce_barter_accept_open_offer() from public, anon;

-- `zy` so it sorts AFTER barter_interests_write_integrity (which validates the transition
-- itself) and before barter_interests_zz_rate_limit, following the existing naming
-- convention on this table. An illegal transition is therefore refused by the rule that owns
-- it, and this trigger speaks only about the post.
drop trigger if exists barter_interests_zy_accept_open_offer on public.barter_interests;
create trigger barter_interests_zy_accept_open_offer
  before insert or update on public.barter_interests
  for each row execute function public.enforce_barter_accept_open_offer();
