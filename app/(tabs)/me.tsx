import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useAuth } from '../../context/AuthContext'
import { ClientMe } from '../../components/ClientMe'
import { ProviderMe } from '../../components/ProviderMe'
import { styles } from '../../components/me/meStyles'

// ── Role-aware entry ────────────────────────────────────────────────────────
// Clients get ClientMe. Providers get ProviderMe with the My Studio entrance,
// and can preview the client profile via "Switch to Client Profile". When a
// provider is previewing, ClientMe shows a top "Switch to Provider Studio"
// button (via onSwitchToStudio) to return — a clear, non-floating control that
// mirrors the drawer's "Back to The Book".
export default function MeScreen() {
  const { isProvider, roleLoading } = useAuth()
  const [viewAsClient, setViewAsClient] = useState(false)

  if (roleLoading) {
    return (
      <View style={[styles.root, styles.loaderWrap]}>
        <StatusBar style="light" />
        <ActivityIndicator color="rgba(240,232,213,0.5)" />
      </View>
    )
  }

  if (isProvider && !viewAsClient) {
    return <ProviderMe onSwitchToClient={() => setViewAsClient(true)} />
  }

  return (
    <ClientMe onSwitchToStudio={isProvider ? () => setViewAsClient(false) : undefined} />
  )
}
