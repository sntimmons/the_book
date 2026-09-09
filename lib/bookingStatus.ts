// Single source of truth for how a booking's raw DB status maps to a
// user-facing label, a color "tone", and which list tab it belongs in.
//
// Background: four screens (client bookings list, provider bookings list,
// booking detail, provider dashboard home) each had their own copies of this
// logic and they disagreed — e.g. `checked_in` showed in Past on one screen and
// Upcoming on another, `declined` vanished entirely, and the dashboard rendered
// the raw status string. Centralizing it here fixes that class of bug.
//
// Beta lifecycle: pending -> accepted -> completed, plus off-ramps declined /
// cancelled / no_show. The intermediate `arriving` / `checked_in` states are
// being dropped for beta; we still MAP them (so any existing rows display and
// sort sensibly) but the app no longer creates them. No DB migration: every
// status here is already allowed by the bookings_status_check constraint.

export type BookingTab = 'pending' | 'upcoming' | 'past' | 'cancelled'

// Color tone for a status pill. Screens own their actual color tokens; this
// just tells them which bucket a status falls into.
export type BookingTone = 'pending' | 'confirmed' | 'completed' | 'cancelled'

// Active, pre-appointment-or-in-progress states. `arriving`/`checked_in` are
// folded in here (shown as "Confirmed") since we no longer surface them.
const UPCOMING = new Set([
  'accepted',
  'arriving',
  'checked_in',
  'rescheduled',
])

// Appointment happened (or its time passed): completed, or client no-showed.
const PAST = new Set(['completed', 'no_show'])

// Every cancellation/decline variant. Includes the DB's American `canceled`
// spelling and the legacy `declined` value (decline now writes
// `cancelled_by_provider`, but old rows may still be `declined`).
const CANCELLED = new Set([
  'canceled',
  'cancelled',
  'cancelled_by_client',
  'cancelled_by_provider',
  'late_cancelled',
  'declined',
])

export function bookingTab(status: string): BookingTab {
  if (status === 'pending') return 'pending'
  if (UPCOMING.has(status)) return 'upcoming'
  if (PAST.has(status)) return 'past'
  // CANCELLED set + any unknown value land here so nothing silently vanishes
  // from the lists.
  return 'cancelled'
}

export function bookingStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'accepted':
    case 'arriving':
    case 'checked_in':
    case 'rescheduled':
      return 'Confirmed'
    case 'completed':
      return 'Completed'
    case 'no_show':
      return 'No show'
    case 'declined':
      return 'Declined'
    case 'canceled':
    case 'cancelled':
    case 'cancelled_by_client':
    case 'cancelled_by_provider':
    case 'late_cancelled':
      return 'Cancelled'
    default:
      return 'Cancelled'
  }
}

export function bookingStatusTone(status: string): BookingTone {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'accepted':
    case 'arriving':
    case 'checked_in':
    case 'rescheduled':
      return 'confirmed'
    case 'completed':
      return 'completed'
    default:
      // no_show, declined, and all cancel variants
      return 'cancelled'
  }
}

// ── THE SECOND AXIS: draft vs submitted, and the request deadline ──────────
//
// Correction 3 gave the booking request a lifecycle, and `status` alone stopped
// being enough to answer "is this a real request?". A DRAFT — the row the client
// is still assembling inside the booking flow — is `status='pending'` like every
// other request, because the write-integrity trigger forces that on INSERT. What
// separates them is `submitted_at`.
//
// The provider side is protected by RLS: their SELECT policy requires
// `submitted_at is not null`, so a draft is invisible to them at the database.
// **The CLIENT side has no such filter** — a client can see their own rows,
// which is exactly what makes resuming a draft possible — so every client-facing
// booking read has to make this distinction itself. It lives here, with the rest
// of the booking-state vocabulary, for the reason stated at the top of this file:
// four screens once each had their own copy of that vocabulary and disagreed.
//
// SELECT `submitted_at` (and, for the provider surfaces, `expires_at`) wherever
// a booking is read for display. A row that omits them cannot be classified, and
// the helpers below fail toward "treat it as a real request" — see each one.

