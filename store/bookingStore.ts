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
  selectedTime: string
  bookingMessage: string
  bookingPhotos: string[]
  agreedToPolicy: boolean

  setProvider: (id: string, name: string, category: string, location: string) => void
  setSelectedService: (service: BookingService) => void
  setSelectedDate: (date: string) => void
  setSelectedTime: (time: string) => void
  setBookingMessage: (msg: string) => void
  setBookingPhotos: (photos: string[]) => void
  setAgreedToPolicy: (agreed: boolean) => void
  reset: () => void
}

export const useBookingStore = create<BookingState>((set) => ({
  providerId: '',
  providerName: '',
  providerCategory: '',
  providerLocation: '',
  selectedService: null,
  selectedDate: '',
  selectedTime: '',
  bookingMessage: '',
  bookingPhotos: [],
  agreedToPolicy: false,

  setProvider: (id, name, category, location) =>
    set({ providerId: id, providerName: name, providerCategory: category, providerLocation: location }),
  setSelectedService: (service) => set({ selectedService: service }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedTime: (time) => set({ selectedTime: time }),
  setBookingMessage: (msg) => set({ bookingMessage: msg }),
  setBookingPhotos: (photos) => set({ bookingPhotos: photos }),
  setAgreedToPolicy: (agreed) => set({ agreedToPolicy: agreed }),
  reset: () => set({
    providerId: '',
    providerName: '',
    providerCategory: '',
    providerLocation: '',
    selectedService: null,
    selectedDate: '',
    selectedTime: '',
    bookingMessage: '',
    bookingPhotos: [],
    agreedToPolicy: false,
  }),
}))
