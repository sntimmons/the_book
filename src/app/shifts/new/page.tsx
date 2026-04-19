'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewShiftPage() {
  const router = useRouter()
  const [venue, setVenue] = useState('')
  const [shiftDate, setShiftDate] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue,
          shift_date: shiftDate,
          expected: Number(expected),
          actual: Number(actual),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Failed to save shift')
        setSaving(false)
        return
      }

      setSaving(false)
      router.push('/shifts')
    } catch (err) {
      console.error('[NewShift] fetch error:', err)
      setError('Network error — check console')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Add New Shift</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">Venue</label>
          <input
            className="w-full border rounded p-2"
            value={venue}
            onChange={e => setVenue(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Date</label>
          <input
            type="date"
            className="w-full border rounded p-2"
            value={shiftDate}
            onChange={e => setShiftDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Expected Payout ($)</label>
          <input
            type="number"
            min="0"
            className="w-full border rounded p-2"
            value={expected}
            onChange={e => setExpected(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Actual Payout ($)</label>
          <input
            type="number"
            min="0"
            className="w-full border rounded p-2"
            value={actual}
            onChange={e => setActual(e.target.value)}
            required
          />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button
          type="submit"
          className="w-full bg-black text-white py-2 rounded disabled:opacity-50"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Shift'}
        </button>
      </form>
    </div>
  )
}
