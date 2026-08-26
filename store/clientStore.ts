import { create } from 'zustand'

interface ClientOnboardingState {
  name: string
  notes: string
  neighborhood: string
  photo: string | null
  setName: (name: string) => void
  setNotes: (notes: string) => void
  setNeighborhood: (neighborhood: string) => void
  setPhoto: (photo: string | null) => void
  reset: () => void
}

const initialState = {
  name: '',
  notes: '',
  neighborhood: '',
  photo: null,
}

export const useClientStore = create<ClientOnboardingState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setNotes: (notes) => set({ notes }),
  setNeighborhood: (neighborhood) => set({ neighborhood }),
  setPhoto: (photo) => set({ photo }),
  reset: () => set(initialState),
}))
