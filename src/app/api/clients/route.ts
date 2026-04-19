import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing Supabase server env vars' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = createClient(url, key)
    const { data, error } = await supabase
      .from('clients')
      .insert([{ name, notes }])
      .select()
      .single()

    if (error) {
      console.error('[POST /api/clients] insert error:', error.message, error.code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ client: data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/clients] unhandled exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
