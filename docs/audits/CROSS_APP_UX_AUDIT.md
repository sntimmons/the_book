# Cross-App UX / Product Truth — audit and core corrections

**Status:** Historical (dated snapshot). The durable operational answer is
[../operations/UX_OPERATIONS.md](../operations/UX_OPERATIONS.md).
**Audit:** read-only, 2026-09-13, against `main` @ `64fa8f9`. Nothing was modified by it.
**Implementation:** merged to `main` as **`5166d9e`** (PR #91), same day. **No migration.**
**Production `kxregomuawwcqvisuhtr` was never connected to, linked, migrated or queried.**

Governing principles: complexity belongs underneath; a user should not have to understand
The Book in order to use it; **if a control doesn't do anything, don't show it**; product
truth beats persuasive copy; psychology to reduce load and improve comprehension — never to
coerce, shame, invent urgency or manufacture progress.

## Executive assessment

**The app is architecturally far ahead of its human experience.** Server-side truth is
strong: enum→human status translation exists, `PRODUCT TRUTH:` comments record prior
corrections, the report flow honestly promises no SLA, and the delete-account screen has the
best disclosure hierarchy in the product. Prior passes did real work, and this audit found
**fewer false claims than expected** because of it.

The gap was presentation, concentrated in three places: **Settings was mostly
non-functional**; **the booking flow — the revenue path — had the least scaffolding of any
flow**; and **onboarding spent the user's sense of progress on optional work**.

## Findings and disposition

| # | Finding | Severity | Cat | Disposition |
|---|---|---|---|---|
| 1 | **No reachable Privacy Policy or Terms of Service** — both `Alert.alert('Coming soon')` | **UX-BLOCKER** | C | **Rows removed; recorded as launch obligation.** Not engineering's to close (OQ-084) |
| 2 | **No reachable general support path** — "Contact Support" and "Report an Issue" were stubs | **UX-BLOCKER** | C | Rows removed; obligation recorded. **In-context reporting is unaffected and real** |
| 3 | **Booking flow had no progress indicator** across 7 screens, while provider onboarding had one | HIGH | B | **Fixed** — derived, never guessed |
| 4 | **"Skip, send request without a message"** claimed to send 3 screens early **and silently deleted attached photos** | HIGH | B | **Fixed** — relabelled; photos preserved |
| 5 | **Provider onboarding put optional Portfolio and Reels at steps 2–3**, ahead of the only required step | HIGH | B | **Fixed** — reordered; both moved out of the sequence and offered from the review |
| 6 | **10 dead Settings rows**, incl. Payment Methods (PD-042) and Identity Verification (PD-004/113) | HIGH | B/C | **Fixed** — removed, with the `stub()` helper |
| 7 | **"View payouts"** led only to "Payouts are not available during beta." | MEDIUM | B | **Fixed** — removed; COMPLETED SERVICE VALUE kept |
| 8 | **Expired requests looked Pending** in the Bookings list | MEDIUM | B | **Fixed** — derived and labelled, without blame |
| 9 | `location` and `neighborhood` **written from one value**, collapsing the Near You city fallback | MEDIUM | C | **Fixed** — two concepts, two values; neighbourhood now required |
| 10 | **Barter: 4 names for "interest", 3 for "terms"** | MEDIUM | B | **Fixed** — one name per act; no state renamed |
| 11 | **Follower count in the primary trust stat row** | MEDIUM | A/B | **Fixed** — demoted out of the row; feature untouched |
| 12 | Reels **"Available" badge unreachable** (flag hardcoded `false`) | LOW | B | **Fixed** — removed with its flag, styles and animation |
| 13 | Reels **built comment feature said "Coming soon"** on demo data | LOW | B | **Fixed** — now names the sample content |
| 14 | Empty states explain but offer **no next action** | MEDIUM | B | **Partially fixed** — only where a truthful action exists (trade activity) |
| 15 | Duplicate personal-info entry (`/settings/personal-info` and `/me/edit`) | MEDIUM | B | **Deferred** |
| 16 | **Orphaned route trees** — `dashboard/provider/*`, a Business analytics sub-tree, `/nearby`, `/top-rated`, `(tabs)/new` | NOTE | B | **Deferred** by instruction |

### Two audit findings that were WRONG, corrected here

The audit is a dated record and these stay visible rather than being quietly dropped:

- **"Messaging gives no explanation when unavailable."** It does. `MESSAGE_REFUSED_COPY`
  distinguishes server-stated refusals from transient ones and names no cause (PD-082). The
  audit grepped the screen's JSX and missed that the explanation is delivered via `Alert`
  from `hooks/useMessaging.ts`. **Only one real nuance remained** — the copy said "right
  now", inviting a retry the code knows cannot succeed — and that was fixed.
- **"Community composer presents 5 decisions at once."** It does not. `wantsService`,
  `wantsArea` and `wantsTiming` gate each field on the chosen intent, in both render and
  payload. The audit counted fields in the file rather than reading their conditions. **No
  change was needed**; the behaviour is now pinned by a test instead.

### A regression caught during implementation

The first attempt at the booking progress indicator resolved the step total on the service
screen via `fetchProviderContract(providerId)`. That would have **reintroduced a known
defect**: the `contracts` RLS is `auth.uid() = user_id OR is_contract_signer(id)`, so the
read returns **zero rows and no error** for a first-time client — the exact false negative
that once "skipped the signing gate entirely for every client, every provider, always". The
indicator would have confidently promised five steps to a client who takes six. Reverted;
the total is now established by the contract step, and is honestly absent until then.

## Cognitive load, after

| Flow | Before | After |
|---|---|---|
| Client onboarding | LOW | LOW |
| **Provider onboarding** | **HIGH** | **MEDIUM** — required path first, 5 steps, each stating its own requirement |
| Discover → provider | LOW | LOW |
| **Booking** | **HIGH** | **MEDIUM** — position known at every step; one fewer destructive surprise |
| Booking management | MEDIUM | LOW-MEDIUM — expiry visible in the list |
| Messaging | MEDIUM | LOW-MEDIUM |
| Reviews | MEDIUM | LOW — the blind window states the number |
| Community | MEDIUM | MEDIUM (already gated) |
| Reels | LOW | LOW |
| **Business** | **HIGH** | **HIGH** — unchanged; IA redesign deliberately out of scope |
| **Barter** | **HIGH** | **MEDIUM** — one name per act; screen count unchanged |
| Reports / blocking | LOW | LOW |
| Account deletion | MEDIUM *(by design)* | MEDIUM *(by design)* |

## What already worked especially well

The **account-deletion disclosure**. The **report/issue copy** — no SLA, no refund promise,
emergency guidance. **Enum→human status translation.** **Lane subtitles** that state their
own rule. The **`filterFailed` and null-vs-empty** distinctions in search and Open Today —
unusually careful. **Honest metric naming** ("COMPLETED SERVICE VALUE"). And the
**`PRODUCT TRUTH:` comment convention**, which is why several suspicious strings turned out
to be already-corrected.

## Deferred UX debt

Explicitly not touched: orphan-route deletion; the Business TODAY / OPERATE / GROW /
SETTINGS redesign; Discover lane changes; search ranking; Near You architecture beyond
semantic correctness; Reels' long-term role; Community post-type mix; reducing the number of
barter screens; the visual design system; app-wide copy polish; Privacy Policy and Terms
legal text; the support-channel destination.

Also deferred and worth naming: the **duplicate personal-info entry point**, and making the
booking step total knowable from step 1 — which needs a **narrow boolean RPC** ("does this
provider have an active contract"), and is a product decision because the earlier
provider-keyed contract read was removed deliberately so nobody holds a standing read path
into other providers' terms.
