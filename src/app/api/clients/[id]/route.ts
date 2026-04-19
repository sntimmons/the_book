import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing Supabase server env vars' }, { status: 500 })
  }

  const { id: clientId } = await params
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client id' }, { status: 400 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const notes = typeof body.notes === 'string' ? body.notes : null

  try {
    const supabase = createClient(url, key)
    const { data, error } = await supabase
      .from('clients')
      .update({ notes })
      .eq('id', clientId)
      .select()
      .single()

    if (error) {
      console.error('[PUT /api/clients/[id]] update error:', error.message, error.code)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ client: data })
  } catch (err) {
    console.error('[PUT /api/clients/[id]] unhandled exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
