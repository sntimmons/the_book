// Provider booking policy — shared domain module.
//
// The editor UI (onboarding + dashboard) works in "label form" (the dropdown
// strings), while the DB stores normalized numbers. All conversion lives here
// so the UI, go-live write, and the client-facing booking screen agree.

export type TravelFeeType = 'flat' | 'per-mile' | 'free'

// Editor working shape (what PolicyEditor holds in state).
export interface PolicyValue {
  cancelWindow: string // e.g. '24 hours before'
  cancellationFeePercent: string // percent of service price, as entered
  noShowFeePercent: string // percent of service price
  rescheduleWindow: string // enum label, incl. 'Anytime' / 'No reschedules allowed'
  rescheduleFeeEnabled: boolean
  rescheduleFee: string // flat dollars
  rescheduleLimit: string // enum label
  gracePeriod: string // e.g. '15 minutes' / 'No grace period'
  travelFeeType: TravelFeeType
  travelAmount: string // dollars (per-appt or per-mile)
  freeRadius: string // e.g. '5 miles' / 'No free radius'
  maxDistance: string // e.g. '25 miles' / 'No limit'
}

// Normalized row for public.provider_policies — the net-new terms only.
// cancellation_window_hours and grace live on provider_booking_preferences.
export interface PolicyRow {
  provider_id: string
  cancellation_fee_percent: number
  no_show_fee_percent: number
  reschedule_window: string
  reschedule_fee_enabled: boolean
  reschedule_fee: number
  reschedule_limit: string
  travel_fee_type: TravelFeeType
  travel_fee_amount: number
  free_travel_radius_miles: number
  max_travel_distance_miles: number | null
}

// The two policy values owned by public.provider_booking_preferences. The rest
// of that table (buffer_minutes, requires_manual_approval) belongs to the
// availability step; each writer upserts only its own columns by provider_id.
export interface BookingPrefsPolicy {
  provider_id: string
  cancellation_window_hours: number
  lateness_grace_minutes: number
}

// Dropdown option lists (shared by the editor).
export const POLICY_OPTIONS = {
  cancelWindow: [
    '2 hours before',
    '6 hours before',
    '12 hours before',
    '24 hours before',
    '48 hours before',
    '72 hours before',
  ],
  rescheduleWindow: [
    'No reschedules allowed',
    '2 hours before',
    '6 hours before',
    '12 hours before',
    '24 hours before',
    '48 hours before',
    'Anytime',
  ],
  rescheduleLimit: [
    'Once per booking',
    'Twice per booking',
    'Unlimited',
    'No reschedules allowed',
  ],
  gracePeriod: [
    'No grace period',
    '5 minutes',
    '10 minutes',
    '15 minutes',
    '20 minutes',
    '30 minutes',
  ],
  freeRadius: ['1 mile', '3 miles', '5 miles', '10 miles', 'No free radius'],
  maxDistance: ['5 miles', '10 miles', '15 miles', '25 miles', '50 miles', 'No limit'],
} as const

// Defaults are real, meaningful terms (not empty) — a provider who taps "Use
// default policies" is agreeing to these, and a client booking a provider with
// no policy row sees exactly these. Matches the onboarding form's initial state.
export const DEFAULT_POLICY: PolicyValue = {
  cancelWindow: '24 hours before',
  cancellationFeePercent: '0',
  noShowFeePercent: '100',
  rescheduleWindow: '24 hours before',
  rescheduleFeeEnabled: false,
  rescheduleFee: '',
  rescheduleLimit: 'Once per booking',
  gracePeriod: '15 minutes',
  travelFeeType: 'per-mile',
  travelAmount: '',
  freeRadius: '5 miles',
  maxDistance: '25 miles',
}

function intFrom(s: string, fallback: number): number {
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : fallback
}

function floatFrom(s: string, fallback: number): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : fallback
}

