import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
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

function ToggleRow({
  icon,
  label,
  value,
  onValueChange,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: boolean
  onValueChange: (v: boolean) => void
  isLast?: boolean
}) {
  return (
    <View style={[s.row, !isLast && s.rowBorder]}>
      <View style={s.rowLeft}>
        <Ionicons name={icon} size={20} color="rgba(240,232,213,0.45)" />
        <Text style={s.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: 'rgba(240,232,213,0.12)', true: '#C8922A' }}
        thumbColor="#F0E8D5"
        ios_backgroundColor="rgba(240,232,213,0.12)"
      />
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const email = user?.email ?? 'Not set'
  const phone = maskPhone(user?.phone)

  const [bookingUpdates, setBookingUpdates] = useState(true)
  const [providerActivity, setProviderActivity] = useState(true)
  const [dealsAlerts, setDealsAlerts] = useState(false)

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

        {/* PAYMENTS */}
        <GroupLabel>Payments</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="card-outline"
            label="Payment Methods"
            onPress={() => stub('Payment Methods')}
          />
          <NavRow
            icon="shield-checkmark-outline"
            label="Booking Protection"
            onPress={() => stub('Booking Protection')}
            isLast
          />
        </View>

        {/* NOTIFICATIONS */}
        <GroupLabel>Notifications</GroupLabel>
        <View style={s.group}>
          <ToggleRow
            icon="notifications-outline"
            label="Booking Updates"
            value={bookingUpdates}
            onValueChange={setBookingUpdates}
          />
          <ToggleRow
            icon="sparkles-outline"
            label="Provider Activity"
            value={providerActivity}
            onValueChange={setProviderActivity}
          />
          <ToggleRow
            icon="pricetag-outline"
            label="Deals & Alerts"
            value={dealsAlerts}
            onValueChange={setDealsAlerts}
            isLast
          />
        </View>

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
          <NavRow
            icon="ban-outline"
            label="Blocked Accounts"
            onPress={() => stub('Blocked Accounts')}
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
