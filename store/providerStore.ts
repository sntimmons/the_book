import { create } from 'zustand'

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
  location: string
  bio: string
  photo: string | null
  banner: string | null
  isMobile: boolean
  services: Service[]
  portfolioPhotos: string[]
  reels: string[]

  setName: (name: string) => void
  setBusinessName: (name: string) => void
  setCategory: (category: string) => void
  setCustomCategory: (cat: string) => void
  setLocation: (location: string) => void
  setBio: (bio: string) => void
  setPhoto: (photo: string | null) => void
  setBanner: (banner: string | null) => void
  setIsMobile: (isMobile: boolean) => void
  setServices: (services: Service[]) => void
  setPortfolioPhotos: (photos: string[]) => void
  setReels: (reels: string[]) => void
  reset: () => void
}

const initialState = {
  name: '',
  businessName: '',
  category: '',
  customCategory: '',
  location: '',
  bio: '',
  photo: null,
  banner: null,
  isMobile: false,
  services: [],
  portfolioPhotos: [],
  reels: [],
}

export const useProviderStore = create<ProviderOnboardingState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setBusinessName: (businessName) => set({ businessName }),
  setCategory: (category) => set({ category }),
  setCustomCategory: (customCategory) => set({ customCategory }),
  setLocation: (location) => set({ location }),
  setBio: (bio) => set({ bio }),
  setPhoto: (photo) => set({ photo }),
  setBanner: (banner) => set({ banner }),
  setIsMobile: (isMobile) => set({ isMobile }),
  setServices: (services) => set({ services }),
  setPortfolioPhotos: (portfolioPhotos) => set({ portfolioPhotos }),
  setReels: (reels) => set({ reels }),
  reset: () => set(initialState),
}))
