# Screen Status Map (v1)

Walks the Master Product Sitemap against the actual code in `~/the-book-app` (and migrations in `~/the-book/supabase/migrations`). Read-only audit, no code changes.

**Labels**
- **BUILT** — screen exists and works with real Supabase data
- **PARTIAL** — exists but uses mock/hardcoded data, or is missing key functionality
- **STUB** — file exists but is a placeholder ("Coming soon", empty, or no real UI)
- **MISSING** — in the sitemap but no code exists for it
- **ORPHAN** — code exists but nothing routes to it (unreachable in normal use)

## Summary counts
| Status | Count |
|---|---:|
| **BUILT** | 47 |
| **PARTIAL** | 10 |
| **STUB** | 9 |
| **MISSING** | 18 |
| **ORPHAN** | 1 |

(Sitemap items + Provider Profile sub-features + extras tracked. Counts treat each sitemap line item as one row even when multiple files implement it.)

---

## AUTHENTICATION

| Item | Status | File | Reason |
|---|---|---|---|
| Welcome 1 → 2 → 3 (intro slides) | **BUILT** | `app/index.tsx` | Three slides cycle inside one screen via the `SLIDES` array (lines 22-38). Auto-rotates, with the video bg. |
| Role Selection | **BUILT** | `app/path-selection.tsx` | "I'm booking" → `/onboarding/client`, "I'm a provider" → `/onboarding/provider`. |

## AUTH

| Item | Status | File | Reason |
|---|---|---|---|
| Create Account — Apple | **MISSING** | `app/auth/signup.tsx:33` | Button fires `Alert.alert('Apple Sign In', 'coming soon...')`. No native Sign-in-with-Apple integration. |
| Create Account — Email | **MISSING** | `app/auth/signup.tsx:44` | Button fires `Alert.alert('Email Sign In', 'coming soon...')`. No email/password flow. |
| Create Account — Phone | **BUILT** | `app/auth/signup.tsx` → `/auth/phone` | Routes to phone OTP flow that works end-to-end. |
| Sign In — Apple | **MISSING** | `app/auth/signin.tsx:47` | Same `Coming soon` Alert as signup. |
| Sign In — Email | **MISSING** | `app/auth/signin.tsx:58` | Same `Coming soon` Alert. |
| Sign In — Phone | **BUILT** | `app/auth/signin.tsx` → `/auth/phone` | Same OTP flow. |
| Phone Auth → SMS Verification | **BUILT** | `app/auth/phone.tsx` → `app/auth/verify.tsx` | Real `supabase.auth.signInWithOtp()` then `verifyOtp()`. Includes a `__DEV__`-gated "Skip for now (dev)" bypass. |

## CLIENT SIDE — Onboarding

| Item | Status | File | Reason |
|---|---|---|---|
| Client Onboarding entry | **BUILT** | `app/onboarding/client/index.tsx` | First/last name + neighborhood + bio + photo into zustand `clientStore` (writes to DB at preview step). |
| Profile Setup | **BUILT** | `app/onboarding/client/index.tsx` | Photo picker works, form captured. |
| Preferences | **BUILT** | `app/onboarding/client/preferences.tsx` | Switches and notification toggles, captured locally. |
| Uploads (ID + selfie) | **PARTIAL** | `app/onboarding/client/uploads.tsx:56,83` | Photo + Video picker boxes fire `Alert.alert('Coming soon')`. Continue/Skip both go forward. |
| Payment method | **PARTIAL** | `app/onboarding/client/payment.tsx:47,68` | "Card" and "Apple Pay" rows both fire `Alert.alert('Coming soon')`. No Stripe yet. |
| Preview / Go live (Discovery Entry) | **BUILT** | `app/onboarding/client/preview.tsx` | `handleGoLive` upserts `clients` row, then `router.replace('/(tabs)/')`. Discovery feed loads on landing. |

## DISCOVERY ECOSYSTEM

