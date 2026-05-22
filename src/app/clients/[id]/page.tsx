"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params?.id as string;
  const [client, setClient] = useState<{ name: string; notes: string | null } | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchClient() {
      setLoading(true);
      const { data, error } = await supabase
        .from("clients")
        .select("name, notes")
        .eq("id", clientId)
        .single();
      if (error || !data) {
        setClient(null);
      } else {
        setClient(data);
        setNotes(data.notes || "");
      }
      setLoading(false);
    }
    if (clientId) fetchClient();
  }, [clientId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save notes");
      } else {
        setSuccess("Notes saved");
      }
    } catch (err) {
      setError("Failed to save notes");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto p-4">Loading...</div>
    );
  }
  if (!client) {
    return (
      <div className="max-w-md mx-auto p-4">Client not found.</div>
    );
  } else {
    return (
      <div className="max-w-md mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">{client?.name || "Client"}</h1>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block mb-1 font-medium">Notes</label>
            <textarea
              className="w-full border rounded p-2 min-h-[100px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={saving}
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {success && <div className="text-green-600">{success}</div>}
          {error && <div className="text-red-600">{error}</div>}
        </form>
      </div>
    );
  }
}
