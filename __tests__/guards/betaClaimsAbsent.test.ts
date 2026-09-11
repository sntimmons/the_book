import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ── UNSUPPORTED BETA CLAIMS DO NOT COME BACK ──────────────────────────────
//
// The closed Houston beta processes NO payment (PD-042) and has NO
// user-completable identity verification (PD-004). It also has no push, device
// or email notification channel (PD-059) and no staffed operational queue behind
// a report. Before this guard existed, the app said otherwise in a dozen places:
// client onboarding assured every new user that their "payment info is encrypted
// and secure" and that "Deposits are held safely until your appointment"; the
// welcome carousel promised "Protected payments. Verified providers."; a provider
// profile could show a green "ID Verified" shield next to "Verification coming
// soon"; provider go-live told providers to "Complete verification within 14 days"
// of a process that does not exist; and an issue report promised refunds "within
// 48 hours" of charges that are never taken.
//
// Every one of those was a one-line change to write and a one-line change to
// re-add. None of them would fail a typecheck, a lint run or any behavioural
// test, because none of them is behaviour — they are sentences, and a sentence
// that misdescribes money or identity is the one kind of inaccuracy a beta cannot
// recover from. So the ABSENCE is pinned the way PD-069's removal is pinned
// (`barterValueAbsent.test.ts`): by reading the source of the live surfaces.
//
// SCOPE IS DELIBERATELY LIVE-ONLY. `app/preview/**` is excluded: those screens
// exist to describe unbuilt capability, they are labelled "Coming soon" by a
// shared scaffold, and forbidding them from naming a future feature would be
// exactly backwards. Documentation is not scanned at all — `FUTURE_PRODUCT_IDEAS`
// and the marketing bank are supposed to discuss payments and verification.
//
// COMMENTS ARE STRIPPED FIRST. Every file this guard covers deliberately CONTAINS
// the removed wording, in a comment explaining why the code no longer says it. An
// assertion that prose could satisfy proves nothing.
//
// WHEN A CAPABILITY ACTUALLY SHIPS, EDIT THIS FILE. A failure here is not a
// request to reword around the guard; it is a question about whether the product
// can back the claim. If it can, delete the row and say so in the commit.

const ROOT = join(__dirname, '..', '..')

// EVERY source root that can produce a user-visible string. `hooks` is here
// because it was NOT, and the omission cost: `hooks/useNotifications.ts` builds
// notification bodies and was still shipping "No charge was made." — a sentence
// this guard has a purpose-built pattern for — while the suite reported clean.
// A guard scoped narrower than the claim in its own header is worse than no
// guard, because the next engineer trusts the green run over a manual read.
// If a new directory renders copy, it belongs in this list.
const ROOTS = ['app', 'components', 'lib', 'hooks', 'store', 'context']
const EXCLUDED_DIRS = [join('app', 'preview')]

function liveSourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = relative(ROOT, full)
      if (EXCLUDED_DIRS.some((ex) => rel === ex || rel.startsWith(ex + sep))) continue
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(rel)
    }
  }
  for (const r of ROOTS) walk(join(ROOT, r))
  return out.sort()
}

/**
 * Source with block comments, JSX comment expressions and line comments removed —
 * TRAILING line comments included. The previous version anchored to line start
 * (`/^\s*\/\/.*$/gm`), so `const x = 1 // "Deposits are held safely"` survived
 * stripping and failed the guard, with a message pointing at a file where the
 * copy does not exist. Given this slice's house style is to quote removed copy
 * in comments, that trap was one keystroke away.
 *
 * The `//` scan is string-literal aware: it walks the line and ignores a `//`
 * that sits inside a quoted string, so a URL or a path in copy is not mistaken
 * for a comment. Results are memoized — ~30 claims x ~150 files was 4,500
 * re-reads per run, which is a disincentive to adding claims, and adding claims
 * is this guard's whole growth path.
 */
