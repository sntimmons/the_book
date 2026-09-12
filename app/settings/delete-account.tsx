import { useCallback, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import {
  DeletionOverview,
  cancelAccountDeletion,
  daysUntil,
  fetchDeletionOverview,
  formatDeletionDate,
  reauthenticate,
  requestAccountDeletion,
} from '@/lib/accountDeletion'

// ── DELETE ACCOUNT ────────────────────────────────────────────────────────
//
// Self-service initiation, in the app, because the policy requires it: emailing
// support must not be the only way out of a product.
//
// FOUR THINGS THIS SCREEN WILL NOT DO, each because the alternative is a lie:
//
//   1. It does not claim an email or push notification was sent. There is no
//      notification infrastructure for this event, so the confirmation is the
//      state ON THIS SCREEN — durable, server-recorded, and visible whenever the
//      person comes back. A fake "check your inbox" is worse than silence.
//   2. It does not promise everything disappears. It says exactly what is
//      deleted, what is anonymised and what is kept, because a person deciding
//      this deserves the real answer and support will be asked either way.
//   3. It does not compute the deletion date locally. The date comes from the
//      server row, so the number shown is the number the engine will use.
//   4. It does not block initiation because of an unresolved booking. The policy
//      allows initiation "even when some records must be retained"; the bookings
//      are SHOWN so the choice is informed, and they stay resolvable afterwards.

export default function DeleteAccount() {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()
  const [overview, setOverview] = useState<DeletionOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setOverview(await fetchDeletionOverview(user.id, providerId ?? null))
    setLoading(false)
  }, [user, providerId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  async function submit() {
    if (!user || busy) return
    setBusy(true)
    if (needsReauth) {
      const ok = await reauthenticate(password)
      if (!ok) {
        setBusy(false)
        Alert.alert('That password did not match', 'Try again.')
        return
      }
      setPassword('')
    }
    const res = await requestAccountDeletion(confirmText)
    setBusy(false)
    if (!res.ok) {
      setNeedsReauth(res.needsReauth)
      Alert.alert('Not started', res.message ?? 'Try again.')
      return
    }
    setConfirmText('')
    setNeedsReauth(false)
    await load()
  }

  async function restore() {
    if (busy) return
    setBusy(true)
    const res = await cancelAccountDeletion()
    setBusy(false)
    if (!res.ok) {
      Alert.alert('Not restored', res.message ?? 'Try again.')
      return
    }
    await load()
  }

  if (loading) {
    return (
      <View style={s.root}>
        <Header />
        <View style={s.center}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      </View>
    )
  }

  const req = overview?.request ?? null
  const graceDays = req?.disclosedGraceDays ?? overview?.graceDays ?? 0
  const pending = req != null && ['requested', 'grace_period', 'finalizing'].includes(req.status)
  const canSubmit = confirmText.trim() === 'DELETE' && !busy && (!needsReauth || password.length > 0)

  // ── SCHEDULED STATE ─────────────────────────────────────────────────────
  if (pending) {
    const finalising = req!.status === 'finalizing'
    return (
      <View style={s.root}>
        <Header />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 16 }}>
          <View style={s.notice}>
            <Feather name="clock" size={16} color="#C8922A" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.noticeTitle}>
                {finalising ? 'Your account is being deleted' : 'Your account is scheduled for deletion'}
              </Text>
              {/* THE SERVER'S DATE, not a local sum. */}
              <Text style={s.noticeBody}>
                {finalising
                  ? 'This is being carried out now and can no longer be stopped.'
                  : `Permanent deletion is scheduled for ${formatDeletionDate(req!.graceEndsAt)} — ` +
                    `${daysUntil(req!.graceEndsAt)} days from now.`}
              </Text>
            </View>
          </View>

          <Text style={s.h2}>What is already true</Text>
          <Bullet>Your profile is hidden. You do not appear in Discover, search or Community.</Bullet>
          <Bullet>You cannot be booked or messaged, and you cannot start new activity.</Bullet>
          <Bullet>Your posts, Reels and Community content are no longer publicly visible.</Bullet>
          <Bullet>
            Existing bookings and trades are still here so you or the other person can finish or
            cancel them.
          </Bullet>

          {!finalising ? (
            <>
              <Text style={s.h2}>Changed your mind?</Text>
              <Text style={s.body}>
                You can restore your account any time before {formatDeletionDate(req!.graceEndsAt)}.
                Everything comes back as it was. After that date it cannot be undone.
              </Text>
              <TouchableOpacity
                style={s.primary}
                activeOpacity={0.85}
                disabled={busy}
                onPress={restore}
              >
                {busy ? (
                  <ActivityIndicator color="#080808" size="small" />
                ) : (
                  <Text style={s.primaryText}>Restore my account</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          <Text style={s.small}>
            {/* NO FAKE NOTIFICATION. This screen IS the confirmation, and it says so. */}
            This screen is your record of the request. We do not send an email or a notification
            about it, so check back here if you want to confirm the status.
          </Text>
        </ScrollView>
      </View>
    )
  }

  // ── INITIATION ──────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.h1}>Delete your account</Text>
        <Text style={s.body}>
          Your account becomes inactive straight away, and is permanently deleted after{' '}
          {graceDays} days. You can restore it at any point during those {graceDays} days.
        </Text>

        <Text style={s.h2}>Deleted permanently</Text>
        <Bullet>Your sign-in, contact details and profile.</Bullet>
        <Bullet>Your profile photo and any profile media.</Bullet>
        <Bullet>Your portfolio, Reels and captions.</Bullet>
        <Bullet>Your Community posts and replies.</Bullet>
        <Bullet>Saved providers, follows, likes and bookmarks.</Bullet>

        <Text style={s.h2}>Kept, with your name removed</Text>
        <Bullet>
          Bookings you took part in, so the other person keeps their own records. You appear as
          &ldquo;Former member&rdquo;.
        </Bullet>
        <Bullet>
          Reviews you wrote stay, because they are part of a provider&rsquo;s honest record. Your
          name is removed.
        </Bullet>
        <Bullet>Trades: the terms and the outcome stay, your identity does not.</Bullet>
        <Bullet>
          Messages are kept for a while after a conversation closes, then deleted. Your name comes
          off them straight away.
        </Bullet>

        <Text style={s.h2}>Kept as a record</Text>
        <Bullet>
          Contracts you accepted, and when you accepted them. These are kept as evidence of an
          agreement and are not visible to anyone but The Book.
        </Bullet>
        <Bullet>
          Safety reports and their outcomes, so a report cannot be erased by deleting an account.
          Access is restricted to The Book.
        </Bullet>
        <Text style={s.small}>
          {/* No legal claim. Stated as an interim policy, because that is what it is. */}
          These two are kept under our interim closed-beta policy while we finish our legal review.
          We are not claiming a legally required retention period.
        </Text>

        {(overview?.unresolved.length ?? 0) > 0 ? (
          <>
            <Text style={s.h2}>Worth finishing first</Text>
            <Text style={s.body}>
              These are still open. You can still delete your account — they stay here so you or
              the other person can finish or cancel them.
            </Text>
            {overview!.unresolved.map((t) => (
              <View key={`${t.kind}-${t.id}`} style={s.row}>
                <Feather
                  name={t.kind === 'booking' ? 'calendar' : 'repeat'}
                  size={14}
                  color="rgba(240,232,213,0.5)"
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t.label}</Text>
                  <Text style={s.rowSub}>{t.detail}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.h2}>Confirm</Text>
        {needsReauth ? (
          <>
            <Text style={s.body}>For your security, enter your password again.</Text>
            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor="rgba(240,232,213,0.3)"
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
          </>
        ) : null}
        <Text style={s.body}>Type DELETE to confirm.</Text>
        <TextInput
          style={s.input}
          placeholder="DELETE"
          placeholderTextColor="rgba(240,232,213,0.3)"
          autoCapitalize="characters"
          autoCorrect={false}
          value={confirmText}
          onChangeText={setConfirmText}
        />

        <TouchableOpacity
          style={[s.danger, !canSubmit && s.disabled]}
          activeOpacity={0.85}
          disabled={!canSubmit}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color="#F0E8D5" size="small" />
          ) : (
            <Text style={s.dangerText}>Delete my account</Text>
          )}
        </TouchableOpacity>
        <Text style={s.small}>
          We do not send an email or notification about this. This screen is where you can check
          the status and restore your account during the {graceDays} days.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Header() {
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Feather name="chevron-left" size={20} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Delete Account</Text>
      <View style={s.iconBtn} />
    </View>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletDot}>·</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#F0E8D5', fontSize: 17, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { color: '#F0E8D5', fontSize: 22, fontWeight: '700' },
  h2: {
    color: 'rgba(240,232,213,0.55)',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  body: { color: 'rgba(240,232,213,0.8)', fontSize: 14, lineHeight: 21 },
  small: { color: 'rgba(240,232,213,0.4)', fontSize: 12, lineHeight: 18 },
  bullet: { flexDirection: 'row', gap: 8 },
  bulletDot: { color: '#C8922A', fontSize: 15, lineHeight: 21 },
  bulletText: { flex: 1, color: 'rgba(240,232,213,0.75)', fontSize: 13, lineHeight: 20 },
  notice: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(200,146,42,0.1)',
  },
  noticeTitle: { color: '#F0E8D5', fontSize: 14, fontWeight: '700' },
  noticeBody: { color: 'rgba(240,232,213,0.75)', fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  rowTitle: { color: 'rgba(240,232,213,0.85)', fontSize: 13 },
  rowSub: { color: 'rgba(240,232,213,0.4)', fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#F0E8D5',
    fontSize: 15,
  },
  primary: {
    backgroundColor: '#C8922A',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#080808', fontSize: 15, fontWeight: '700' },
  danger: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(214,84,84,0.6)',
    backgroundColor: 'rgba(214,84,84,0.12)',
  },
  dangerText: { color: '#E88A8A', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
})
