import { supabase } from './supabase'

// Contracts data layer. A provider has at most one active contract (unique on
// provider_id); clients sign it per booking (one contract_signatures row per
// booking). Signature images live in the private contract-signatures bucket —
// for now signatures are placeholders with a null signature_url.

export interface Contract {
  id: string
  providerId: string
  userId: string
  title: string
  body: string
  isActive: boolean
  createdAt: string
  updatedAt: string | null
}

export interface ContractSignature {
  id: string
  contractId: string
  bookingId: string
  clientUserId: string
  signatureUrl: string | null
  signedAt: string | null
  status: 'pending' | 'signed' | 'declined'
}

// A signed contract enriched for the provider's list view.
export interface SignedContractRow {
  signature: ContractSignature
  clientName: string
  bookingDate: string | null
  serviceName: string | null
}

// A signed contract enriched for the read-only viewer.
export interface SignedContractDetail {
  signature: ContractSignature
  contract: Contract | null
  clientName: string
  providerName: string
}

interface RawContractRow {
  id: string
  provider_id: string
  user_id: string
  title: string
  body: string
  is_active: boolean
  created_at: string
  updated_at: string | null
}

interface RawSignatureRow {
  id: string
  contract_id: string
  booking_id: string
  client_user_id: string
  signature_url: string | null
  signed_at: string | null
  status: 'pending' | 'signed' | 'declined'
}

const CONTRACT_COLUMNS =
  'id, provider_id, user_id, title, body, is_active, created_at, updated_at'
const SIGNATURE_COLUMNS =
  'id, contract_id, booking_id, client_user_id, signature_url, signed_at, status'

function mapContract(r: RawContractRow): Contract {
  return {
    id: r.id,
    providerId: r.provider_id,
    userId: r.user_id,
    title: r.title,
    body: r.body,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapSignature(r: RawSignatureRow): ContractSignature {
  return {
    id: r.id,
    contractId: r.contract_id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    signatureUrl: r.signature_url,
    signedAt: r.signed_at,
    status: r.status,
  }
}

// The provider's active contract, or null if they have not created one.
export async function fetchProviderContract(providerId: string): Promise<Contract | null> {
  if (!providerId) return null
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) {
    if (error) console.log('Fetch provider contract error:', error)
    return null
  }
  return mapContract(data as RawContractRow)
}

// The signature row for a booking, or null if not yet signed.
export async function fetchContractSignature(
  bookingId: string,
): Promise<ContractSignature | null> {
  if (!bookingId) return null
  const { data, error } = await supabase
    .from('contract_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.log('Fetch contract signature error:', error)
    return null
  }
  return mapSignature(data as RawSignatureRow)
}

// Recent signed contracts for a provider (client name + booking date), newest
// first. Empty if the provider has no contract.
export async function fetchProviderSignatures(
  providerId: string,
): Promise<SignedContractRow[]> {
  const contract = await fetchProviderContract(providerId)
  if (!contract) return []

  const { data, error } = await supabase
    .from('contract_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('contract_id', contract.id)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(10)
  if (error) {
    console.log('Fetch provider signatures error:', error)
    return []
  }
  const sigs = ((data as RawSignatureRow[] | null) ?? []).map(mapSignature)
  if (sigs.length === 0) return []

  const bookingIds = Array.from(new Set(sigs.map((s) => s.bookingId).filter(Boolean)))
  const clientIds = Array.from(new Set(sigs.map((s) => s.clientUserId).filter(Boolean)))

  const bookingMap = new Map<string, { date: string | null; service: string | null }>()
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, requested_date, service_name')
      .in('id', bookingIds)
    for (const b of (bookings as
      | { id: string; requested_date: string | null; service_name: string | null }[]
      | null) ?? []) {
      bookingMap.set(b.id, { date: b.requested_date, service: b.service_name })
    }
  }

  const clientMap = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', clientIds)
    for (const c of (clients as { id: string; name: string | null }[] | null) ?? []) {
      clientMap.set(c.id, c.name || 'Client')
    }
  }

  return sigs.map((s) => ({
    signature: s,
    clientName: clientMap.get(s.clientUserId) ?? 'Client',
    bookingDate: bookingMap.get(s.bookingId)?.date ?? null,
    serviceName: bookingMap.get(s.bookingId)?.service ?? null,
  }))
}

// A single signed contract with its contract text, client, and provider, for
// the read-only viewer. `signatureId` is a contract_signatures.id.
export async function fetchSignedContract(
  signatureId: string,
): Promise<SignedContractDetail | null> {
  if (!signatureId) return null
  const { data, error } = await supabase
    .from('contract_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('id', signatureId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.log('Fetch signed contract error:', error)
    return null
  }
  const signature = mapSignature(data as RawSignatureRow)

  const { data: contractData } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('id', signature.contractId)
    .maybeSingle()
  const contract = contractData ? mapContract(contractData as RawContractRow) : null

  let clientName = 'Client'
  if (signature.clientUserId) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', signature.clientUserId)
      .maybeSingle()
    clientName = (client as { name: string | null } | null)?.name || 'Client'
  }

  let providerName = 'Provider'
  if (contract?.providerId) {
    const { data: provider } = await supabase
      .from('providers')
      .select('display_name')
      .eq('id', contract.providerId)
      .maybeSingle()
    providerName = (provider as { display_name: string | null } | null)?.display_name || 'Provider'
  }

  return { signature, contract, clientName, providerName }
}
