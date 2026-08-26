import { create } from 'zustand'
import type { AvailabilityValue } from '@/components/AvailabilityEditor'
import type { PolicyValue } from '@/lib/policy'

export interface AddOn {
  name: string
  extraTime: string
  extraPrice: string
}

export interface Service {
  id: string
  name: string
  price: string
  duration: string
  depositRequired: boolean
  depositAmount: string
  addOns: AddOn[]
}

interface ProviderOnboardingState {
  name: string
  businessName: string
  category: string
  customCategory: string
  categoryId: number | null
  location: string
  bio: string
  photo: string | null
  banner: string | null
  isMobile: boolean
  services: Service[]
  portfolioPhotos: string[]
  reels: string[]
  // Availability captured in the onboarding AvailabilityEditor. Held here so
  // go-live can persist it (weekly hours, blackout dates, booking prefs) after
  // the providers row exists. null = the provider skipped the step.
  availability: AvailabilityValue | null
  // Booking policy captured in the onboarding PolicyEditor. Written to
  // provider_policies at go-live. null = provider hasn't reached the step;
  // go-live falls back to DEFAULT_POLICY so a row always exists.
  policy: PolicyValue | null

  setName: (name: string) => void
  setBusinessName: (name: string) => void
  setCategory: (category: string) => void
  setCustomCategory: (cat: string) => void
  setCategoryId: (id: number | null) => void
  setLocation: (location: string) => void
  setBio: (bio: string) => void
  setPhoto: (photo: string | null) => void
  setBanner: (banner: string | null) => void
  setIsMobile: (isMobile: boolean) => void
  setServices: (services: Service[]) => void
  setPortfolioPhotos: (photos: string[]) => void
  setReels: (reels: string[]) => void
  setAvailability: (availability: AvailabilityValue | null) => void
  setPolicy: (policy: PolicyValue | null) => void
  reset: () => void
}

const initialState = {
  name: '',
  businessName: '',
  category: '',
  customCategory: '',
  categoryId: null,
  location: '',
  bio: '',
  photo: null,
  banner: null,
  isMobile: false,
  services: [],
  portfolioPhotos: [],
  reels: [],
  availability: null,
  policy: null,
}

export const useProviderStore = create<ProviderOnboardingState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setBusinessName: (businessName) => set({ businessName }),
  setCategory: (category) => set({ category }),
  setCustomCategory: (customCategory) => set({ customCategory }),
  setCategoryId: (categoryId) => set({ categoryId }),
  setLocation: (location) => set({ location }),
  setBio: (bio) => set({ bio }),
  setPhoto: (photo) => set({ photo }),
  setBanner: (banner) => set({ banner }),
  setIsMobile: (isMobile) => set({ isMobile }),
  setServices: (services) => set({ services }),
  setPortfolioPhotos: (portfolioPhotos) => set({ portfolioPhotos }),
  setReels: (reels) => set({ reels }),
  setAvailability: (availability) => set({ availability }),
  setPolicy: (policy) => set({ policy }),
  reset: () => set(initialState),
}))
