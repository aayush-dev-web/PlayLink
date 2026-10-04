import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'

const FAVORITES_CHANGED_EVENT = 'playlink-venue-favorites-changed'

export default function useVenueFavorites() {
  const { user } = useAuth()
  const userId = user?.id || ''
  const [favoriteIds, setFavoriteIds] = useState([])
  const [pendingIds, setPendingIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const favoriteIdsRef = useRef([])
  const pendingIdsRef = useRef(new Set())

  const publishFavorites = useCallback((ids) => {
    favoriteIdsRef.current = ids
    setFavoriteIds(ids)
  }, [])

  useEffect(() => {
    let active = true
    publishFavorites([])
    setError('')

    const onFavoritesChanged = (event) => {
      if (event.detail?.userId === userId && Array.isArray(event.detail.ids)) {
        publishFavorites(event.detail.ids)
      }
    }
    window.addEventListener(FAVORITES_CHANGED_EVENT, onFavoritesChanged)

    if (!user) {
      setLoading(false)
      return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, onFavoritesChanged)
    }

    setLoading(true)
    if (!supabase) {
      setError('Favorites are unavailable because the account database is not configured.')
      setLoading(false)
      return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, onFavoritesChanged)
    }

    supabase.from('venue_favorites').select('venue_id').eq('user_id', userId)
      .then(({ data, error: loadError }) => {
        if (!active) return
        if (loadError) {
          setError('Saved venues could not be loaded. Apply the venue favorites migration and try again.')
          return
        }
        publishFavorites((data || []).map((item) => String(item.venue_id)))
      })
      .catch(() => {
        if (active) setError('Saved venues could not be loaded. Check your connection and try again.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      window.removeEventListener(FAVORITES_CHANGED_EVENT, onFavoritesChanged)
    }
  }, [publishFavorites, user, userId])

  const toggleFavorite = useCallback(async (venueId) => {
    const id = String(venueId)
    if (pendingIdsRef.current.has(id)) return false
    if (!user) {
      setError('Sign in to save favorite venues.')
      return false
    }
    const shouldRemove = favoriteIdsRef.current.includes(id)
    pendingIdsRef.current.add(id)
    setPendingIds((current) => [...current, id])
    setError('')
    try {
      if (!supabase) throw new Error('Saved venues are unavailable because the account database is not configured.')
      const result = shouldRemove
        ? await supabase.from('venue_favorites').delete().eq('user_id', userId).eq('venue_id', id)
        : await supabase.from('venue_favorites').upsert({ user_id: userId, venue_id: id }, { onConflict: 'user_id,venue_id' })
      if (result.error) throw result.error
      const currentIds = favoriteIdsRef.current
      const nextIds = shouldRemove ? currentIds.filter((favoriteId) => favoriteId !== id) : currentIds.includes(id) ? currentIds : [...currentIds, id]
      publishFavorites(nextIds)
      window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: { userId, ids: nextIds } }))
      return true
    } catch {
      setError('Your favorite venue could not be updated. Please try again.')
      return false
    } finally {
      pendingIdsRef.current.delete(id)
      setPendingIds((current) => current.filter((pendingId) => pendingId !== id))
    }
  }, [publishFavorites, user, userId])

  return {
    favoriteIds,
    pendingIds,
    loading,
    error,
    isFavorite: (venueId) => favoriteIds.includes(String(venueId)),
    toggleFavorite,
  }
}
