import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { amIOperator } from '@/lib/operator'
import { supabase } from '@/lib/supabase'

// ── Masked phone helper ───────────────────────────────────────────────────────

function maskPhone(phone: string | undefined | null): string {
  if (!phone) return 'Not set'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  const last4 = digits.slice(-4)
  return '+1 (***) ***-' + last4
}

function stub(title: string) {
  Alert.alert(title, 'Coming soon')
}

// ── Row primitives ────────────────────────────────────────────────────────────

function GroupLabel({ children }: { children: string }) {
  return <Text style={s.groupLabel}>{children}</Text>
}

function NavRow({
  icon,
  label,
  value,
  onPress,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value?: string
  onPress: () => void
  isLast?: boolean
}) {
  return (
    <TouchableOpacity
      style={[s.row, !isLast && s.rowBorder]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={s.rowLeft}>
        <Ionicons name={icon} size={20} color="rgba(240,232,213,0.45)" />
        <Text style={s.rowLabel}>{label}</Text>
      </View>
      <View style={s.rowRight}>
        {value ? (
          <Text style={s.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="rgba(240,232,213,0.45)" />
      </View>
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { user, isProvider } = useAuth()
  // Null until known, and never assumed. See the row it controls below.
  const [isOperator, setIsOperator] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await amIOperator()
      if (!cancelled) setIsOperator(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const email = user?.email ?? 'Not set'
  const phone = maskPhone(user?.phone)

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/')
        },
      },
    ])
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={s.headerSide}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={s.headerSide} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ACCOUNT */}
        <GroupLabel>Account</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="person-outline"
            label="Personal Information"
            onPress={() => router.push('/settings/personal-info' as never)}
          />
          <NavRow
            icon="call-outline"
            label="Phone Number"
            value={phone}
            onPress={() => stub('Phone Number')}
          />
          <NavRow
            icon="mail-outline"
            label="Email"
            value={email}
            onPress={() => stub('Email')}
            isLast
          />
        </View>

        {/* PROVIDER: escape hatch so a client (including anyone who was routed
            in as a client without choosing) can still reach provider
            onboarding. On go-live a providers row is created and provider role
            takes precedence, so it also frees an already-trapped client. */}
        {!isProvider && (
          <>
            <GroupLabel>Provider</GroupLabel>
            <View style={s.group}>
              <NavRow
                icon="briefcase-outline"
                label="Set up a provider profile"
                onPress={() => router.push('/onboarding/provider' as never)}
                isLast
              />
            </View>
          </>
        )}

        {/* PAYMENTS. PRODUCT TRUTH: a "Booking Protection" row used to sit
            here. The Book operates no payment protection, escrow or custody of
            any kind, and no protection product has been decided on, so the row
            named a capability that does not exist and is not promised. Removed.
            "Payment Methods" stays: it is an honest Coming-soon stub for a
            capability the roadmap does own (PD-042). */}
        <GroupLabel>Payments</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="card-outline"
            label="Payment Methods"
            onPress={() => stub('Payment Methods')}
            isLast
          />
        </View>

        {/* ITEM A (Correction 3): the Notifications group is removed.
            Three switches — Booking Updates, Provider Activity, Deals & Alerts —
            held state in local React state and nothing else. Nothing was
            persisted, nothing read them, and there is no push, device or email
            channel in this product for them to govern, so flipping one changed
            nothing at all and quietly told the user they had control they did
            not have. The group comes back when there is a real channel to
            control. In-app notifications are DERIVED from booking, message and
            trade state (hooks/useNotifications.ts) and have never had per-type
            preferences to set. */}

        {/* THE OPERATOR ENTRY POINT (Session 8B, PD-068).
            Rendered ONLY for an allow-listed operator, and `=== true` on
            purpose: an unknown answer draws nothing. This is a convenience,
            not a boundary — every screen behind it re-checks in the database,
            and every RPC refuses a non-operator on its own. */}
        {isOperator === true ? (
          <>
            <GroupLabel>The Book</GroupLabel>
            <View style={s.group}>
              <NavRow
                icon="albums-outline"
                label="Review Queue"
                onPress={() => router.push('/operator' as never)}
                isLast
              />
            </View>
          </>
        ) : null}

        {/* PRIVACY */}
        <GroupLabel>Privacy</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="eye-outline"
            label="Profile Visibility"
            onPress={() => stub('Profile Visibility')}
          />
          <NavRow
            icon="finger-print-outline"
            label="Identity Verification"
            onPress={() => stub('Identity Verification')}
          />
          {/* NO LONGER A STUB. Blocking is live as of Session 8, and this row
              was the only place in the product a person would look for the list
              — reading "Coming soon" while their blocks were real. It was also
              the only exit from a genuine dead end: discovery filters on
              `is_approved`, so a block against a provider who is later
              de-approved had no other surface that could undo it. */}
          <NavRow
            icon="ban-outline"
            label="Blocked Accounts"
            onPress={() => router.push('/settings/blocked' as never)}
            isLast
          />
        </View>

        {/* SUPPORT */}
        <GroupLabel>Support</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="help-circle-outline"
            label="Help Center"
            onPress={() => stub('Help Center')}
          />
          <NavRow
            icon="chatbubble-outline"
            label="Contact Support"
            onPress={() => stub('Contact Support')}
          />
          <NavRow
            icon="flag-outline"
            label="Report an Issue"
            onPress={() => stub('Report an Issue')}
            isLast
          />
        </View>

        {/* LEGAL */}
        <GroupLabel>Legal</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => stub('Terms of Service')}
          />
          <NavRow
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => stub('Privacy Policy')}
            isLast
          />
        </View>

        {/* SIGN OUT */}
        <TouchableOpacity
          style={s.signOutRow}
          activeOpacity={0.7}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color="rgba(200,146,42,0.6)" />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* VERSION */}
        <Text style={s.version}>Version 1.0.0 Beta</Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerSide: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },

  // Group label
  groupLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  group: {
    // rows manage their own separators
  },

  // Row
  row: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  rowLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    marginLeft: 12,
  },
  rowValue: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    flexShrink: 1,
  },

  // Sign out
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 51,
    marginTop: 32,
    marginHorizontal: 24,
  },
  signOutText: {
    fontSize: 14,
    color: 'rgba(200,146,42,0.7)',
    fontFamily: 'Manrope_500Medium',
  },

  // Version
  version: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.2)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 12,
  },
})
