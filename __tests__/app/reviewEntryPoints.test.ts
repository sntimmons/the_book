import fs from 'fs'
import path from 'path'

// Phase 1 review-entry guards.
//
// These are SOURCE-LEVEL contract tests over the review entry points and the
// server-authoritative RPC. They lock the invariants that make QA-JOURNEY-001
// (a no_show booking offering a guaranteed-to-fail "Leave Review") impossible to
// reintroduce, and the truthfulness invariants around blind reviews.

const root = path.join(__dirname, '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')

// Strip comments so "no X" assertions test real CODE, not the prose explaining it.
const stripTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const stripSql = (src: string) => src.replace(/--.*$/gm, '')

const clientList = read('app', '(tabs)', 'bookings.tsx')
const bookingDetail = read('app', 'bookings', '[id].tsx')
const satisfaction = read('app', 'post-booking', 'satisfaction.tsx')
const clientForm = read('app', 'post-booking', 'review.tsx')
const providerForm = read('app', 'post-booking', 'provider-review.tsx')
const submitted = read('app', 'post-booking', 'submitted.tsx')
const bookingStatus = read('lib', 'bookingStatus.ts')
const rpc = read(
  'supabase',
  'migrations',
  '20260903000000_review_opportunity_rpc.sql',
)
const guard = read(
  'supabase',
  'migrations',
  '20260904000000_booking_completed_no_show_guard.sql',
)
const phase0 = read(
  'supabase',
  'migrations',
  '20260902000000_reviews_phase0_foundation.sql',
)

describe('CLIENT: no_show never enters the service-review flow (QA-JOURNEY-001)', () => {
  it('the Past TAB still groups completed + no_show (grouping is unchanged)', () => {
    expect(bookingStatus).toMatch(/const PAST = new Set\(\['completed', 'no_show'\]\)/)
  })

  it('the Leave Review CTA is gated on the RAW booking status, not the Past tab', () => {
    // The CTA must sit behind an explicit completed check.
    expect(clientList).toMatch(
      /bookingStatus === 'completed' &&[\s\S]{0,200}?post-booking\/satisfaction/,
    )
  })

  it('CardActions receives the raw booking status', () => {
    expect(clientList).toMatch(/bookingStatus=\{booking\.status\}/)
    expect(clientList).toMatch(/bookingStatus: string/)
  })

  it('does not label the Past tab as completed-only while it contains no_show', () => {
    expect(clientList).not.toMatch(/COMPLETED APPOINTMENTS/)
  })

  it('no review entry point keys off the generic past grouping', () => {
    // A `status === 'past'` branch may exist (Book Again), but must not be the
    // sole gate on a review route.
    const pastBranch = clientList.slice(clientList.indexOf("if (status === 'past')"))
    const cta = pastBranch.indexOf('post-booking/satisfaction')
    const gate = pastBranch.indexOf("bookingStatus === 'completed'")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(cta)
  })
})

