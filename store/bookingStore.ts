import { create } from 'zustand'

export interface BookingService {
  id: string
  name: string
  price: string
  duration: string
  depositRequired: boolean
  depositAmount: string
}

interface BookingState {
  providerId: string
  providerName: string
  providerCategory: string
  providerLocation: string
  selectedService: BookingService | null
  selectedDate: string
  selectedTime: string
  note: string
  agreedToPolicy: boolean

  setProvider: (id: string, name: string, category: string, location: string) => void
  setSelectedService: (service: BookingService) => void
  setSelectedDate: (date: string) => void
  setSelectedTime: (time: string) => void
  setNote: (note: string) => void
  setAgreedToPolicy: (agreed: boolean) => void
  reset: () => void
}

export const useBookingStore = create<BookingState>((set) => ({
  providerId: '1',
  providerName: 'Nia Laurent',
  providerCategory: 'Lash Tech',
  providerLocation: 'River Oaks',
  selectedService: null,
  selectedDate: '',
  selectedTime: '',
  note: '',
  agreedToPolicy: false,

  setProvider: (id, name, category, location) =>
    set({ providerId: id, providerName: name, providerCategory: category, providerLocation: location }),
  setSelectedService: (service) => set({ selectedService: service }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedTime: (time) => set({ selectedTime: time }),
  setNote: (note) => set({ note }),
  setAgreedToPolicy: (agreed) => set({ agreedToPolicy: agreed }),
  reset: () => set({
    selectedService: null,
    selectedDate: '',
    selectedTime: '',
    note: '',
    agreedToPolicy: false,
  }),
}))
