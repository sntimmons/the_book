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
import { useAppearance, useTheme } from '@/context/ThemeContext'
import type { Appearance } from '@/lib/theme/tokens'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { amIOperator } from '@/lib/operator'
import { supabase } from '@/lib/supabase'

// ── Masked phone helper ───────────────────────────────────────────────────────


// `stub()` REMOVED ALONG WITH ITS LAST CALLER. It was one line —
// `Alert.alert(title, 'Coming soon')` — and that cheapness is why ten Settings
// rows existed for capabilities the product does not have. Leaving the helper
// behind would make the eleventh just as easy.

// ── Row primitives ────────────────────────────────────────────────────────────

const APPEARANCE_LABELS: Record<Appearance, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

function GroupLabel({ children }: { children: string }) {
  const { colors } = useTheme()
  return <Text style={[s.groupLabel, { color: colors.textSecondary }]}>{children}</Text>
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
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      style={[s.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <View style={s.rowLeft}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
        <Text style={[s.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={s.rowRight}>
        {value ? (
          <Text style={[s.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const { appearance } = useAppearance()
  const { colors } = useTheme()
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

  // `email` and `phone` were read only to display beside their own Coming-soon
  // rows, which are gone. Personal Information is where account details live.

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
    <View style={[s.root, { backgroundColor: colors.bgCanvas }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4, backgroundColor: colors.bgSurface }]}>
        <TouchableOpacity
          style={s.headerSide}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={colors.iconPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Settings</Text>
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
            isLast
          />
        </View>

        {/* PREFERENCES. Appearance is device-local and changes how Third LOOKS and
            nothing else — not visibility, privacy, permissions or ranking (PD-119). */}
        <GroupLabel>Preferences</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="contrast-outline"
            label="Appearance"
            value={APPEARANCE_LABELS[appearance]}
            onPress={() => router.push('/settings/appearance' as never)}
            isLast
          />
        </View>
        {/* PHONE AND EMAIL ROWS REMOVED. Both were `stub()` — a row that showed the
            value and then said "Coming soon" when tapped. Neither can actually be
            changed in the app, so the rows offered something the product cannot do.
            "If a control doesn't do anything, don't show it."

            The VALUES are not lost: Personal Information above shows the account
            details. What is gone is the false affordance of editing them.

            Restore these when a real change flow exists — changing either is an
            auth-credential change, not a profile edit. */}

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
        {/* PAYMENTS GROUP REMOVED ENTIRELY. "Payment Methods" was a Coming-soon
            stub, and an earlier note here argued it could stay because "the roadmap
            owns the capability". That reasoning does not survive the product
            principle: The Book takes no payment at all (PD-042), so a Payments
            section in Settings tells a beta user this product handles their money.
            A roadmap item is not a reason to show a control today.

            Restore it when payments exist — not when they are planned. */}

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
          {/* "Profile Visibility" and "Identity Verification" REMOVED. Both were
              stubs. Identity Verification is the more serious of the two: no
              identity-verification process exists (PD-004), and PD-113 rules the
              terminology itself unapproved until one does — so a Settings row named
              for it implied a capability twice over. Profile visibility is derived
              (approval, deletion state, blocks), not a switch anybody sets.

              Blocked Accounts stays because it is real. */}
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

        {/* SUPPORT GROUP WITHHELD FOR BETA — AND THIS IS A LAUNCH OBLIGATION, NOT
            A CLEANUP.

            All three rows were `stub()`: Help Center, Contact Support, Report an
            Issue. A user with a problem tapped "Contact Support" and was told
            "Coming soon", which is worse than no row at all — it spends their trust
            at the exact moment they needed help.

            They are REMOVED rather than replaced with a fake destination, because
            inventing one (a mailto to an unmonitored inbox, a form that goes
            nowhere) would keep the same lie behind better wording.

            WHAT STILL WORKS, and is why this is a removal rather than a regression:
            in-context reporting is real and reachable — `components/ReportSheet.tsx`
            from a profile or a post, and `app/post-booking/issue.tsx` from a
            booking. Safety reporting is not affected by this change. What is missing
            is a GENERAL support route, and it was missing before this commit too.

            OPEN LAUNCH OBLIGATION: a real Contact Support destination, and a
            general Report an Issue route if wanted. Tracked in
            docs/operations/UX_OPERATIONS.md. Do not restore these rows with a
            placeholder. */}

        {/* LEGAL GROUP WITHHELD FOR BETA — THE MOST SERIOUS OF THESE REMOVALS.

            "Terms of Service" and "Privacy Policy" were both `stub()`: a row that
            said "Coming soon" for documents this product needs in order to collect
            personal data, take bookings, and run a 30-day deletion policy with
            legally-retained evidence.

            A row that promises a privacy policy and delivers an alert is worse than
            an absent row, and a placeholder document would be worse than either.
            So they are removed, and their absence is recorded as blocking rather
            than filed as polish.

            OPEN LAUNCH OBLIGATION, and it is not engineering's to close: a
            reachable Privacy Policy and Terms of Service, whose retention language
            depends on OQ-084 (counsel). Tracked in
            docs/operations/UX_OPERATIONS.md. */}

        {/* ACCOUNT — the way out of the product.
            Self-service deletion has to live INSIDE the app: a product whose only
            exit is emailing support is one people cannot leave, and the approved
            closed-beta policy says so in as many words. It sits under Legal
            rather than in Support because it is not a favour anyone grants. */}
        <GroupLabel>Account</GroupLabel>
        <View style={s.group}>
          <NavRow
            icon="trash-outline"
            label="Delete Account"
            onPress={() => router.push('/settings/delete-account' as never)}
            isLast
          />
        </View>

        {/* SIGN OUT */}
        <TouchableOpacity
          style={s.signOutRow}
          activeOpacity={0.7}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.actionText} />
          <Text style={[s.signOutText, { color: colors.actionText }]}>Sign Out</Text>
        </TouchableOpacity>

        {/* VERSION */}
        <Text style={[s.version, { color: colors.textSecondary }]}>Version 1.0.0 Beta</Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
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
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },

  // Group label
  groupLabel: {
    fontSize: 10,
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
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  rowLabel: {
    fontSize: 14,
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
    fontFamily: 'Manrope_500Medium',
  },

  // Version
  version: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 12,
  },
})
