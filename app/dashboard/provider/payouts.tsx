import { useCallback, useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

// ─── Money model ─────────────────────────────────────────────────────────
// The Book deducts 5% from each provider payout. The 3% client protection
// fee is charged on top of the booking price (paid by the client) and is
// not part of the provider's gross. payment_amount on bookings is the
// service subtotal that the provider quoted.
const PLATFORM_FEE_RATE = 0.05

type BookingRow = {
  id: string
  status: string
  payment_status: string | null
  payment_amount: number | null
  payment_authorized_at: string | null
  payment_captured_at: string | null
  completed_at: string | null
  service_name: string | null
  requested_date: string | null
  appointment_time: string | null
  refund_status: string | null
}

type ProviderRow = {
  id: string
  display_name: string | null
  stripe_account_id: string | null
  stripe_payouts_enabled: boolean | null
  stripe_onboarding_complete: boolean | null
}

type Totals = {
  available: number
  held: number
  lifetime: number
  feesTaken: number
}

type HistoryItem = {
  bookingId: string
  serviceName: string
  date: string | null
  gross: number
  net: number
  status: 'Available' | 'Held'
}

const ZERO_TOTALS: Totals = { available: 0, held: 0, lifetime: 0, feesTaken: 0 }

function money(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const [y, mo, d] = iso.split('T')[0].split('-')
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[parseInt(mo) - 1]} ${parseInt(d)}, ${y}`
}

function maskAccount(id: string): string {
  if (id.length <= 8) return id
  return id.slice(0, 5) + '...' + id.slice(-4)
}

function isHeldStatus(s: string): boolean {
  return s === 'accepted' || s === 'arriving' || s === 'checked_in'
}

function computeTotalsAndHistory(bookings: BookingRow[]): {
  totals: Totals
  history: HistoryItem[]
} {
  let available = 0
  let held = 0
  let lifetime = 0
  let feesTaken = 0
  const history: HistoryItem[] = []

  for (const b of bookings) {
    const gross = b.payment_amount ?? 0
    if (gross <= 0) continue
    const fee = gross * PLATFORM_FEE_RATE
    const net = gross - fee
    const refunded = b.refund_status && b.refund_status !== 'none'

    if (refunded) continue

    if (b.status === 'completed' && b.payment_captured_at) {
      available += net
      lifetime += net
      feesTaken += fee
      history.push({
        bookingId: b.id,
        serviceName: b.service_name ?? 'Booking',
        date: b.completed_at ?? b.requested_date,
        gross,
        net,
        status: 'Available',
      })
      continue
    }

    if (isHeldStatus(b.status) && b.payment_authorized_at && !b.payment_captured_at) {
      held += net
      history.push({
        bookingId: b.id,
        serviceName: b.service_name ?? 'Booking',
        date: b.appointment_time ?? b.requested_date,
        gross,
        net,
        status: 'Held',
      })
    }
  }

  return { totals: { available, held, lifetime, feesTaken }, history }
}

export default function ProviderPayouts() {
  const insets = useSafeAreaInsets()
  const { openPanel } = usePanelContext()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [provider, setProvider] = useState<ProviderRow | null>(null)
  const [totals, setTotals] = useState<Totals>(ZERO_TOTALS)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showBetaSheet, setShowBetaSheet] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      setLoadError('You need to be signed in to view payouts.')
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const { data: prov, error: provErr } = await supabase
        .from('providers')
        .select('id, display_name, stripe_account_id, stripe_payouts_enabled, stripe_onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle()
      if (provErr) throw provErr
      if (!prov) {
        setLoadError('No provider profile found for this account.')
        setLoading(false)
        return
      }
      setProvider(prov as ProviderRow)

      const { data: rows, error: bookErr } = await supabase
        .from('bookings')
        .select(
          'id, status, payment_status, payment_amount, payment_authorized_at, payment_captured_at, completed_at, service_name, requested_date, appointment_time, refund_status',
        )
        .eq('provider_id', prov.id)
        .not('payment_amount', 'is', null)
      if (bookErr) throw bookErr

      const computed = computeTotalsAndHistory((rows as BookingRow[]) ?? [])
      setTotals(computed.totals)
      // Newest first
      setHistory(
        computed.history.sort((a, b) => {
          const ta = a.date ? new Date(a.date).getTime() : 0
          const tb = b.date ? new Date(b.date).getTime() : 0
          return tb - ta
        }),
      )
    } catch (err: any) {
      console.log('Payouts load error:', err)
      setLoadError(err.message ?? 'Could not load payouts.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const payoutsConnected =
    !!provider?.stripe_account_id && provider?.stripe_payouts_enabled === true

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.skeletonBody}>
          <View style={[styles.skeletonBar, { width: 220 }]} />
          <View style={[styles.skeletonCard, { height: 160 }]} />
          <View style={[styles.skeletonCard, { height: 72 }]} />
          <View style={[styles.skeletonCard, { height: 180 }]} />
        </View>
      ) : loadError ? (
        <View style={styles.errorBody}>
          <Ionicons name="cloud-offline" size={32} color="rgba(240,232,213,0.25)" />
          <Text style={styles.errorTitle}>Could not load payouts</Text>
          <Text style={styles.errorSub}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Beta notice */}
          <View style={styles.notice}>
            <Ionicons name="information-circle" size={14} color="rgba(240,232,213,0.55)" />
            <Text style={styles.noticeText}>
              Payouts are processed manually during beta. Full Stripe Connect integration launches with v1.0.
            </Text>
          </View>

          {/* Balance summary */}
          <Text style={styles.sectionLabel}>BALANCE</Text>
          <View style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <View style={styles.balanceAmberDot} />
              <Text style={styles.balanceLabel}>AVAILABLE</Text>
            </View>
            <Text style={styles.balanceAvailable}>{money(totals.available)}</Text>
            <Text style={styles.balanceSubline}>
              after 5% platform fee, awaiting manual payout
            </Text>

            <View style={styles.balanceDivider} />

            <View style={styles.balanceSplitRow}>
              <View style={styles.balanceSplitCell}>
                <Text style={styles.balanceSplitLabel}>HELD</Text>
                <Text style={styles.balanceSplitValue}>{money(totals.held)}</Text>
                <Text style={styles.balanceSplitCaption}>confirmed, not yet complete</Text>
              </View>
              <View style={styles.balanceCellDivider} />
              <View style={styles.balanceSplitCell}>
                <Text style={styles.balanceSplitLabel}>LIFETIME</Text>
                <Text style={styles.balanceSplitValue}>{money(totals.lifetime)}</Text>
                <Text style={styles.balanceSplitCaption}>net earnings to date</Text>
              </View>
            </View>

            {totals.feesTaken > 0 && (
              <Text style={styles.feeLine}>
                {money(totals.feesTaken)} taken in platform fees lifetime.
              </Text>
            )}
          </View>

          {/* Payout method */}
          <Text style={styles.sectionLabel}>PAYOUT METHOD</Text>
          <Pressable
            style={styles.methodCard}
            onPress={() => setShowBetaSheet(true)}
          >
            <View style={styles.methodIconWrap}>
              <Ionicons
                name={payoutsConnected ? 'card' : 'card-outline'}
                size={20}
                color={payoutsConnected ? '#F0E8D5' : 'rgba(240,232,213,0.45)'}
              />
            </View>
            <View style={styles.methodInfo}>
              {payoutsConnected ? (
                <>
                  <Text style={styles.methodTitle}>Stripe Express connected</Text>
                  <Text style={styles.methodSub}>
                    {maskAccount(provider!.stripe_account_id!)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.methodTitle}>Connect with Stripe</Text>
                  <Text style={styles.methodSub}>
                    Set up your payout account.
                  </Text>
                </>
              )}
            </View>
            <Text style={styles.methodAction}>
              {payoutsConnected ? 'Details' : 'Connect'}
            </Text>
          </Pressable>

          {/* Payout history */}
          <Text style={styles.sectionLabel}>PAYOUT HISTORY</Text>
          <View style={styles.historyCard}>
            {history.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Ionicons name="receipt-outline" size={28} color="rgba(240,232,213,0.18)" />
                <Text style={styles.historyEmptyTitle}>No payouts yet.</Text>
                <Text style={styles.historyEmptySub}>
                  Your earnings from completed bookings will show up here.
                </Text>
              </View>
            ) : (
              history.map((row, i) => (
                <View
                  key={row.bookingId}
                  style={[styles.historyRow, i < history.length - 1 && styles.historyRowBorder]}
                >
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyService} numberOfLines={1}>
                      {row.serviceName}
                    </Text>
                    <Text style={styles.historyDate}>{shortDate(row.date)}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyNet}>{money(row.net)}</Text>
                    <Text
                      style={[
                        styles.historyStatus,
                        row.status === 'Available'
                          ? styles.historyStatusAvailable
                          : styles.historyStatusHeld,
                      ]}
                    >
                      {row.status}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.footnote}>
            Numbers update as bookings move through confirmation, completion, and payout. The 5% platform fee is deducted from each booking before it lands in your balance.
          </Text>
        </ScrollView>
      )}

      {/* Beta info sheet */}
      <Modal
        visible={showBetaSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBetaSheet(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowBetaSheet(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Payouts during beta</Text>
          <Text style={styles.sheetBody}>
            Stripe Connect onboarding is not live yet. During beta, payouts are processed manually by The Book team. Once Stripe Connect launches with v1.0, every approved provider will be invited to connect their account directly from this screen.
          </Text>
          {payoutsConnected && (
            <View style={styles.sheetMetaBlock}>
              <Text style={styles.sheetMetaLabel}>YOUR CONNECTED ACCOUNT</Text>
              <Text style={styles.sheetMetaValue}>
                {provider!.stripe_account_id}
              </Text>
              <Text style={styles.sheetMetaCaption}>
                Stripe payouts are enabled on your account, but the live payout engine inside The Book is not switched on yet.
              </Text>
            </View>
          )}
          <Pressable style={styles.sheetCloseBtn} onPress={() => setShowBetaSheet(false)}>
            <Text style={styles.sheetCloseText}>Got it</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Loading
  skeletonBody: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  skeletonBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginTop: 8,
  },
  skeletonCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
  },

  // Error
  errorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  errorTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 14,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Scroll content
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },

  // Beta notice
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    backgroundColor: 'rgba(240,232,213,0.03)',
    marginBottom: 24,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },

  // Balance card
  balanceCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 24,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  balanceAmberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  balanceLabel: {
    fontSize: 9,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
  },
  balanceAvailable: {
    fontSize: 36,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 40,
  },
  balanceSubline: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },
  balanceDivider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginVertical: 18,
  },
  balanceSplitRow: {
    flexDirection: 'row',
  },
  balanceSplitCell: {
    flex: 1,
  },
  balanceCellDivider: {
    width: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 12,
  },
  balanceSplitLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  balanceSplitValue: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  balanceSplitCaption: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  feeLine: {
    marginTop: 14,
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },

  // Payout method
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    marginBottom: 24,
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  methodSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  methodAction: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },

  // History
  historyCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: 16,
  },
  historyEmpty: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  historyEmptyTitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 6,
  },
  historyEmptySub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 20,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  historyLeft: {
    flex: 1,
  },
  historyService: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  historyDate: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyNet: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  historyStatus: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
  },
  historyStatusAvailable: {
    color: '#C8922A',
  },
  historyStatusHeld: {
    color: 'rgba(240,232,213,0.4)',
  },

  // Footnote
  footnote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
    paddingHorizontal: 4,
    marginTop: 4,
  },

  // Beta sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 10,
  },
  sheetBody: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
  },
  sheetMetaBlock: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  sheetMetaLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  sheetMetaValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  sheetMetaCaption: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 8,
    lineHeight: 16,
  },
  sheetCloseBtn: {
    marginTop: 22,
    height: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
})
