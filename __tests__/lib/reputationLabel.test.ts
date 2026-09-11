import { ratingClientLabel, reviewTotalLabel } from '../../lib/reputationLabel'

// PD-091 makes the public rating the mean of each client's LATEST revealed
// review. These helpers exist so the denominator shown beside a rating says
// CLIENTS — the thing the rating actually averages — rather than review count,
// which under a repeat-client rule can be many times larger.
describe('ratingClientLabel', () => {
  it('says nothing when there is nothing to say', () => {
    // A provider with no rated clients must fall back to "New"/"Rating" at the
    // call site rather than render "0 clients", which reads as a judgement.
    expect(ratingClientLabel(0)).toBeNull()
    expect(ratingClientLabel(null)).toBeNull()
    expect(ratingClientLabel(undefined)).toBeNull()
  })

  it('is singular for one and plural after that', () => {
    expect(ratingClientLabel(1)).toBe('1 client')
    expect(ratingClientLabel(2)).toBe('2 clients')
  })

  it('never abbreviates the number the rating rests on', () => {
    // The surface this replaced abbreviated to "1.2k". Abbreviating the
    // denominator of a trust claim trades precision for width in the one place
    // precision is the point — and these counts are small by construction,
    // because they count relationships and not receipts.
    expect(ratingClientLabel(1200)).toBe('1200 clients')
  })
})

describe('reviewTotalLabel', () => {
  it('labels a review total as reviews, always', () => {
    // Both numbers are true; they answer different questions. This one must
    // never be used as the explanation of a rating on its own.
    expect(reviewTotalLabel(1)).toBe('1 review')
    expect(reviewTotalLabel(20)).toBe('20 reviews')
    expect(reviewTotalLabel(0)).toBeNull()
  })
})
