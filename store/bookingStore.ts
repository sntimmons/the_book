import { create } from 'zustand'

export interface BookingService {
  id: string
  name: string
  price: string
  duration: string
  depositRequired: boolean
  depositAmount: string
  addOns: Array<{
    name: string
    extraTime: string
    extraPrice: string
  }>
}

interface BookingState {
  providerId: string
  providerName: string
  providerCategory: string
  providerLocation: string
  selectedService: BookingService | null
  selectedDate: string
  // YYYY-MM-DD form of selectedDate, used for the bookings.requested_date
  // column. selectedDate stays as the display string ("May 31, 2026").
  rawDate: string
  selectedTime: string
  bookingMessage: string
  bookingPhotos: string[]
  agreedToPolicy: boolean
  // Contract signing intent, captured on book/contract.tsx before the booking
  // row exists. The contract_signatures row is written in book/payment.tsx once
  // the booking is created (booking_id is the FK). Null contractId = provider
  // has no contract, so no signature is written.
  contractId: string | null
  contractSigned: boolean
  // Correction 3 items J and K. The booking row is created as a DRAFT before the
  // contract step and carried through signing and submission, so the whole flow
  // refers to ONE request. Holding the id here is what makes the contract screen
  // and the send screen agree on which booking they are working on after a
  // back-out, a retry or a dropped connection. It is NOT the source of truth —
  // the draft is found by (client, provider) on the server, which is what makes
  // resuming work on a fresh launch too — but it saves a lookup and keeps the
  // two screens from racing each other.
  draftBookingId: string | null
  // Beta identity-verification trust notice: set true once the user has
  // acknowledged it in the current booking attempt, so it is not shown again on
  // re-entry. Cleared by reset() (i.e. when the booking flow resets). This is
  // NOT long-term "never show again" persistence — it is per-booking-attempt.
  verificationNoticeAcknowledged: boolean

  setProvider: (id: string, name: string, category: string, location: string) => void
  setSelectedService: (service: BookingService) => void
  setSelectedDate: (date: string) => void
  setRawDate: (date: string) => void
  setSelectedTime: (time: string) => void
  setBookingMessage: (msg: string) => void
  setBookingPhotos: (photos: string[]) => void
  setAgreedToPolicy: (agreed: boolean) => void
  setContractSigned: (contractId: string) => void
  setDraftBookingId: (bookingId: string | null) => void
  setVerificationNoticeAcknowledged: (acknowledged: boolean) => void
  reset: () => void
}

export const useBookingStore = create<BookingState>((set) => ({
  providerId: '',
  providerName: '',
  providerCategory: '',
  providerLocation: '',
  selectedService: null,
  selectedDate: '',
  rawDate: '',
  selectedTime: '',
  bookingMessage: '',
  bookingPhotos: [],
  agreedToPolicy: false,
  contractId: null,
  contractSigned: false,
  draftBookingId: null,
  verificationNoticeAcknowledged: false,

  // setProvider marks the START of a booking attempt (called from Book Now). It
  // resets the per-attempt verification-notice acknowledgement so that abandoning
  // one attempt and starting a new one re-shows the notice, while preserving the
  // provider context set here.
  setProvider: (id, name, category, location) =>
    set({
      providerId: id,
      providerName: name,
      providerCategory: category,
      providerLocation: location,
      verificationNoticeAcknowledged: false,
      // A new attempt must not carry another provider's draft id. The draft is
      // re-found (or created) for THIS provider on the next step.
      draftBookingId: null,
    }),
  setSelectedService: (service) => set({ selectedService: service }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setRawDate: (date) => set({ rawDate: date }),
  setSelectedTime: (time) => set({ selectedTime: time }),
  setBookingMessage: (msg) => set({ bookingMessage: msg }),
  setBookingPhotos: (photos) => set({ bookingPhotos: photos }),
  setAgreedToPolicy: (agreed) => set({ agreedToPolicy: agreed }),
  setContractSigned: (contractId) => set({ contractId, contractSigned: true }),
  setDraftBookingId: (bookingId) => set({ draftBookingId: bookingId }),
  setVerificationNoticeAcknowledged: (acknowledged) =>
    set({ verificationNoticeAcknowledged: acknowledged }),
  reset: () => set({
    providerId: '',
    providerName: '',
    providerCategory: '',
    providerLocation: '',
    selectedService: null,
    selectedDate: '',
    rawDate: '',
    selectedTime: '',
    bookingMessage: '',
    bookingPhotos: [],
    agreedToPolicy: false,
    contractId: null,
    contractSigned: false,
    draftBookingId: null,
    verificationNoticeAcknowledged: false,
  }),
}))