function clampPercent(n: number): number {
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

function milesLabel(miles: number, zeroLabel: string): string {
  if (miles <= 0) return zeroLabel
  return miles === 1 ? '1 mile' : `${miles} miles`
}

function graceMinutes(v: PolicyValue): number {
  return v.gracePeriod === 'No grace period' ? 0 : intFrom(v.gracePeriod, 0)
}

// PolicyValue → provider_policies row (fees, reschedule, travel).
export function policyToPoliciesRow(providerId: string, v: PolicyValue): PolicyRow {
  return {
    provider_id: providerId,
    cancellation_fee_percent: clampPercent(intFrom(v.cancellationFeePercent, 0)),
    no_show_fee_percent: clampPercent(intFrom(v.noShowFeePercent, 0)),
    reschedule_window: v.rescheduleWindow,
    reschedule_fee_enabled: v.rescheduleFeeEnabled,
    reschedule_fee: v.rescheduleFeeEnabled ? floatFrom(v.rescheduleFee, 0) : 0,
    reschedule_limit: v.rescheduleLimit,
    travel_fee_type: v.travelFeeType,
    travel_fee_amount: v.travelFeeType === 'free' ? 0 : floatFrom(v.travelAmount, 0),
    free_travel_radius_miles:
      v.freeRadius === 'No free radius' ? 0 : intFrom(v.freeRadius, 0),
    max_travel_distance_miles:
      v.maxDistance === 'No limit' ? null : intFrom(v.maxDistance, 0),
  }
}

// PolicyValue → the two columns the policy step owns on
// provider_booking_preferences. Only these columns are sent, so the upsert
// merges with the availability step's buffer/approval columns by provider_id.
export function policyToBookingPrefs(
  providerId: string,
  v: PolicyValue,
): BookingPrefsPolicy {
  return {
    provider_id: providerId,
    cancellation_window_hours: intFrom(v.cancelWindow, 24),
    lateness_grace_minutes: graceMinutes(v),
  }
}

// DB rows → PolicyValue. Both sources may be null (no row yet) → the relevant
// slice of DEFAULT_POLICY is used so we never show invented terms.
export function rowsToPolicy(
  policiesRow: PolicyRow | null,
  prefsRow: Partial<BookingPrefsPolicy> | null,
): PolicyValue {
  const p = policiesRow
  const hours = prefsRow?.cancellation_window_hours
  const grace = prefsRow?.lateness_grace_minutes
  return {
    cancelWindow: hours == null ? DEFAULT_POLICY.cancelWindow : `${hours} hours before`,
    gracePeriod:
      grace == null
        ? DEFAULT_POLICY.gracePeriod
        : grace === 0
          ? 'No grace period'
          : `${grace} minutes`,
    cancellationFeePercent: p ? String(p.cancellation_fee_percent) : DEFAULT_POLICY.cancellationFeePercent,
    noShowFeePercent: p ? String(p.no_show_fee_percent) : DEFAULT_POLICY.noShowFeePercent,
    rescheduleWindow: p ? p.reschedule_window : DEFAULT_POLICY.rescheduleWindow,
    rescheduleFeeEnabled: p ? p.reschedule_fee_enabled : DEFAULT_POLICY.rescheduleFeeEnabled,
    rescheduleFee: p && p.reschedule_fee ? String(p.reschedule_fee) : DEFAULT_POLICY.rescheduleFee,
    rescheduleLimit: p ? p.reschedule_limit : DEFAULT_POLICY.rescheduleLimit,
    travelFeeType: p ? p.travel_fee_type : DEFAULT_POLICY.travelFeeType,
    travelAmount: p && p.travel_fee_amount ? String(p.travel_fee_amount) : DEFAULT_POLICY.travelAmount,
    freeRadius: p ? milesLabel(p.free_travel_radius_miles, 'No free radius') : DEFAULT_POLICY.freeRadius,
    maxDistance:
      p == null
        ? DEFAULT_POLICY.maxDistance
        : p.max_travel_distance_miles == null
          ? 'No limit'
          : milesLabel(p.max_travel_distance_miles, 'No limit'),
  }
}

// Client-facing prose, derived from real terms. Each line is optional so we
// only show what applies (e.g. no fee line when the fee is 0).
export interface PolicyDisplay {
  cancellation: { free: string; fee: string | null; noShow: string | null }
  reschedule: { window: string; limit: string | null; fee: string | null }
  grace: string
}

export function policyToDisplay(v: PolicyValue): PolicyDisplay {
  const withinPhrase = v.cancelWindow.replace(/ before$/, '') // '24 hours'
  const cancelPct = intFrom(v.cancellationFeePercent, 0)
  const noShowPct = intFrom(v.noShowFeePercent, 0)

  const limitProse: Record<string, string | null> = {
    'Once per booking': 'One reschedule allowed per booking',
    'Twice per booking': 'Two reschedules allowed per booking',
    Unlimited: 'Unlimited reschedules',
    'No reschedules allowed': null,
  }

  let rescheduleWindow: string
  if (v.rescheduleWindow === 'No reschedules allowed') {
    rescheduleWindow = 'No reschedules allowed'
  } else if (v.rescheduleWindow === 'Anytime') {
    rescheduleWindow = 'Free reschedule anytime'
  } else {
    rescheduleWindow = `Free reschedule up to ${v.rescheduleWindow}`
  }

  return {
    cancellation: {
      free: `Free cancellation up to ${v.cancelWindow}`,
      fee:
        cancelPct > 0
          ? `${cancelPct}% of the service price if cancelled within ${withinPhrase}`
          : null,
      noShow: noShowPct > 0 ? `${noShowPct}% charge for no-shows` : null,
    },
    reschedule: {
      window: rescheduleWindow,
      limit:
        v.rescheduleWindow === 'No reschedules allowed'
          ? null
          : limitProse[v.rescheduleLimit] ?? null,
      fee:
        v.rescheduleFeeEnabled && floatFrom(v.rescheduleFee, 0) > 0
          ? `$${v.rescheduleFee} fee for late reschedules`
          : null,
    },
    grace:
      v.gracePeriod === 'No grace period'
        ? 'No grace period. Late arrivals may be treated as a no-show.'
        : `${v.gracePeriod} grace period. After that the appointment may be forfeited.`,
  }
}