const cache = new Map<string, string>()
function code(rel: string): string {
  const hit = cache.get(rel)
  if (hit !== undefined) return hit
  const withoutBlocks = readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const out = withoutBlocks
    .split('\n')
    .map((line) => {
      let quote: string | null = null
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]
        if (quote) {
          if (ch === '\\') i += 1
          else if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch
        } else if (ch === '/' && line[i + 1] === '/') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
  cache.set(rel, out)
  return out
}

interface Claim {
  /** What the product would have to be able to do for this wording to be honest. */
  why: string
  pattern: RegExp
}

// PAYMENT. The Book does not process cards, charge, hold deposits, custody money,
// protect payments, offer escrow or support a wallet. Nothing may say it does,
// and nothing may say a charge is merely deferred ("not charged YET", "you'll be
// asked to pay AFTER") — a deferred charge is still a charge that never comes.
const PAYMENT_CLAIMS: Claim[] = [
  { why: 'no payment protection exists', pattern: /protected payments?/i },
  { why: 'no payment protection exists', pattern: /payment protection/i },
  { why: 'no deposit is ever taken', pattern: /deposit protection/i },
  { why: 'no protection product exists or is decided', pattern: /booking protection/i },
  { why: 'no money is ever custodied', pattern: /held safely/i },
  { why: 'no money is ever custodied', pattern: /\bescrow\b/i },
  { why: 'no payment method is collected or stored', pattern: /encrypted and secure/i },
  { why: 'no wallet or processor integration exists', pattern: /apple pay/i },
  // `\b` already refuses `stripe_account_id` (an underscore is a word
  // character, so there is no boundary), which is why column names are not hits.
  { why: 'no processor integration exists', pattern: /\bstripe\b/i },
  { why: 'no card brands are accepted', pattern: /mastercard|\bamex\b/i },
  { why: 'nothing is charged at any point', pattern: /charged at booking confirmation/i },
  { why: 'nothing is charged at any point', pattern: /(only )?charged when/i },
  { why: 'nothing is charged at any point', pattern: /will (only )?be charged/i },
  { why: 'a deferred charge is still a charge that never comes', pattern: /not charged yet/i },
  { why: 'a deferred charge is still a charge that never comes', pattern: /won'?t be charged/i },
  { why: 'there is no in-app payment step, now or later', pattern: /asked to pay (only )?after/i },
  { why: 'there is no in-app payment step, now or later', pattern: /payment (is )?taken until/i },
  { why: 'The Book holds no payment method it could have charged', pattern: /no charge (was )?made/i },
  { why: 'The Book neither processes nor records payment', pattern: /was payment completed/i },
  { why: 'no refund path exists because no charge does', pattern: /eligible refunds/i },
  // FOUND BY REVIEW, not by this list: a percentage penalty is a charge claim
  // even when the word "charged" never appears. `lib/policy.ts` renders
  // "100% charge for no-shows" from the PLATFORM default, on a screen the
  // client ticks a box to agree to.
  { why: 'The Book collects no fee, so no surface may present one as collectable',
    pattern: /\d+%\s*charge\b/i },
  { why: 'no completed-service value is tracked on a screen that shows none',
    pattern: /is tracked here/i },
  { why: 'The Book observes no payment, so it cannot report money spent',
    pattern: /total spent/i },
]

// IDENTITY. There is no government-ID, selfie, liveness or third-party
// verification flow, so no provider or client can have completed one. Marketplace
// approval and founder curation are NOT identity verification and must not borrow
// its vocabulary. "Verification coming soon" is fine and deliberately not listed:
// it describes a future capability, which is true.
const IDENTITY_CLAIMS: Claim[] = [
  { why: 'no identity verification process exists', pattern: /\bID Verified\b/i },
  { why: 'no identity verification process exists', pattern: /\bidentity[ -]verified\b/i },
  // Bound to VERIFICATION rather than left as a bare numeric window. The
  // SLA block below explains why bare windows are wrong — a provider's own
  // cancellation terms legitimately read "within 24 hours" — and this entry
  // was breaking that rule, so a future "14 days" reschedule option would have
  // failed a test blaming identity verification.
  { why: 'no verification exists to have a deadline (OQ-036)',
    pattern: /verif\w*[^.]{0,60}within \d+\s*(day|week|month)/i },
  { why: 'no verification exists to have a deadline (OQ-036)',
    pattern: /within \d+\s*(day|week|month)s?[^.]{0,60}verif/i },
  { why: 'no verification deadline is approved', pattern: /complete verification within/i },
]

// NOTIFICATIONS. No push, device or email notification path exists anywhere in
// the product. An update is visible in the app when the user opens it; nothing is
// delivered to them.
const NOTIFICATION_CLAIMS: Claim[] = [
  { why: 'no notification channel exists (PD-059)', pattern: /notified instantly/i },
  { why: 'no notification channel exists (PD-059)', pattern: /will be notified/i },
  { why: 'no notification channel exists (PD-059)', pattern: /you'?ll be notified/i },
  { why: 'no notification channel exists (PD-059)', pattern: /get a notification/i },
]

// OPERATIONS. No response-time commitment has ever been approved, and no operator
// queue is staffed or even reachable in-product. Barter's "This trade is under
// review." is the approved shape: it says a human must look, and promises nothing
// about when. Note these are worded as SUPPORT promises rather than as a bare
// "within N hours", because a provider's own cancellation window legitimately
// reads "if cancelled within 24 hours" and must not trip this guard.
const SLA_CLAIMS: Claim[] = [
  { why: 'no support response commitment is approved', pattern: /we will follow up within/i },
  { why: 'no support response commitment is approved', pattern: /our team responds within/i },
  { why: 'no operator review queue is staffed', pattern: /our team will review/i },
  { why: 'no operator review queue is staffed', pattern: /reviewed by a real person/i },
  // An OUTCOME promise outranks a timing promise and survived the first sweep
  // directly above two SLAs that did not: "we will make it right".
  { why: 'no remedy mechanism exists behind a report', pattern: /make it right/i },
  { why: 'no remedy mechanism exists behind a report', pattern: /help resolve this/i },
  // AFFIRMATIVE only. The bare word banned the truthful phrasings a beta most
  // wants — "response times are not guaranteed" — which is how a guard gets its
  // patterns deleted instead of its claims fixed.
  { why: 'nothing in this beta is guaranteed to a user',
    pattern: /(?<!not )(?<!never )\bguaranteed\b/i },
]

const ALL: Claim[] = [
  ...PAYMENT_CLAIMS,
  ...IDENTITY_CLAIMS,
  ...NOTIFICATION_CLAIMS,
  ...SLA_CLAIMS,
]

describe('no live surface makes an unsupported beta claim', () => {
  const files = liveSourceFiles()

  it('finds the live surfaces to scan (a guard over nothing passes vacuously)', () => {
    expect(files.length).toBeGreaterThan(80)
    expect(files).toContain(join('app', 'index.tsx'))
    expect(files).toContain(join('components', 'ProviderProfile.tsx'))
    expect(files.some((f) => f.startsWith(join('app', 'preview')))).toBe(false)
  })

  it.each(ALL.map((c) => [c.pattern.source, c] as const))(
    'no live surface says %s',
    (_label, claim) => {
      const offenders = files
        .filter((rel) => claim.pattern.test(code(rel)))
        .map((rel) => `${rel} — ${claim.why}`)
      expect(offenders).toEqual([])
    },
  )
})

// A TEXT guard cannot see an ICON. The verification check-mark rendered on the
// provider profile, on Search and on Top Rated carried no words at all — it was
// a tick in a circle, conditioned on `identity_verified` — so every pattern above
// was structurally blind to the single most-seen verification claim in the
// product. Two of the three survived the first pass of this slice for exactly
// that reason. This asserts the SHAPE instead: no live surface may render
// anything off that column.
describe('no live surface renders a verification claim from identity_verified', () => {
  it('does not condition any render on the flag', () => {
    const offenders = liveSourceFiles()
      .filter((rel) => /identity_verified\s*&&/.test(code(rel)))
      .map((rel) => `${rel} — no identity-verification process exists (PD-004)`)
    expect(offenders).toEqual([])
  })

  it('plumbs no verified-ness prop that nothing can honestly read', () => {
    const offenders = liveSourceFiles()
      .filter((rel) => /\b(isVerified|providerVerified)\b/.test(code(rel)))
      .map((rel) => `${rel} — prop has no supportable reader`)
    expect(offenders).toEqual([])
  })
})

// The client onboarding payment step is not merely reworded — it is GONE. It asked
// every new client to configure a payment system that does not exist.
//
// BE EXACT ABOUT ITS REACHABILITY, because a reviewer challenged this and the
// stale record disagrees with the code. At the commit this branch was cut from
// (`224d609`), `uploads.tsx` already read "Step 3 of 3" and both its buttons
// already routed to `/onboarding/client/preview` — nothing in app/, components/
// or lib/ referenced the payment screen, so it survived only as a deep-linkable
// route (thebook://onboarding/client/payment) carrying four false claims. It WAS
// wired in at some earlier point — `docs/history/PASS1_BUTTON_INVENTORY.md`
// records it, and uploads.tsx still carried a stale "Progress bar 75%" comment —
// but docs/history is a dated snapshot and the code is what governs.
//
// THE FLOW IS NOW TWO STEPS: index → uploads → preview, and says "of 2".
// `preferences.tsx` was deleted by the PR #74 Founder rulings: PD-079 removed the
// interests grid and the mobile switch as data nothing read, which left it asking
// the SAME question step 1 asks with the SAME component — and step 1 is the one
// that writes the answer to the store. No replacement question was invented to
// preserve the count. `preview.tsx` is deliberately not in the list below: it is
// the summary screen and carries no step label.
describe('client onboarding does not collect payment', () => {
  it('has no payment step file', () => {
    expect(existsSync(join(ROOT, 'app/onboarding/client/payment.tsx'))).toBe(false)
  })

  it('has no route into a client onboarding payment step', () => {
    const offenders = liveSourceFiles().filter((rel) =>
      /onboarding\/client\/payment/.test(code(rel)),
    )
    expect(offenders).toEqual([])
  })

  it('numbers its steps over the two that exist', () => {
    // PD-081 locks client onboarding at TWO steps. The two are now the details
    // screen and the preview, which is where the profile is actually created.
    //
    // `uploads.tsx` used to be the second and has been REMOVED: it was entirely
    // placeholder — nine photo slots and two reel slots, every one raising
    // "Coming soon" — promising a client media system the product does not have,
    // in the flow where a client decides what this product is. Nothing was
    // invented to replace it, which PD-081 also forbids.
    expect(code('app/onboarding/client/index.tsx')).toMatch(/Step \d of 2/)
    expect(code('app/onboarding/client/index.tsx')).not.toMatch(/of 3|of 4/)
  })

  it('has no client media placeholder left in onboarding', () => {
    // The removed step is gone, not hidden. A surviving file or route would let
    // it come back by accident, and a "Coming soon" media control in onboarding
    // is a promise the product cannot keep.
    expect(existsSync('app/onboarding/client/uploads.tsx')).toBe(false)
    const idx = code('app/onboarding/client/index.tsx')
    expect(idx).not.toMatch(/client\/uploads/)
    for (const claim of ['Add reel', 'Add photo', 'Up to 60 seconds']) {
      expect([claim, idx.includes(claim)]).toEqual([claim, false])
    }
  })

  it('has no route into the removed preferences step', () => {
    // The step is gone, not hidden. A surviving route would leave it
    // deep-linkable, which is exactly how the payment step outlived its wiring.
    expect(existsSync(join(ROOT, 'app/onboarding/client/preferences.tsx'))).toBe(false)
    const offenders = liveSourceFiles().filter((rel) =>
      /onboarding\/client\/preferences/.test(code(rel)),
    )
    expect(offenders).toEqual([])
  })
})

// The provider review's fourth accountability dimension asked "Was payment
// completed?" and fed the answer back as a client statistic. The Book observes no
// payment, so it was an accountability finding the product cannot make. The
// question, the write and the aggregate are all gone; the column stays as legacy
// data no live surface reads.
describe('no surface treats payment completion as platform-held accountability', () => {
  it('the provider review does not write payment_completed', () => {
    expect(code('app/post-booking/provider-review.tsx')).not.toMatch(/payment_completed/)
  })

  // PLAIN ABSENCE, not a shape match. These were two formatting-coupled regexes
  // (`/tally\(\(r\) => r\.paymentCompleted\)/`) that hard-coded spacing around
  // `=>` and the name `tally`, so a prettier change or a rename would have made
  // them silently un-matchable — passing while guarding nothing. Dropping the
  // read path as well as the write (the PD-069 treatment of `offering_value`)
  // is what makes the simple assertion possible.
  it('does not read, type or aggregate payment completion anywhere', () => {
    expect(code('lib/reviews.ts')).not.toMatch(/payment_completed|paymentCompleted/)
  })

  it('the provider view of a client shows no payment stat', () => {
    expect(code('app/bookings/request/[id].tsx')).not.toMatch(/dimStats\.paymentCompleted/)
  })
})

// ── BOOKING & ONBOARDING INTEGRITY ────────────────────────────────────────
//
// Each of these pins a claim that was live in the product and is now gone. A
// guard is the only thing that stops a removed claim coming back the next time
// someone writes marketing copy into a flow.

describe('the booking flow does not say a thing happened before it happened', () => {
  it('only the real submit control says a request is being sent', () => {
    // The POLICY screen said "Send Request" and navigated to the contract. Two
    // steps still stood between there and sending, so anyone who stopped after
    // tapping it believed they had booked.
    const policy = code('app/book/policy.tsx')
    expect(policy).not.toMatch(/>\s*Send Request\s*</)
    expect(code('app/book/payment.tsx')).toMatch(/Send Booking Request/)
  })
})

describe('contract acceptance claims only what it can prove', () => {
  it('the fake signature canvas is gone from the flow', () => {
    // It rendered "Signature canvas — requires development build" beside a
    // button labelled "Sign" and produced a null signature_url: a control that
    // looked like evidence and was not.
    const c = code('app/book/contract.tsx')
    expect(c).not.toMatch(/requires development build/)
    expect(c).not.toMatch(/Signature canvas/)
  })

  it('claims durable acceptance, not a legal signature', () => {
    const c = code('app/book/contract.tsx')
    for (const claim of ['legally binding', 'e-signature', 'notarized', 'witnessed signature',
      'legally enforceable']) {
      expect([claim, c.toLowerCase().includes(claim)]).toEqual([claim, false])
    }
    // And it says what it DOES record, including the limit. Whitespace is
    // normalised because the copy wraps across source lines — a guard that only
    // matches an unwrapped string fails the moment someone reformats the file,
    // which teaches people to delete the guard.
    const flat = c.replace(/\s+/g, ' ')
    expect(flat).toMatch(/which version you accepted/)
    expect(flat).toMatch(/not a witnessed or legally certified signature/)
  })
})

describe('provider onboarding makes no unsupported claim', () => {
  it('the invented reels statistic is gone', () => {
    // "Providers with reels get 3x more profile views" had no product data
    // behind it, and was being used to push a provider into an OPTIONAL step.
    const r = code('app/onboarding/provider/reels.tsx')
    expect(r).not.toMatch(/3x/)
    expect(r).not.toMatch(/more profile views/)
  })

  it('and says plainly that media is optional', () => {
    expect(code('app/onboarding/provider/reels.tsx')).toMatch(/optional/i)
  })
})