| Item | Status | File | Reason |
|---|---|---|---|
| Discovery Feed | **BUILT** | `app/(tabs)/index.tsx` | Loads via `useProviders()` hook. Featured carousel + For you / Available Right Now / Trending / Top Rated + Browse by category. |
| Reels Feed | **PARTIAL** | `app/reels/index.tsx` | Entire `MOCK_REELS` array hardcoded. Held intentionally for Expo Go walkthrough; flagged "revert before beta" in PASS1 inventory. |
| Search | **BUILT** | `app/(tabs)/search.tsx` | Real `useProviderSearch()` + `useCategories()`. Filters / sort / quick filter chips / category tiles all live. |
| Nearby Discovery | **BUILT** | `app/nearby/index.tsx` | Real provider rows. Note: distance label is decorative — no geolocation wired (no missing screen, just static text). |
| Top Rated Showcase | **BUILT** | `app/top-rated/index.tsx` | Reads `average_rating` + `review_count` from providers. Both columns are always **0** today because nothing populates them — see "Reputation System" below. |

## PROVIDER PROFILE

| Item | Status | File | Reason |
|---|---|---|---|
| Hero | **BUILT** | `components/ProviderProfile.tsx` (banner + photo + name + stats) | Real provider data via `useProvider(id)`. |
| Portfolio | **BUILT** | `components/ProviderProfile.tsx:372` + lightbox modal at `:494` | Tap opens full-screen Modal with horizontal-paging FlatList over up to 9 photos. Pass-3b. |
| Reels (preview tile row) | **BUILT** | `components/ProviderProfile.tsx:398-428` | Preview row using `provider.reels` (real provider portfolio reels). Note: tapping a reel does not currently deep-link — preview only. |
| Reviews | **MISSING** | `components/ProviderProfile.tsx:100` (activeTab union is `'portfolio' \| 'posts'` only) | The profile has **no reviews tab and no review list rendered**. Provider profiles literally never surface individual reviews. |
| Services | **BUILT** | `components/ProviderProfile.tsx` services section | Renders `provider.services` (real, from `provider_services` table via `useProvider`). |
| Book Now | **BUILT** | `components/ProviderProfile.tsx:486` | Sets provider in `bookingStore`, pushes `/book/service`. |

## BOOKING SYSTEM

| Item | Status | File | Reason |
|---|---|---|---|
| Service Select | **BUILT** | `app/book/service.tsx` | Reads `provider_services` for the booked provider. |
| Date/Time | **BUILT** | `app/book/datetime.tsx` | Queries `provider_availability` (weekday) and `provider_blocked_dates`. Real availability lookup. |
| Policy review | **BUILT** | `app/book/policy.tsx` | Agree toggle gates Continue. |
| Payment | **BUILT** | `app/book/payment.tsx:82-100` | `supabase.from('bookings').insert(...)` with `status='pending'`, `payment_status='not_charged'`. Real row created. |
| Requested (status state) | **BUILT** | derived: `bookings.status='pending'` shown in `app/(tabs)/bookings.tsx` + `app/dashboard/provider/bookings.tsx` + `dashboard/provider/index.tsx` requests card | The "requested" state is a real status string consumed on both sides. |
| Accepted | **BUILT** | `app/post-booking/accepted.tsx` | Pass-2 de-mock + pass-3 calendar wiring. Loads booking by `?id=`, real provider/service/date/deposit; "Add to Calendar" now writes a real event via `expo-calendar`. |
| Declined | **BUILT** | `app/post-booking/declined.tsx` | Pass-2 de-mock. Loads declined booking's category, queries alternative providers by same category, real routing per card. |
| Confirmed | **BUILT** | `app/book/confirmed.tsx` | Terminal animation screen after payment. |
| Chat (1:1) | **BUILT** | `app/messages/[id].tsx` | Realtime via `postgres_changes` on `messages` (depends on Supabase Replication being enabled). |

## CLIENT OPERATING AREA

| Item | Status | File | Reason |
|---|---|---|---|
| My Bookings | **BUILT** | `app/(tabs)/bookings.tsx` | Upcoming / Pending / Past / Cancelled tabs. Real query + role-aware action buttons. |
| Inbox | **BUILT** | `app/(tabs)/messages.tsx` | Real `useConversations()` + filter tabs. Compose icon at line 79 is DEAD (no new-conversation UI yet) — not blocking inbox itself. |
| Active Chat | **BUILT** | `app/messages/[id].tsx` | Same screen as Booking System → Chat. Realtime. |
| Saved Providers | **STUB** | `app/(tabs)/me.tsx:516` `SavedTab` | Returns a hardcoded "No saved providers yet" empty state. **No query to `saved_providers` table.** The Bookmark button on provider profiles is also not wired to save. |
| Notifications | **BUILT** | `app/notifications/index.tsx` | Real list derived from bookings + messages via `useNotifications`. Realtime. Tap routing now branches per type (post-booking wiring pass). |
| Me Tab | **BUILT** | `app/(tabs)/me.tsx` | Real client + bookings + provider_follows. Edit profile / next booking / saved / following tabs all render. |

