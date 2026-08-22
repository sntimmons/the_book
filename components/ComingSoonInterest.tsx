import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// The interest signal for the "coming soon" preview screens. Each preview passes
// its own featureName so the founder can see, per feature, how many testers
// tapped "I'd use this" (a real in-app demand survey).
//
// Recording is best-effort and optimistic: we flip to the confirmed state right
// away (the preview is about gauging reaction, not gating a flow) and let the
// write settle in the background. A duplicate tap, a row that already exists, or
// a feature_interest table the founder has not created yet must NEVER surface an
// error or crash the tester — every failure mode just leaves the confirmed UI.
export function ComingSoonInterest({
  featureName,
  label = "I'd use this",
}: {
  featureName: string
  label?: string
}) {
  const { user } = useAuth()
  const [interested, setInterested] = useState(false)
  // Total people who have expressed interest (social proof). null = not loaded
  // yet or the count RPC is unavailable, in which case no line is shown.
  const [count, setCount] = useState<number | null>(null)

  // Reflect interest the user already recorded so the confirmed state survives
  // re-opening the screen. Any error (missing table, no auth) is swallowed.
  useEffect(() => {
    let cancelled = false
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('feature_interest')
        .select('id')
        .eq('user_id', user.id)
        .eq('feature_name', featureName)
        .maybeSingle()
      if (!cancelled && data) setInterested(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user, featureName])

  // Load the global interest count via the SECURITY DEFINER rpc (a plain select
  // can't — RLS limits reads to the user's own row). Absent function/table just
  // leaves count null, so the social-proof line stays hidden.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('feature_interest_count', {
        p_feature_name: featureName,
      })
      if (!cancelled && !error && typeof data === 'number') setCount(data)
    })()
    return () => {
      cancelled = true
    }
  }, [featureName])

  async function recordInterest() {
    // Optimistically bump the visible count once (only if not already counted).
    if (!interested) setCount((c) => (c == null ? c : c + 1))
    setInterested(true)
    if (!user) return
    try {
      // supabase-js resolves (not throws) on a unique violation or missing
      // table; we intentionally do not read `error`, so duplicates and an
      // absent table both no-op while the confirmed state stays.
      await supabase
        .from('feature_interest')
        .insert({ user_id: user.id, feature_name: featureName })
    } catch {
      // Network-level throw: confirmed state stays, nothing shown to the tester.
    }
  }

  const countLine =
    count && count > 0 ? (
      <Text style={styles.countText}>
        {count === 1 ? '1 person interested' : `${count} people interested`}
      </Text>
    ) : null

  if (interested) {
    return (
      <View>
        <View style={styles.confirmed}>
          <Ionicons name="checkmark-circle" size={20} color="#C8922A" />
          <Text style={styles.confirmedText}>We'll let you know</Text>
        </View>
        {countLine}
      </View>
    )
  }

  return (
    <View>
      <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={recordInterest}>
        <Text style={styles.btnText}>{label}</Text>
      </TouchableOpacity>
      {countLine}
    </View>
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
  countText: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
})
