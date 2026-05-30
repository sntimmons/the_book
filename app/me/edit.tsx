import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.backBtnSpacer} />
      </View>

      <View style={styles.body}>
        <Feather name="edit-2" size={36} color="rgba(240,232,213,0.1)" />
        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>Profile editing coming soon.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: { width: 36, height: 36 },
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
})
