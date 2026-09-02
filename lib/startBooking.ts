// The single client-side booking-start boundary.
//
// CODE-DRIFT-001: the verification gate used to be evaluated only inside the
// provider-profile "Book Now" handler, while rebook entry points pushed straight
// to `/book/service` — bypassing the gate (and, in one case, entering the flow
// with stale provider context). EVERY client action that begins a booking or
// rebooking attempt for a provider must now go through `startBooking`, so the
// gate is evaluated in exactly one place and a future `beta-notice → required`
// flip covers all entries without reshaping the booking flow.
//
// This boundary is intentionally NARROW: it establishes provider context,
// evaluates the verification gate, and routes to the verification notice or the
// service step. It does NOT own the booking flow itself.

import { router } from 'expo-router'
import { useBookingStore } from '@/store/bookingStore'
import {
  VERIFICATION_ENFORCEMENT_MODE,
  VerificationEnforcementMode,
  resolveVerificationGate,
  canProceedWithTransaction,
  requiresVerificationNotice,
  isClientIdentityVerified,
} from './verificationGate'

export type BookingStartDecision = 'proceed' | 'show_notice' | 'blocked'

// Pure decision — unit-testable across every enforcement mode. `verified` is the
// client's identity-verification state; `noticeAcknowledged` is the per-attempt
// beta-notice acknowledgement. Unknown verification MUST be passed as false (the
// gate never resolves unknown → verified). Composed from the existing gate
// helpers so there is a single source of truth for verification decisions:
//   - required + unverified            → 'blocked'      (cannot proceed)
//   - beta-notice + unverified + !ack  → 'show_notice'  (education, then continue)
//   - verified, or beta bypass + ack   → 'proceed'
export function resolveBookingStartDecision(
  verified: boolean,
  noticeAcknowledged: boolean,
  mode: VerificationEnforcementMode = VERIFICATION_ENFORCEMENT_MODE,
): BookingStartDecision {
  const gate = resolveVerificationGate(verified, mode)
  if (!canProceedWithTransaction(gate)) return 'blocked'
  if (requiresVerificationNotice(gate) && !noticeAcknowledged) return 'show_notice'
  return 'proceed'
}

export const BOOKING_START_ROUTE: Record<BookingStartDecision, string> = {
  proceed: '/book/service',
  show_notice: '/book/verification',
  // Until 'required' mode ships a real verification-required flow, a hard block
  // routes to the same gate surface as the notice. Production mode is
  // 'beta-notice', so 'blocked' is not reachable today; when 'required' ships,
  // this is the ONE place to route a blocked attempt to the required flow (and
  // `/book/verification` would drop its bypass-continue in that mode).
  blocked: '/book/verification',
}

export interface BookingProviderContext {
  id: string
  name: string
  category?: string
  location?: string
}

// Establish provider context for a NEW attempt (setProvider also resets the
// per-attempt notice acknowledgement), evaluate the gate against a FRESH
// acknowledgement, and route. Returns the decision (handy for callers/tests;
// callers may ignore it). Never relies on stale booking-store state — the
// provider context passed here is always written before the gate is evaluated.
export function startBooking(ctx: BookingProviderContext): BookingStartDecision {
  const store = useBookingStore.getState()
  store.setProvider(ctx.id, ctx.name, ctx.category ?? '', ctx.location ?? '')
  const decision = resolveBookingStartDecision(
    isClientIdentityVerified(),
    useBookingStore.getState().verificationNoticeAcknowledged,
  )
  router.push(BOOKING_START_ROUTE[decision] as never)
  return decision
}
