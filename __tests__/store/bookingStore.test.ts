import { useBookingStore } from '@/store/bookingStore'

// Locks the beta verification-notice acknowledgement lifecycle: it defaults off,
// can be set, and is cleared by reset() (per-booking-attempt, not persistent).
describe('bookingStore verification-notice acknowledgement', () => {
  afterEach(() => {
    useBookingStore.getState().reset()
  })

  it('defaults to not acknowledged', () => {
    useBookingStore.getState().reset()
    expect(useBookingStore.getState().verificationNoticeAcknowledged).toBe(false)
  })

  it('can be acknowledged for the current booking attempt', () => {
    useBookingStore.getState().setVerificationNoticeAcknowledged(true)
    expect(useBookingStore.getState().verificationNoticeAcknowledged).toBe(true)
  })

  it('reset() clears the acknowledgement (booking flow reset)', () => {
    useBookingStore.getState().setVerificationNoticeAcknowledged(true)
    useBookingStore.getState().reset()
    expect(useBookingStore.getState().verificationNoticeAcknowledged).toBe(false)
  })

  it('starting a NEW booking attempt (setProvider) resets acknowledgement and keeps provider context', () => {
    const s = useBookingStore.getState()
    s.setVerificationNoticeAcknowledged(true) // acknowledged in a prior attempt
    s.setProvider('prov-1', 'Test Provider', 'Hair', 'Houston')
    const after = useBookingStore.getState()
    expect(after.verificationNoticeAcknowledged).toBe(false) // eligible to show again
    expect(after.providerId).toBe('prov-1') // provider context preserved
    expect(after.providerName).toBe('Test Provider')
  })

  it('ordinary in-attempt state changes do NOT reset the acknowledgement', () => {
    const s = useBookingStore.getState()
    s.setProvider('prov-1', 'Test Provider', 'Hair', 'Houston') // new attempt → false
    s.setVerificationNoticeAcknowledged(true) // acknowledged this attempt
    // Moving through the flow within the same attempt must not clear it.
    s.setSelectedService({
      id: 'svc-1',
      name: 'Cut',
      price: '50',
      duration: '30 min',
      depositRequired: false,
      depositAmount: '0',
      addOns: [],
    })
    s.setSelectedDate('May 1, 2026')
    s.setRawDate('2026-05-01')
    s.setSelectedTime('10:00 AM')
    s.setBookingMessage('hi')
    expect(useBookingStore.getState().verificationNoticeAcknowledged).toBe(true)
  })
})
