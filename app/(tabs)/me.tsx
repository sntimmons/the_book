import { ActivityIndicator, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useAuth } from '../../context/AuthContext'
import { ClientMe } from '../../components/ClientMe'
import { ProviderMe } from '../../components/ProviderMe'
import { styles } from '../../components/me/meStyles'

// ── Role-only entry ─────────────────────────────────────────────────────────
// Role is derived from the account, never a mode the user toggles. Providers get
// ProviderMe (with the My Studio entrance into their Business tools); everyone
// else gets ClientMe. No viewAsClient / preview state — one shell, no modes
// (NAVIGATION_ARCHITECTURE.md).
export default function MeScreen() {
  const { isProvider, roleLoading } = useAuth()

  if (roleLoading) {
    return (
      <View style={[styles.root, styles.loaderWrap]}>
        <StatusBar style="light" />
        <ActivityIndicator color="rgba(240,232,213,0.5)" />
      </View>
    )
  }

  return isProvider ? <ProviderMe /> : <ClientMe />
}
