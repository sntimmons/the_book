// THE BOOKING FLOW'S OWN COUNT OF ITSELF. Pure logic, NO I/O — the same split as
// lib/discovery.ts and lib/obligationState.ts, and for the same reason: a progress
// indicator is a CLAIM about how much work is left, and a false one is worse than
// none.
//
// ══ WHY THIS IS NOT A CONSTANT ════════════════════════════════════════════
//
// The obvious implementation is `Step 3 of 7` typed into each screen. That is what
// provider onboarding does, and in the booking flow it would be **wrong**, because
// one step is conditional:
//
//     app/book/contract.tsx — "A genuine 'no contract exists' (empty, no error)
//     skips the step."  →  router.replace('/book/payment')
//
// A provider with no active contract takes the client from the policy step straight
// to sending. Hard-coding a total would then either overstate the remaining work
// (claiming a contract step that never comes) or leave a visible gap where step 5
// should be. Both are the indicator lying about the flow it describes.
//
// So the total is DERIVED from whether a contract applies, and until that is known
// the indicator says `Step 3` with no total rather than guessing one. An unknown
// total is honest; a wrong one is not.
//
// ══ WHAT COUNTS AS A STEP ═════════════════════════════════════════════════
//
// A step is a screen where the CLIENT DOES SOMETHING that moves the request
// forward. `/book/confirmed` is therefore not a step: it is the outcome, and
// numbering it would mean the indicator reads "6 of 6" before the request is sent
// and then needs a seventh to describe success. The final step is SENDING, and it
// is the last thing the user is asked to do.
//
// `/book/verification.tsx` is not a step either — it is a gate that appears before
// the flow when identity verification is pending, not a stage within it.

/** The screens a client acts on, in order. `contract` is conditional. */
export type BookingStepKey = 'service' | 'datetime' | 'message' | 'policy' | 'contract' | 'send'

/**
 * Does this provider's booking require signing a contract?
 *
 * `null` means NOT YET ESTABLISHED, and it is a real state rather than a
 * placeholder: `fetchProviderContract` deliberately distinguishes "no contract
 * exists" from "the lookup failed", and a failed lookup must not be read as "no
 * contract required". While it is null the indicator shows no total.
 */
export type ContractRequired = boolean | null

const WITH_CONTRACT: BookingStepKey[] = [
  'service',
  'datetime',
  'message',
  'policy',
  'contract',
  'send',
]

const WITHOUT_CONTRACT: BookingStepKey[] = ['service', 'datetime', 'message', 'policy', 'send']

/**
 * The steps this booking will actually take.
 *
 * When `contractRequired` is unknown we return the LONGER list, because the caller
 * uses it only to locate the current step — never to show a total. Returning the
 * shorter one would make `indexOf('contract')` fail on the very screen that
 * discovers a contract exists.
 */
export function bookingSteps(contractRequired: ContractRequired): BookingStepKey[] {
  return contractRequired === false ? WITHOUT_CONTRACT : WITH_CONTRACT
}

/** 1-based position of a step, or null if it is not part of this booking. */
export function bookingStepNumber(
  step: BookingStepKey,
  contractRequired: ContractRequired,
): number | null {
  const i = bookingSteps(contractRequired).indexOf(step)
  return i === -1 ? null : i + 1
}

/**
 * How many steps this booking has — or null while that is genuinely unknown.
 *
 * NULL IS THE POINT. The caller renders "Step 3" rather than inventing a total, so
 * the user is told where they are without being told something false about what is
 * left.
 */
export function bookingStepTotal(contractRequired: ContractRequired): number | null {
  if (contractRequired === null) return null
  return bookingSteps(contractRequired).length
}

/**
 * The label to show. Never claims completion: the last step is SENDING, and it is
 * numbered like every other step because the user still has to do it.
 */
export function bookingProgressLabel(
  step: BookingStepKey,
  contractRequired: ContractRequired,
): string | null {
  const n = bookingStepNumber(step, contractRequired)
  if (n === null) return null
  const total = bookingStepTotal(contractRequired)
  if (total !== null) return `Step ${n} of ${total}`

  // NO TOTAL YET. "Step 3" says where they are without inventing how much is left.
  //
  // The exception is the SEND step, which is always last whether or not a contract
  // applied — so "Last step" is true on both paths and is worth saying, because a
  // bare number cannot tell somebody they have arrived. It still does not claim the
  // request is sent: it is the last thing they are asked to DO.
  if (step === 'send') return 'Last step'
  return `Step ${n}`
}
