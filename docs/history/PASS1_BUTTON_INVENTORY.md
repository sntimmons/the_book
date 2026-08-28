> ## HISTORICAL SNAPSHOT - NOT CURRENT-STATE DOCUMENTATION
>
> **Snapshot date:** ~2026-05-31 (last edited). **Development era:** the
> `phase-a-pass-1-nav-cleanup` branch, when the app had ~51 screens (it now has
> 115+).
>
> This file is a point-in-time button/route punch list kept for historical
> reference. It is **not authoritative** current-state documentation and is
> known to be stale. **When this document conflicts with the current source
> code, the source code wins.** For the docs index see
> [../README.md](../README.md).

# PASS 1 — Button & Route Inventory

Generated for branch `phase-a-pass-1-nav-cleanup`. Punch list for later passes.
Legend: **OK** · **DEAD** (no-op / Coming soon) · **BROKEN** (route does not exist) · **MISMATCH** (lands somewhere other than label implies).

## Summary
- Screens audited: **51**
- OK: **~210**
- DEAD: **27**
- BROKEN: **0**
- MISMATCH: **2**

All 51 screens verified by direct file read. No `(inferred)` rows.

---

## Per-screen detail

### `/` — `app/index.tsx`
Welcome screen. Dev menu/site map excluded (gated behind `__DEV__`).

| Element | Action | Status |
|---|---|---|
| "Get Started" button | router.push('/auth/signup') | OK |
| "Sign in" link | router.push('/auth/signin') | OK |

---

### `/path-selection` — `app/path-selection.tsx`
| Element | Action | Status |
|---|---|---|
| "I'm booking" card | router.push('/onboarding/client') | OK |
| "I'm a provider" card | router.push('/onboarding/provider') | OK |
| "Already have an account?" link | router.push('/auth/signin') | OK |

---

### `/auth/signup` — `app/auth/signup.tsx`
| Element | Action | Status |
|---|---|---|
| "Continue with Apple" button | Alert.alert('Apple Sign In', 'Apple Sign In is coming soon...') @ app/auth/signup.tsx:33 | DEAD |
| "Continue with Email" button | Alert.alert('Email Sign In', 'Email sign in is coming soon...') @ app/auth/signup.tsx:44 | DEAD |
| "Continue with Phone" button | router.push('/auth/phone') | OK |
| "Already have an account?" link | router.push('/auth/signin') | OK |

---

### `/auth/signin` — `app/auth/signin.tsx`
| Element | Action | Status |
|---|---|---|
| "Continue with Apple" button | Alert.alert('Apple Sign In', ...) @ app/auth/signin.tsx:47 | DEAD |
| "Continue with Email" button | Alert.alert('Email Sign In', ...) @ app/auth/signin.tsx:58 | DEAD |
| "Sign in with Phone" button | router.push('/auth/phone') | OK |
| "Don't have an account?" link | router.push('/auth/signup') | OK |

---

### `/auth/phone` — `app/auth/phone.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Next" button | supabase.auth.signInWithOtp() then /auth/verify | OK |
| "Skip for now (dev)" button | session check then /dashboard/provider, /(tabs)/, or /path-selection | OK (dev-only, gated by `__DEV__`) |

---

### `/auth/verify` — `app/auth/verify.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Wrong number?" link | router.back() | OK |
| OTP input | supabase.auth.verifyOtp() then route by profile lookup | OK |
| "Verify" button | submits OTP, routes to dashboard/tabs/path-selection | OK |
| "Resend code" link | supabase.auth.signInWithOtp() | OK |

---

### `/(tabs)/` — `app/(tabs)/index.tsx`
Discovery feed.

| Element | Action | Status |
|---|---|---|
| Search icon (top right) | router.push('/(tabs)/search') | OK |
| Notifications icon (top right) | router.push('/notifications') | OK |
| Story ring (each provider) | router.push(`/providers/${p.id}`) | OK |
| Featured hero slide | router.push to /providers/{id} or /top-rated | OK |
| Pagination dot | scrollTo(x) | OK |
| Category filter button | setActiveCategoryId(id) | OK |
| "Near You" row | router.push('/nearby') | OK |
| "For you" card (each) | router.push(`/providers/${p.id}`) | OK |
| "See all" (For you) | no-op empty handler @ app/(tabs)/index.tsx:486 | DEAD |
| "Available Right Now" card (each) | router.push(`/providers/${p.id}`) | OK |
| "See all" (Available Right Now) | router.push('/nearby') | OK |
| "Trending Now" card (each) | router.push(`/providers/${p.id}`) | OK |
| "Top Rated" card (each) | router.push(`/providers/${p.id}`) | OK |
| "View all" (Top Rated) | router.push('/top-rated') | OK |
| "Browse by category" card | router.push('/(tabs)/search') | OK |

---

