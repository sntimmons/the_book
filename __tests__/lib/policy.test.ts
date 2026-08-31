import {
  policyToPoliciesRow,
  rowsToPolicy,
  policyToBookingPrefs,
  DEFAULT_POLICY,
  PolicyValue,
} from '@/lib/policy'

const PID = 'provider-1'

// Locks the label <-> number conversion between the editor, the go-live write,
// and the client-facing display. Drift here shows wrong fees / travel terms.
describe('policyToPoliciesRow', () => {
  it('clamps a fee percent below 0 up to 0', () => {
    const v: PolicyValue = { ...DEFAULT_POLICY, cancellationFeePercent: '-25' }
    expect(policyToPoliciesRow(PID, v).cancellation_fee_percent).toBe(0)
  })

  it('clamps a fee percent above 100 down to 100', () => {
    const v: PolicyValue = { ...DEFAULT_POLICY, noShowFeePercent: '150' }
    expect(policyToPoliciesRow(PID, v).no_show_fee_percent).toBe(100)
  })

  it("maps 'No limit' max distance to null", () => {
    const v: PolicyValue = { ...DEFAULT_POLICY, maxDistance: 'No limit' }
    expect(policyToPoliciesRow(PID, v).max_travel_distance_miles).toBeNull()
  })

  it("maps 'No free radius' to 0 miles", () => {
    const v: PolicyValue = { ...DEFAULT_POLICY, freeRadius: 'No free radius' }
    expect(policyToPoliciesRow(PID, v).free_travel_radius_miles).toBe(0)
  })

  it("zeroes the travel amount when travel is 'free'", () => {
    const v: PolicyValue = { ...DEFAULT_POLICY, travelFeeType: 'free', travelAmount: '20' }
    expect(policyToPoliciesRow(PID, v).travel_fee_amount).toBe(0)
  })
})

describe('rowsToPolicy', () => {
  it('returns the established defaults when both rows are null', () => {
    expect(rowsToPolicy(null, null)).toEqual(DEFAULT_POLICY)
  })
})

describe('round-trip stability', () => {
  it('DEFAULT_POLICY survives policyToPoliciesRow -> rowsToPolicy unchanged', () => {
    const policiesRow = policyToPoliciesRow(PID, DEFAULT_POLICY)
    const prefsRow = policyToBookingPrefs(PID, DEFAULT_POLICY)
    expect(rowsToPolicy(policiesRow, prefsRow)).toEqual(DEFAULT_POLICY)
  })
})
