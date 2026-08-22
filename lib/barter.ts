import { supabase } from './supabase'
import { fetchProviderInfoMap, CommunityProviderInfo } from './community'

// Barter data layer. Providers trade services without cash: an owner posts an
// offer (offering X, seeking Y), other providers express interest, and on accept
// both are connected through the existing messaging system. Provider display
// info is batch-fetched by provider_id (same pattern as the community feed).

export interface BarterOffer {
  id: string
  providerId: string
  userId: string
  offeringService: string
  seekingService: string
  offeringValue: number | null
  notes: string | null
  isActive: boolean
  createdAt: string
}

export interface BarterInterest {
  id: string
  offerId: string
  interestedProviderId: string
  interestedUserId: string
  message: string | null
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
  provider: CommunityProviderInfo
}

export interface BarterOfferWithProvider extends BarterOffer {
  provider: CommunityProviderInfo
  interestCount: number
}

interface RawOfferRow {
  id: string
  provider_id: string
  user_id: string
  offering_service: string
  seeking_service: string
  offering_value: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

const OFFER_COLUMNS =
  'id, provider_id, user_id, offering_service, seeking_service, offering_value, notes, is_active, created_at'

// Active offers newest-first, each with provider display info and a count of
// how many providers have expressed interest.
export async function fetchBarterFeed(): Promise<BarterOfferWithProvider[]> {
  const { data, error } = await supabase
    .from('barter_offers')
    .select(OFFER_COLUMNS)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.log('Barter feed error:', error)
    return []
  }
  const rows = (data as RawOfferRow[] | null) ?? []
  if (rows.length === 0) return []

  const offerIds = rows.map((r) => r.id)
  const [infoMap, countMap] = await Promise.all([
    fetchProviderInfoMap(rows.map((r) => r.provider_id)),
    fetchInterestCounts(offerIds),
  ])

  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    userId: r.user_id,
    offeringService: r.offering_service,
    seekingService: r.seeking_service,
    offeringValue: r.offering_value,
    notes: r.notes,
    isActive: r.is_active,
    createdAt: r.created_at,
    provider: infoMap.get(r.provider_id) ?? {
      name: 'Provider',
      photo: null,
      category: '',
      neighborhood: null,
    },
    interestCount: countMap.get(r.id) ?? 0,
  }))
}

// Interest counts keyed by offer_id for the given offers.
async function fetchInterestCounts(offerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (offerIds.length === 0) return map
  const { data } = await supabase
    .from('barter_interests')
    .select('offer_id')
    .in('offer_id', offerIds)
  for (const r of (data as { offer_id: string }[] | null) ?? []) {
    map.set(r.offer_id, (map.get(r.offer_id) ?? 0) + 1)
  }
  return map
}

// Which offer ids the current user has already expressed interest in.
export async function fetchMyInterests(userId: string): Promise<Set<string>> {
  if (!userId) return new Set()
  const { data } = await supabase
    .from('barter_interests')
    .select('offer_id')
    .eq('interested_user_id', userId)
  return new Set(((data as { offer_id: string }[] | null) ?? []).map((r) => r.offer_id))
}

// Interests on a specific offer with provider info, for the owner's review view.
// Only pending interests are actionable, but all are returned so the owner sees
// history; the screen filters as needed.
export async function fetchOfferInterests(offerId: string): Promise<BarterInterest[]> {
  const { data, error } = await supabase
    .from('barter_interests')
    .select('id, offer_id, interested_provider_id, interested_user_id, message, status, created_at')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.log('Offer interests error:', error)
    return []
  }
  const rows =
    (data as
      | {
          id: string
          offer_id: string
          interested_provider_id: string
          interested_user_id: string
          message: string | null
          status: 'pending' | 'accepted' | 'declined'
          created_at: string
        }[]
      | null) ?? []
  const infoMap = await fetchProviderInfoMap(rows.map((r) => r.interested_provider_id))
  return rows.map((r) => ({
    id: r.id,
    offerId: r.offer_id,
    interestedProviderId: r.interested_provider_id,
    interestedUserId: r.interested_user_id,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    provider: infoMap.get(r.interested_provider_id) ?? {
      name: 'Provider',
      photo: null,
      category: '',
      neighborhood: null,
    },
  }))
}