### `/(tabs)/bookings` — `app/(tabs)/bookings.tsx`
| Element | Action | Status |
|---|---|---|
| Tab "Upcoming" / "Pending" / "Past" / "Cancelled" | setActiveStatus(...) | OK |
| Booking card | router.push(`/bookings/${booking.id}`) | OK |
| "Message" action | openChat() then router.push(`/messages/${convoId}`) | OK |
| "Reschedule" action | Alert with "Message Provider" option | OK |
| "Cancel" action | router.push('/bookings/' + bookingId) | OK |
| "Cancel Request" action | router.push('/bookings/' + bookingId) | OK |
| "Book Again" (past) | router.push(`/providers/${providerId}`) | OK |
| "Leave Review" (past) | router.push('/post-booking/satisfaction') | OK |
| "Find Similar" (cancelled) | router.push('/(tabs)/search') | OK |
| "Book Again" (cancelled) | router.push(`/providers/${providerId}`) | OK |

---

### `/(tabs)/me` — `app/(tabs)/me.tsx`
| Element | Action | Status |
|---|---|---|
| Share icon | Share.share() | OK |
| Settings icon | router.push('/settings') | OK |
| "Edit Profile" button | router.push('/me/edit') | OK |
| Tab: Bookings / Saved / Following | setActiveTab(...) | OK |
| "Message" (next booking) | getOrCreateConversation() then /messages/{convoId} | OK |
| "View Booking" | router.push(`/bookings/${nextBooking.id}`) | OK |
| "Find a provider" (empty state) | router.push('/(tabs)/search') | OK |
| "See all" (upcoming) | router.push('/(tabs)/bookings') | OK |

---

### `/(tabs)/messages` — `app/(tabs)/messages.tsx`
| Element | Action | Status |
|---|---|---|
| Compose icon | no-op, comment "future" @ app/(tabs)/messages.tsx:79 | DEAD |
| Tab "All" / "Bookings" | setActiveFilter(...) | OK |
| Conversation row | router.push(`/messages/${convo.id}`) | OK |

---

### `/(tabs)/new` — `app/(tabs)/new.tsx`
| Element | Action | Status |
|---|---|---|
| "Book a provider" | router.back() then router.push('/(tabs)/search') | OK |
| "Browse discovery" | router.back() then router.push('/(tabs)/') | OK |
| "Message a provider" | router.back() then router.push('/messages') | OK |
| "Cancel" + overlay tap | router.back() | OK |

---

### `/(tabs)/search` — `app/(tabs)/search.tsx`
| Element | Action | Status |
|---|---|---|
| Input clear button | setQuery(''), focus input | OK |
| "Cancel" | clears query + filters | OK |
| "Filters" / "Sort" buttons | open sheets | OK |
| Quick filter chips | toggleFilter() | OK |
| Filter sheet "Reset" / category / availability / rating pills | setSheetCategoryId / setAvailability / setMinRating | OK |
| "Mobile providers only" toggle | setMobileOnly() | OK |
| "Apply Filters" | setActiveCategoryId, close | OK |
| Sort sheet options | setSortBy() | OK |
| Recent term / trending chip / category tile | setQuery / setActiveCategoryId | OK |
| "Clear" recent | setRecent([]) | OK |
| Near You / result card | router.push(`/providers/${p.id}`) | OK |
| Active filter chip close | onRemoveFilter() | OK |
| "Browse Categories" (no results) | clears query and category | OK |

---

### `/nearby` — `app/nearby/index.tsx`
| Element | Action | Status |
|---|---|---|
| Provider row | router.push(`/providers/${p.id}`) | OK |
| Story item | router.push(`/providers/${p.id}`) | OK |
| Distance chip | decorative no-op (no geolocation wired) | OK |

---

### `/top-rated` — `app/top-rated/index.tsx`
| Element | Action | Status |
|---|---|---|
| Featured hero | router.push(`/providers/${provider.id}`) | OK |
| Provider row | router.push(`/providers/${p.id}`) | OK |

---

### `/reels` — `app/reels/index.tsx`
Uses `MOCK_REELS` hardcoded array. Kept intentionally for dev walkthrough, revert before beta.

| Element | Action | Status |
|---|---|---|
| Reel like button | toggle local isLiked, increment likes | OK (dev-only mock, revert before beta) |
| Reel save button | toggle local isSaved | OK (dev-only mock, revert before beta) |
| Reel share button | Share.share() | OK (dev-only mock, revert before beta) |
| Reel comment button | Alert.alert('Comments', 'Coming soon') @ app/reels/index.tsx:554 | DEAD (dev-only mock, revert before beta) |
| Provider name / avatar tap | router.push(`/providers/${reel.providerId}`) | OK (dev-only mock, revert before beta) |
| Close / swipe down | router.back() | OK (dev-only mock, revert before beta) |

---

### `/providers/[id]` — `app/providers/[id].tsx` + `components/ProviderProfile.tsx`
Wrapper page loads provider via `useProvider(id)` and delegates rendering to `ProviderProfile`.

