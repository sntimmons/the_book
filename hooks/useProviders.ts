import { useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'

export interface Provider {
  id: string
  user_id: string
  display_name: string
  username: string
  category_id: number | null
  bio: string | null
  location: string | null
  neighborhood: string | null
  profile_photo_url: string | null
  cover_image_url: string | null
  rating: number | null
  average_rating: number | null
  review_count: number | null
  total_bookings: number | null
  repeat_client_rate: number | null
  follower_count: number | null
  next_available: string | null
  is_trending: boolean
  is_featured: boolean
  is_demo: boolean
  identity_verified: boolean
  years_experience: number | null
  specialties: string[] | null
  created_at: string | null
  // Best portfolio photo, resolved from the posts table after the provider
  // fetch. Used as the Discover card image in preference to profile_photo_url.
  heroImage?: string
}

export interface Service {
  id: string
  provider_id: string
  name: string
  description: string | null
  price: number
  duration_minutes: number
  is_active: boolean
}

export interface Category {
  id: number
  name: string
  slug: string
}

// Public-safe provider columns. Never select('*') on providers in public-facing
// queries: the table also holds stripe_* payment fields, verification_notes /
// verification_status, business_verified, no_show_count / late_count, and
// payment/deposit config — none of which should reach another user's device.
// (The provider's OWN dashboard queries its own row and can read more.)
const PUBLIC_PROVIDER_FIELDS = [
  'id',
  'user_id',
  'display_name',
  'username',
  'category_id',
  'bio',
  'location',
  'neighborhood',
  'profile_photo_url',
  'cover_image_url',
  'rating',
  'average_rating',
  'review_count',
  'total_bookings',
  'repeat_client_rate',
  'follower_count',
  'next_available',
  'is_trending',
  'is_featured',
  'is_demo',
  'identity_verified',
  'years_experience',
  'specialties',
  'created_at',
].join(', ')

export async function getLiveCount(): Promise<number> {
  const { count } = await supabase
    .from('providers')
    .select('id', { count: 'exact', head: true })
    .eq('is_approved', true)
  return count || 0
}

export async function getTodayBookingCount(): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', today.toISOString())
  return count || 0
}

// Attach each provider's hero portfolio photo (lowest sort_order image) in a
// single batch query, avoiding an N+1 per-card lookup. Providers without a
// portfolio photo are left with heroImage undefined so the card falls back to
// profile_photo_url, then the silhouette placeholder.
async function attachHeroImages(list: Provider[]): Promise<Provider[]> {
  if (list.length === 0) return list

  const providerIds = list.map((p) => p.id)
  const { data, error } = await supabase
    .from('posts')
    .select('provider_id, media_url')
    .eq('media_type', 'image')
    .eq('content_type', 'portfolio')
    .eq('is_active', true)
    .eq('is_demo', false)
    .in('provider_id', providerIds)
    .order('sort_order', { ascending: true })

  if (error) {
    // Non-fatal: fall back to profile photos rather than failing the feed.
    console.log('Fetch hero images error:', error)
    return list
  }

  // First row seen per provider wins. Rows arrive ordered by sort_order asc, so
  // the first occurrence for a provider is its lowest-sort_order photo.
  const heroByProvider = new Map<string, string>()
  for (const row of (data as { provider_id: string; media_url: string }[]) ?? []) {
    if (!heroByProvider.has(row.provider_id)) {
      heroByProvider.set(row.provider_id, row.media_url)
    }
  }

  return list.map((p) => ({ ...p, heroImage: heroByProvider.get(p.id) }))
}

