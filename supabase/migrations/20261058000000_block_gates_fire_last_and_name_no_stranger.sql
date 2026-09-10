-- FORWARD CORRECTION to 20261055000000 (Session 8, PD-082).
--
-- ══ THE MISTAKE, WHICH MY OWN COMMENT DENIED ══════════════════════════════
--
-- `20261055000000` created two gates and asserted, in writing:
--
--     "`zz_` so it runs AFTER `enforce_booking_write_integrity` (triggers fire
--      in name order)"
--
-- **The prefix is not `zz_`.** The triggers are named `bookings_zz_...` and
-- `conversation_zz_...`, so they sort on `b` and `c` — BEFORE
-- `enforce_booking_write_integrity` and `enforce_conversation_update`, which
-- sort on `e`. Both fire FIRST, which is precisely what the comment says must
-- not happen.
--
-- `zz_` only sorts last when it is the LEADING token. `20261056000000` got that
-- right for `barter_interests_zw_not_blocked` — but only because every trigger
-- on that table shares the `barter_interests_` prefix, so the comparison starts
-- after it. On `bookings` and `conversation` the neighbouring triggers have
-- unrelated names, and the same trick silently does the opposite.
--
-- ── WHAT IT COST: A ZERO-SIDE-EFFECT BLOCK ORACLE ─────────────────────────
--
-- `enforce_conversation_reopen_not_blocked` read `NEW.provider_id` and
-- `NEW.client_id` — the values in the SUBMITTED row, not the values the
-- conversation actually has. Firing before `enforce_conversation_update`, it
-- answered before the immutability check could refuse the change:
--
--     update public.conversation
--        set provider_id = '<any provider id from the public feed>',
--            request_status = 'pending'
--      where id = '<a conversation I am legitimately in>';
--
--       -> 42501  ==> a block exists between me and that provider
--       -> 23514  ==> it does not
--
-- Both outcomes ABORT the statement, so nothing is written, the target is never
-- touched, and it can be repeated for every provider on the board. That is the
-- exact question PD-082 says a blocked person may never have answered, restored
-- by the migration that was written to close it — and closed there only for the
-- `/rpc/` route.
--
-- ══ TWO INDEPENDENT FIXES, BECAUSE ONE IS NOT ENOUGH ══════════════════════
--
-- 1. **The gates read OLD identity.** A block is a fact about the pair a row
--    ALREADY belongs to. Reading NEW let the caller nominate a stranger and ask
--    about them; reading OLD makes the question unaskable, whatever order the
--    triggers fire in. This is the load-bearing half.
--
-- 2. **The triggers are renamed to sort last for real** — `zz_` LEADING. Now
--    the immutability and authorship rules refuse a malformed update before a
--    block gate sees it at all, which is the defence in depth the original
--    comment believed it already had.
--
-- ══ AND A GAP THE SAME REVIEW FOUND ═══════════════════════════════════════
--
-- The reopen gate had NO LIVE-TRANSACTION EXCEPTION, unlike every other block
-- gate in the session. `getOrCreateConversation` attaches a booking by setting
-- `booking_id` AND `request_status = 'accepted'` in one update, so a pair with a
-- SUBMITTED, NON-TERMINAL booking who then blocked could never open the thread
-- for it — two people with a live appointment and no way to talk about it. That
-- is the failure `20261046000000` calls the reason the exception exists at all,
-- reintroduced on the one path that did not carry it. Added here, worded exactly
-- as the messaging gate words it.
--
-- WHAT IS NOT CHANGED, AND WHY: a blocked pair with NO live transaction still
-- cannot reopen. And `-> declined` stays available to everyone, always — a
-- blocker must never lose the control that ends a thread.

-- ── 1. The reopen gate: OLD identity, plus the live-transaction exception ──
create or replace function public.enforce_conversation_reopen_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_user uuid;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Only a transition INTO an active request state. Declining, and every other
  -- change, stays available.
  if new.request_status is distinct from old.request_status
     and new.request_status in ('pending', 'accepted') then

    -- OLD, NOT NEW. The pair this conversation belongs to is not a value the
    -- caller may nominate in the same statement they are asking about. Reading
    -- NEW turned this gate into an oracle: see the header.
    select p.user_id into v_provider_user
      from public.providers p where p.id = old.provider_id;

    if v_provider_user is not null
       and public.contact_blocked(old.client_id, v_provider_user)
       -- THE EXCEPTION, matching 20261051000000. A block never strands a
       -- transaction that already exists: a pair with a submitted, non-terminal
       -- booking or an unresolved confirmed agreement must be able to open the
       -- thread that booking will be attached to, or blocking mid-appointment
       -- leaves two people with no way to finish.
       and not public.has_live_transaction(old.client_id, v_provider_user) then
      raise exception 'This conversation is not available.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

