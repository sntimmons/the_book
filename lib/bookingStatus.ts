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
