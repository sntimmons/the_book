-- A DEFAULT IS NOT A PROVIDER'S TERM.
--
-- ══ THE DEFECT ════════════════════════════════════════════════════════════
--
-- `app/book/policy.tsx` shows a client the terms they are about to agree to, and
-- it reads them from two tables:
--
--     provider_policies              fees, reschedule, travel   -- client-readable
--     provider_booking_preferences   cancellation window, grace -- OWNER-ONLY
--
-- The second has exactly one SELECT policy, `provider_read_own_preferences`:
-- `provider_id in (select id from providers where user_id = auth.uid())`. A
-- client is not that provider, so the read returns **zero rows and no error** —
-- the same silent false negative `lib/contracts.ts` records for `contracts`.
--
-- The screen guards on `if (!policiesRes.data && !prefsRes.data) return`, and
-- `provider_policies` DOES return. So the guard never fires, `rowsToPolicy`
-- substitutes `DEFAULT_POLICY` for the two missing fields, and the client is
-- shown a constant in the same type, in the same list, beside that provider's
-- real fee and reschedule terms — and then ticks a box saying they have read and
-- agree to it.
--
-- The substitution is not even self-consistent: this table's own default for
-- `lateness_grace_minutes` is **60**, and `DEFAULT_POLICY.gracePeriod` is
-- **15 minutes**. A provider who never opened the editor has 60 in the database
-- and the client is told 15.
--
-- ══ WHY THIS IS A FUNCTION AND NOT A POLICY ═══════════════════════════════
--
-- The obvious fix is a client-readable SELECT policy on the table. It is wrong:
-- the row also carries `vacation_mode`, `max_bookings_per_day`, `buffer_minutes`,
-- `minimum_notice_hours`, `requires_manual_approval`, `appointment_time_required`,
-- `same_day_booking` and `timezone`. Those are how a business is run, not what a
-- client agreed to, and `vacation_mode` plus `max_bookings_per_day` together
-- describe capacity a competitor would like to have. A column-level grant would
-- narrow the columns but not the rows, and this table has no other public reader
-- to justify standing table access at all.
--
-- So: a function that returns the two fields a client is entitled to and nothing
-- else, on the same shape as `provider_is_bookable` (`20261071000000`).
--
-- It answers through `provider_content_hidden` (`20261120000000`) rather than
-- repeating the erasure test, so a departed provider's terms stop being served on
-- exactly the same clock as their services, availability, blocked dates and
-- policies. That function is the ONE answer to "may this provider's public
-- content be served", and a new public read belongs behind it or in a documented
-- retention class.
create or replace function public.provider_public_booking_terms(p_provider_id uuid)
returns table (cancellation_window_hours integer, lateness_grace_minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.cancellation_window_hours, p.lateness_grace_minutes
    from public.provider_booking_preferences p
   where p.provider_id = p_provider_id
     and not public.provider_content_hidden(p_provider_id);
$$;

alter function public.provider_public_booking_terms(uuid) owner to postgres;
revoke all on function public.provider_public_booking_terms(uuid) from public, anon;
grant execute on function public.provider_public_booking_terms(uuid) to authenticated;

comment on function public.provider_public_booking_terms(uuid) is
  'The two booking terms a CLIENT is entitled to before they agree to them: the '
  'cancellation window and the lateness grace. Exists because '
  'provider_booking_preferences is owner-only by design and must stay that way — '
  'the same row carries vacation_mode, max_bookings_per_day, buffer_minutes, '
  'minimum_notice_hours and timezone, which are how a business is run rather than '
  'what a client agreed to. Returns NO ROW when the provider has never set these, '
  'which the client screens render as "not published" — never as a default, '
  'because a default presented as a provider term is the defect this replaces. '
  'Carries no fee, deposit or payment field: Third takes no payment in this beta '
  'and this function must not become the place that implies otherwise.';
