import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'
import { dashboardBack } from '@/lib/dashboardNav'

export default function ProviderPayouts() {
  const { openPanel } = usePanelContext()
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={dashboardBack} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts</Text>
        <View style={styles.menuBtnSpacer} />
      </View>

      <View style={styles.body}>
        <Ionicons name="wallet-outline" size={34} color="rgba(200,146,42,0.6)" />
        <Text style={styles.title}>Payout setup coming soon</Text>
        <Text style={styles.subtitle}>Payouts are not available during beta.</Text>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            The value of your completed services is tracked here in the meantime.
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnSpacer: { width: 84, height: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
    marginTop: 14,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.2)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  note: {
    marginTop: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(200,146,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.15)',
    borderRadius: 12,
    padding: 14,
  },
  noteText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 17,
  },
})
