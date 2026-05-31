// Shared analytics helpers used across the provider analytics screens.

import { supabase } from '../../../lib/supabase'

// Look up the providers.id for the current session. In dev with DEV_MODE
// auth bypass there is no real session, so fall back to the first approved
// provider so the analytics screens render real data instead of "No data yet".
export async function getProviderDbId(
  userId: string | undefined,
): Promise<string | null> {
  if (userId) {
    const { data: prov } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    return prov?.id ?? null
  }
  if (__DEV__) {
    const { data: prov } = await supabase
      .from('providers')
      .select('id')
      .eq('is_approved', true)
      .limit(1)
      .maybeSingle()
    const id = prov?.id ?? null
    console.log('[analytics] DEV MODE: using provider', id)
    return id
  }
  return null
}

export const money = (n: number) => '$' + Number(n || 0).toFixed(0)

export const money2 = (n: number) => '$' + Number(n || 0).toFixed(2)

export const pct = (n: number) => Math.round(n || 0) + '%'

export const daysSince = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

export const currentMonthRange = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export const monthRange = (monthsAgo: number) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    shortLabel: start.toLocaleDateString('en-US', { month: 'short' }),
  }
}

export const parseHour = (timeStr: string): number => {
  if (!timeStr) return 0
  const parts = timeStr.trim().split(' ')
  const time = parts[0]
  const period = parts[1]
  const [hours] = time.split(':')
  let h = parseInt(hours, 10)
  if (Number.isNaN(h)) return 0
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return h
}

export const getTimeBlock = (hour: number): number => {
  if (hour >= 8 && hour < 11) return 0
  if (hour >= 11 && hour < 14) return 1
  if (hour >= 14 && hour < 17) return 2
  if (hour >= 17 && hour < 20) return 3
  return 4
}

export const TIME_BLOCK_LABELS = ['Morning', 'Midday', 'Afternoon', 'Evening', 'Late']
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LABELS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export const getDayOfWeek = (dateStr: string): number => {
  const d = new Date(dateStr)
  return d.getDay()
}

export const goalKey = (userId: string) => 'provider_monthly_goal_' + userId

// Cancellation status set used across screens.
export const CANCEL_STATUSES = [
  'cancelled_by_client',
  'cancelled_by_provider',
  'late_cancelled',
]

// TODO: revert to completed only
// before production launch
// During dev/testing, any booking in an active status counts toward analytics
// so the screens show real data. Production should treat only 'completed' as
// revenue-earning. Use isEarning() in place of `status === 'completed'`.
export const DEV_EARNING_STATUSES = [
  'completed',
  'accepted',
  'pending',
  'checked_in',
  'arriving',
]

export const isEarning = (status: string | null | undefined): boolean =>
  DEV_EARNING_STATUSES.includes(status || '')

export interface BookingRow {
  id: string
  provider_id: string
  user_id: string | null
  service_name: string | null
  payment_amount: number | null
  status: string | null
  created_at: string | null
  requested_date: string | null
  requested_time: string | null
  provider_first_response_at?: string | null
}

export interface ServiceRow {
  id: string
  name: string
  price: number | null
  duration_minutes: number | null
  is_active?: boolean
}

export const sumCompleted = (rows: BookingRow[]) =>
  rows
    .filter((b) => b.status === 'completed')
    .reduce((s, b) => s + (b.payment_amount || 0), 0)

export const inMonth = (dateStr: string | null, startIso: string, endIso: string) => {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  return t >= new Date(startIso).getTime() && t < new Date(endIso).getTime()
}
