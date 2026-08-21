import { useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { ClientMe } from '../../components/ClientMe'
import { ProviderMe } from '../../components/ProviderMe'
import { styles } from '../../components/me/meStyles'

// ── Role-aware entry ────────────────────────────────────────────────────────
// Clients get ClientMe (in components/ClientMe.tsx). Providers get ProviderMe
// (components/ProviderMe.tsx) with the My Studio entrance. A provider can
// preview the client profile via the quiet "Switch to Client Profile" link; a
// floating pill brings them back. Both halves share components/me/meStyles.ts
// and components/me/MeShared.tsx.
export default function MeScreen() {
  const { isProvider, roleLoading } = useAuth()
  const insets = useSafeAreaInsets()
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
    <View style={{ flex: 1 }}>
      <ClientMe />
      {isProvider && (
        <View
          style={[styles.returnPillWrap, { bottom: insets.bottom + 80 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.returnPill}
            activeOpacity={0.85}
            onPress={() => setViewAsClient(false)}
          >
            <Feather name="briefcase" size={13} color="#080808" />
            <Text style={styles.returnPillText}>Return to Studio</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
