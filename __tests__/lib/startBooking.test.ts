// Tests for the centralized booking-start boundary (CODE-DRIFT-001).
//
// The pure decision is proven across BOTH enforcement modes (beta-notice and the
// future 'required') without changing production mode. The imperative startBooking
// is proven to establish provider context and route through the gate. A static
// route census proves no in-scope client entry point bypasses the boundary by
// pushing /book/service directly.

import fs from 'fs'
import path from 'path'

import {
  resolveBookingStartDecision,
  BOOKING_START_ROUTE,
  startBooking,
} from '@/lib/startBooking'
import { useBookingStore } from '@/store/bookingStore'
import { router } from 'expo-router'

describe('resolveBookingStartDecision (pure)', () => {
  it('verified user proceeds — beta-notice mode', () => {
    expect(resolveBookingStartDecision(true, false, 'beta-notice')).toBe('proceed')
  })

  it('verified user proceeds — required mode', () => {
    expect(resolveBookingStartDecision(true, false, 'required')).toBe('proceed')
  })

  it('unverified + beta-notice + not acknowledged → show_notice', () => {
    expect(resolveBookingStartDecision(false, false, 'beta-notice')).toBe('show_notice')
  })

  it('unverified + beta-notice + acknowledged → proceed', () => {
    expect(resolveBookingStartDecision(false, true, 'beta-notice')).toBe('proceed')
  })

  it('unverified + required → blocked (hard block, never proceeds)', () => {
    expect(resolveBookingStartDecision(false, false, 'required')).toBe('blocked')
    // acknowledgement must NOT let a required hard-block slip through
    expect(resolveBookingStartDecision(false, true, 'required')).toBe('blocked')
  })

  it('unknown verification passed as false never resolves to proceed under required', () => {
    expect(resolveBookingStartDecision(false, false, 'required')).not.toBe('proceed')
  })
})

describe('BOOKING_START_ROUTE mapping', () => {
  it('proceed → service step; notice/blocked → the gate surface', () => {
    expect(BOOKING_START_ROUTE.proceed).toBe('/book/service')
    expect(BOOKING_START_ROUTE.show_notice).toBe('/book/verification')
    expect(BOOKING_START_ROUTE.blocked).toBe('/book/verification')
  })
})

describe('startBooking (imperative boundary)', () => {
  beforeEach(() => {
    useBookingStore.getState().reset()
    ;(router.push as jest.Mock).mockClear()
  })

  it('establishes the correct provider context (no stale state) and resets the per-attempt acknowledgement', () => {
    // seed stale state from a prior attempt
    useBookingStore.getState().setProvider('OLD', 'Old Name', 'oldcat', 'oldloc')
    useBookingStore.getState().setVerificationNoticeAcknowledged(true)

    startBooking({ id: 'prov-123', name: 'New Name', category: 'Lashes', location: 'Houston' })

    const s = useBookingStore.getState()
    expect(s.providerId).toBe('prov-123')
    expect(s.providerName).toBe('New Name')
    expect(s.providerCategory).toBe('Lashes')
    expect(s.providerLocation).toBe('Houston')
    // setProvider reset the acknowledgement for the new attempt
    expect(s.verificationNoticeAcknowledged).toBe(false)
  })

  it('routes an unverified beta client through the verification notice (production behavior)', () => {
    // isClientIdentityVerified() is false and mode is beta-notice → show_notice
    const decision = startBooking({ id: 'p1', name: 'A' })
    expect(decision).toBe('show_notice')
    expect(router.push).toHaveBeenCalledWith('/book/verification')
  })

  it('defaults missing category/location to empty strings', () => {
    startBooking({ id: 'p2', name: 'B' })
    const s = useBookingStore.getState()
    expect(s.providerCategory).toBe('')
    expect(s.providerLocation).toBe('')
  })
})

// Static route census: no in-scope client screen may reference /book/service as a
// navigation target. This scans for ANY occurrence of the literal (not just a
// static `router.push('/book/service')` — a dynamic/data-form push would slip a
// regex), so the guard matches its stated intent. The ONLY app/ files allowed to
// name /book/service are the post-notice Continue (book/verification.tsx) and the
// __DEV__-gated dev sitemap (index.tsx). The centralized boundary itself lives in
// lib/startBooking.ts (outside app/) and names the route via its route map.
describe('no /book/service bypass among client entry points', () => {
  const appDir = path.join(__dirname, '..', '..', 'app')
  const ALLOWED = new Set([
    path.join('book', 'verification.tsx'), // the post-notice Continue
    'index.tsx', // __DEV__-gated dev sitemap only (not a production journey)
  ])

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (entry.name.endsWith('.tsx')) out.push(full)
    }
    return out
  }

  it('only book/verification and the dev sitemap reference /book/service', () => {
    const offenders: string[] = []
    for (const file of walk(appDir)) {
      const rel = path.relative(appDir, file)
      if (ALLOWED.has(rel)) continue
      const src = fs.readFileSync(file, 'utf8')
      if (src.includes('/book/service')) offenders.push(rel)
    }
    // Any offender is a screen that can reach the service step without going
    // through startBooking() — i.e. a gate bypass (CODE-DRIFT-001 regression).
    expect(offenders).toEqual([])
  })

  it('the three booking-start entry screens import startBooking', () => {
    const entries = [
      path.join('providers', '[id].tsx'),
      path.join('reviews', 'all', '[id].tsx'),
      path.join('post-booking', 'review.tsx'),
    ]
    for (const rel of entries) {
      const src = fs.readFileSync(path.join(appDir, rel), 'utf8')
      expect(src).toMatch(/startBooking/)
    }
  })
})
