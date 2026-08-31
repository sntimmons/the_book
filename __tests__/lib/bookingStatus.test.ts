import {
  bookingTab,
  bookingStatusLabel,
  bookingStatusTone,
} from '@/lib/bookingStatus'

// Locks the "single source of truth" for booking status grouping (the reason
// lib/bookingStatus.ts exists — four screens previously disagreed) and the
// Batch 4A regression that `rescheduled` must stay active/upcoming.
describe('bookingTab', () => {
  it('keeps rescheduled active (upcoming) — Batch 4A regression', () => {
    expect(bookingTab('rescheduled')).toBe('upcoming')
  })

  it('maps accepted/arriving/checked_in to upcoming', () => {
    expect(bookingTab('accepted')).toBe('upcoming')
    expect(bookingTab('arriving')).toBe('upcoming')
    expect(bookingTab('checked_in')).toBe('upcoming')
  })

  it('maps completed and no_show to past', () => {
    expect(bookingTab('completed')).toBe('past')
    expect(bookingTab('no_show')).toBe('past')
  })

  it('maps declined and every cancel variant to cancelled', () => {
    for (const s of [
      'declined',
      'canceled',
      'cancelled',
      'cancelled_by_client',
      'cancelled_by_provider',
      'late_cancelled',
    ]) {
      expect(bookingTab(s)).toBe('cancelled')
    }
  })

  it('keeps pending in its own bucket', () => {
    expect(bookingTab('pending')).toBe('pending')
  })

  it('never lets an unknown status vanish — falls into cancelled', () => {
    expect(bookingTab('some_future_status')).toBe('cancelled')
    expect(bookingTab('')).toBe('cancelled')
  })
})

describe('label/tone consistency with the canonical grouping', () => {
  it('rescheduled reads as Confirmed / confirmed tone (mirrors upcoming)', () => {
    expect(bookingStatusLabel('rescheduled')).toBe('Confirmed')
    expect(bookingStatusTone('rescheduled')).toBe('confirmed')
  })

  it('accepted family shares the Confirmed label and confirmed tone', () => {
    for (const s of ['accepted', 'arriving', 'checked_in']) {
      expect(bookingStatusLabel(s)).toBe('Confirmed')
      expect(bookingStatusTone(s)).toBe('confirmed')
    }
  })

  it('completed is Completed / completed', () => {
    expect(bookingStatusLabel('completed')).toBe('Completed')
    expect(bookingStatusTone('completed')).toBe('completed')
  })

  it('no_show and cancel variants read as cancelled tone', () => {
    expect(bookingStatusTone('no_show')).toBe('cancelled')
    expect(bookingStatusTone('cancelled_by_provider')).toBe('cancelled')
    expect(bookingStatusLabel('no_show')).toBe('No show')
    expect(bookingStatusLabel('declined')).toBe('Declined')
  })
})
