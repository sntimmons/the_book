import { startBooking } from '@/lib/startBooking'
import { useBookingStore } from '@/store/bookingStore'
import { router } from 'expo-router'

jest.mock('@/lib/verificationGate', () => {
  const actual = jest.requireActual('@/lib/verificationGate')
  return { ...actual, isClientIdentityVerified: () => true }
})

const SERVICE = {
  id: 's2',
  name: 'Clean Fade',
  price: '45.00',
  duration: '45 min',
  depositRequired: false,
  depositAmount: '0',
  addOns: [],
}

beforeEach(() => {
  useBookingStore.getState().reset()
})

// PM RULING 2: a service row is NAVIGATION CONVENIENCE. These lock the part
// that would be a product change if it drifted — that preselection never buys a
// shorter route into a booking.
describe('startBooking with a preselected service', () => {
  it('still enters at the service step, never past it', () => {
    startBooking({ id: 'p1', name: 'Jordan', service: SERVICE })
    expect(router.push).toHaveBeenCalledWith('/book/service')
  })

  it('enters at exactly the same step with or without a service', () => {
    startBooking({ id: 'p1', name: 'Jordan' })
    const without = (router.push as jest.Mock).mock.calls.at(-1)
    startBooking({ id: 'p1', name: 'Jordan', service: SERVICE })
    const with_ = (router.push as jest.Mock).mock.calls.at(-1)
    expect(with_).toEqual(without)
  })

  it('carries the service into the store the service step reads', () => {
    startBooking({ id: 'p1', name: 'Jordan', service: SERVICE })
    expect(useBookingStore.getState().selectedService).toEqual(SERVICE)
  })

  it('writes the service AFTER provider context, so the new attempt cannot clear it', () => {
    // setProvider starts a fresh attempt. A preselection written first would be
    // part of the state it resets — which is a silent, intermittent bug.
    useBookingStore.getState().setSelectedService({ ...SERVICE, id: 'stale' })
    startBooking({ id: 'p2', name: 'Ada', service: SERVICE })
    const state = useBookingStore.getState()
    expect(state.providerId).toBe('p2')
    expect(state.selectedService?.id).toBe('s2')
  })

  it('leaves no service selected when none was passed', () => {
    startBooking({ id: 'p1', name: 'Jordan' })
    expect(useBookingStore.getState().selectedService).toBeNull()
  })

  it('does not bypass the verification gate', () => {
    // The gate is evaluated on the fresh acknowledgement regardless of whether a
    // service travelled with the attempt.
    startBooking({ id: 'p1', name: 'Jordan', service: SERVICE })
    expect(useBookingStore.getState().verificationNoticeAcknowledged).toBe(false)
  })
})