## PROVIDER SIDE

| Item | Status | File | Reason |
|---|---|---|---|
| Provider Onboarding (8 steps) | **BUILT** | `app/onboarding/provider/{index,portfolio,reels,services,availability,policy,payout,golive}.tsx` | All 8 steps render. `golive.tsx` persists provider + services + availability to Supabase. |
| Dashboard | **BUILT** | `app/dashboard/provider/index.tsx` | Real today's schedule + pending requests + earnings totals from a single bookings query. Accept/Decline buttons wired. |
| Bookings Manager | **BUILT** | `app/dashboard/provider/bookings.tsx` | Pass-3a. Provider-side list with Pending/Upcoming/Past/Cancelled tabs. Status labels mirror `bookings/[id].tsx`. |
| Availability | **BUILT** | `app/dashboard/provider/availability.tsx` | 7-line mount of `components/AvailabilityEditor.tsx` in dashboard mode — loads from `provider_availability` + `provider_blocked_dates` + `provider_booking_preferences` and saves back. |
| CRM (My Clients) | **BUILT** | `app/dashboard/provider/clients.tsx` | Pass-3a. Derives clients from this provider's bookings, joins `clients.name`, visit count + last visit + spend. Tap opens conversation. |
| Analytics | **BUILT** | `app/dashboard/provider/analytics.tsx` + 5 detail screens | Hub + goal-detail + revenue-detail + client-intelligence + service-performance + schedule-detail. All real. Dev fallback to a `display_name='Stephen'` provider when no auth in dev. |
| Settings | **STUB** | `app/dashboard/provider/settings.tsx` | Header + "Coming in the next update". (Distinct from the client `/settings` screen, which is partially built — see below.) |
| Edit Profile (dashboard) | **BUILT** *(extra)* | `app/dashboard/provider/edit-profile.tsx` | Pass before this audit. Real provider row + photo/banner Storage upload + category sheet. |
| Services & Pricing | **BUILT** *(extra)* | `app/dashboard/provider/services.tsx` | Pass. Add/edit/delete/toggle services. Note: delete silently fails — `provider_services` is missing a DELETE RLS policy (Phase C). |
| Portfolio (dashboard) | **STUB** | `app/dashboard/provider/portfolio.tsx` | "Coming in the next update". Real portfolio editor lives only in onboarding. |
| Posts & Reels (dashboard) | **STUB** | `app/dashboard/provider/posts.tsx` | "Coming in the next update". |
| Payouts (dashboard) | **STUB** | `app/dashboard/provider/payouts.tsx` | "Coming in the next update" + a note that beta payouts are manual; Stripe Connect comes later. |

## PROVIDER OS (post-MVP / future-now)

| Item | Status | File | Reason |
|---|---|---|---|
| Community Hub | **MISSING** | — | No route, no file. |
| Blast Messaging | **MISSING** | — | No route, no file. The existing 1:1 messaging is `/messages/*`. |
| Contracts | **MISSING** | — | No route, no file. |
| Learning Center | **MISSING** | — | No route, no file. |
| Financial Insights | **MISSING** | — | The closest existing screen is `dashboard/provider/revenue-detail.tsx`, but that's the Analytics revenue tile — not a "financial insights" surface (tax forms, P&L, payout breakdowns). |
| Reputation System | **MISSING** | — | The data plumbing exists: migration 011 creates `provider_reviews` table + `providers.average_rating` + `review_count` columns, all with RLS. **Nothing writes either table or recomputes the columns**, and there's no dedicated reputation UI. |
| Imports | **MISSING** | — | No route, no file. |

## TRUST & SAFETY

