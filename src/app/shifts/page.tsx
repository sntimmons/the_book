'use client'
import { useEffect, useState } from 'react'

type Shift = {
  id: string
  venue: string
  shift_date: string
  expected: number
  actual: number
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function ShiftsListPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchShifts() {
      const res = await fetch('/api/shifts')
      if (res.ok) {
        const json = await res.json()
        setShifts(json.shifts ?? [])
      }
      setLoading(false)
    }
    fetchShifts()
  }, [])

  if (loading) return <div className="max-w-2xl mx-auto p-4">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Shifts</h1>
        <a href="/shifts/new" className="bg-black text-white px-4 py-2 rounded text-sm font-semibold">
          Add Shift
        </a>
      </div>

      {shifts.length === 0 ? (
        <p className="text-zinc-400">No shifts yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shifts.map(shift => {
            const diff = shift.actual - shift.expected
            const diffColor = diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-zinc-500'
            return (
              <li key={shift.id} className="rounded-xl border p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{shift.venue}</span>
                  <span className="text-sm text-zinc-500">{shift.shift_date}</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span>Expected: {currency.format(shift.expected)}</span>
                  <span>Actual: {currency.format(shift.actual)}</span>
                  <span className={`font-semibold ${diffColor}`}>
                    {diff >= 0 ? '+' : ''}{currency.format(diff)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
