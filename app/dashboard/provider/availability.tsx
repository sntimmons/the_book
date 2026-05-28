import AvailabilityEditor from '@/components/AvailabilityEditor'
import { usePanelContext } from '@/context/PanelContext'

export default function ProviderAvailability() {
  const { openPanel } = usePanelContext()
  return <AvailabilityEditor mode="dashboard" onOpenPanel={openPanel} />
}
