import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Local-only interest signal for the "coming soon" preview screens. There is no
// backend yet; we are only gauging tester reaction, so a confirmed local state
// is enough. If we later want to record this, swap the setState for a write.
export function ComingSoonInterest({ label = "I'd use this" }: { label?: string }) {
  const [interested, setInterested] = useState(false)

  if (interested) {
    return (
      <View style={styles.confirmed}>
        <Ionicons name="checkmark-circle" size={20} color="#C8922A" />
        <Text style={styles.confirmedText}>We'll let you know</Text>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={styles.btn}
      activeOpacity={0.85}
      onPress={() => setInterested(true)}
    >
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  confirmed: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.35)',
    backgroundColor: 'rgba(200,146,42,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmedText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
})
