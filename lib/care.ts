import { supabase } from './supabase'

// Client Care Hub data layer. Rebook reminders live in care_reminders (one row
// per client + service); "due" logic is single-sourced here so the Care screen
// and the Discover rebook banner agree on what counts as due.

export interface CareReminder {
  id: string
  serviceName: string
  providerId: string | null
  intervalDays: number
  lastBookedAt: string | null
  nextReminderAt: string | null
  isActive: boolean
}

// Interval choices offered in the Add Reminder picker, mapped to interval_days.
export const INTERVAL_OPTIONS: { days: number; label: string }[] = [
  { days: 14, label: 'Every 2 weeks' },
  { days: 21, label: 'Every 3 weeks' },
  { days: 28, label: 'Every 4 weeks' },
  { days: 42, label: 'Every 6 weeks' },
  { days: 56, label: 'Every 8 weeks' },
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
]

// A reminder is "due" when its next date is in the past or within 3 days.
export const DUE_WINDOW_DAYS = 3

// Human label for an interval in days (falls back for non-preset values).
export function intervalLabel(days: number): string {
  const preset = INTERVAL_OPTIONS.find((o) => o.days === days)
  if (preset) return preset.label
  if (days % 30 === 0) {
    const months = days / 30
    return `Every ${months} month${months === 1 ? '' : 's'}`
  }
  if (days % 7 === 0) {
    const weeks = days / 7
    return `Every ${weeks} week${weeks === 1 ? '' : 's'}`
  }
  return `Every ${days} days`
}

// True if the reminder is due now or within the due window.
export function isDue(reminder: CareReminder): boolean {
  if (!reminder.nextReminderAt) return false
  const next = new Date(reminder.nextReminderAt).getTime()
  return next <= Date.now() + DUE_WINDOW_DAYS * 86400000
}

interface RawReminderRow {
  id: string
  service_name: string
  provider_id: string | null
  interval_days: number
  last_booked_at: string | null
  next_reminder_at: string | null
  is_active: boolean
}

const REMINDER_COLUMNS =
  'id, service_name, provider_id, interval_days, last_booked_at, next_reminder_at, is_active'

function mapReminder(r: RawReminderRow): CareReminder {
  return {
    id: r.id,
    serviceName: r.service_name,
    providerId: r.provider_id,
    intervalDays: r.interval_days,
    lastBookedAt: r.last_booked_at,
    nextReminderAt: r.next_reminder_at,
    isActive: r.is_active,
  }
}

// Active reminders for a client, soonest-due first.
export async function fetchActiveReminders(userId: string): Promise<CareReminder[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('care_reminders')
    .select(REMINDER_COLUMNS)
    .eq('client_user_id', userId)
    .eq('is_active', true)
    .order('next_reminder_at', { ascending: true, nullsFirst: false })
  if (error) {
    console.log('Care reminders error:', error)
    return []
  }
  return ((data as RawReminderRow[] | null) ?? []).map(mapReminder)
}

// The single soonest-due reminder for the client, or null if none is due.
// Used by the Discover rebook banner.
export async function fetchDueReminder(userId: string): Promise<CareReminder | null> {
  const active = await fetchActiveReminders(userId)
  const due = active.filter(isDue)
  return due[0] ?? null
}