| Element | Action | Status |
|---|---|---|
| "Back to discovery" (not-found state) | router.replace('/(tabs)/') @ app/providers/[id].tsx:51 | OK |
| Back arrow (in profile) | router.back() @ components/ProviderProfile.tsx:147 | OK |
| Share icon | handleShare then Share.share() @ components/ProviderProfile.tsx:160 | OK |
| Follow / Unfollow button | onFollow (toggles local isFollowing state) @ components/ProviderProfile.tsx:207 | OK |
| Message (top) | onMessage then getOrCreateConversation, /messages/{convoId} @ components/ProviderProfile.tsx:221 | OK |
| Tab buttons (services / portfolio / reviews) | setActiveTab(tab) @ components/ProviderProfile.tsx:303 | OK |
| Portfolio photo tap | console.log('open photo', i), no lightbox @ components/ProviderProfile.tsx:376 | DEAD |
| Message button (bottom) | onMessage then /messages/{convoId} @ components/ProviderProfile.tsx:481 | OK |
| "Book Now" CTA | onBookNow then setProvider(), router.push('/book/service') @ components/ProviderProfile.tsx:486 | OK |

---

### `/messages/[id]` — `app/messages/[id].tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow (error state) | router.back() @ app/messages/[id].tsx:123 | OK |
| "Back to messages" (error state) | router.replace('/(tabs)/messages') @ app/messages/[id].tsx:140 | OK |
| Back arrow (chat header) | router.back() @ app/messages/[id].tsx:158 | OK |
| Send button | handleSend then supabase.from('messages').insert | OK |
| Keyboard dismiss tap | Keyboard.dismiss | OK |
| Input focus tap | focuses TextInput | OK |

---

### `/bookings/[id]` — `app/bookings/[id].tsx`
Role-aware lifecycle. Buttons rendered conditionally by `status` and `isProvider`.

| Element | Action | Status |
|---|---|---|
| Back arrow (top + error state) | router.back() @ app/bookings/[id].tsx:320, :350 | OK |
| "Back" (BookingNotFound) | router.back() @ app/bookings/[id].tsx:458, :510 | OK |
| "Back to dashboard" (provider) | router.replace('/dashboard/provider') @ app/bookings/[id].tsx:521 | OK |
| Cancel Booking button | handleCancel then Alert.alert confirmation then updateStatus(cancelled_by_{provider,client}) | OK |
| Message button | getOrCreateConversation then router.push(`/messages/${convoId}`) | OK |
| "Mark Arriving" (provider, accepted) | updateStatus('arriving') | OK |
| "Mark Checked In" (provider, arriving) | updateStatus('checked_in') | OK |
| "Mark No Show" (provider) | Alert confirm then updateStatus('no_show') | OK |
| "Mark Completed" (provider, checked_in) | Alert confirm then updateStatus('completed') | OK |
| Accept / Decline (provider, pending) | Alert confirm then updateStatus('accepted' / 'cancelled_by_provider') | OK |

---

### `/notifications` — `app/notifications/index.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() @ app/notifications/index.tsx:107 | OK |
| "Mark all read" | markAllRead() (local Set) @ app/notifications/index.tsx:116 | OK |
| Notification row | handleNotificationTap then /messages/{convoId} (for new_message) or /bookings/{id} (others) @ app/notifications/index.tsx:97-100 | OK |

---

### `/book/service` — `app/book/service.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Error fallback "back to home" | router.replace('/(tabs)/') @ app/book/service.tsx:31 | OK |
| Service row | handleSelect(service) then setSelectedService in store | OK |
| "Continue" button | router.push('/book/datetime') (gated by selectedId) | OK |

---

### `/book/datetime` — `app/book/datetime.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Message provider" link | getOrCreateConversation then /messages/{convoId} | OK |
| Prev month / Next month chevrons | prevMonth() / nextMonth() | OK |
| Date cell | handleDateTap(dateStr) | OK |
| Time slot cell | handleTimeTap(slot) | OK |
| "Continue" button | router.push('/book/message') (gated by canContinue) | OK |

---

### `/book/message` — `app/book/message.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Message chip (suggested) | setBookingMessage(chip) | OK |
| Photo remove (each) | removePhoto(index) | OK |
| Add photo | pickPhoto then ImagePicker | OK |
| "Continue" button | router.push('/book/policy') | OK |
| "Skip, send request without a message" link | handleSkip then router.push('/book/policy') | OK |

---

### `/book/policy` — `app/book/policy.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "I agree" toggle row | setAgreedToPolicy(!agreedToPolicy) | OK |
| "Continue" button | router.push('/book/payment') (gated by agreedToPolicy) | OK |

---

### `/book/payment` — `app/book/payment.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Card payment option | setUseApplePay(false) | OK |
| Apple Pay option | setUseApplePay(true) | OK |
| "Confirm & Pay" button | handleConfirm then INSERT into `bookings`, router.push to /book/confirmed | OK |

---