// Pagination is OPT-IN via `pageSize`: pass a page size (Discover passes 20) to
// page through providers with fetchMore(); omit it (nearby / top-rated / the
// search strip) to load the full list in one shot, exactly as before.
export function useProviders(categoryId?: number, pageSize?: number) {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      try {
        if (replace) setLoading(true)
        else setLoadingMore(true)

        let query = supabase
          .from('providers')
          .select(PUBLIC_PROVIDER_FIELDS)
          .eq('is_approved', true)
          .order('is_featured', { ascending: false })
          .order('average_rating', { ascending: false, nullsFirst: false })
          // Stable tiebreaker so offset pagination can't duplicate/skip rows
          // when is_featured/average_rating tie.
          .order('id', { ascending: true })

        if (categoryId) {
          query = query.eq('category_id', categoryId)
        }
        if (pageSize != null) {
          query = query.range(offset, offset + pageSize - 1)
        }

        const { data, error } = await query
        if (error) throw error
        // Cast through unknown: a runtime-string select() makes supabase-js
        // infer GenericStringError instead of our row shape.
        const page = await attachHeroImages((data as unknown as Provider[]) || [])
        setHasMore(pageSize != null && page.length === pageSize)
        setProviders((prev) => (replace ? page : [...prev, ...page]))
      } catch (err: any) {
        setError(err.message)
        console.log('Fetch providers error:', err)
      } finally {
        if (replace) setLoading(false)
        else setLoadingMore(false)
      }
    },
    [categoryId, pageSize],
  )

  // Re-fetch (from page 0) on every focus and on category change so an edited
  // provider's updated photo/details appear after returning to the feed.
  useFocusEffect(
    useCallback(() => {
      fetchPage(0, true)
    }, [fetchPage]),
  )

  const fetchMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    fetchPage(providers.length, false)
  }, [loading, loadingMore, hasMore, providers.length, fetchPage])

  return {
    providers,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchMore,
    refetch: () => fetchPage(0, true),
  }
}

export function useProvider(providerId: string) {
  const [provider, setProvider] = useState<Provider | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  // Re-fetch on focus so edits show when returning to this profile (e.g. after
  // popping an edit screen pushed on top), not just on the first mount.
  useFocusEffect(
    useCallback(() => {
      if (!providerId) return
      fetchProvider()
    }, [providerId]),
  )

  const fetchProvider = async () => {
    try {
      setLoading(true)

      const [providerRes, servicesRes] = await Promise.all([
        supabase.from('providers').select(PUBLIC_PROVIDER_FIELDS).eq('id', providerId).single(),
        supabase
          .from('provider_services')
          .select('*')
          .eq('provider_id', providerId)
          .eq('is_active', true)
          .order('price', { ascending: true }),
      ])

      if (providerRes.error) throw providerRes.error

      setProvider(providerRes.data as unknown as Provider)
      setServices((servicesRes.data as Service[]) || [])
    } catch (err: any) {
      console.log('Fetch provider error:', err)
    } finally {
      setLoading(false)
    }
  }

  return { provider, services, loading, refetch: fetchProvider }
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      setCategories((data as Category[]) || [])
    } catch (err: any) {
      console.log('Fetch categories error:', err)
    } finally {
      setLoading(false)
    }
  }

  return { categories, loading }
}

export function useProviderSearch(
  query: string,
  categoryId?: number,
  filters?: {
    availableToday?: boolean
    minRating?: number
    mobileOnly?: boolean
  },
) {
  const [results, setResults] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)

  // `filters` is passed as an inline object literal from the caller, so its
  // reference changes on every render. Depending on the object directly made
  // this effect re-run each render (-> setState -> render -> repeat), which is
  // the "Maximum update depth exceeded" loop. Key the work off the primitive
  // values the search actually uses instead, via a stable useCallback.
  const minRating = filters?.minRating

  const searchProviders = useCallback(async () => {
    try {
      setLoading(true)

      let dbQuery = supabase
        .from('providers')
        .select(PUBLIC_PROVIDER_FIELDS)
        .eq('is_approved', true)

      if (query.length >= 2) {
        // Sanitize for the PostgREST .or() filter grammar (commas/parens/%/*).
        const term = query.replace(/[(),%*]/g, ' ').trim()

        // Also match providers by category name, so "lash" surfaces Lashes
        // providers even when the word isn't in their name/bio/neighborhood.
        const { data: cats } = await supabase
          .from('categories')
          .select('id')
          .ilike('name', `%${term}%`)
        const catIds = ((cats as { id: number }[] | null) ?? []).map((c) => c.id)

        const orParts = [
          `display_name.ilike.%${term}%`,
          `bio.ilike.%${term}%`,
          `location.ilike.%${term}%`,
          `neighborhood.ilike.%${term}%`,
        ]
        if (catIds.length > 0) {
          orParts.push(`category_id.in.(${catIds.join(',')})`)
        }
        dbQuery = dbQuery.or(orParts.join(','))
      }

      if (categoryId) {
        dbQuery = dbQuery.eq('category_id', categoryId)
      }

      if (minRating) {
        dbQuery = dbQuery.gte('rating', minRating)
      }

      dbQuery = dbQuery.order('rating', { ascending: false }).limit(20)

      const { data, error } = await dbQuery
      if (error) throw error
      setResults((data as unknown as Provider[]) || [])
    } catch (err: any) {
      console.log('Search error:', err)
    } finally {
      setLoading(false)
    }
  }, [query, categoryId, minRating])

  useEffect(() => {
    if (query.length < 2 && !categoryId) {
      setResults([])
      return
    }
    searchProviders()
  }, [query, categoryId, searchProviders])

  return { results, loading }
}

