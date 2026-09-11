import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  CLIENT_INTENTS,
  PROVIDER_INTENTS,
  SERVICE_TAGS,
  CommunityIntent,
  IntentSpec,
  createCommunityPost,
  fetchShoutoutBookingOptions,
  intentSpec,
  isClientIntent,
} from '@/lib/community'
import { HOUSTON_AREAS } from '@/lib/areas'
import { useProviderSearch } from '@/hooks/useProviders'

const MAX_LEN = 1000

// ── THE COMPOSER IS PER-INTENT ────────────────────────────────────────────
//
// There is no blank box. A person arrives here having already said what they
// want — "looking for someone", "recommend a provider" — and the fields they see
// are the ones that intent actually needs. That is the difference between a
// service community and a status feed, and it is also what makes a post USEFUL
// to answer: "who does knotless braids in the Heights, Saturday" can be replied
// to; "hey everyone" cannot.
//
// Every rule below is ALSO enforced by the database (20261088000000). What is
// here is the shape of the form and the honesty of the copy; what is there is
// the guarantee.

export default function CommunityCompose() {
  const insets = useSafeAreaInsets()
  const { user, isProvider } = useAuth()
  const params = useLocalSearchParams<{ intent?: string }>()

  const available: IntentSpec[] = useMemo(
    () => (isProvider ? [...CLIENT_INTENTS, ...PROVIDER_INTENTS] : CLIENT_INTENTS),
    [isProvider],
  )

  const requested = typeof params.intent === 'string' ? params.intent : null
  const initial =
    (requested && available.some((i) => i.key === requested) ? requested : null) ??
    available[0].key

  const [intent, setIntent] = useState<CommunityIntent>(initial as CommunityIntent)
  const [content, setContent] = useState('')
  const [serviceTag, setServiceTag] = useState<string | null>(null)
  const [area, setArea] = useState<string | null>(null)
  const [timing, setTiming] = useState('')
  const [taggedProviderId, setTaggedProviderId] = useState<string | null>(null)
  const [taggedProviderName, setTaggedProviderName] = useState('')
  const [providerQuery, setProviderQuery] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookingOptions, setBookingOptions] = useState<
    { id: string; serviceName: string; completedAt: string }[]
  >([])
  const [submitting, setSubmitting] = useState(false)

  const spec = intentSpec(intent)
  const isShoutout = intent === 'shoutout'
  const isOpenToday = intent === 'open_today'
  const wantsService = intent !== 'shoutout'
  const wantsArea = intent === 'looking_for' || intent === 'who_does_this'
  const wantsTiming = intent === 'looking_for'

  // Debounced so a two-character query does not run a search per keystroke. The
  // hook searches on the query it is given; an empty one returns nothing, which
  // is what should happen before someone has typed a name.
  const [debouncedProviderQuery, setDebouncedProviderQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedProviderQuery(isShoutout ? providerQuery.trim() : ''),
      300,
    )
    return () => clearTimeout(t)
  }, [providerQuery, isShoutout])
  const { results: providerResults } = useProviderSearch(
    debouncedProviderQuery.length >= 2 ? debouncedProviderQuery : '',
  )

  // Completed bookings with the tagged provider, if any. EMPTY IS ORDINARY — the
  // linkage is optional evidence, not a requirement, and in a small beta most
  // recommendations will have none.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isShoutout || !taggedProviderId || !user) {
        setBookingOptions([])
        setBookingId(null)
        return
      }
      const opts = await fetchShoutoutBookingOptions(user.id, taggedProviderId)
      if (!cancelled) setBookingOptions(opts)
    })()
    return () => {
      cancelled = true
    }
  }, [isShoutout, taggedProviderId, user])

  const canPost =
    content.trim().length > 0 &&
    !!user &&
    !submitting &&
    (!isShoutout || !!taggedProviderId)

  async function submit() {
    const text = content.trim()
    if (!text || !user || submitting) return
    if (isShoutout && !taggedProviderId) return
    setSubmitting(true)

    // Server-side rate limit. Not an error — a wait.
    const rl = await checkRateLimit(user.id, 'community_post')
    if (!rl.allowed) {
      setSubmitting(false)
      Alert.alert('Please wait', rl.message ?? 'Please wait before trying again.')
      return
    }

    Sentry.addBreadcrumb({ message: 'Community post submit', category: 'community' })
    const res = await createCommunityPost(user.id, {
      intent,
      content: text,
      serviceTag: wantsService ? serviceTag : null,
      area: wantsArea ? area : null,
      timing: wantsTiming ? timing.trim() || null : null,
      taggedProviderId: isShoutout ? taggedProviderId : null,
      taggedBookingId: isShoutout ? bookingId : null,
    })
    setSubmitting(false)
    if (!res.ok) {
      // The message is the SERVER'S reason, mapped in one place. An Open Today
      // note refused for want of published hours says so and points at the
      // screen that fixes it, rather than offering a retry that cannot work.
      Alert.alert('Not posted', res.message ?? 'Please try again.', [{ text: 'OK' }])
      return
    }
    router.back()
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="x" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{spec?.label ?? 'Post'}</Text>
        <TouchableOpacity
          style={[s.postBtn, !canPost && s.postBtnDisabled]}
          activeOpacity={0.85}
          disabled={!canPost}
          onPress={submit}
        >
          {submitting ? (
            <ActivityIndicator color="#080808" size="small" />
          ) : (
            <Text style={s.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* What kind of post */}
        <View style={s.block}>
          <Text style={s.label}>What is this?</Text>
          <View style={s.chipWrap}>
            {available.map((i) => (
              <Chip
                key={i.key}
                label={i.label}
                active={intent === i.key}
                onPress={() => {
                  setIntent(i.key)
                  if (i.key !== 'shoutout') {
                    setTaggedProviderId(null)
                    setTaggedProviderName('')
                    setBookingId(null)
                  }
                }}
              />
            ))}
          </View>
          {isProvider ? (
            <Text style={s.hint}>
              {isClientIntent(intent)
                ? 'Posting as you, not as your business.'
                : 'Posting as your business.'}
            </Text>
          ) : null}
        </View>

        {isOpenToday ? (
          <View style={s.notice}>
            <Feather name="sun" size={14} color="#C8922A" />
            <Text style={s.noticeText}>
              This only posts on days your published hours say you are open, and it ends
              when your day does. It does not claim you have a free slot.
            </Text>
          </View>
        ) : null}

        {/* Who you are recommending */}
        {isShoutout ? (
          <View style={s.block}>
            <Text style={s.label}>Who are you recommending?</Text>
            {taggedProviderId ? (
              <View style={s.selectedRow}>
                <Feather name="award" size={14} color="#C8922A" />
                <Text style={s.selectedName} numberOfLines={1}>
                  {taggedProviderName}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setTaggedProviderId(null)
                    setTaggedProviderName('')
                  }}
                >
                  <Text style={s.clear}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={s.input}
                  placeholder="Search providers by name"
                  placeholderTextColor="rgba(240,232,213,0.3)"
                  value={providerQuery}
                  onChangeText={setProviderQuery}
                  autoCapitalize="words"
                />
                {providerResults.slice(0, 5).map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={s.resultRow}
                    activeOpacity={0.8}
                    onPress={() => {
                      setTaggedProviderId(p.id)
                      setTaggedProviderName(p.display_name ?? 'Provider')
                      setProviderQuery('')
                    }}
                  >
                    <Text style={s.resultName} numberOfLines={1}>
                      {p.display_name}
                    </Text>
                    <Feather name="plus" size={15} color="rgba(240,232,213,0.4)" />
                  </TouchableOpacity>
                ))}
              </>
            )}
            <Text style={s.hint}>
              A recommendation is not a review. It does not change anyone&apos;s rating.
            </Text>

            {taggedProviderId && bookingOptions.length > 0 ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={s.label}>Link a booking? (optional)</Text>
                {bookingOptions.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[s.resultRow, bookingId === b.id && s.resultRowActive]}
                    activeOpacity={0.8}
                    onPress={() => setBookingId((prev) => (prev === b.id ? null : b.id))}
                  >
                    <Text style={s.resultName} numberOfLines={1}>
                      {b.serviceName}
                    </Text>
                    {bookingId === b.id ? (
                      <Feather name="check" size={15} color="#C8922A" />
                    ) : null}
                  </TouchableOpacity>
                ))}
                <Text style={s.hint}>
                  Linking one shows &ldquo;Booked on The Book&rdquo; on your recommendation.
                  Optional — plenty of good recommendations do not have one, and leaving it
                  off says nothing against you.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* The text */}
        <View style={s.block}>
          <Text style={s.label}>{spec?.prompt ?? 'What would you like to say?'}</Text>
          <TextInput
            style={s.textarea}
            placeholder={spec?.prompt ?? ''}
            placeholderTextColor="rgba(240,232,213,0.25)"
            multiline
            maxLength={MAX_LEN}
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
          />
          <Text style={s.counter}>
            {content.length}/{MAX_LEN}
          </Text>
        </View>

        {wantsService ? (
          <View style={s.block}>
            <Text style={s.label}>Service (optional)</Text>
            <View style={s.chipWrap}>
              {SERVICE_TAGS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={serviceTag === t}
                  onPress={() => setServiceTag((prev) => (prev === t ? null : t))}
                />
              ))}
            </View>
          </View>
        ) : null}

        {wantsArea ? (
          <View style={s.block}>
            <Text style={s.label}>Area (optional)</Text>
            <View style={s.chipWrap}>
              {HOUSTON_AREAS.map((n) => (
                <Chip
                  key={n}
                  label={n}
                  active={area === n}
                  onPress={() => setArea((prev) => (prev === n ? null : n))}
                />
              ))}
            </View>
          </View>
        ) : null}

        {wantsTiming ? (
          <View style={s.block}>
            <Text style={s.label}>When? (optional)</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. this Saturday, next week"
              placeholderTextColor="rgba(240,232,213,0.3)"
              value={timing}
              onChangeText={setTiming}
              maxLength={60}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text style={active ? s.chipTextActive : s.chipText}>{label}</Text>
    </TouchableOpacity>
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
  headerTitle: { color: '#F0E8D5', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  postBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#C8922A',
    minWidth: 64,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.35 },
  postBtnText: { color: '#080808', fontSize: 13, fontWeight: '700' },
  block: { gap: 8 },
  label: {
    color: 'rgba(240,232,213,0.55)',
    fontSize: 12,
    letterSpacing: 0.4,
    fontWeight: '600',
  },
  hint: { color: 'rgba(240,232,213,0.35)', fontSize: 11, lineHeight: 16 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.08)',
  },
  noticeText: { flex: 1, color: 'rgba(240,232,213,0.7)', fontSize: 12, lineHeight: 17 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  chipActive: { backgroundColor: '#C8922A' },
  chipText: { color: 'rgba(240,232,213,0.6)', fontSize: 12 },
  chipTextActive: { color: '#080808', fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#F0E8D5',
    fontSize: 14,
  },
  textarea: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderRadius: 12,
    padding: 12,
    minHeight: 130,
    color: '#F0E8D5',
    fontSize: 14,
    lineHeight: 20,
  },
  counter: { color: 'rgba(240,232,213,0.3)', fontSize: 11, alignSelf: 'flex-end' },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.1)',
  },
  selectedName: { flex: 1, color: '#F0E8D5', fontSize: 13, fontWeight: '600' },
  clear: { color: '#C8922A', fontSize: 12, fontWeight: '600' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  resultRowActive: { backgroundColor: 'rgba(200,146,42,0.1)' },
  resultName: { color: 'rgba(240,232,213,0.85)', fontSize: 13, flexShrink: 1 },
})
