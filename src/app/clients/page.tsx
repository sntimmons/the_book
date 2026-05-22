'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  name: string
  notes: string | null
  created_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchClients() {
      const { data } = await supabase
        .from('clients')
        .select('id, name, notes, created_at')
        .order('created_at', { ascending: false })

      setClients(data ?? [])
      setLoading(false)
    }

    fetchClients()
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-black text-white">
        <h1 className="text-2xl font-bold mb-6">Your Regulars</h1>
        <p className="text-zinc-400">Loading...</p>
      </main>
    )
  }

    return (
      <main className="min-h-screen p-6 bg-black text-white">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Your Regulars</h1>
          <a
            href="/clients/new"
            className="bg-white text-black px-4 py-2 rounded font-semibold text-sm hover:bg-zinc-200 transition"
          >
            Add Client
          </a>
        </div>

        {clients.length === 0 ? (
          <p className="text-zinc-400">No clients yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {clients.map((client) => (
              <li key={client.id}>
                <a
                  href={`/clients/${client.id}`}
                  className="block rounded-xl bg-zinc-900 p-4 border border-zinc-800 hover:bg-zinc-800 transition"
                >
                  <p className="font-semibold text-lg">{client.name}</p>
                  {client.notes && (
                    <p className="text-zinc-400 text-sm mt-1">{client.notes}</p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    )
}