// A post surfaced by content search, flattened with the provider info needed
// to display it and navigate to their profile.
export interface ContentSearchPost {
  id: string
  media_url: string
  media_type: string
  thumbnail_url: string | null
  provider_id: string
  provider_name: string
}

interface RawContentRow {
  id: string
  media_url: string
  media_type: string
  thumbnail_url: string | null
  provider_id: string | null
  provider: { id: string; display_name: string } | null
}

// Content (posts) search. Matches on the post's own caption/service_type via
// ilike AND on the provider's category (so "lash" surfaces Lashes providers'
// work). The category path is currently the primary signal because seeded
// posts have no captions/tags yet. Caller passes an already-debounced query.
export function useContentSearch(query: string) {
  const [posts, setPosts] = useState<ContentSearchPost[]>([])
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    try {
      setLoading(true)
      // Sanitize for the PostgREST .or() filter grammar (commas/parens/%/*).
      const term = query.replace(/[(),%*]/g, ' ').trim()
      if (term.length < 2) {
        setPosts([])
        return
      }

      // Categories whose name matches, so content also surfaces by the
      // provider's category (e.g. "lash" -> the Lashes category -> its posts).
      const { data: cats } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', `%${term}%`)
      const catIds = ((cats as { id: number }[] | null) ?? []).map((c) => c.id)

      const textSelect =
        'id, media_url, media_type, thumbnail_url, provider_id, provider:providers(id, display_name)'
      const catSelect =
        'id, media_url, media_type, thumbnail_url, provider_id, provider:providers!inner(id, display_name)'

      // Two queries merged: base-column text match, and (when the query names a
      // category) posts whose provider is in that category. Kept separate
      // because PostgREST can't OR a base column against an embedded one.
      const queries: any[] = [
        supabase
          .from('posts')
          .select(textSelect)
          .eq('is_active', true)
          .eq('is_demo', false)
          .or(`caption.ilike.%${term}%,service_type.ilike.%${term}%`)
          .order('created_at', { ascending: false })
          .limit(30),
      ]
      if (catIds.length > 0) {
        queries.push(
          supabase
            .from('posts')
            .select(catSelect)
            .eq('is_active', true)
            .eq('is_demo', false)
            .in('provider.category_id', catIds)
            .order('created_at', { ascending: false })
            .limit(30),
        )
      }

      const settled = await Promise.all(queries)

      const seen = new Set<string>()
      const merged: ContentSearchPost[] = []
      for (const res of settled) {
        if (res.error) {
          console.log('Content search query error:', res.error)
          continue
        }
        for (const r of (res.data as unknown as RawContentRow[]) ?? []) {
          if (!r.provider || !r.media_url || seen.has(r.id)) continue
          seen.add(r.id)
          merged.push({
            id: r.id,
            media_url: r.media_url,
            media_type: r.media_type,
            thumbnail_url: r.thumbnail_url,
            provider_id: r.provider_id ?? r.provider.id,
            provider_name: r.provider.display_name,
          })
        }
      }
      setPosts(merged.slice(0, 30))
    } catch (err) {
      console.log('Content search error:', err)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (query.trim().length < 2) {
      setPosts([])
      return
    }
    run()
  }, [query, run])

  return { posts, loading }
}
