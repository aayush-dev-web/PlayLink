import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../auth/supabase.js'

const baseGameSports = [
  { name: 'Football', slug: 'football', is_game: true },
  { name: 'Cricket', slug: 'cricket', is_game: true },
]

const baseVenueSports = [
  { name: 'Futsal', slug: 'futsal', is_game: false },
  { name: 'Cricket', slug: 'cricket', is_game: true },
]
const supportedVenueSportSlugs = new Set(['cricket', 'futsal'])

export default function usePlayLinkSports() {
  const [sports, setSports] = useState(baseGameSports)
  const [venueSports, setVenueSports] = useState(baseVenueSports)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    async function loadSports() {
      if (!supabase) {
        if (active) setError('Sports could not be loaded because Supabase is not configured.')
        return
      }
      try {
        const { data, error: loadError } = await supabase
          .from('playlink_sports')
          .select('name,slug,is_game')
          .order('name')
        if (!active) return
        if (loadError) {
          setError(`Sports could not be loaded: ${loadError.message}`)
          return
        }
        setSports((data || []).filter((sport) => sport.is_game))
        setVenueSports((data || []).filter((sport) => supportedVenueSportSlugs.has(sport.slug)))
        setError('')
      } catch (loadError) {
        if (active) setError(`Sports could not be loaded: ${loadError instanceof Error ? loadError.message : 'Unknown error'}`)
      }
    }
    loadSports()
    return () => { active = false }
  }, [refreshKey])

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), [])
  return { sports, venueSports, error, refresh }
}
