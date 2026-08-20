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

  setProvider: (id: string, name: string, category: string, location: string) => void
  setSelectedService: (service: BookingService) => void
  setSelectedDate: (date: string) => void
  setRawDate: (date: string) => void
  setSelectedTime: (time: string) => void
  setBookingMessage: (msg: string) => void
  setBookingPhotos: (photos: string[]) => void
  setAgreedToPolicy: (agreed: boolean) => void
  setContractSigned: (contractId: string) => void
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

  setProvider: (id, name, category, location) =>
    set({ providerId: id, providerName: name, providerCategory: category, providerLocation: location }),
  setSelectedService: (service) => set({ selectedService: service }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setRawDate: (date) => set({ rawDate: date }),
  setSelectedTime: (time) => set({ selectedTime: time }),
  setBookingMessage: (msg) => set({ bookingMessage: msg }),
  setBookingPhotos: (photos) => set({ bookingPhotos: photos }),
  setAgreedToPolicy: (agreed) => set({ agreedToPolicy: agreed }),
  setContractSigned: (contractId) => set({ contractId, contractSigned: true }),
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
  }),
}))
