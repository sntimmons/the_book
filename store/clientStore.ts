import { create } from 'zustand'

interface ClientOnboardingState {
  name: string
  notes: string
  photo: string | null
  setName: (name: string) => void
  setNotes: (notes: string) => void
  setPhoto: (photo: string | null) => void
  reset: () => void
}

const initialState = {
  name: '',
  notes: '',
  photo: null,
}

export const useClientStore = create<ClientOnboardingState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setNotes: (notes) => set({ notes }),
  setPhoto: (photo) => set({ photo }),
  reset: () => set(initialState),
}))