### `/book/confirmed` — `app/book/confirmed.tsx`
| Element | Action | Status |
|---|---|---|
| "Back to home" button | handleBackToHome then router.replace('/(tabs)/') | OK |

---

### `/post-booking/accepted` — `app/post-booking/accepted.tsx`
| Element | Action | Status |
|---|---|---|
| "Add to Calendar" button | Alert.alert('Coming soon', ...) @ app/post-booking/accepted.tsx:103 | DEAD |
| "Message Provider" button | router.push('/(tabs)/messages') @ app/post-booking/accepted.tsx:122 | OK |
| "Back to Home" button | router.push('/(tabs)/') @ app/post-booking/accepted.tsx:130 | OK |

---

### `/post-booking/declined` — `app/post-booking/declined.tsx`
| Element | Action | Status |
|---|---|---|
| Alternative provider card (each) | router.push('/(tabs)/') with `// TODO: wire to real provider id` @ app/post-booking/declined.tsx:76 | MISMATCH (label is a provider card, lands on tabs home) |
| "Find Another Provider" button | router.push('/(tabs)/search') @ app/post-booking/declined.tsx:102 | OK |
| "Back to Home" button | router.push('/(tabs)/') @ app/post-booking/declined.tsx:110 | OK |

---

### `/post-booking/satisfaction` — `app/post-booking/satisfaction.tsx`
| Element | Action | Status |
|---|---|---|
| Rating star (each) | setRating(i + 1) | OK |
| "Leave a review" button | router.push('/post-booking/review') | OK |
| "Report an issue" button | router.push('/post-booking/issue') | OK |
| Skip / Back to home | router.push('/(tabs)/') | OK |

---

### `/post-booking/review` — `app/post-booking/review.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow (top + secondary) | router.back() @ app/post-booking/review.tsx:54, :85 | OK |
| Category tag chip | toggleCategory(cat) | OK |
| "Book again" link | router.push('/book/service') @ app/post-booking/review.tsx:150 | OK |
| "Submit review" button | router.push('/post-booking/submitted') @ app/post-booking/review.tsx:182 | OK |
| "Skip, post without a written review" link | router.push('/post-booking/submitted') @ app/post-booking/review.tsx:191 | OK |

---

### `/post-booking/submitted` — `app/post-booking/submitted.tsx`
| Element | Action | Status |
|---|---|---|
| "Book Nia again" rebook card | router.push('/book/service') @ app/post-booking/submitted.tsx:59 | OK |
| "Back to Home" button | router.push('/(tabs)/') @ app/post-booking/submitted.tsx:75 | OK |
| "View Nia's Profile" link | router.push('/(tabs)/') with `// TODO: wire to real provider id` @ app/post-booking/submitted.tsx:83 | MISMATCH (label says profile, lands on tabs home) |

---

### `/post-booking/issue` — `app/post-booking/issue.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Issue tag chip | toggleIssue(issue) | OK |
| "Submit" button | handleSubmit then router.push('/(tabs)/') @ app/post-booking/issue.tsx:50, :167 | OK |
| "Back to home" link | router.push('/(tabs)/') @ app/post-booking/issue.tsx:176 | OK |

---

### `/post-booking/provider-review` — `app/post-booking/provider-review.tsx`
Provider rates the client after a completed booking. No back arrow (terminal flow).

| Element | Action | Status |
|---|---|---|
| Rating star (each) | handleRate(i + 1) | OK |
| Tag chip | toggleTag(tag) | OK |
| "Submit" button | router.push('/dashboard/provider') @ app/post-booking/provider-review.tsx:160 | OK |
| "Skip" link | router.push('/dashboard/provider') @ app/post-booking/provider-review.tsx:169 | OK |

---

### `/onboarding/provider` — `app/onboarding/provider/index.tsx`
Step 1 of 8 (profile basics).

| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Banner picker | pickBanner then ImagePicker | OK |
| Photo picker | pickPhoto then ImagePicker | OK |
| Category field | setShowCategorySheet(true) | OK |
| "Mobile provider" switch | setIsMobile(...) | OK |
| "Continue" button | handleContinue then router.push('/onboarding/provider/portfolio') | OK |
| Category sheet overlay | close sheet | OK |
| Category sheet item / "Other" | selectCategory(name) | OK |

---

### `/onboarding/provider/portfolio` — `app/onboarding/provider/portfolio.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Remove photo (each) | removePhoto(i) | OK |
| Add photo | pickPhoto then ImagePicker | OK |
| "Continue" button | handleContinue then router.push('/onboarding/provider/reels') | OK |
| "Skip" link | router.push('/onboarding/provider/reels') | OK |

---

### `/onboarding/provider/reels` — `app/onboarding/provider/reels.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Remove reel (each) | removeReel(i) | OK |
| Add reel | pickReel then ImagePicker | OK |
| "Continue" / "Skip" | navigate then router.push('/onboarding/provider/services') | OK |

---

