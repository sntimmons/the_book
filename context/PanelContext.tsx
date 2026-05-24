import { createContext, useContext } from 'react'

interface PanelContextType {
  openPanel: () => void
  closePanel: () => void
}

export const PanelContext = createContext<PanelContextType>({
  openPanel: () => {},
  closePanel: () => {},
})

export const usePanelContext = () => useContext(PanelContext)
