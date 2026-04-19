'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddClientPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);
    setError("");
    console.log('[AddClient] submitting to /api/clients')

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), notes: notes.trim() }),
      })

      console.log('[AddClient] response status:', res.status)
      const json = await res.json()
      console.log('[AddClient] response body:', json)

      if (!res.ok) {
        setError(json.error || 'Failed to add client')
        setLoading(false)
        return
      }

      setLoading(false)
      router.push('/clients')
    } catch (err) {
      console.error('[AddClient] fetch threw:', err)
      setError('Network error — check console')
      setLoading(false)
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Add Client</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">Name<span className="text-red-500">*</span></label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Notes</label>
          <textarea
            className="w-full border rounded px-3 py-2"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <button
          type="submit"
          className="w-full bg-black text-white py-2 rounded disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Adding..." : "Add Client"}
        </button>
      </form>
    </div>
  );
}
