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
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export interface ProviderService {
  id?: string
  name: string
  price: string
  duration?: string
  depositRequired?: boolean
  depositAmount?: string
}

export interface ProviderData {
  name: string
  businessName?: string
  category: string
  location: string
  bio?: string
  photo?: string
  banner?: string
  services?: ProviderService[]
  portfolio?: string[]
  reels?: string[]
  rating?: number
  bookingCount?: number
  followerCount?: number
  followingCount?: number
  isVerified?: boolean
  isLive?: boolean
}

export interface ProviderProfileProps {
  previewMode?: boolean
  provider: ProviderData
  isFollowing?: boolean
  onBookNow?: () => void
  onFollow?: () => void
  onMessage?: () => void
}

const MOCK_PROVIDER: ProviderData = {
  name: 'Marcus Johnson',
  businessName: 'Blade Cuts Studio',
  category: 'Barber',
  location: 'Midtown, Houston',
  bio: 'Master barber with 8 years experience. Specializing in fades, lineups, and creative designs. Book your spot today.',
  rating: 0,
  bookingCount: 0,
  followerCount: 0,
  followingCount: 0,
  isVerified: false,
  isLive: true,
}

const MOCK_POSTS = [
  {
    id: '1',
    text: 'Just wrapped up a full day of appointments. Houston, y\'all keep me busy and I love it. Slots opening up next Thursday, link in bio to book.',
    timestamp: '2 hours ago',
    likes: 24,
    comments: 3,
    hasPhoto: false,
  },
  {
    id: '2',
    text: 'Before and after from today. Client wanted a clean fade with a hard part. Came out clean.',
    timestamp: 'Yesterday',
    likes: 47,
    comments: 8,
    hasPhoto: true,
  },
]