describe('DEFENSE-IN-DEPTH: impossible states are terminal, never a retry loop', () => {
  const entryScreens: [string, string][] = [
    ['satisfaction', satisfaction],
    ['review (client form)', clientForm],
    ['provider-review (provider form)', providerForm],
  ]

  it.each(entryScreens)(
    '%s reads the server-authoritative opportunity before rendering the form',
    (_name, src) => {
      expect(src).toMatch(/useReviewOpportunity\(/)
    },
  )

  it.each(entryScreens)(
    '%s renders neither the form nor a verdict while the state is still loading',
    (_name, src) => {
      // CODE-STATE-002: "not read yet" must not be indistinguishable from "read
      // failed", or an ineligible booking flashes the form for one RPC round trip.
      expect(src).toMatch(/oppLoading/)
      expect(src.indexOf('if (oppLoading)')).toBeLessThan(src.indexOf('oppCopy.terminal'))
    },
  )

  it('all four consumers share one opportunity hook', () => {
    for (const src of [satisfaction, clientForm, providerForm, bookingDetail]) {
      expect(src).toMatch(/useReviewOpportunity/)
    }
    // and none of them calls the RPC directly any more
    for (const src of [satisfaction, clientForm, providerForm, bookingDetail]) {
      expect(stripTs(src)).not.toMatch(/getReviewOpportunity\(/)
    }
  })

  it.each(entryScreens)('%s renders a terminal state via the shared screen', (_name, src) => {
    expect(src).toMatch(/oppCopy\.terminal/)
    expect(src).toMatch(/ReviewStateScreen/)
  })

  it('the shared terminal screen offers an exit and never a retry', () => {
    const shared = stripTs(read('components', 'ReviewStateScreen.tsx'))
    expect(shared).toMatch(/onExit/)
    expect(shared).not.toMatch(/try again/i)
    expect(shared).not.toMatch(/retry/i)
  })

  it('both submit paths map failures through the truthful state re-read', () => {
    expect(clientForm).toMatch(/reviewSubmitErrorMessage\(.*'client_to_provider'\)/s)
    expect(providerForm).toMatch(/reviewSubmitErrorMessage\(.*'provider_to_client'\)/s)
  })
})

describe('PROVIDER: persistent review entry, keyed by booking_id', () => {
  it('booking detail loads the provider→client opportunity for completed bookings', () => {
    expect(bookingDetail).toMatch(/useReviewOpportunity\(/)
    expect(bookingDetail).toMatch(/'provider_to_client'/)
    // read only for the provider on a completed booking
    expect(bookingDetail).toMatch(/isProvider && booking\?\.status === 'completed'/)
  })

  it('re-entry routes to the provider review form for THAT booking id', () => {
    expect(bookingDetail).toMatch(/post-booking\/provider-review\?id=\$\{booking\.id\}/)
  })

  it('the entry is shown only for the provider on a completed booking', () => {
    expect(bookingDetail).toMatch(/isProvider && bucket === 'completed'/)
  })
})

describe('TRUTHFULNESS: submitted is not revealed', () => {
  it('the confirmation never claims public visibility', () => {
    expect(submitted).not.toMatch(/now live|public|Other Houston clients can now see/i)
    expect(submitted).toMatch(/stays private/i)
  })

  it('the client review form explains the blind window rather than promising publication', () => {
    expect(clientForm).toMatch(/stays private until/i)
    expect(clientForm).not.toMatch(/Reviews are public/i)
  })

  it('no control claims to post a review that is never written (QA-TRUTH-001)', () => {
    expect(stripTs(clientForm)).not.toMatch(/post without a written review/i)
    expect(clientForm).toMatch(/nothing will be posted/i)
  })

  it('the confirmation star display reflects the submitted rating (QA-TRUTH-003)', () => {
    // A hardcoded five-star row misrepresents a 1-4 star review.
    expect(clientForm).not.toMatch(/\[0, 1, 2, 3, 4\]\.map/)
    expect(clientForm).toMatch(/n <= parsedRating/)
  })

  it('a duplicate submit never routes to the success screen (CODE-DUP-004)', () => {
    const dup = clientForm.slice(clientForm.indexOf('if (isDuplicate)'))
    const branch = dup.slice(0, dup.indexOf('console.log'))
    expect(branch).not.toMatch(/post-booking\/submitted/)
    expect(branch).toMatch(/reviewOpportunityCopy\('already_submitted'/)
  })
})

describe('RPC review_opportunity: server-authoritative contract', () => {
  it('defers its positive answer to review_eligible (one eligibility authority)', () => {
    // CODE-DUP-001: the read helper must never report 'eligible' for a booking the
    // INSERT policies would reject, even after review_eligible() gains conditions.
    expect(rpc).toMatch(/if not public\.review_eligible\(p_booking_id\) then/)
    expect(rpc.indexOf('review_eligible(p_booking_id)')).toBeLessThan(
      rpc.indexOf("return 'eligible'"),
    )
  })

  it('resolves a never-completed booking (incl. a real no_show) to not_completed', () => {
    // A no_show never had completed_at stamped, so the completed_at anchor is what
    // resolves it. This is the approved product rule.
    expect(rpc).toMatch(/if v_booking\.completed_at is null then\s*\n\s*return 'not_completed';/)
  })

  it('does NOT gate eligibility on live booking status (SEC-DATA-101)', () => {
    // Anchoring on live status would let a provider suppress an already-earned
    // review by flipping a completed booking to no_show, and would disagree with
    // review_eligible(), which the INSERT policies use and which has no status test.
    expect(stripSql(rpc)).not.toMatch(/v_booking\.status\s*=/)
  })

  it('fails CLOSED for a caller with no identity (null auth.uid())', () => {
    // `auth.uid() = user_id` is NULL, not false, when auth.uid() is null, and
    // PL/pgSQL treats a NULL `if` condition as false — so the gate must return
    // before any state is read.
    expect(rpc).toMatch(/if v_uid is null then\s*\n\s*return 'not_participant';/)
    expect(rpc.indexOf('v_uid is null')).toBeLessThan(rpc.indexOf('from public.bookings'))
    expect(rpc).toMatch(/coalesce\(v_is_participant, false\)/)
    // no bare auth.uid() comparison survives in the participant/already checks
    expect(stripSql(rpc)).not.toMatch(/auth\.uid\(\) = v_booking\.user_id/)
  })

  it('binds the caller to the booking before returning any state', () => {
    expect(rpc.indexOf('if not v_is_participant then')).toBeLessThan(
      rpc.indexOf("return 'not_completed'"),
    )
    expect(rpc).toMatch(/v_uid = v_booking\.user_id/)
    expect(rpc).toMatch(/p\.user_id = v_uid/)
  })

  it('does not leak booking existence to a non-participant', () => {
    expect(rpc).toMatch(/if not found then\s*\n\s*return 'not_participant';/)
  })

  it('is keyed by booking_id throughout, so repeat bookings stay independent', () => {
    expect(rpc).toMatch(/pr\.booking_id = p_booking_id/)
    expect(rpc).toMatch(/cr\.booking_id = p_booking_id/)
    expect(rpc).toMatch(/review_window_closed\(p_booking_id\)/)
  })

  it('is SECURITY DEFINER with a pinned search_path and no public grant', () => {
    expect(rpc).toMatch(/security definer/)
    expect(rpc).toMatch(/set search_path = ''/)
    expect(rpc).toMatch(/revoke all on function public\.review_opportunity\(uuid, text\) from public/)
    expect(rpc).toMatch(/grant execute on function public\.review_opportunity\(uuid, text\) to authenticated/)
    expect(rpc).not.toMatch(/to anon/)
    // Supabase default privileges auto-grant EXECUTE to anon at CREATE time, and
    // `revoke from public` does NOT remove that direct grant. It must be revoked
    // explicitly — the same correction shipped in 20260829070000.
    expect(rpc).toMatch(
      /revoke execute on function public\.review_opportunity\(uuid, text\) from anon/,
    )
  })

  it('returns only a state string — never review content', () => {
    expect(rpc).toMatch(/returns text/)
    expect(stripSql(rpc)).not.toMatch(/rating|review_text/)
  })

  it('honors under_review and the window close', () => {
    expect(rpc).toMatch(/if v_booking\.under_review then\s*\n\s*return 'under_review';/)
    expect(rpc).toMatch(/review_window_closed\(p_booking_id\) then\s*\n\s*return 'window_closed';/)
  })
})

describe('PRODUCT TRUTH: 7-day model, no ~1-hour fallback', () => {
  const docs = [
    ['BETA_SCOPE', read('docs', 'product', 'BETA_SCOPE.md')],
    ['REVIEWS_MODEL', read('docs', 'product', 'REVIEWS_MODEL.md')],
    ['USER_JOURNEYS', read('docs', 'product', 'USER_JOURNEYS.md')],
  ] as const

  it.each(docs)('%s does not present ~1 hour as approved current intent', (_n, src) => {
    expect(src).not.toMatch(/APPROVED PRODUCT INTENT[\s\S]{0,200}?~?1 hour/i)
    expect(src).not.toMatch(/the target is ~?1 hour/i)
  })

  it('the QA reviewer checklist no longer mandates a ~1-hour finding', () => {
    // Negative-only, deliberately. Asserting the PRESENCE of particular prose in an
    // agent spec coupled `npm run check` to a governance artifact: rewording the
    // checklist broke the app suite and pointed the failure at .agents/ (CODE-TEST-010).
    // The stale mandate is what must never come back; how the replacement is worded is
    // the agent spec's business, not this suite's.
    const checklist = read('.agents', 'qa-journey-reviewer', 'CHECKLIST.md')
    expect(checklist).not.toMatch(
      /Approved intent = reveal on counterpart submission, else \*\*~1 hour\*\*/,
    )
  })

  it('the 7-day window remains the single DB definition', () => {
    const phase0 = read(
      'supabase',
      'migrations',
      '20260902000000_reviews_phase0_foundation.sql',
    )
    expect(phase0).toMatch(/interval '7 days'/)
  })

  it('the UI does not re-derive the window from the RPC state', () => {
    for (const src of [satisfaction, clientForm, providerForm]) {
      expect(src).not.toMatch(/7 \* 24 \* 60 \* 60 \* 1000|SEVEN_DAYS/)
    }
  })
})

describe('PHASE 2 has not started', () => {
  const phase1Sources = [clientList, bookingDetail, satisfaction, clientForm, providerForm]
  it('no review_signals / reliability score / conduct profile code', () => {
    for (const src of phase1Sources) {
      expect(stripTs(src)).not.toMatch(
        /review_signals|reliability_score|cancellation_score|no_show_pct|delivered_at/,
      )
    }
  })
  it('no conduct/reliability table in the Phase 1 migration', () => {
    expect(stripSql(rpc)).not.toMatch(/create table/i)
    expect(stripSql(rpc)).not.toMatch(/review_signals|reliability|conduct/i)
  })
})

describe('RATING: a star-only review is valid (PRODUCT DECISION)', () => {
  it('client canPost requires only a parsed 1-5 rating', () => {
    expect(clientForm).toMatch(/const canPost = parsedRating != null/)
  })

  it('client no longer demands written text or a tag', () => {
    expect(stripTs(clientForm)).not.toMatch(/reviewText\.trim\(\)\.length > 10/)
    expect(stripTs(clientForm)).not.toMatch(/selectedCategories\.length > 0\s*$/m)
  })

  it('free text and tags remain OPTIONAL, not required', () => {
    // the inputs still exist; they are simply not gating submission
    expect(clientForm).toMatch(/setReviewText/)
    expect(clientForm).toMatch(/toggleCategory/)
  })

  it('provider applies the same star-only principle', () => {
    expect(providerForm).toMatch(/const canSubmit = rating > 0/)
  })

  it('no Phase 2 structured signal is required to submit', () => {
    const gate = clientForm.slice(clientForm.indexOf('const canPost'))
    const line = gate.slice(0, gate.indexOf('\n'))
    expect(line).not.toMatch(/signal|reliability|conduct/i)
  })
})

describe('PROVIDER: successful submission is confirmed, not silent (QA-UX-004)', () => {
  it('success sets a submitted state rather than navigating away', () => {
    expect(providerForm).toMatch(/setSubmitted\(true\)/)
    // the old silent exit on success is gone
    const submitFn = providerForm.slice(providerForm.indexOf('async function handleSubmit'))
    const body = submitFn.slice(0, submitFn.indexOf('function handleSkip'))
    expect(body).not.toMatch(/setSubmitting\(false\)\s*\n\s*router\.replace/)
  })

  it('renders a truthful confirmation reusing the shared state screen', () => {
    expect(providerForm).toMatch(/if \(submitted\)/)
    expect(providerForm).toMatch(/REVIEW_SUBMITTED_TITLE/)
    expect(providerForm).toMatch(/REVIEW_SUBMITTED_BODY/)
    expect(providerForm).toMatch(/ReviewStateScreen/)
  })

  it('the shared confirmation copy never claims public visibility', () => {
    const lib = read('lib', 'reviews.ts')
    const block = lib.slice(lib.indexOf('REVIEW_SUBMITTED_TITLE'))
    const copy = block.slice(0, block.indexOf('// Maps a failed'))
    expect(copy).toMatch(/Review submitted/)
    expect(copy).toMatch(/stays private until/i)
    expect(copy).not.toMatch(/now live|public|visible immediately|posted publicly/i)
  })

  it('submit and skip are distinguishable outcomes', () => {
    // skip still exits directly; submit goes through the confirmation
    expect(providerForm).toMatch(/function handleSkip\(\) \{\s*\n\s*router\.replace/)
  })
})

describe('LIFECYCLE: completed -> no_show is rejected at the write boundary', () => {
  it('the guard migration exists and raises on a completed booking', () => {
    expect(guard).toMatch(/if old\.completed_at is not null then/)
    expect(guard).toMatch(/A completed booking cannot be marked no_show/)
    expect(guard).toMatch(/errcode = 'check_violation'/)
  })

  it('the guard sits inside the no_show branch only', () => {
    const nsBranch = guard.slice(guard.indexOf("elsif new.status = 'no_show' then"))
    const nextBranch = nsBranch.indexOf('    else')
    expect(nsBranch.slice(0, nextBranch)).toMatch(/old\.completed_at is not null/)
  })

  it('no OTHER transition was altered (guard fn == Phase 0 fn + this one check)', () => {
    // Compare the two function bodies with comments and whitespace removed; the only
    // difference must be the new completed_at guard.
    const fnOf = (src: string) => {
      const i = src.indexOf('create or replace function public.enforce_booking_write_integrity')
      const j = src.indexOf('revoke all on function public.enforce_booking_write_integrity')
      return src
        .slice(i, j)
        .replace(/--.*$/gm, '')
        .replace(/\s+/g, ' ')
        .trim()
    }
    const added =
      " if old.completed_at is not null then raise exception 'A completed booking cannot be marked no_show' using errcode = 'check_violation'; end if;"
    expect(fnOf(guard).replace(added, '')).toBe(fnOf(phase0))
  })

  it('review_eligible / review_window_closed are NOT redefined by the guard', () => {
    expect(guard).not.toMatch(/function public\.review_eligible/)
    expect(guard).not.toMatch(/function public\.review_window_closed/)
    expect(guard).not.toMatch(/interval '7 days'/)
  })

  it('creates no table, policy, or trigger — function replacement only', () => {
    expect(stripSql(guard)).not.toMatch(/create table|create policy|create trigger|drop policy/i)
  })

  it('service_role still bypasses, leaving an ops correction path open', () => {
    expect(guard).toMatch(/if auth\.role\(\) = 'service_role' then\s*\n\s*return new;/)
  })
})

describe('NAVIGATION + loading contract (CODE-ROUTE-010 / CODE-STATE-010 / CODE-ARCH-013)', () => {
  it('a submitted client review cannot be returned to via back', () => {
    expect(clientForm).toMatch(/router\.replace\(\('\/post-booking\/submitted\?id=' \+ id\)/)
    expect(stripTs(clientForm)).not.toMatch(/router\.push\(\('\/post-booking\/submitted/)
  })

  it('booking detail honours the hook loading contract', () => {
    expect(bookingDetail).toMatch(/loading: reviewOppLoading/)
    expect(bookingDetail).toMatch(/reviewOppLoading \? 'unknown' : reviewOpp/)
  })

  it('a rejected opportunity read cannot strand a screen with no exit', () => {
    const hook = read('hooks', 'useReviewOpportunity.ts')
    expect(hook).toMatch(/\.catch\(/)
    // the catch must clear loading, not just swallow
    const c = hook.slice(hook.indexOf('.catch('))
    expect(c).toMatch(/setLoading\(false\)/)
    expect(c).toMatch(/setOpportunity\('unknown'\)/)
  })

  it('no inert hover state remains in the satisfaction screen', () => {
    expect(satisfaction).not.toMatch(/hoveredRating/)
  })
})

describe('COPY TRUTHFULNESS: negative reviews and unverified claims', () => {
  it('the only route to the review form is rating-neutral (QA-UX-001)', () => {
    // A 1-2 star client must not have to affirm a positive experience to review.
    // Full coverage of the negative path lives in negativeReviewPath.test.ts.
    expect(stripTs(satisfaction)).not.toMatch(/Yes, it was great/)
    expect(satisfaction).toMatch(/Continue to review/)
  })

  it('the review form makes no unverified availability claim (QA-TRUTH-002)', () => {
    expect(stripTs(clientForm)).not.toMatch(/has availability next week/i)
  })

  it('review copy does not assume provider gender', () => {
    for (const src of [satisfaction, clientForm, providerForm, submitted]) {
      expect(stripTs(src)).not.toMatch(/\b(her|she|his|he)\b business/i)
      expect(stripTs(src)).not.toMatch(/\bShe has\b|\bHe has\b/)
    }
  })

  it('the review prompt does not presuppose a positive experience', () => {
    expect(stripTs(clientForm)).not.toMatch(/what made this appointment great/i)
  })
})