/** The columns these helpers need. Anything with more fields satisfies it. */
export interface BookingLifecycleRow {
  submitted_at?: string | null
  expires_at?: string | null
}

/**
 * Is this row still an unsent draft?
 *
 * FAILS CLOSED TOWARD "REAL". `undefined` — the column was not selected — is NOT
 * a draft, because misclassifying a real request as a draft would HIDE a booking
 * a provider is waiting on, and that is much worse than showing a client one
 * extra row. Only an explicit `null` from the database means draft.
 */
export function isBookingDraft(row: BookingLifecycleRow): boolean {
  return row.submitted_at === null
}

/** The complement, for filtering a list down to requests that were actually sent. */
export function isSubmittedRequest(row: BookingLifecycleRow): boolean {
  return !isBookingDraft(row)
}

/**
 * The provider-facing urgency of a submitted request, derived exactly as the
 * database's `booking_request_urgency()` derives it (`20261037000000` § 6).
 *
 * ── WHY THIS REPLACED TWO HARD-CODED 24-HOUR GUARDS ───────────────────────
 *
 * Both provider surfaces used to compute expiry as `created_at + 24 hours`, and
 * Correction 3 made all three parts of that wrong at once:
 *   * **24h vs 72h** — PD-071 sets the window at 72 hours.
 *   * **`created_at` vs `submitted_at`** — `created_at` is now stamped when the
 *     DRAFT is created at the contract step. A client who drafts, leaves, and
 *     submits a day later produced a request the dashboard marked **expired on
 *     arrival** while the server gave it a full 72 hours.
 *   * **Decline was blocked too.** The server deliberately allows declining
 *     forever — letting a provider clear a stale request is not a thing to
 *     prevent — and the UI disabled it.
 *
 * The deadline itself is never recomputed here: `expires_at` is server-derived
 * (`LEAST(submitted_at + 72h, appointment_time)`) and this only COMPARES it, so a
 * wrong device clock can shift what a provider is shown but can never change what
 * the database will accept. The server refuses a late accept with `PT425`
 * regardless.
 */
export type RequestUrgency = 'draft' | 'none' | 'nudge' | 'urgent' | 'expired'

const HOURS = 60 * 60 * 1000

export function bookingRequestUrgency(
  row: BookingLifecycleRow,
  now: number = Date.now(),
): RequestUrgency {
  if (!row.submitted_at) return 'draft'
  const submitted = new Date(row.submitted_at).getTime()
  if (Number.isNaN(submitted)) return 'none'
  const expires = row.expires_at ? new Date(row.expires_at).getTime() : NaN
  if (!Number.isNaN(expires) && now >= expires) return 'expired'
  if (now >= submitted + 48 * HOURS) return 'urgent'
  if (now >= submitted + 24 * HOURS) return 'nudge'
  return 'none'
}

/**
 * May the provider still ACCEPT this request?
 *
 * Accepting is the only act the deadline forbids. **Declining is never gated by
 * this** — ask `bookingRequestUrgency` if you want to LABEL a stale request, and
 * never use that label to disable the decline control.
 *
 * Fails toward ALLOWING when `expires_at` is absent: the server holds the real
 * boundary and refuses with `PT425`, so a missing column costs one honest error
 * message, whereas failing closed would hide a live Accept from a provider whose
 * request is perfectly answerable.
 */
export function canAcceptRequest(row: BookingLifecycleRow, now: number = Date.now()): boolean {
  return bookingRequestUrgency(row, now) !== 'expired'
}

/** Time left to accept, for display. Null when there is no deadline to show. */
export function requestTimeRemaining(
  row: BookingLifecycleRow,
  now: number = Date.now(),
): string | null {
  if (!row.submitted_at || !row.expires_at) return null
  const diff = new Date(row.expires_at).getTime() - now
  if (Number.isNaN(diff)) return null
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / HOURS)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h left`
  }
  if (hours > 0) return `${hours}h left`
  return `${Math.floor((diff % HOURS) / (60 * 1000))}m left`
}
