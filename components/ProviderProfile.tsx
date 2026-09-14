import { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Share,
  StyleSheet,
  useWindowDimensions,
  Modal,
  FlatList,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ratingClientLabel, reviewTotalLabel, displayRating } from '../lib/reputationLabel'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BLOCKED_PROFILE_COPY } from '@/lib/safety'
import { useTheme } from '@/context/ThemeContext'
import {
  UNPUBLISHED_TERMS_COPY,
  bookingTermsCopy,
  type PublicBookingTerms,
} from '@/lib/publicBookingTerms'
import ProviderReviewsSection from './ProviderReviewsSection'
import ProviderShoutouts from './ProviderShoutouts'

// THE PUBLIC PROVIDER PROFILE.
//
// Phase 3B: migrated onto the Third theme from the approved Figma composition
// (`198:26` Light / `208:86` Dark). Every colour resolves from the semantic
// tokens, so System / Light / Dark all work from one tree.
//
// ── THE ONE STRUCTURAL IDEA ───────────────────────────────────────────────
//
// The hero photograph does not stop at the image. It continues into the
// identity band, which is painted with `mediaScrim` and lettered with
// `textOnAction` — the two roles the token set defines as holding **on media in
// both schemes**. That is what lets one tree give a dramatic dark-to-warm
// opening in Light and a single continuous dark field in Dark, without a
// hardcoded colour and without inverting anything.
//
// Everything below it is warm canvas with hairline-separated rows rather than a
// stack of elevated cards, which is the Third language and is also what keeps
// Dark flat instead of tiled.

export interface ProviderService {
  id?: string
  name: string
  price: string
  duration?: string
  /** From provider_services.description. Public, and shown only when set. */
  description?: string
  depositRequired?: boolean
  depositAmount?: string
}

export interface ProviderData {
  name: string
  businessName?: string
  /** providers.username — the handle, shown only when the provider has one. */
  username?: string
  category: string
  location: string
  bio?: string
  photo?: string
  banner?: string
  services?: ProviderService[]
  portfolio?: string[]
  reels?: string[]
  /** posts.content_type = 'process'. The provider's own account of the visit. */
  process?: string[]
  /** providers.specialties — already public, simply never surfaced before. */
  specialties?: string[]
  /**
   * The provider's REAL cancellation window and lateness grace, from
   * `provider_public_booking_terms`. Nulls mean NOT PUBLISHED and are rendered
   * as such — never as the platform default, which is the defect PD-125 was
   * raised against.
   */
  bookingTerms?: PublicBookingTerms
  rating?: number
  /**
   * How many DISTINCT clients the rating rests on. Not the review count: the
   * rating counts each client once (their most recent revealed review) while
   * the review list shows every review. Displaying one without the other is
   * misleading in whichever direction it chose.
   */
  ratingClientCount?: number
  reviewCount?: number
  bookingCount?: number
  followerCount?: number
}

export interface ProviderProfileProps {
  previewMode?: boolean
  provider: ProviderData
  // Real provider db id. When present (and not preview), the live Client
  // Reviews section is rendered below the content.
  providerId?: string
  isFollowing?: boolean
  isSaved?: boolean
  // When the viewer owns this provider, the follow / save / message / book
  // controls are hidden entirely — a user cannot act on their own profile.
  isOwnProfile?: boolean
  /**
   * ITEM H (Correction 3). False when this provider is no longer taking NEW
   * bookings.
   *
   * AVAILABILITY, NOT A JUDGEMENT, and never a verification claim. Everything
   * else about the profile stays exactly as it is — the portfolio, the reviews,
   * the services, the message control and every existing booking and
   * conversation. Only the one act the database would now refuse (PT426) is
   * withdrawn, and it is withdrawn HERE rather than being allowed to fail three
   * screens later with a raw error.
   *
   * Defaults to true so no caller that has not been updated silently hides a
   * live provider's booking control.
   */
  acceptingBookings?: boolean
  /**
   * Session 8 (QA-JOURNEY-002). True when the VIEWER has blocked the person
   * behind this provider.
   *
   * Distinct from `acceptingBookings`, and never folded into it. That flag says
   * something about the PROVIDER — they are not taking new bookings, and every
   * client sees the same line. This says something about the VIEWER'S OWN
   * ACTION, is true for exactly one person, and has a different remedy: unblock
   * them. Reusing the de-approval line here would tell you a business had been
   * removed from the marketplace because you blocked it.
   */
  blockedByMe?: boolean
  onBookNow?: () => void
  /**
   * Start a booking with THIS service already selected. Navigation convenience
   * only — the same flow, entered at the same first step. When absent, a service
   * row is inert rather than pretending to be a control.
   */
  onSelectService?: (service: ProviderService) => void
  onFollow?: () => void
  onSave?: () => void
  onMessage?: () => void
  /**
   * Session 8. Opens the safety sheet (Block / Report) for this provider.
   *
   * Optional and absent on the go-live preview and on your own profile — you
   * cannot block or report yourself, and a provider previewing their own listing
   * is not looking at a person they might need to act against.
   */
  onSafetyMenu?: () => void
}

