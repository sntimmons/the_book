import { create } from 'zustand'

interface ClientOnboardingState {
  name: string
  notes: string
  setName: (name: string) => void
  setNotes: (notes: string) => void
  reset: () => void
}

const initialState = {
  name: '',
  notes: '',
}

export const useClientStore = create<ClientOnboardingState>((set) => ({
  ...initialState,
  setName: (name) => set({ name }),
  setNotes: (notes) => set({ notes }),
  reset: () => set(initialState),
}))