### `/onboarding/provider/services` — `app/onboarding/provider/services.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Edit service (each) | openEdit(service) | OK |
| Remove service (each) | removeService(service.id) | OK |
| "Add service" button | resetDraft() + open sheet | OK |
| "Continue" button | router.push('/onboarding/provider/availability') (gated) | OK |
| Sheet close + X | closes sheet, resets draft | OK |
| Duration pill (sheet) | setDraftDuration(pill) | OK |
| Deposit toggle (sheet) | setDraftDepositRequired(...) | OK |
| Remove add-on / Save add-on / Add add-on (sheet) | removeAddOn / saveAddOn / setShowAddOnInput | OK |
| Save service (sheet) | saveService then updates store | OK |

---

### `/onboarding/provider/availability` — `app/onboarding/provider/availability.tsx`
Thin wrapper that delegates to `components/AvailabilityEditor.tsx`.

| Element | Action | Status |
|---|---|---|
| "Continue" / "Skip" (from editor) | router.push('/onboarding/provider/policy') @ app/onboarding/provider/availability.tsx:8-9 | OK |
| (AvailabilityEditor internal controls: day toggles, time pickers, etc.) | edit local availability state | OK |

---

### `/onboarding/provider/policy` — `app/onboarding/provider/policy.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Preset card (each) | applyPreset(p) | OK |
| Cancel window / reschedule window / reschedule limit / grace period dropdowns | setActiveDropdown(...) | OK |
| Reschedule fee toggle | setRescheduleFeeEnabled(...) | OK |
| Travel fee type (each) | setTravelFeeType(opt.key) | OK |
| Free radius / max distance dropdowns | setActiveDropdown(...) | OK |
| "Continue" / "Skip" | navigate then router.push('/onboarding/provider/payout') | OK |
| Dropdown backdrop / option | setActiveDropdown(null) / value setter | OK |

---

### `/onboarding/provider/payout` — `app/onboarding/provider/payout.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Debit / Bank method toggle | setPayoutMethod(...) | OK |
| Schedule option (each) | setPayoutSchedule(opt.key) | OK |
| Account type (each) | setAccountType(t) | OK |
| "Continue" / "Skip" | navigate then router.push('/onboarding/provider/golive') | OK |

---

### `/onboarding/provider/golive` — `app/onboarding/provider/golive.tsx`
Step 8 (final). Persists provider + services + availability to Supabase.

| Element | Action | Status |
|---|---|---|
| Back arrow (top + bottom) | router.back() @ app/onboarding/provider/golive.tsx:260, :324 | OK |
| "Go Live" button | handleGoLive then validates, signed-out preview vs real INSERT, router.replace('/dashboard/provider') | OK |
| "Add a profile photo" alert | guardrail Alert before continuing | OK |
| Signed-out preview Alert | Alert with "Preview Dashboard" button then router.replace('/dashboard/provider') | OK (dev-only, uploads + portfolio URLs held in memory) |

---

### `/onboarding/client` — `app/onboarding/client/index.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Photo picker | pickImage then ImagePicker | OK |
| "Continue" button | router.push('/onboarding/client/preferences') | OK |

---

### `/onboarding/client/preferences` — `app/onboarding/client/preferences.tsx`
| Element | Action | Status |
|---|---|---|
| Pref toggle (helper) | onToggle | OK |
| Back arrow | router.back() | OK |
| "Change location" link | handleChangeLocation (local setter, no real geolocation) | OK |
| "Show mobile providers" switch | setMobileProv | OK |
| "Booking updates" switch | setNotifBooking | OK |
| "New providers nearby" switch | setNotifCreator (state var name only) | OK |
| "Deals & alerts" switch | setNotifDeals | OK |
| "Continue" button | router.push('/onboarding/client/uploads') | OK |

---

### `/onboarding/client/uploads` — `app/onboarding/client/uploads.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| Photo picker box | Alert.alert('Coming soon', ...) @ app/onboarding/client/uploads.tsx:56 | DEAD |
| Video picker box | Alert.alert('Coming soon', ...) @ app/onboarding/client/uploads.tsx:83 | DEAD |
| "Continue" button | router.push('/onboarding/client/payment') | OK |
| "Skip" link | router.push('/onboarding/client/payment') | OK |

---

### `/onboarding/client/payment` — `app/onboarding/client/payment.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Open card input" option | Alert.alert('Coming soon', ...) @ app/onboarding/client/payment.tsx:47 | DEAD |
| "Apple Pay" option | Alert.alert('Coming soon', ...) @ app/onboarding/client/payment.tsx:68 | DEAD |
| "Continue" button | router.push('/onboarding/client/preview') | OK |
| "Skip" link | router.push('/onboarding/client/preview') | OK |

---

### `/onboarding/client/preview` — `app/onboarding/client/preview.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow (top + bottom) | router.back() @ app/onboarding/client/preview.tsx:129, :351 | OK |
| Settings nav button (header) | Alert.alert('Coming soon', ...) @ app/onboarding/client/preview.tsx:138 | DEAD |
| "Go live" / finish button | handleGoLive then upserts `clients` row, router.replace('/(tabs)/') @ app/onboarding/client/preview.tsx:88, :120, :340 | OK |