const MOCK_PROVIDER: ProviderData = {
  name: 'Marcus Johnson',
  businessName: 'Blade Cuts Studio',
  category: 'Barber',
  location: 'Midtown, Houston',
  bio: 'Master barber with 8 years experience. Specializing in fades, lineups, and creative designs.',
  rating: 0,
  bookingCount: 0,
  followerCount: 0,
}

/** Initials for a provider with no photo. Never an icon that implies a person. */
export function providerInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * The trust line under the portrait, and the rule it carries.
 *
 * Unrated is an ABSENCE, not a verdict: `displayRating` returns null for a
 * provider nobody has reviewed (average_rating is 0, never null), so this never
 * renders `0.0` as if it were a score. When there IS a rating, the number beside
 * it is CLIENTS — a bare `(12)` reads as twelve opinions when PD-091 allows it
 * to be two clients who each came back six times.
 */
export function reputationLine(p: {
  rating?: number | null
  ratingClientCount?: number | null
  reviewCount?: number | null
}): { rating: string | null; detail: string | null } {
  const value = displayRating({ average_rating: p.rating ?? null })
  if (value == null) return { rating: null, detail: 'No reviews yet' }
  const parts = [ratingClientLabel(p.ratingClientCount), reviewTotalLabel(p.reviewCount)]
    .filter(Boolean)
    .join('  ·  ')
  return { rating: value.toFixed(1), detail: parts.length > 0 ? parts : null }
}

/** Completed bookings, the one volume fact the marketplace actually knows. */
export function completedBookingsLine(n: number | null | undefined): string | null {
  const v = n ?? 0
  if (v <= 0) return null
  return `${v} completed ${v === 1 ? 'booking' : 'bookings'}`
}

