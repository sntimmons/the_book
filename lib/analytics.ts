import { supabase } from './supabase'

// Provider analytics data layer. All metrics are computed client-side from the
// provider's raw booking rows (no aggregation views). Earnings count only
// completed bookings; date buckets use requested_date (a plain YYYY-MM-DD date).

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface TopService {
  name: string
  count: number
  earned: number
}

export interface MonthEarning {
  label: string // e.g. "Aug"
  key: string // YYYY-MM
  amount: number
}

export interface DayCount {
  date: string // YYYY-MM-DD
  count: number
}

export interface ProviderAnalytics {
  totalEarned: number
  earnedThisMonth: number
  earnedThisWeek: number
  completedCount: number
  pendingCount: number
  cancelledCount: number
  noShowCount: number
  disputeCount: number
  uniqueClients: number
  repeatClientRate: number // percentage 0..100
  topServices: TopService[]
  earningsByMonth: MonthEarning[] // last 6 months, oldest first
  bookingsByDay: DayCount[] // last 30 days, oldest first
  totalBookings: number // all rows, for empty-state detection
  bookingsLast30Days: number // sum of bookingsByDay counts
}

export interface RecentBooking {
  id: string
  userId: string | null
  serviceName: string | null
  requestedDate: string | null
  status: string
  paymentAmount: number | null
}

interface RawBookingRow {
  id: string
  user_id: string | null
  service_name: string | null
  requested_date: string | null
  status: string
  payment_amount: number | null
  completed_at: string | null
  no_show_flag: boolean | null
  dispute_flag: boolean | null
  created_at: string | null
  cancelled_at: string | null
  payment_status: string | null
}

const ANALYTICS_COLUMNS =
  'id, user_id, service_name, requested_date, status, payment_amount, completed_at, no_show_flag, dispute_flag, created_at, cancelled_at, payment_status'

// Local YYYY-MM-DD for a date (avoids UTC drift on day/month boundaries).
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonthStr(now: Date): string {
  return ymd(new Date(now.getFullYear(), now.getMonth(), 1))
}

// Monday as the start of the current week.
function startOfWeekStr(now: Date): string {
  const dow = now.getDay() // 0 Sun .. 6 Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1
  return ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday))
}

const amt = (b: RawBookingRow) => Number(b.payment_amount) || 0

export async function fetchProviderAnalytics(
  providerId: string,
): Promise<ProviderAnalytics | null> {
  if (!providerId) return null

  const { data, error } = await supabase
    .from('bookings')
    .select(ANALYTICS_COLUMNS)
    .eq('provider_id', providerId)
  if (error) {
    console.log('Analytics fetch error:', error)
    return null
  }
  const rows = (data as RawBookingRow[] | null) ?? []

  const now = new Date()
  const monthStart = startOfMonthStr(now)
  const weekStart = startOfWeekStr(now)

  const completed = rows.filter((b) => b.status === 'completed')

  const totalEarned = completed.reduce((s, b) => s + amt(b), 0)
  const earnedThisMonth = completed
    .filter((b) => b.requested_date != null && b.requested_date >= monthStart)
    .reduce((s, b) => s + amt(b), 0)
  const earnedThisWeek = completed
    .filter((b) => b.requested_date != null && b.requested_date >= weekStart)
    .reduce((s, b) => s + amt(b), 0)

  const completedCount = completed.length
  const pendingCount = rows.filter(
    (b) => b.status === 'pending' || b.status === 'accepted',
  ).length
  const cancelledCount = rows.filter((b) => b.status === 'cancelled').length
  const noShowCount = rows.filter((b) => b.no_show_flag === true).length
  const disputeCount = rows.filter((b) => b.dispute_flag === true).length

  // Unique + repeat clients (completed bookings only).
  const visitsByClient = new Map<string, number>()
  for (const b of completed) {
    if (!b.user_id) continue
    visitsByClient.set(b.user_id, (visitsByClient.get(b.user_id) ?? 0) + 1)
  }
  const uniqueClients = visitsByClient.size
  const repeatClients = Array.from(visitsByClient.values()).filter((v) => v > 1).length
  const repeatClientRate = uniqueClients > 0 ? (repeatClients / uniqueClients) * 100 : 0

  // Top services by booking count (completed), then earned as tiebreak.
  const svcMap = new Map<string, { count: number; earned: number }>()
  for (const b of completed) {
    const name = b.service_name || 'Other'
    const cur = svcMap.get(name) ?? { count: 0, earned: 0 }
    cur.count += 1
    cur.earned += amt(b)
    svcMap.set(name, cur)
  }
  const topServices: TopService[] = Array.from(svcMap.entries())
    .map(([name, v]) => ({ name, count: v.count, earned: v.earned }))
    .sort((a, b) => b.count - a.count || b.earned - a.earned)
    .slice(0, 5)

  // Earnings by month for the last 6 months (completed, bucketed by
  // requested_date's YYYY-MM).
  const earningsByMonth: MonthEarning[] = []
  const monthIndex = new Map<string, number>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`
    monthIndex.set(key, earningsByMonth.length)
    earningsByMonth.push({ label: MONTH_LABELS[d.getMonth()], key, amount: 0 })
  }
  for (const b of completed) {
    if (!b.requested_date) continue
    const key = b.requested_date.slice(0, 7)
    const idx = monthIndex.get(key)
    if (idx != null) earningsByMonth[idx].amount += amt(b)
  }

  // Bookings by day for the last 30 days (all statuses, by requested_date).
  const bookingsByDay: DayCount[] = []
  const dayIndex = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const date = ymd(d)
    dayIndex.set(date, bookingsByDay.length)
    bookingsByDay.push({ date, count: 0 })
  }
  for (const b of rows) {
    if (!b.requested_date) continue
    const idx = dayIndex.get(b.requested_date)
    if (idx != null) bookingsByDay[idx].count += 1
  }
  const bookingsLast30Days = bookingsByDay.reduce((s, d) => s + d.count, 0)

  return {
    totalEarned,
    earnedThisMonth,
    earnedThisWeek,
    completedCount,
    pendingCount,
    cancelledCount,
    noShowCount,
    disputeCount,
    uniqueClients,
    repeatClientRate,
    topServices,
    earningsByMonth,
    bookingsByDay,
    totalBookings: rows.length,
    bookingsLast30Days,
  }
}

// Most recent bookings for the provider, newest first.
export async function fetchRecentBookings(
  providerId: string,
  limit = 10,
): Promise<RecentBooking[]> {
  if (!providerId) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, user_id, service_name, requested_date, status, payment_amount, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.log('Recent bookings error:', error)
    return []
  }
  return (
    (data as
      | {
          id: string
          user_id: string | null
          service_name: string | null
          requested_date: string | null
          status: string
          payment_amount: number | null
        }[]
      | null) ?? []
  ).map((b) => ({
    id: b.id,
    userId: b.user_id,
    serviceName: b.service_name,
    requestedDate: b.requested_date,
    status: b.status,
    paymentAmount: b.payment_amount,
  }))
}
