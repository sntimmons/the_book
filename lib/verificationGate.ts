// Centralized transaction verification gate — the single source of truth for
// whether a user may proceed into a transaction (a booking) and whether the beta
// identity-verification trust notice must be shown.
//
// IMPORTANT: this contains NO real identity verification, NO vendor, and NO
// document collection. It only decides gate behavior. Real verification is a
// future feature; the enum below is shaped so it can be added without changing
// the booking journey.

export type VerificationEnforcementMode = 'beta-notice' | 'required'

export type VerificationGateState =
  | 'verified'
  | 'unverified_beta_bypass'
  | 'unverified_hard_block'

// Beta ships in 'beta-notice': an unverified user sees a trust notice but may
// continue booking. Flipping to 'required' (future) hard-blocks unverified
// transactions WITHOUT reshaping the booking flow. Do not implement a real
// verification vendor flow behind 'required' in this batch.
export const VERIFICATION_ENFORCEMENT_MODE: VerificationEnforcementMode = 'beta-notice'

// Resolve the gate for a single actor. `verified` is strictly boolean: any
// missing/unknown verification state MUST be passed as false. Unknown state must
// never resolve to 'verified' by omission.
export function resolveVerificationGate(
  verified: boolean,
  mode: VerificationEnforcementMode = VERIFICATION_ENFORCEMENT_MODE,
): VerificationGateState {
  if (verified === true) return 'verified'
  return mode === 'required' ? 'unverified_hard_block' : 'unverified_beta_bypass'
}

// Verified always proceeds; the beta bypass proceeds (after showing a notice); a
// future hard block does not.
export function canProceedWithTransaction(state: VerificationGateState): boolean {
  return state === 'verified' || state === 'unverified_beta_bypass'
}

// Only the beta bypass shows the educational trust notice. A verified user needs
// no notice; a future hard block routes to a real verification flow, not a notice.
export function requiresVerificationNotice(state: VerificationGateState): boolean {
  return state === 'unverified_beta_bypass'
}

// Client identity-verification state is NOT yet modeled: the `clients` table has
// no verification column (only providers.identity_verified exists). Until a
// client verification state exists, a client is treated as UNVERIFIED — never
// silently verified. This is the single place to update when client verification
// state is added.
export function isClientIdentityVerified(): boolean {
  return false
}

// FUTURE: a real transaction will require BOTH the client AND the provider to be
// verified before proceeding. When 'required' mode ships, the caller composes the
// two, e.g. resolveVerificationGate(clientVerified && providerVerified, 'required').
// Provider verification state today lives in providers.identity_verified.
