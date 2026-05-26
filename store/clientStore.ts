import { create } from 'zustand'

interface ClientOnboardingState {
  firstName: string
  lastName: string
  neighborhood: string
  bio: string
  photo: string | null
  setFirstName: (v: string) => void
  setLastName: (v: string) => void
  setNeighborhood: (v: string) => void
  setBio: (v: string) => void
  setPhoto: (v: string | null) => void
  reset: () => void
}

const initialState = {
  firstName: '',
  lastName: '',
  neighborhood: '',
  bio: '',
  photo: null,
}

export const useClientStore = create<ClientOnboardingState>((set) => ({
  ...initialState,
  setFirstName: (firstName) => set({ firstName }),
  setLastName: (lastName) => set({ lastName }),
  setNeighborhood: (neighborhood) => set({ neighborhood }),
  setBio: (bio) => set({ bio }),
  setPhoto: (photo) => set({ photo }),
  reset: () => set(initialState),
}))