---

### `/dashboard/provider` — `app/dashboard/provider/index.tsx` (+ drawer in `_layout.tsx`)
Provider dashboard hub. The drawer is rendered from `_layout.tsx` and is reachable from every dashboard screen via the menu button.

#### Drawer items (rendered in `_layout.tsx`)
| Element | Action | Status |
|---|---|---|
| Drawer overlay | closePanel() @ app/dashboard/provider/_layout.tsx:173 | OK |
| "View profile" link | handleNavItem('/providers/' + providerProfile.id) @ app/dashboard/provider/_layout.tsx:212 | OK |
| "Edit profile" link | handleNavItem('/dashboard/provider/edit-profile') @ app/dashboard/provider/_layout.tsx:225 | OK |
| Drawer item (each NAV_SECTIONS row) | handleNavItem(item.route), disabled when route is null (e.g. Help) @ app/dashboard/provider/_layout.tsx:245 | OK |
| "Switch to client" footer | router.replace('/(tabs)/') @ app/dashboard/provider/_layout.tsx:272 | OK |
| "Sign out" footer | Alert.alert confirmation then supabase.auth.signOut() then router.replace('/') @ app/dashboard/provider/_layout.tsx:282 | OK |

#### Hub screen (`index.tsx`)
| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| Notifications icon | router.push('/notifications') | OK |
| Payouts card | router.push('/dashboard/provider/payouts') | OK |
| "View all bookings" | router.push('/dashboard/provider/bookings') | OK |
| Request card tap | router.push(`/bookings/${req.id}`) | OK |
| Decline button (request) | handleDecline then Alert confirm then updateStatus('cancelled_by_provider') | OK |
| Message button (request) | getOrCreateConversation then router.push(`/messages/${convoId}`) | OK |
| Accept button (request) | handleAccept then Alert confirm then updateStatus('accepted') | OK |
| Quick action tile (each) | router.push(action.route) (only if route defined) | OK |

---

### `/dashboard/provider/edit-profile` — `app/dashboard/provider/edit-profile.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | handleBack then unsaved-changes Alert then router.back() @ app/dashboard/provider/edit-profile.tsx:305 | OK |
| "Save" button | handleSave then uploads to Storage, UPDATE providers, Alert + router.back() @ app/dashboard/provider/edit-profile.tsx:313 | OK |
| Banner picker | pickBanner then ImagePicker @ app/dashboard/provider/edit-profile.tsx:368 | OK |
| Photo picker | pickPhoto then ImagePicker @ app/dashboard/provider/edit-profile.tsx:388 | OK |
| Category field | setShowCategorySheet(true) @ app/dashboard/provider/edit-profile.tsx:421 | OK |
| Category sheet overlay / X / item | close sheet / selectCategory | OK |

---

### `/dashboard/provider/services` — `app/dashboard/provider/services.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Add Service" button (top + empty state) | handleAddService then opens sheet | OK |
| Edit icon (each service) | onEdit(service) then opens sheet pre-filled | OK |
| Delete icon (each service) | onDelete(service) then Alert confirm then DELETE provider_services (silently fails per missing RLS policy) | OK (write succeeds locally; RLS gap noted in audit) |
| Toggle switch (each service) | onChange(!value) then optimistic UPDATE is_active | OK |
| Sheet overlay / close | closes sheet | OK |
| Duration field (sheet) | setShowDurationSheet(true) | OK |
| Save button (sheet) | handleSaveService then INSERT or UPDATE provider_services | OK |
| Duration sheet overlay / X / option | close / select duration | OK |

---

### `/dashboard/provider/analytics` — `app/dashboard/provider/analytics.tsx`
| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| Period selector (each) | setPeriod(p.key) | OK |
| "Service performance" tile (2 entry points) | router.push('/dashboard/provider/service-performance') @ app/dashboard/provider/analytics.tsx:497, :528 | OK |
| "Client intelligence" tile (2 entry points) | router.push('/dashboard/provider/client-intelligence') @ app/dashboard/provider/analytics.tsx:539, :571 | OK |

---

### `/dashboard/provider/bookings` — `app/dashboard/provider/bookings.tsx`
Placeholder ("Coming in the next update").

| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| (No other interactive elements) | — | — |

---

### `/dashboard/provider/availability` — `app/dashboard/provider/availability.tsx`
7-line stub file (likely re-export or empty).

| Element | Action | Status |
|---|---|---|
| (No interactive elements rendered) | — | — |

---

### `/dashboard/provider/clients` — `app/dashboard/provider/clients.tsx`
Placeholder ("Coming in the next update").

| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| (No other interactive elements) | — | — |

---

### `/dashboard/provider/portfolio` — `app/dashboard/provider/portfolio.tsx`
Placeholder ("Coming in the next update").

| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| (No other interactive elements) | — | — |

