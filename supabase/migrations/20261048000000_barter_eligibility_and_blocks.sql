-- Session 8 (A, C, J) — barter respects eligibility and blocks, on WRITE only.
--
-- ══ THE TRAP THIS MIGRATION WAS DESIGNED AROUND ═══════════════════════════
--
-- `20260906000000` prepared this exact change and left a warning with it, in its
-- "NOT changed here, on purpose" section. Read it before touching any of this:
--
--   > Adding `and p.is_approved` [to `caller_provider_id()`] would make it NULL
--   > for a de-approved provider, which would ALSO block them from closing their
--   > own live offers (`barter_offers_owner_update` WITH CHECK). That lockout
--   > must be designed for — likely by a separate `caller_eligible_provider_id()`
--   > — rather than discovered.
--
-- And, on the read side:
--
--   > gating [`barter_interests_offer_owner_read`] on `is_approved` would be
--   > actively WRONG: a de-approved provider would lose sight of responses
--   > already sent to them.
--
-- So this migration does exactly what that one designed: a SEPARATE
-- `caller_eligible_provider_id()`, used ONLY by the two policies that create
-- something new. `caller_provider_id()` is left alone, which is what keeps a
-- de-approved provider able to close their own offers, release their own
-- interests, read their own board and answer their own obligations.
--
-- ══ THE RULE, IN ONE LINE ═════════════════════════════════════════════════
--
-- **Eligibility and blocks gate what you may START. They never gate what you may
-- FINISH, CANCEL, READ or CLEAN UP.**
--
-- This is the same shape as PD-075's booking rule (an INSERT-only refusal) and
-- the same shape as `20261047000000`'s block gates. A de-approved provider with
-- a confirmed trade still owes their counterparty a delivery; taking away their
-- ability to record it would punish the counterparty, not them.
--
-- ══ WHAT IS NOT CHANGED ═══════════════════════════════════════════════════
--
-- The board READ policy (`barter_offers_provider_read`) is untouched. Whether a
-- de-approved provider may still SEE the barter board is a product question this
-- migration deliberately does not answer — `20260906000000` called it "a
-- deliberate, separate decision" and nothing since has decided it. Recorded, not
-- resolved.

-- ── 1. The eligible-caller seam ────────────────────────────────────────────
create or replace function public.caller_eligible_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Fail closed before any read when there is no authenticated caller.
  select case
    when (select auth.uid()) is null then null
    else (
      select p.id from public.providers p
       where p.user_id = (select auth.uid())
         and p.is_approved
    )
  end;
$$;

alter function public.caller_eligible_provider_id() owner to postgres;
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon at CREATE time, and
-- `revoke ... from public` does NOT remove that direct grant. Both are required —
-- the same pairing `caller_provider_id()` uses.
revoke all on function public.caller_eligible_provider_id() from public;
revoke all on function public.caller_eligible_provider_id() from anon;
grant execute on function public.caller_eligible_provider_id() to authenticated;

comment on function public.caller_eligible_provider_id() is
  'The caller''s provider id, but ONLY while they are approved. The write-side '
  'twin of caller_provider_id(), which is deliberately left ungated so a '
  'de-approved provider can still close their own offers, release their own '
  'interests and answer their own obligations. Use this one for policies that '
  'CREATE something new; use caller_provider_id() for everything else. '
  '20260906000000 designed this split and recorded why.';

-- ── 2. A new OFFER requires an eligible, unblocked author ──────────────────
--
-- Predicate carried forward verbatim apart from the swap. Note what is NOT here:
-- no block term. An offer is addressed to the board, not to a person, so there is
-- nobody to be blocked from — the block bites on the INTEREST below, which is the
-- act that reaches a specific provider.
drop policy if exists "barter_offers_provider_insert" on public.barter_offers;
create policy "barter_offers_provider_insert" on public.barter_offers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and provider_id = (select public.caller_eligible_provider_id())
  );

-- ── 3. A new INTEREST requires eligibility AND no block ────────────────────
--
-- This is the barter equivalent of sending a booking request: one provider
-- reaching a specific other provider. Both gates belong here.
drop policy if exists "barter_interests_provider_insert" on public.barter_interests;
create policy "barter_interests_provider_insert" on public.barter_interests
  for insert to authenticated
  with check (
    interested_user_id = (select auth.uid())
    and interested_provider_id = (select public.caller_eligible_provider_id())
    -- The offer's author must not be blocked with this caller, in either
    -- direction. `contact_blocked` is SECURITY DEFINER precisely so this sees the
    -- block the OTHER party made.
    and not exists (
      select 1
        from public.barter_offers o
       where o.id = barter_interests.offer_id
         and public.contact_blocked(interested_user_id, o.user_id)
    )
  );

comment on policy "barter_interests_provider_insert" on public.barter_interests is
  'A new response to an offer requires: the caller''s own identity, an APPROVED '
  'provider row (caller_eligible_provider_id), and no block in either direction '
  'with the offer''s author. Answering an offer is how one provider reaches '
  'another, so it is gated like a booking request. Reading, releasing and '
  'answering EXISTING interests are deliberately not gated.';