| Item | Status | File | Reason |
|---|---|---|---|
| Satisfaction Check | **PARTIAL** | `app/post-booking/satisfaction.tsx` | UI renders stars + "Yes / Something wasn't right" / Skip. **Star rating is not persisted or passed forward** — local state only. Provider/service hardcoded "Nia · Classic Full Set · May 28". |
| Reviews (write flow) | **PARTIAL** | `app/post-booking/review.tsx` | Chip selection + free text up to 500 chars. **Post Review and Skip both `router.push('/post-booking/submitted')`** — no `provider_reviews.insert(...)`. Everything entered is dropped. Hardcoded "Nia Laurent". |
| Reviews submitted state | **PARTIAL** | `app/post-booking/submitted.tsx` | Pass-2 wired `?id=` lookup, but the "Review posted" message is misleading because no review was actually posted. |
| Provider rates client | **PARTIAL** | `app/post-booking/provider-review.tsx` | UI for rating clients + tags + private note. Submit/Skip both go to `/dashboard/provider`. **No `client_reviews` table exists**; this data has nowhere to go. Privacy promise "Providers see their score as a range not the exact number or comments" describes a system that hasn't been built. |
| Review Detail | **ORPHAN** | `app/reviews/[id].tsx` | "Coming in the next update" placeholder. No UI routes here (dev menu only). |
| Issue reporting (from satisfaction) | **PARTIAL** *(extra)* | `app/post-booking/issue.tsx` | Tag chips + Submit. Submit just `router.push('/(tabs)/')`. No insert into any reports table. |
| Disputes | **MISSING** | — | No `/disputes` route. Migration 023 mentions "booking protection" + 022 creates a `reports` table for moderation, but no UI surfaces either. |
| Verification (identity) | **PARTIAL** | read sites: `app/(tabs)/me.tsx:262`, `(tabs)/index.tsx:519`, `providers/[id].tsx:87`, `(tabs)/search.tsx:548`; data: migration 021 | The `identity_verified` boolean is read everywhere to show a verified badge. **No submission flow** (no ID upload, no verification form, no `/verification` route, no `verification_status` admin action surfaced). |

## ADMIN

| Item | Status | File | Reason |
|---|---|---|---|
| Existing admin entry: Providers | **STUB** | `app/admin/providers.tsx` | "Coming in the next update" placeholder. Dev-menu-only access. |
| Existing admin entry: Create Provider | **STUB** | `app/admin/create-provider.tsx` | Same — placeholder. |
| Verification Queue | **MISSING** | — | No route, no file. |
| Disputes (admin) | **MISSING** | — | No route, no file. |
| Content Moderation | **MISSING** | — | No route, no file. Migration 022 creates `reports` schema; no UI. |
| Payments (admin) | **MISSING** | — | No route, no file. |
| Reports (admin) | **MISSING** | — | No route, no file. |

## FUTURE PREMIUM

| Item | Status | File | Reason |
|---|---|---|---|
| Advanced CRM | **MISSING** | — | (Expected — future scope.) |
| Advanced Analytics | **MISSING** | — | The 5 existing analytics detail screens cover the basic tier. |
| Automations | **MISSING** | — | |
| Team Accounts | **MISSING** | — | |
| Marketing Tools | **MISSING** | — | |
| AI Follow-Up | **MISSING** | — | |
| AI Scheduling Assistant | **MISSING** | — | |

---

## Code that exists but isn't in the sitemap (extras)

These are real screens/features built that aren't called out in the v1 sitemap. None are orphaned in the strict sense — most are sub-screens of sitemap entries.

| Item | Status | File | Mapped to which sitemap section |
|---|---|---|---|
| `/bookings/[id]` (booking detail with full lifecycle) | **BUILT** | `app/bookings/[id].tsx` | The lifecycle hub for Booking System (Accept/Decline/Mark Arriving/Checked In/Completed/No Show + Cancel). Reached from My Bookings + Provider Dashboard. |
| `/me/edit` (client profile edit) | **BUILT** | `app/me/edit.tsx` | Extends Me Tab. Real `clients` upsert + photo picker. |
| `/settings` (account settings hub) | **PARTIAL** | `app/settings/index.tsx` | Extends Me Tab. 13 of 16 rows fire `stub()` Coming-soon Alerts. 3 notification toggles work locally. Sign Out works. Personal Information row is wired (see next). |
| `/settings/personal-info` (name editor) | **BUILT** | `app/settings/personal-info.tsx` | Pass-3b. Real `clients` upsert pattern matching `me/edit`. |
| Notifications detail tap | **BUILT** | `app/notifications/index.tsx:94` | Post-booking wiring pass: `booking_accepted` → `/post-booking/accepted?id=…`, `booking_declined` → `/post-booking/declined?id=…`, `new_message` → `/messages/{convoId}`, others → `/bookings/{id}`. |
| Provider analytics: goal-detail, revenue-detail, client-intelligence, service-performance, schedule-detail | **BUILT** | `app/dashboard/provider/{goal,revenue,client-intelligence,service-performance,schedule}-detail.tsx` | Sub-screens of Provider Side → Analytics. |
| `/discovery/index.tsx` | **BUILT** *(redirect)* | `app/discovery/index.tsx` | Single line: `<Redirect href="/(tabs)/" />`. Alias for the Discovery Feed. |
| Dev menu + site map | **BUILT** *(dev-only)* | `app/index.tsx` (modal, gated `__DEV__`) | Not user-facing. |