---

### `/dashboard/provider/posts` — `app/dashboard/provider/posts.tsx`
Placeholder ("Coming in the next update").

| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| (No other interactive elements) | — | — |

---

### `/dashboard/provider/payouts` — `app/dashboard/provider/payouts.tsx`
Placeholder ("Coming in the next update").

| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| (No other interactive elements) | — | — |

---

### `/dashboard/provider/settings` — `app/dashboard/provider/settings.tsx`
Placeholder ("Coming in the next update"). Distinct from `/settings` (the client settings screen with 13 stub rows).

| Element | Action | Status |
|---|---|---|
| Menu button | openPanel() | OK |
| (No other interactive elements) | — | — |

---

### `/dashboard/provider/goal-detail` — `app/dashboard/provider/goal-detail.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() @ app/dashboard/provider/goal-detail.tsx:190 | OK |
| "Edit goal" entry point | opens modal @ app/dashboard/provider/goal-detail.tsx:197 | OK |
| Drill into root dashboard | router.push('/dashboard/provider/') @ app/dashboard/provider/goal-detail.tsx:266 | OK |
| Drill into client intelligence | router.push('/dashboard/provider/client-intelligence') @ app/dashboard/provider/goal-detail.tsx:278 | OK |
| Modal overlay | closes modal | OK |
| "Save goal" button | saveGoal then AsyncStorage write + reload | OK |

---

### `/dashboard/provider/revenue-detail` — `app/dashboard/provider/revenue-detail.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Service performance" link | router.push('/dashboard/provider/service-performance') @ app/dashboard/provider/revenue-detail.tsx:282 | OK |
| "Client intelligence" link | router.push('/dashboard/provider/client-intelligence') @ app/dashboard/provider/revenue-detail.tsx:316 | OK |
| Top-of-dashboard link | router.push('/dashboard/provider/') @ app/dashboard/provider/revenue-detail.tsx:358 | OK |

---

### `/dashboard/provider/client-intelligence` — `app/dashboard/provider/client-intelligence.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Send reminder" (per-client) | sendReminder(c.id) then getOrCreateConversation then router.push('/messages/' + convoId) | OK |

---

### `/dashboard/provider/service-performance` — `app/dashboard/provider/service-performance.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| (Data tables only, no other actions) | — | — |

---

### `/dashboard/provider/schedule-detail` — `app/dashboard/provider/schedule-detail.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| (Heatmap is read-only, no actions) | — | — |

---

### `/settings` — `app/settings/index.tsx`
All rows except Sign Out use a local `stub()` helper that fires `Alert.alert('Coming soon', ...)`.

| Element | Action | Status |
|---|---|---|
| Back arrow | router.back() | OK |
| "Personal Information" row | stub('Personal Information') @ app/settings/index.tsx:155 | DEAD |
| "Phone Number" row | stub('Phone Number') @ app/settings/index.tsx:161 | DEAD |
| "Email" row | stub('Email') @ app/settings/index.tsx:167 | DEAD |
| "Payment Methods" row | stub('Payment Methods') @ app/settings/index.tsx:178 | DEAD |
| "Booking Protection" row | stub('Booking Protection') @ app/settings/index.tsx:183 | DEAD |
| "Booking Updates" toggle | setBookingUpdates() | OK |
| "Provider Activity" toggle | setProviderActivity() | OK |
| "Deals & Alerts" toggle | setDealsAlerts() | OK |
| "Profile Visibility" row | stub('Profile Visibility') @ app/settings/index.tsx:218 | DEAD |
| "Identity Verification" row | stub('Identity Verification') @ app/settings/index.tsx:223 | DEAD |
| "Blocked Accounts" row | stub('Blocked Accounts') @ app/settings/index.tsx:228 | DEAD |
| "Help Center" row | stub('Help Center') @ app/settings/index.tsx:239 | DEAD |
| "Contact Support" row | stub('Contact Support') @ app/settings/index.tsx:244 | DEAD |
| "Report an Issue" row | stub('Report an Issue') @ app/settings/index.tsx:249 | DEAD |
| "Terms of Service" row | stub('Terms of Service') @ app/settings/index.tsx:259 | DEAD |
| "Privacy Policy" row | stub('Privacy Policy') @ app/settings/index.tsx:264 | DEAD |
| "Sign Out" row | handleSignOut then Alert confirm then supabase.auth.signOut() then router.replace('/') | OK |

---

### `/me/edit` — `app/me/edit.tsx`
| Element | Action | Status |
|---|---|---|
| Back arrow | handleBack then unsaved-changes check then router.back() | OK |
| "Save" button | handleSave then uploads photo, upserts client row, router.back() | OK |
| "Change photo" button | pickPhoto then ImagePicker | OK |
| "Delete Account" button | handleDeleteAccount then Alert confirm then supabase.auth.signOut() then router.replace('/') | OK |

---

## All DEAD elements (consolidated)