export default function ProviderProfile({
  previewMode = false,
  provider: providerProp,
  providerId,
  isFollowing = false,
  isSaved = false,
  isOwnProfile = false,
  acceptingBookings = true,
  blockedByMe = false,
  onBookNow,
  onSelectService,
  onFollow,
  onSave,
  onMessage,
  onSafetyMenu,
}: ProviderProfileProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { colors, type } = useTheme()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const provider = previewMode ? { ...MOCK_PROVIDER, ...providerProp } : providerProp
  const portfolioPhotos = provider.portfolio ?? []
  const reels = provider.reels ?? []
  const processMedia = provider.process ?? []
  const services = provider.services ?? []
  const specialties = (provider.specialties ?? []).filter(Boolean)
  const terms = provider.bookingTerms
  const termsCopy = terms ? bookingTermsCopy(terms) : null
  // The section appears only when at least one term is PUBLISHED. A block that
  // says "not published" twice and nothing else is not information.
  const showBookingTerms = !!termsCopy && !termsCopy.nonedPublished
  const showActions = !previewMode && !isOwnProfile

  const reputation = reputationLine(provider)
  const bookingsLine = completedBookingsLine(provider.bookingCount)
  // Media is 3-up with 20pt gutters and 10pt gaps, matching the approved frame.
  const tile = (width - 40 - 20) / 3

  async function handleShare() {
    try {
      await Share.share({ message: `Check out ${provider.name} on Third` })
    } catch {}
  }

  const onMediaSubtle = { color: colors.textOnAction, opacity: 0.6 }

  function Section({
    kicker,
    title,
    children,
  }: {
    kicker: string
    title: string
    children: React.ReactNode
  }) {
    return (
      <View style={styles.section}>
        <Text style={[type.caption, styles.kicker, { color: colors.statusLocal }]}>{kicker}</Text>
        <Text style={[type.titleSection, { color: colors.textPrimary }]}>{title}</Text>
        {children}
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: previewMode ? 40 : 128 }}
      >
        {/* ── HERO ────────────────────────────────────────────────────────
            A provider with no cover image gets the scrim field, not a grey
            placeholder or a stock photo: the composition holds, and nothing
            about the absence reads as a lesser business. */}
        <View style={[styles.hero, { backgroundColor: colors.mediaScrim }]}>
          {provider.banner ? (
            <Image
              source={{ uri: provider.banner }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Cover photo for ${provider.name}`}
            />
          ) : null}
          {/* Ink at alpha, and deliberately a literal: this is `mediaScrim`
              (#211F1D), which the token set fixes to the SAME value in Light and
              Dark precisely because a scrim over a photograph must not invert. A
              gradient needs alpha stops, which a hex token cannot express. */}
          <LinearGradient
            colors={['transparent', 'rgba(33,31,29,0.35)', 'rgba(33,31,29,0.95)']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {!previewMode && (
            <View style={[styles.heroControls, { top: insets.top + 8 }]}>
              <MediaButton icon="chevron-left" label="Go back" onPress={() => router.back()} />
              <View style={styles.heroControlsRight}>
                <MediaButton icon="share" label={`Share ${provider.name}`} onPress={handleShare} />
                {showActions ? (
                  <MediaButton
                    icon="bookmark"
                    label={isSaved ? `Saved ${provider.name}` : `Save ${provider.name}`}
                    active={isSaved}
                    onPress={onSave}
                  />
                ) : null}
                {showActions && onSafetyMenu ? (
                  <MediaButton icon="more-horizontal" label="More options" onPress={onSafetyMenu} />
                ) : null}
              </View>
            </View>
          )}
        </View>

        {/* ── IDENTITY, on the same scrim the hero fades into ────────────── */}
        <View style={[styles.identity, { backgroundColor: colors.mediaScrim }]}>
          <View style={styles.avatarWrap}>
            {provider.photo ? (
              <Image
                source={{ uri: provider.photo }}
                style={[styles.avatar, { borderColor: colors.textOnAction }]}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${provider.name} profile photo`}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  styles.avatarInitials,
                  { borderColor: colors.textOnAction, backgroundColor: colors.bgSubtle },
                ]}
                accessible
                accessibilityLabel={`${provider.name}, no profile photo`}
              >
                <Text style={[type.titleSection, { color: colors.textPrimary }]}>
                  {providerInitials(provider.name)}
                </Text>
              </View>
            )}
          </View>

          {/* Reputation reads as text, never as colour alone. */}
          <View style={styles.repRow} accessibilityRole="text">
            {reputation.rating ? (
              <>
                <Feather name="star" size={13} color={colors.textOnAction} />
                <Text style={[type.labelAction, styles.repValue, { color: colors.textOnAction }]}>
                  {reputation.rating}
                </Text>
              </>
            ) : null}
            {reputation.detail ? (
              <Text style={[type.labelMeta, styles.repDetail, onMediaSubtle]}>
                {reputation.rating ? `·  ${reputation.detail}` : reputation.detail}
              </Text>
            ) : null}
          </View>
          {bookingsLine ? (
            <Text style={[type.caption, styles.bookingsLine, { color: colors.textOnAction, opacity: 0.45 }]}>
              {bookingsLine}
            </Text>
          ) : null}

          <Text style={[type.displayScreen, styles.name, { color: colors.textOnAction }]}>
            {provider.name}
          </Text>
          {provider.username ? (
            <Text style={[type.caption, styles.handle, { color: colors.textOnAction, opacity: 0.55 }]}>
              @{provider.username}
            </Text>
          ) : null}

          <Text style={[type.bodyDefault, styles.trade, { color: colors.textOnAction, opacity: 0.85 }]}>
            {[provider.category, provider.businessName].filter(Boolean).join('  ·  ')}
          </Text>
          {provider.location ? (
            <Text style={[type.bodySmall, styles.hood, onMediaSubtle]}>{provider.location}</Text>
          ) : null}

          {provider.bio ? (
            <Text style={[type.bodyDefault, styles.bio, { color: colors.textOnAction, opacity: 0.8 }]}>
              {provider.bio}
            </Text>
          ) : null}

          {specialties.length > 0 ? (
            <Text style={[type.caption, styles.specialties, { color: colors.textOnAction, opacity: 0.5 }]}>
              {specialties.join('   ·   ').toUpperCase()}
            </Text>
          ) : null}

          {/* BOOK IS PRIMARY HERE TOO. With Follow alone in this area it read as
              the screen's main action, which inverts what the profile is for. */}
          {showActions && !blockedByMe && acceptingBookings ? (
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.actionPrimary }]}
              onPress={onBookNow}
              accessibilityRole="button"
              accessibilityLabel={`Request booking with ${provider.name}`}
              testID="profile-request-booking"
            >
              <Text style={[type.titleCard, { color: colors.textOnAction }]}>Request booking</Text>
            </Pressable>
          ) : null}

          {showActions ? (
            <View style={styles.identityActions}>
              <Pressable
                style={[styles.secondaryBtn, { borderColor: colors.textOnAction }]}
                onPress={onFollow}
                accessibilityRole="button"
                accessibilityState={{ selected: isFollowing }}
                accessibilityLabel={
                  isFollowing ? `Following ${provider.name}. Tap to unfollow.` : `Follow ${provider.name}`
                }
              >
                <Text style={[type.labelAction, { color: colors.textOnAction }]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
              {blockedByMe ? null : (
                <Pressable
                  style={[styles.iconBtn, { borderColor: colors.textOnAction }]}
                  onPress={onMessage}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${provider.name}`}
                >
                  <Feather name="message-circle" size={18} color={colors.textOnAction} />
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        {/* ── SERVICES ──────────────────────────────────────────────────── */}
        {services.length > 0 ? (
          <Section kicker="WHAT YOU CAN BOOK" title="Services">
            <View style={styles.rows}>
              {services.map((svc, i) => {
                const tappable = !!onSelectService && showActions && !blockedByMe && acceptingBookings
                const Row = tappable ? Pressable : View
                return (
                  <Row
                    key={svc.id ?? `${svc.name}-${i}`}
                    onPress={tappable ? () => onSelectService?.(svc) : undefined}
                    accessibilityRole={tappable ? 'button' : undefined}
                    accessibilityLabel={
                      tappable
                        ? `${svc.name}, $${svc.price}${svc.duration ? `, ${svc.duration}` : ''}. Start a booking request.`
                        : undefined
                    }
                    style={[
                      styles.serviceRow,
                      i < services.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth * 2,
                        borderBottomColor: colors.borderSubtle,
                      },
                    ]}
                  >
                    <View style={styles.serviceText}>
                      <Text style={[type.titleCard, { color: colors.textPrimary }]}>{svc.name}</Text>
                      {svc.duration ? (
                        <Text style={[type.bodySmall, styles.serviceMeta, { color: colors.textSecondary }]}>
                          {svc.duration}
                        </Text>
                      ) : null}
                      {svc.description ? (
                        <Text style={[type.bodySmall, styles.serviceMeta, { color: colors.textSecondary }]}>
                          {svc.description}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.servicePrice}>
                      <Text style={[type.titleCard, { color: colors.textPrimary }]}>${svc.price}</Text>
                      {tappable ? (
                        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                      ) : null}
                    </View>
                  </Row>
                )
              })}
            </View>
          </Section>
        ) : null}

        {/* ── PROCESS ───────────────────────────────────────────────────── */}
        {processMedia.length > 0 ? (
          <Section kicker="HOW AN APPOINTMENT GOES" title="Process">
            <Text style={[type.bodyDefault, styles.sectionLead, { color: colors.textSecondary }]}>
              {provider.name.split(' ')[0]} posted these so you know what to expect.
            </Text>
            <View style={styles.mediaRow}>
              {processMedia.slice(0, 3).map((uri, i) => (
                <Image
                  key={uri + i}
                  source={{ uri }}
                  style={[styles.processTile, { width: tile, height: tile * 1.48, backgroundColor: colors.bgSubtle }]}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`Process clip ${i + 1} of ${Math.min(processMedia.length, 3)}`}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── PORTFOLIO ─────────────────────────────────────────────────── */}
        {portfolioPhotos.length > 0 ? (
          <Section kicker="RECENT WORK" title="Portfolio">
            <View style={styles.grid}>
              {portfolioPhotos.slice(0, 9).map((uri, i) => (
                <Pressable
                  key={uri + i}
                  onPress={() => setLightboxIndex(i)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Work photo ${i + 1} of ${Math.min(portfolioPhotos.length, 9)}. Open full screen.`}
                >
                  <Image
                    source={{ uri }}
                    style={[styles.tile, { width: tile, height: tile, backgroundColor: colors.bgSubtle }]}
                  />
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── REELS ─────────────────────────────────────────────────────── */}
        {reels.length > 0 ? (
          <Section kicker="IN MOTION" title="Reels">
            <View style={styles.mediaRow}>
              {reels.slice(0, 3).map((uri, i) => (
                <Image
                  key={uri + i}
                  source={{ uri }}
                  style={[styles.processTile, { width: tile, height: tile * 1.78, backgroundColor: colors.bgSubtle }]}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`Reel ${i + 1} of ${Math.min(reels.length, 3)}`}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── BOOKING DETAILS ───────────────────────────────────────────
            Only the two terms a client is entitled to, and only when the
            provider has actually published them. No fee percentage, no deposit,
            no charge language: Third takes no payment in this beta, so this
            section must never imply it can collect or enforce anything. */}
        {showBookingTerms ? (
          <Section kicker="BEFORE YOU REQUEST" title="Booking details">
            <View style={styles.rows}>
              {termsCopy?.cancellation ? (
                <TermRow
                  label="Cancellation"
                  value={termsCopy.cancellation}
                  last={!termsCopy.grace}
                />
              ) : null}
              {termsCopy?.grace ? <TermRow label="Running late" value={termsCopy.grace} last /> : null}
            </View>
            {!termsCopy?.cancellation || !termsCopy?.grace ? (
              <Text style={[type.bodySmall, styles.sectionLead, { color: colors.textSecondary }]}>
                {UNPUBLISHED_TERMS_COPY.hint}
              </Text>
            ) : null}
            <Text style={[type.bodySmall, styles.sectionLead, { color: colors.textSecondary }]}>
              Third does not take payment in this beta. You settle with{' '}
              {provider.name.split(' ')[0]} directly.
            </Text>
          </Section>
        ) : null}

        {!previewMode && providerId ? <ProviderShoutouts providerId={providerId} /> : null}
        {!previewMode && providerId ? <ProviderReviewsSection providerId={providerId} /> : null}
      </ScrollView>

      {/* ── STICKY BOOK BAR ─────────────────────────────────────────────── */}
      {showActions && (
        <View
          style={[
            styles.bookBar,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: colors.bgCanvas,
              borderTopColor: colors.borderSubtle,
            },
          ]}
        >
          {/* The message control is withdrawn for someone you have blocked, and
              ONLY for that case. A de-approved provider keeps it — a client who
              already knows them can still reach them, which is the whole point
              of item H. A blocked pair has no new-contact path at all, so the
              button could only fail; an existing live thread is still reachable
              from Messages, where it belongs. */}
          {blockedByMe ? null : (
            <TouchableOpacity
              style={[styles.barIconBtn, { borderColor: colors.borderSubtle }]}
              onPress={onMessage}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Message ${provider.name}`}
            >
              <Feather name="message-circle" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          {blockedByMe ? (
            <View style={[styles.barPrimary, styles.barClosed, { borderColor: colors.borderSubtle }]}>
              <Text style={[type.labelAction, { color: colors.textPrimary }]}>
                {BLOCKED_PROFILE_COPY.bookBar}
              </Text>
              <Text style={[type.bodySmall, { color: colors.textSecondary }]}>
                {BLOCKED_PROFILE_COPY.hint}
              </Text>
            </View>
          ) : acceptingBookings ? (
            <Pressable
              style={[styles.barPrimary, { backgroundColor: colors.actionPrimary }]}
              onPress={onBookNow}
              accessibilityRole="button"
              accessibilityLabel={`Request booking with ${provider.name}`}
              testID="profile-book-bar"
            >
              <Text style={[type.titleCard, { color: colors.textOnAction }]}>Request booking</Text>
            </Pressable>
          ) : (
            // Not a disabled control: a greyed button invites a tap and says
            // nothing. It states the fact in the provider's own terms, and the
            // MESSAGE control beside it stays live — a client who already knows
            // this provider can still reach them.
            <View style={[styles.barPrimary, styles.barClosed, { borderColor: colors.borderSubtle }]}>
              <Text style={[type.labelAction, { color: colors.textPrimary }]}>
                Not currently available for new bookings
              </Text>
            </View>
          )}
        </View>
      )}

      <Modal
        visible={lightboxIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxIndex(null)}
      >
        <View style={[styles.lightboxRoot, { backgroundColor: colors.mediaScrim }]}>
          <FlatList
            data={portfolioPhotos.slice(0, 9)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={lightboxIndex ?? 0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            keyExtractor={(_, i) => String(i)}
            onMomentumScrollEnd={(e) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / width)
              if (next !== lightboxIndex) setLightboxIndex(next)
            }}
            renderItem={({ item }) => (
              <View style={{ width, justifyContent: 'center' }}>
                <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
              </View>
            )}
          />
          <TouchableOpacity
            style={[styles.lightboxClose, { top: insets.top + 12 }]}
            onPress={() => setLightboxIndex(null)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Feather name="x" size={22} color={colors.textOnAction} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

function TermRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors, type } = useTheme()
  return (
    <View
      style={[
        styles.termRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.borderSubtle },
      ]}
    >
      <Text style={[type.bodyDefault, styles.termLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[type.bodyDefault, styles.termValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  )
}

function MediaButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: React.ComponentProps<typeof Feather>['name']
  label: string
  onPress?: () => void
  active?: boolean
}) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      // Same scrim ink at alpha, for the same reason: these controls sit on the
      // photograph and must stay legible against it in either appearance.
      style={[styles.mediaBtn, { backgroundColor: 'rgba(33,31,29,0.55)' }]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active } : undefined}
    >
      <Feather name={icon} size={17} color={colors.textOnAction} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { height: 300, width: '100%' },
  heroControls: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroControlsRight: { flexDirection: 'row', gap: 8 },
  mediaBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  identity: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 28 },
  avatarWrap: { position: 'absolute', left: 20, top: -44 },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3 },
  avatarInitials: { alignItems: 'center', justifyContent: 'center' },
  repRow: { flexDirection: 'row', alignItems: 'center', minHeight: 20, flexWrap: 'wrap' },
  repValue: { marginLeft: 5 },
  repDetail: { marginLeft: 6 },
  bookingsLine: { marginTop: 3 },
  name: { marginTop: 10 },
  handle: { marginTop: 3 },
  trade: { marginTop: 10 },
  hood: { marginTop: 2 },
  bio: { marginTop: 16 },
  specialties: { marginTop: 16 },
  primaryBtn: {
    marginTop: 22,
    height: 54,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    opacity: 0.95,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 50,
    height: 46,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { paddingHorizontal: 20, paddingTop: 36 },
  kicker: { marginBottom: 8 },
  sectionLead: { marginTop: 6 },
  rows: { marginTop: 18 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  serviceText: { flex: 1 },
  serviceMeta: { marginTop: 3 },
  servicePrice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  termLabel: { flex: 1 },
  termValue: { textAlign: 'right' },
  mediaRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  processTile: { borderRadius: 14, borderCurve: 'continuous' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  tile: { borderRadius: 10, borderCurve: 'continuous' },
  bookBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  barIconBtn: {
    width: 56,
    height: 54,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barPrimary: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  barClosed: { borderWidth: 1 },
  lightboxRoot: { flex: 1 },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', right: 20 },
})
