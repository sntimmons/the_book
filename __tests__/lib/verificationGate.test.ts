import {
  resolveVerificationGate,
  canProceedWithTransaction,
  requiresVerificationNotice,
  isClientIdentityVerified,
  VERIFICATION_ENFORCEMENT_MODE,
} from '@/lib/verificationGate'

// Locks the centralized transaction verification gate behavior.
describe('resolveVerificationGate', () => {
  it('verified → proceed, no notice', () => {
    const s = resolveVerificationGate(true)
    expect(s).toBe('verified')
    expect(canProceedWithTransaction(s)).toBe(true)
    expect(requiresVerificationNotice(s)).toBe(false)
  })

  it('unverified + beta-notice → bypass with notice (proceed allowed)', () => {
    const s = resolveVerificationGate(false, 'beta-notice')
    expect(s).toBe('unverified_beta_bypass')
    expect(canProceedWithTransaction(s)).toBe(true)
    expect(requiresVerificationNotice(s)).toBe(true)
  })

  it('unverified + required → hard block (future; cannot proceed, no notice)', () => {
    const s = resolveVerificationGate(false, 'required')
    expect(s).toBe('unverified_hard_block')
    expect(canProceedWithTransaction(s)).toBe(false)
    expect(requiresVerificationNotice(s)).toBe(false)
  })

  it('missing/unknown verification state must NOT resolve as verified', () => {
    // Anything that is not strictly true is unverified.
    expect(resolveVerificationGate(false)).not.toBe('verified')
    // @ts-expect-error — exercise the "unknown" path defensively.
    expect(resolveVerificationGate(undefined)).not.toBe('verified')
    // @ts-expect-error
    expect(resolveVerificationGate(null)).not.toBe('verified')
  })

  it('defaults to the current beta enforcement mode', () => {
    expect(VERIFICATION_ENFORCEMENT_MODE).toBe('beta-notice')
    // With the default mode, an unverified actor gets the beta bypass.
    expect(resolveVerificationGate(false)).toBe('unverified_beta_bypass')
  })
})

describe('isClientIdentityVerified (current truth: client state not modeled)', () => {
  it('returns false — clients have no verification state yet, so never silently verified', () => {
    expect(isClientIdentityVerified()).toBe(false)
  })
})
