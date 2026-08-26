import PolicyEditor from '@/components/PolicyEditor'
import { usePanelContext } from '@/context/PanelContext'

export default function ProviderPolicies() {
  const { openPanel } = usePanelContext()
  return <PolicyEditor mode="dashboard" onOpenPanel={openPanel} />
}