| File:Line | Element | What it needs |
|---|---|---|
| app/auth/signup.tsx:33 | "Continue with Apple" | Apple Sign In via Supabase / native SDK |
| app/auth/signup.tsx:44 | "Continue with Email" | Email/password screens + Supabase auth |
| app/auth/signin.tsx:47 | "Continue with Apple" | Apple Sign In |
| app/auth/signin.tsx:58 | "Continue with Email" | Email/password screens + Supabase auth |
| app/(tabs)/index.tsx:486 | "See all" (For you) | Implement full list page or modal |
| app/(tabs)/messages.tsx:79 | Compose icon | New-conversation flow (pick provider, create conversation) |
| app/reels/index.tsx:554 | Reel comment button | Real comments table + UI (mock is intentional placeholder) |
| app/onboarding/client/uploads.tsx:56 | Photo picker box | Wire `expo-image-picker` + Storage upload to client avatar |
| app/onboarding/client/uploads.tsx:83 | Video picker box | Wire video picker + Storage upload |
| app/onboarding/client/payment.tsx:47 | "Card" option | Stripe integration (or third-party payment form) |
| app/onboarding/client/payment.tsx:68 | "Apple Pay" option | Apple Pay (Stripe payment sheet) |
| app/onboarding/client/preview.tsx:138 | Settings nav button | Either drop the button or route to a real client settings screen |
| app/post-booking/accepted.tsx:103 | "Add to Calendar" | `expo-calendar` integration (request perms, write event) |
| app/settings/index.tsx:155 | "Personal Information" row | Form for name + personal details |
| app/settings/index.tsx:161 | "Phone Number" row | Phone change flow with re-verification |
| app/settings/index.tsx:167 | "Email" row | Email change flow with confirmation |
| app/settings/index.tsx:178 | "Payment Methods" row | Payment management UI |
| app/settings/index.tsx:183 | "Booking Protection" row | Insurance/guarantee info page |
| app/settings/index.tsx:218 | "Profile Visibility" row | Privacy settings form |
| app/settings/index.tsx:223 | "Identity Verification" row | ID/selfie verification flow |
| app/settings/index.tsx:228 | "Blocked Accounts" row | Block-list management |
| app/settings/index.tsx:239 | "Help Center" row | Docs/FAQ link or embedded page |
| app/settings/index.tsx:244 | "Contact Support" row | Support request form |
| app/settings/index.tsx:249 | "Report an Issue" row | Issue reporting form |
| app/settings/index.tsx:259 | "Terms of Service" row | Static page or external link |
| app/settings/index.tsx:264 | "Privacy Policy" row | Static page or external link |
| components/ProviderProfile.tsx:376 | Portfolio photo tap | Lightbox / photo viewer modal |

---

## All BROKEN / MISMATCH elements (consolidated)

| File:Line | Element | Current target | Where it should go |
|---|---|---|---|
| app/post-booking/declined.tsx:76 | Alternative provider card (each) | `router.push('/(tabs)/')` | `router.push('/providers/' + p.id)`. `ALTERNATIVES` const list lacks ids; either pass real similar-providers from prior screen or drop the section |
| app/post-booking/submitted.tsx:83 | "View Nia's Profile" link | `router.push('/(tabs)/')` | `router.push('/providers/' + bookingProviderId)`. Needs booking context passed through review flow |

No BROKEN routes. Every `router.push` / `router.replace` target has a matching file under `app/` (the `app/dashboard/client/*` paths were stripped from the dev menu in this branch's Task 2 cleanup).

---

## Notes & recommendations

1. **Mock reels (intentional)**: `app/reels/index.tsx` MOCK_REELS stays for dev walkthrough. Revert before beta.
2. **Settings is a wasteland**: 13 rows in `/settings` all fire the local `stub()` helper. Either build out the screens or hide the rows for beta.
3. **Apple/Email sign-in are DEAD on both auth screens**: Phone OTP is the only working path. If beta requires email signup, must wire before launch.
4. **Two MISMATCH labels in post-booking**: both have `// TODO: wire to real provider id` comments. Currently land users on the tab home, confusing for the "View Profile" / alternative-provider use cases.
5. **Dashboard placeholders**: `bookings`, `clients`, `portfolio`, `posts`, `payouts`, `settings`, `availability` under `/dashboard/provider/` are all "Coming in the next update" cards. Real availability editor lives in onboarding only. Plan to either point drawer at the onboarding editor or build dashboard versions.
6. **Provider services delete**: button works in UI but the `provider_services` table has no DELETE RLS policy (per prior audit). User sees no error; row reappears on refetch.
7. **`/dashboard/client/*` removed**: deleted in Task 2 of this branch. Any future router.push to that path will be BROKEN. Keep an eye on auth routing after sign-in.
8. **`provider-review` is terminal**: no back arrow. Both Submit and Skip send the provider straight to `/dashboard/provider`.

---

*Report generated from direct read of all 51 user-reachable screens. Updated to remove all `(inferred)` rows.*
