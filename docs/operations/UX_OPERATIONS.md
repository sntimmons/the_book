# Cross-App UX — operations note and launch obligations

**Status:** Authoritative. **Anchor:** `main` @ `5166d9e` (PR #91, 2026-09-13).
**Audit this implements:** [../audits/CROSS_APP_UX_AUDIT.md](../audits/CROSS_APP_UX_AUDIT.md)
(read-only, 2026-09-13).
**Policy:** PD-004 (no identity verification), PD-042 (no payments), PD-059 (no
notification channel), PD-082 (a blocked person is never told), PD-112 (a headline may
not assert what its body calls future), PD-113 (verification terminology).

**No migration was added.** Every change is application code and copy.

---

## 1. Final booking flow and its progress

**service → date/time → message & reference photos → policy → [contract] → send →
confirmation**

The **contract step is conditional** — `app/book/contract.tsx` skips straight to sending
when the provider has no active contract. So a booking is **six steps or five**, and the
count is derived rather than typed: `lib/bookingProgress.ts` owns it, and
`components/StepProgress.tsx` renders it.

| What the client sees | When |
|---|---|
| `Step 1` … `Step 4` | Before the flow knows whether a contract applies |
| `Last step` | On the send screen, before the total is known — true on both paths |
| `Step 5 of 6` / `Step 6 of 6` | Once the contract step has established a contract exists |
| `Step 4 of 5` / `Step 5 of 5` | Once it has established there is none |

**Why the total is sometimes absent, and why that is deliberate.** The only safe read of
a provider's contract is keyed on a **booking**, which does not exist until the contract
step creates it. The provider-keyed read (`fetchProviderContract`) returns **zero rows
and no error** for a first-time client because of the `contracts` RLS — a false negative
that once "skipped the signing gate entirely for every client, every provider, always".
Using it to pre-compute the total would reintroduce it as a progress claim. **An unknown
total is honest; a guessed one is not.**

**The confirmation screen is not a step.** Numbering it would make the indicator read
"6 of 6" before the request is sent.

**Support note:** a client saying "it said step 4 and then jumped to the last step" has
seen correct behaviour — their provider has no contract on file.

## 2. Skipping the message

The control now reads **"Continue without a message"**. It previously read *"Skip, send
request without a message"* and the request was **not** sent — policy, possibly a
contract, and the send screen all came after.

**Skipping clears the message only. Reference photos are preserved.** They are separate
booking inputs, and the old handler silently discarded attached photos with no warning.
If a client reports losing photos at this step, that is a regression — it is pinned by
`__tests__/guards/crossAppUx.test.ts`.

## 3. Final provider onboarding sequence

**Basics & profile photo → Service → Availability → Policy → Readiness review → Go Live**
(`Step 1 of 5` … `Step 5 of 5`)

**Portfolio and Reels are no longer steps.** They were steps 2 and 3, ahead of the
service Go Live actually requires — so a provider asked to produce video early could
abandon before reaching the one thing that would have let them list. They are now offered
**from the readiness review**, marked optional, and remain available afterwards from
Business → Add Photos / Posts. Both return to the review rather than chaining forward.

### Required vs optional, stated once

| Step | Blocks Go Live? | What the screen says |
|---|---|---|
| Profile basics + photo | **Yes** | "Required to go live." |
| At least one service | **Yes** | "Required to go live — clients book a service, so you need at least one." |
| **Neighbourhood** | **Yes** (new, see § 4) | part of the basics step |
| Availability | **No** | "You can go live without this, but clients cannot book a time until you set hours." |
| Policy | **No** | "Optional — we use sensible defaults until you change them." |
| Portfolio | **No** | offered after the review as optional |
| Reels | **No** | offered after the review as optional |

**Visible ≠ bookable is unchanged.** A provider with no availability or no active service
is still **visible** and not **bookable**. Availability is not a Go Live blocker; it is a
booking blocker, and the screen now says so instead of leaving the provider to infer it.

**The progress bar is derived too.** It was hard-coded to `62.5%` — 5/8, left over from an
eight-step flow whose payout screen was deleted — and now comes from the same module as
the label, so the bar and the number cannot disagree.

## 4. Provider location and neighbourhood

**They are different concepts and are now stored that way.**

| Column | Value | Used for |
|---|---|---|
| `providers.location` | **`Houston, TX`** (the `BETA_CITY` constant in `lib/areas.ts`) | the city fallback, via `cityOf()` |
| `providers.neighborhood` | the area the provider picked from `HOUSTON_AREAS` | the exact-area match |

**What was wrong:** Go Live wrote the **same value into both**. `lib/areas.ts` yields bare
area names, so `cityOf('Midtown')` returned `'Midtown'` and the city tier could never
match anything — the Near You fallback existed and did nothing.

**A neighbourhood is now required to finish the profile step.** It was optional, and
skipping it had an invisible cost: permanent absence from Near You with nothing in the app
explaining why.

**Enforced in the UX, not the schema, and this is deliberate:** account erasure sets
`location = null, neighborhood = null` (`20261104000000`), so a `NOT NULL` constraint would
**refuse to let somebody delete their account**. A required field whose own product rules
require it to become null cannot be a database constraint.

**No precise location is collected or derived.** No street address, no geocoding, no
lat/long, nothing inferred. A fixed list of Houston areas, and nothing else. Carried
forward as **OQ-089** for whether the list or the question should change.

## 5. Settings — what was removed and what is withheld

**Ten rows did nothing but show an alert saying "Coming soon".** The `stub()` helper that
made them cheap to add is removed along with its last caller.

**Removed outright** (no capability exists, and none is implied): Phone Number, Email,
Payment Methods, Profile Visibility, Identity Verification, Help Center.

- **Phone Number / Email** cannot actually be changed in the app. Personal Information
  still shows account details; what is gone is the false affordance. Changing either is an
  auth-credential change, not a profile edit — restore when a real flow exists.
- **Payment Methods** — the whole Payments group is gone. The Book takes no payment
  (PD-042); a Payments section tells a beta user otherwise. Restore when payments exist,
  not when they are planned.
- **Identity Verification** — no process exists (PD-004) and the terminology is unapproved
  until one does (PD-113).

**Withheld, and tracked as launch obligations** (§ 9): Contact Support, Report an Issue,
Terms of Service, Privacy Policy.

**What still works, so this is not a support regression:** in-context reporting is real and
reachable — `components/ReportSheet.tsx` from a profile or post, and
`app/post-booking/issue.tsx` from a booking. **Safety reporting is unaffected.** What is
missing is a *general* support route, and it was missing before this change too — it was
simply hidden behind a row that said "Coming soon".

**Retained because real:** Personal Information, Blocked Accounts, Delete Account, Sign Out.

## 6. Payouts

**"View payouts" is removed from the provider dashboard.** It led to a screen whose entire
content was *"Payouts are not available during beta."* — an honest destination, and a
control that existed only to deliver that sentence.

**COMPLETED SERVICE VALUE stays exactly as it is.** It is a truthful count of work
completed. **Do not rename it** to earnings, balance, payout or wallet; it implies no money
movement and must not start to.

## 7. Expired booking requests

The Bookings **list** now shows **Expired** on a request whose deadline has passed. It
previously showed "Pending" identically to a live request, because expiry is **derived from
`expires_at`** rather than stored in `status` — the detail screen derived it and the list
did not, so a client could wait indefinitely on something nobody could answer.

**The copy does not blame the provider.** A provider who ran out of time has not refused,
and the pill is toned neutrally rather than as a rejection. No raw enum value is shown.

## 8. Messaging, reviews, Community, barter, profile, Reels

**Messaging unavailable.** "Message not sent — **Messaging is not available for this
conversation.**" It previously ended "right now", which invited a retry that cannot
succeed: this copy is shown only for refusals the server stated (a block, a declined
request, the one-message-while-pending rule). **It names no cause** — PD-082 means a
blocked person is never told they were blocked, so it must read identically whichever rule
refused it. Transient failures still get "check your connection and try again".

**Review blind window.** The confirmation says the review becomes visible *"once [Name]
reviews you too, or 7 days after your appointment — whichever comes first."* The 7 days was
previously stated only before submitting. It reveals **nothing** about whether the other
person has reviewed — a condition, not a report — and exposes no reputation internals.

**Community composer** was already correct and is now pinned: each secondary field
(service, area, timing) is gated on the chosen intent, in both the render and the payload.

**Barter vocabulary — one name per act.** Four names for expressing interest and three for
proposing terms are now one each. **No state name, RPC or transition was changed.**

| Act | Now called |
|---|---|
| Saying you want a trade | **"I'm interested"** (status remains "Interested") |
| Offering terms | **"Propose terms"** |
| Revising terms | **"Propose different terms"** |
| Agreeing | "Accept these terms" (unchanged) |

The composer's card titles are nouns — **"Your terms"**, **"Revised terms"** — so one
screen never shows the same phrase twice.

**Provider profile.** Follower and Following counts are out of the **primary stat row**,
which is where a client reads trust signals; a follower number there invited exactly the
inference marketplace ranking refuses to make. The row now shows Bookings and Rating.
**The follow feature is untouched** — only its placement changed.

**Reels.** The pulsing "Available" badge is removed: its flag was hardcoded `false` and
could never render, and "available" is not something this beta can establish. Commenting on
a **sample** reel now says so honestly instead of claiming the feature is "coming soon".

**Messages after Session 7B** (design: [design/MESSAGES.md](../design/MESSAGES.md)) — the
support-facing changes:

- **The inbox filter "All" is now "Conversations".** It never included pending requests or
  declined ones, so the old label promised a complete view and showed a partial one. **Nothing
  about which conversations appear has changed** — only the word. *"Where did All go"* is
  expected; the answer is that it was renamed to describe what it always showed.
- **A pending request appears under Requests, never under Conversations**, with a truthful count
  in the filter. The **Messages tab shows no badge**.
- **The empty screens no longer say "Message a provider to get started."** There is no compose
  control in Messages, so that sentence pointed at an action the screen could not perform. A
  conversation still starts from a provider's profile.
- **Long threads now show day separators** — Today, Yesterday, a weekday, then a date. Derived
  from existing message times; nothing was backfilled and no message changed.
- **The booking service and the request state now sit in a band under the thread header** rather
  than in the header line and down beside the keyboard.
- **Safety is unchanged and in the same place.** The block notice still sits above the composer
  with its Unblock action, the composer still does not close for a blocker (a live booking keeps
  a working thread by design), the "…" safety menu is still in the thread header, and the
  refusal copy still names no cause — PD-082 means a blocked person is never told they were
  blocked.
- **Starting a conversation looks like Third now too.** The first-contact composer reached from
  a provider's **Message** control (and from the booking flow) was the last screen on the old
  palette; it was migrated in Session 7C. **Nothing about starting a conversation changed** —
  same eligibility, same recipient, same one-request-then-wait behaviour, and the same wording
  when the server refuses.
- **No read receipts, typing indicators, presence or online status were added**, and none exist.
  If someone asks whether the other person has "seen" a message: the product does not report
  that, and `is_read` drives only the recipient's own unread mark.

**Reels after Session 6B** (design: [design/REELS.md](../design/REELS.md)) — the support-facing
changes:

- **A single tap pauses and resumes.** There was previously no way to pause a reel at all; the
  thing that looked like a play button was a decorative glyph that could not be pressed. A
  paused reel says **PAUSED** and shows a brightened seek line.
- **No like, comment, view or follower number appears anywhere on the surface.** Liking,
  saving, commenting and sharing all still work. *"Where did my like count go"* is expected and
  correct: counts were removed deliberately, the interaction was not.
- **"Book" is now "View & book"** and opens the provider's profile, where the booking action
  lives. The old label promised a booking the control never started.
- **Providers see a small `+` in the top right that opens Posts & Reels.** Clients do not see
  it, and neither does a provider who has not finished onboarding — it needs both a provider
  role and a provider row. It is a shortcut to the existing uploader, not a second one, and the
  durable path is still Me → My Studio.
- **A blocked provider's reels are still absent in both directions** — the feed reads
  `posts_visible`, unchanged by this work.

## 9. OPEN LAUNCH OBLIGATIONS — none of these are complete

| # | Obligation | Notes |
|---|---|---|
| 1 | **Reachable Privacy Policy** | Blocking. The app collects personal data, takes bookings, and runs a 30-day deletion policy with legally-retained evidence. Its retention language depends on **OQ-084** (counsel). |
| 2 | **Reachable Terms of Service** | Blocking, same reasoning. |
| 3 | **Real Contact Support destination** | A beta user with a problem currently has no general route to a person. In-context reporting works; this does not replace it. |
| 4 | **General Report an Issue route**, if wanted | In-context reporting already covers safety. This is the generic case. |
| 5 | **OQ-084** — retention durations and the privacy/FAQ language | Counsel, not engineering. Gates 1 and 2. |

**Do not close any of these by adding a placeholder.** A document that exists but says
nothing, or a support form that goes nowhere, keeps the same lie behind better wording —
which is precisely why the rows were removed rather than repointed.

## 10. What Operations should know

- **A client asking why the step count changed mid-booking**: their provider has no
  contract on file, so the flow is one step shorter. Correct behaviour.
- **A provider asking why they are not in Near You**: they may not have set a
  neighbourhood. It is required for new providers now; anyone onboarded before this change
  may still be missing it, and it is editable from Business → Edit Profile.
- **A provider asking about payouts**: The Book moves no money. "Completed service value"
  is a record of work done, not a balance owed.
- **A client asking where the Privacy Policy is**: it is not in the app yet. Do not
  improvise an answer about what it says.
- **A provider asking whether Reels or portfolio are required to go live**: no. Basics, a
  photo, a service and a neighbourhood.

## Attribution on content surfaces (Phase 4C, 2026-09-15)

Discover now shows **content** as well as providers, and content carries a rule the provider
surfaces do not need: **media without attribution reads as a recommendation.** A row of
unlabelled photographs on a marketplace looks like the product endorsing what is in them.

So every content tile names its source, and the naming is deliberately the *weakest* thing
it could truthfully be:

| | Treatment |
|---|---|
| Provider identity | `labelMeta` / `caption` at `textPrimary` or `textSecondary` |
| Time | `caption` at `textSecondary`, always subordinate to the identity |
| Anything evaluative | **Absent** — no rating, followers, likes, engagement, badges, verification, completed bookings, price or quality language |

The identity line answers *whose work is this*. It never answers *is this good*. The types
behind these rows carry no field that could answer the second question, which is what keeps
the rule from depending on discipline.

**Where a name cannot be read, it is omitted rather than invented**, and the tile still
appears — attribution is a caption on the work, never a filter on it.

This is the same principle the provider card follows (`components/ui/ProviderCard.tsx`): a
surface may state facts about identity freely and must state nothing about worth that the
product cannot support.