---

## Schema notes that affect statuses above

These came up while auditing and matter to the labels:

- **No `clients` table CREATE migration exists** — committed migrations vs live DB are drifted. All the BUILT items that read/write `clients` (Me Tab, /me/edit, onboarding/client/preview, /settings/personal-info, dashboard CRM, messaging, notifications, bookings) work in dev because the live DB has the table, but a fresh deploy from migrations would break them.
- **No `client_reviews` table** — provider-rates-client (`provider-review.tsx`) has no place to write.
- **`provider_reviews` table exists** (migration 011) but **nothing in the app reads or writes it**. `providers.average_rating` and `providers.review_count` exist but are never updated — every provider reads as 0/0. Top Rated sort works mechanically but produces ties.
- **`saved_providers` table exists** (migration 002) but `SavedTab` in Me Tab doesn't query it; the bookmark icon on profiles is decorative.
- **`provider_follows` table** is queried by Me Tab for `following` count, and there's a Following tab — but no UI surfaces who you follow.
- **Realtime** (`postgres_changes` for messages/conversations/bookings) requires manually toggling Supabase Replication for those tables. Listed BUILT items assume this is enabled.
- **`provider_services` is missing a DELETE RLS policy** — services delete in the dashboard silently fails.

---

## Closest gaps to beta — the booking-and-review loop

The core flow today: **discover → profile → book → pay → notification → confirmed**. That works end to end. **The loop closes badly:** the appointment happens, the satisfaction prompt collects nothing, the review writes nothing, ratings stay at 0 forever, and no review ever appears on any profile. Ranked by what blocks closing that loop:

1. **Reviews don't persist** — `post-booking/review.tsx` and `post-booking/submitted.tsx` need to INSERT into `provider_reviews` on Post Review (and on Skip with rating-only?). Currently zero writes. Needs the satisfaction screen to thread the star rating + booking id forward via route params.
2. **Satisfaction Check rating is lost** — `post-booking/satisfaction.tsx` should pass `?id=` + `?rating=` to `/post-booking/review`, but threads neither. Without this, even if reviews insert, the rating defaults to 0 or has to be re-tapped.
3. **`providers.average_rating` / `review_count` are never recomputed** — even if reviews start inserting, every profile and every "Top Rated" sort will continue to show 0 reviews. Needs a Supabase trigger on `provider_reviews` insert (or an app-side recompute) to maintain the two columns.
4. **No reviews ever shown on the provider profile** — `components/ProviderProfile.tsx` has no reviews tab/section at all. Even after writes work, clients can't see them. Needs a reviews section that queries `provider_reviews.eq('provider_id', id).order('created_at desc')`.
5. **Saved Providers is fake** — bookmark icon on the profile and the Saved tab in Me both look real but neither queries `saved_providers`. Low complexity (table exists, just needs an INSERT/DELETE + a query in `SavedTab`). Not strictly in the review loop, but it's the most visible "this button does nothing" gap in the client-side experience.
6. **Provider-of-client reviews have no home** — `post-booking/provider-review.tsx` collects data with privacy promises about blind reveal, but there's no `client_reviews` table. This requires a schema decision (separate table vs unified `booking_reviews`) before any wiring.
7. **Reels feed is mock data** — held intentionally for the Expo Go walkthrough per your spec, but blocks any real beta since the entire feed is fake. PASS1 inventory already flagged "revert before beta".
8. **Settings is mostly stubs** — 13 of 16 rows fire Coming-soon. The 3 account fields (Personal Info wired this pass; Email + Phone deferred pending re-verification flow design) are the bare minimum for a beta where a user can update their own profile.

Beyond the loop, the next-most-load-bearing absences are: **Verification submission flow** (badges show today based on `identity_verified`, but nothing lets a provider actually verify), **payment methods** (paywall in onboarding is a Coming-soon), and **disputes** (the data exists, no UI).
