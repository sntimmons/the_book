import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { amIOperator } from '@/lib/operator'

// ── THE GATE, AND WHY IT IS ALSO NOT THE GATE ─────────────────────────────
//
// This decides what to DRAW. It does not decide what is ALLOWED — every RPC
// behind these screens checks `is_operator()` in the database, and a client
// that lied here would render an empty queue and be refused on every action.
// That ordering matters: a UI gate that is the only gate is not a gate.
//
// Three states, not two. `null` means "we could not tell yet", and it renders
// as neither the queue nor a refusal — showing "not available" to an operator
// with a slow connection would send them away from a screen they are entitled
// to, and showing the queue optimistically would flash case subjects at someone
// who may not be an operator at all.
export default function OperatorLayout() {
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await amIOperator()
      if (!cancelled) setAllowed(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (allowed === null) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#C8922A" />
      </View>
    )
  }

  if (allowed !== true) {
    // No explanation, and no "request access" control. A person who is not an
    // operator has no route to becoming one from inside the app — that is a
    // service_role act by design (20261059000000) — so a button here would be
    // exactly the dead button PD-081 refused to ship.
    return (
      <View style={s.center}>
        <Text style={s.denied}>Not available.</Text>
        <Text style={s.back} onPress={() => router.back()}>
          Go back
        </Text>
      </View>
    )
  }

  return <Stack screenOptions={{ headerShown: false }} />
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  denied: { fontSize: 15, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_400Regular' },
  back: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
})
