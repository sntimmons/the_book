import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing Supabase server env vars' }, { status: 500 })
  }

  try {
    const supabase = createClient(url, key)
    const { data, error } = await supabase
      .from('shifts')
      .select('id, venue, shift_date, expected, actual')
      .order('shift_date', { ascending: false })

    if (error) {
      console.error('[GET /api/shifts] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ shifts: data })
  } catch (err) {
    console.error('[GET /api/shifts] unhandled exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing Supabase server env vars' }, { status: 500 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { venue, shift_date, expected, actual } = body

  if (!venue || !shift_date || expected === undefined || actual === undefined) {
    return NextResponse.json({ error: 'Missing required fields: venue, shift_date, expected, actual' }, { status: 400 })
  }

  try {
    const supabase = createClient(url, key)
    const { data, error } = await supabase
      .from('shifts')
      .insert([{
        venue: String(venue).trim(),
        shift_date,
        expected: Number(expected),
        actual: Number(actual),
      }])
      .select()
      .single()

    if (error) {
      console.error('[POST /api/shifts] insert error:', error.message, error.code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ shift: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/shifts] unhandled exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
