import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Action = {
  icon: string
  title: string
  subtitle: string
  onPress: () => void
}

export default function NewScreen() {
  const insets = useSafeAreaInsets()

  function go(route: string) {
    router.back()
    setTimeout(() => router.push(route as any), 80)
  }

  const actions: Action[] = [
    {
      icon: 'calendar',
      title: 'Book a provider',
      subtitle: 'Find and book your next appointment',
      onPress: () => go('/(tabs)/search'),
    },
    {
      icon: 'compass',
      title: 'Browse discovery',
      subtitle: 'Explore providers near you',
      onPress: () => go('/(tabs)/'),
    },
    {
      icon: 'message-circle',
      title: 'Message a provider',
      subtitle: 'Start a conversation',
      onPress: () => go('/messages'),
    },
  ]

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />

        <Text style={styles.title}>What would you like to do?</Text>

        {actions.map((action, idx) => (
          <TouchableOpacity
            key={action.title}
            activeOpacity={0.7}
            style={[styles.row, idx < actions.length - 1 && styles.rowBorder]}
            onPress={action.onPress}
          >
            <Feather name={action.icon as any} size={20} color="#F0E8D5" />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{action.title}</Text>
              <Text style={styles.rowSubtitle}>{action.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="rgba(240,232,213,0.2)" />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cancel}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    marginTop: 10,
  },
  title: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 16,
  },
  row: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  rowSubtitle: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  cancel: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
})