export default function ProviderProfile({
  previewMode = false,
  provider: providerProp,
  isFollowing = false,
  onBookNow,
  onFollow,
  onMessage,
}: ProviderProfileProps) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [activeTab, setActiveTab] = useState<'portfolio' | 'posts'>('portfolio')

  const provider = previewMode ? { ...MOCK_PROVIDER, ...providerProp } : providerProp
  const cellSize = width / 3
  const portfolioPhotos = provider.portfolio ?? []
  const reelItems = provider.reels ?? []
  const services = provider.services ?? []

  async function handleShare() {
    try {
      await Share.share({ message: `Check out ${provider.name} on The Book` })
    } catch {}
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: previewMode ? 40 : 120 }}
      >
        {/* ── BANNER ── */}
        <View style={styles.banner}>
          {provider.banner ? (
            <Image source={{ uri: provider.banner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={['#1a1008', '#0d0804', '#080808']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          {/* Bottom fade */}
          <LinearGradient
            colors={['transparent', 'rgba(8,8,8,0.6)', '#080808']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {previewMode ? (
            <View style={[styles.previewPill, { top: insets.top + 12 }]}>
              <Feather name="eye" size={11} color="rgba(240,232,213,0.5)" />
              <Text style={styles.previewPillText}>THIS IS YOUR PUBLIC PROFILE</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.bannerBtn, { top: insets.top + 12, left: 16 }]}
                onPress={() => router.back()}
                activeOpacity={0.8}
              >
                <Feather name="chevron-left" size={18} color="#F0E8D5" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bannerBtn, { top: insets.top + 12, right: 64 }]}
                activeOpacity={0.8}
              >
                <Feather name="flag" size={16} color="rgba(240,232,213,0.5)" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bannerBtn, { top: insets.top + 12, right: 16 }]}
                onPress={handleShare}
                activeOpacity={0.8}
              >
                <Feather name="share" size={18} color="#F0E8D5" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── PROFILE PHOTO ROW ── */}
        <View style={styles.photoRow}>
          {/* Photo + badges */}
          <View style={styles.photoWrap}>
            {provider.photo ? (
              <Image
                source={{ uri: provider.photo }}
                style={styles.photo}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Feather name="user" size={30} color="rgba(240,232,213,0.2)" />
              </View>
            )}
            {provider.isVerified && (
              <View style={styles.verifiedBadge}>
                <Feather name="check" size={10} color="#080808" />
              </View>
            )}
            {provider.isLive && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>

          {/* Action buttons */}
          {!previewMode && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followBtnActive]}
                onPress={onFollow}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.followBtnText,
                    isFollowing && styles.followBtnTextActive,
                  ]}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={onMessage}
                activeOpacity={0.8}
              >
                <Feather name="message-circle" size={16} color="#F0E8D5" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── IDENTITY ── */}
        <View style={styles.identity}>
          <Text style={styles.providerName}>{provider.name}</Text>
          {provider.businessName ? (
            <Text style={styles.businessName}>{provider.businessName}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={12} color="rgba(240,232,213,0.3)" />
            <Text style={styles.metaText}>
              {provider.category} · {provider.location}
            </Text>
          </View>
        </View>

        {/* ── STATS ── */}
        <View style={styles.statsRow}>
          <StatCol value={provider.bookingCount ?? 0} label="Bookings" />
          <View style={styles.statDivider} />
          <StatCol value={provider.followerCount ?? 0} label="Followers" />
          <View style={styles.statDivider} />
          <StatCol value={provider.followingCount ?? 0} label="Following" />
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            {(provider.rating ?? 0) > 0 ? (
              <View style={styles.ratingRow}>
                <Text style={styles.statValue}>{provider.rating}</Text>
                <Feather name="star" size={12} color="#C8922A" />
              </View>
            ) : (
              <Text style={styles.statValue}>New</Text>
            )}
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ── TRUST BADGES ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgesRow}
          style={styles.badgesScroll}
        >
          <View style={[styles.badge, styles.badgeGreen]}>
            <Feather name="check-circle" size={12} color="#4CAF50" />
            <Text style={styles.badgeText}>Phone Verified</Text>
          </View>
          {provider.isVerified && (
            <View style={[styles.badge, styles.badgeGreen]}>
              <Feather name="shield" size={12} color="#4CAF50" />
              <Text style={styles.badgeText}>ID Verified</Text>
            </View>
          )}
          <View style={[styles.badge, styles.badgeMuted]}>
            <Feather name="scissors" size={12} color="rgba(240,232,213,0.4)" />
            <Text style={styles.badgeText}>{provider.category}</Text>
          </View>
        </ScrollView>

        {/* ── BIO ── */}
        {provider.bio ? (
          <Text style={styles.bio}>{provider.bio}</Text>
        ) : null}

        <View style={styles.separator} />

        {/* ── TABS ── */}
        <View style={styles.tabBar}>
          {(['portfolio', 'posts'] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── PORTFOLIO TAB ── */}
        {activeTab === 'portfolio' && (
          <View>
            {/* Services */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SERVICES</Text>
              {services.length > 0 ? (
                <>
                  {services.slice(0, 3).map((s, i) => (
                    <View
                      key={s.id ?? i}
                      style={[styles.serviceRow, i < Math.min(services.length, 3) - 1 && styles.serviceRowBorder]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.serviceName}>{s.name}</Text>
                        {s.duration ? (
                          <Text style={styles.serviceDuration}>{s.duration}</Text>
                        ) : null}
                        {s.depositRequired && s.depositAmount ? (
                          <View style={styles.depositRow}>
                            <Feather name="shield" size={10} color="#C8922A" />
                            <Text style={styles.depositText}>Deposit: ${s.depositAmount}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.servicePriceCol}>
                        <Text style={styles.servicePrice}>${s.price}</Text>
                        {!previewMode && (
                          <Text style={styles.bookLink}>Book</Text>
                        )}
                      </View>
                    </View>
                  ))}
                  {services.length > 3 && (
                    <Text style={styles.seeAll}>
                      See all {services.length} services →
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.emptyText}>No services listed yet.</Text>
              )}
            </View>

            <View style={[styles.separator, { marginHorizontal: 20, marginTop: 4 }]} />

            {/* Portfolio photos */}
            <View style={styles.portfolioHeader}>
              <Text style={styles.sectionLabel}>PORTFOLIO</Text>
              {previewMode ? (
                <Text style={styles.portfolioAction}>Add photos →</Text>
              ) : (
                <Text style={styles.portfolioCount}>
                  {portfolioPhotos.length} photos
                </Text>
              )}
            </View>

            <View style={styles.photoGrid}>
              {portfolioPhotos.length > 0
                ? portfolioPhotos.slice(0, 9).map((uri, i) => (
                    <Pressable
                      key={i}
                      style={{ width: cellSize, height: cellSize }}
                      onPress={() => console.log('open photo', i)}
                    >
                      <Image
                        source={{ uri }}
                        style={{ width: cellSize, height: cellSize }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))
                : [0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={[styles.photoPlaceholderCell, { width: cellSize, height: cellSize }]}
                    >
                      <Feather name="camera" size={20} color="rgba(240,232,213,0.1)" />
                    </View>
                  ))}
            </View>

            {/* Reels preview */}
            <View style={[styles.section, { marginTop: 24 }]}>
              <View style={styles.portfolioHeader}>
                <Text style={styles.sectionLabel}>REELS</Text>
                {!previewMode && <Text style={styles.portfolioAction}>See all →</Text>}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {[0, 1, 2].map((i) => {
                  const reel = reelItems[i]
                  return (
                    <View key={i} style={styles.reelCell}>
                      {reel ? (
                        <View style={styles.reelFilled}>
                          <Feather name="play" size={24} color="rgba(240,232,213,0.5)" />
                        </View>
                      ) : (
                        <Feather name="play-circle" size={24} color="rgba(240,232,213,0.15)" />
                      )}
                    </View>
                  )
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {/* ── POSTS TAB ── */}
        {activeTab === 'posts' && (
          <View style={styles.section}>
            {previewMode ? (
              <View style={styles.postsEmpty}>
                <Feather name="edit" size={32} color="rgba(240,232,213,0.12)" />
                <Text style={styles.postsEmptyTitle}>Your posts will appear here</Text>
                <Text style={styles.postsEmptySub}>
                  Share updates, photos, and reels to stay top of mind with clients.
                </Text>
              </View>
            ) : (
              MOCK_POSTS.map((post) => (
                <View key={post.id} style={styles.postCard}>
                  <View style={styles.postTopRow}>
                    <View style={styles.postAvatar}>
                      <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.postAuthor}>{provider.name}</Text>
                      <Text style={styles.postTime}>{post.timestamp}</Text>
                    </View>
                    <Feather name="more-horizontal" size={18} color="rgba(240,232,213,0.3)" />
                  </View>
                  <Text style={styles.postText}>{post.text}</Text>
                  {post.hasPhoto && (
                    <View style={styles.postPhotoPlaceholder} />
                  )}
                  <View style={styles.postActions}>
                    <TouchableOpacity style={styles.postAction} activeOpacity={0.7}>
                      <Feather name="heart" size={18} color="rgba(240,232,213,0.4)" />
                      <Text style={styles.postActionCount}>{post.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.postAction} activeOpacity={0.7}>
                      <Feather name="message-circle" size={18} color="rgba(240,232,213,0.4)" />
                      <Text style={styles.postActionCount}>{post.comments}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.postAction} activeOpacity={0.7}>
                      <Feather name="share" size={18} color="rgba(240,232,213,0.4)" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.postAction, { marginLeft: 'auto' }]} activeOpacity={0.7}>
                      <Feather name="bookmark" size={18} color="rgba(240,232,213,0.4)" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ── STICKY BOOK NOW ── */}
      {!previewMode && (
        <View style={[styles.bookBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={styles.messageBarBtn}
            onPress={onMessage}
            activeOpacity={0.8}
          >
            <Feather name="message-circle" size={20} color="#F0E8D5" />
          </TouchableOpacity>
          <Pressable style={styles.bookNowBtn} onPress={onBookNow}>
            <Text style={styles.bookNowText}>Book Now</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

function StatCol({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.statCol}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },

  // Banner
  banner: {
    height: 200,
  },
  previewPill: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(8,8,8,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  previewPillText: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
  },
  bannerBtn: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(8,8,8,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile photo row
  photoRow: {
    marginTop: -36,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#080808',
  },
  photoPlaceholder: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#C8922A',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  liveBadgeText: {
    fontSize: 8,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  followBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0E8D5',
  },
  followBtnActive: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.2)',
    paddingVertical: 7,
  },
  followBtnText: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
  followBtnTextActive: {
    color: '#F0E8D5',
  },
  messageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Identity
  identity: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  providerName: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  businessName: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  metaText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignSelf: 'center',
  },
  statValue: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // Separator
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginTop: 16,
    marginHorizontal: 20,
  },

  // Trust badges
  badgesScroll: {
    marginTop: 14,
  },
  badgesRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeGreen: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.2)',
  },
  badgeMuted: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderColor: 'rgba(240,232,213,0.1)',
  },
  badgeText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // Bio
  bio: {
    paddingHorizontal: 20,
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    marginTop: 16,
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#F0E8D5',
  },
  tabText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  tabTextActive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Section
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    paddingVertical: 16,
  },

  // Service rows
  serviceRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  serviceName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  serviceDuration: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  depositText: {
    fontSize: 11,
    color: '#C8922A',
    fontFamily: 'Manrope_400Regular',
    marginLeft: 4,
  },
  servicePriceCol: {
    alignItems: 'flex-end',
  },
  servicePrice: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  bookLink: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
    marginTop: 3,
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    marginTop: 12,
  },

  // Portfolio
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 20,
  },
  portfolioAction: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
  },
  portfolioCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  photoPlaceholderCell: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Reels
  reelCell: {
    width: 110,
    aspectRatio: 9 / 16,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelFilled: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Posts
  postsEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  postsEmptyTitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 12,
  },
  postsEmptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  postCard: {
    marginBottom: 20,
  },
  postTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthor: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  postTime: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  postText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginBottom: 12,
  },
  postPhotoPlaceholder: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginBottom: 12,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.05)',
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  postActionCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },

  // Book bar
  bookBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8,8,8,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  messageBarBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookNowBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookNowText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
})