alter function public.enforce_conversation_reopen_not_blocked() owner to postgres;
revoke all on function public.enforce_conversation_reopen_not_blocked()
  from public, anon, authenticated;

comment on function public.enforce_conversation_reopen_not_blocked() is
  'Refuses a blocked pair re-entering an active request state, so a declined '
  'thread cannot be flipped back to pending as a contact signal. Reads OLD '
  'identity deliberately — reading NEW (until 20261058000000) let a caller name '
  'any provider in one statement and read the block answer off the SQLSTATE, '
  'with no row written. Carries the live-transaction exception so a pair with a '
  'live booking can still open the thread for it.';

-- ── 2. The submit gate: OLD identity ───────────────────────────────────────
--
-- Same reasoning. `user_id` and `provider_id` are fixed when a draft is created
-- and a submit does not change them, so OLD is not merely safer here — it is
-- the correct source.
create or replace function public.enforce_booking_submit_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if old.submitted_at is null and new.submitted_at is not null
     and public.contact_blocked_provider(old.user_id, old.provider_id) then
    raise exception 'This provider is not available for new bookings.'
      using errcode = 'PT427';
  end if;
  return new;
end;
$$;

alter function public.enforce_booking_submit_not_blocked() owner to postgres;
revoke all on function public.enforce_booking_submit_not_blocked()
  from public, anon, authenticated;

comment on function public.enforce_booking_submit_not_blocked() is
  'Refuses the draft->submitted transition for a blocked pair (PT427). Kept out '
  'of enforce_booking_write_integrity on purpose: that function is ~290 lines, '
  'has been rebuilt three times, and has twice lost a rule to a copy-forward. '
  'Reads OLD identity so the submitting caller cannot name a provider they are '
  'not already drafting against. Trigger zz_bookings_submit_not_blocked sorts '
  'AFTER enforce_booking_write_integrity — the earlier name, '
  'bookings_zz_submit_not_blocked, sorted on "b" and ran FIRST.';

-- ── 3. The triggers sort last for real ─────────────────────────────────────
drop trigger if exists bookings_zz_submit_not_blocked on public.bookings;
drop trigger if exists zz_bookings_submit_not_blocked on public.bookings;
create trigger zz_bookings_submit_not_blocked
  before update on public.bookings
  for each row execute function public.enforce_booking_submit_not_blocked();

drop trigger if exists conversation_zz_reopen_not_blocked on public.conversation;
drop trigger if exists zz_conversation_reopen_not_blocked on public.conversation;
create trigger zz_conversation_reopen_not_blocked
  before update on public.conversation
  for each row execute function public.enforce_conversation_reopen_not_blocked();

-- ── 4. Two grants that were narrowed for the wrong role only ──────────────
--
-- `20261052000000` revoked table-level INSERT/UPDATE/DELETE on `reports` from
-- `authenticated`, and said why: the baseline handed them out with no policy to
-- constrain them, which is "one added policy away from being a live hole". The
-- same baseline line hands `anon` the identical privileges (`grant all ... to
-- anon`), and only SELECT was taken back. RLS denies today because `auth.uid()`
-- is null for `anon` and there is no UPDATE or DELETE policy — but that is the
-- policy layer holding a door the grant layer never should have opened.
revoke insert, update, delete, truncate on public.reports from anon;

-- `community_reports` is the retired community-feed reporting table. Session 8
-- pointed that screen at `reports`; `20261057000000` labelled this one ORPHANED
-- and said "the label is the whole mechanism."
--
-- **That was the wrong call, by this session's own rule.** PD-084 and the ledger
-- both say a guarantee asserted in a comment is not a guarantee — the grant is.
-- The table still held `grant all ... to authenticated` and a live
-- `reports_insert_own` INSERT policy, so an older installed build, or any future
-- screen whose author does not read table comments, could still write a safety
-- report into a table with no reader and no operator path.
--
-- The ROWS AND EVERY FK ARE UNTOUCHED — this changes no retention or deletion
-- semantics, which requirement O puts out of scope. It closes the write path
-- only.
revoke insert, update, delete, truncate on public.community_reports from anon, authenticated;
drop policy if exists "reports_insert_own" on public.community_reports;
