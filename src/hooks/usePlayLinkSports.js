import { useEffect, useState } from 'react'
import { supabase } from '../auth/supabase.js'

const baseSports = [
  { name: 'Futsal', slug: 'futsal' },
  { name: 'Cricket', slug: 'cricket' },
]

export default function usePlayLinkSports() {
  const [sports, setSports] = useState(baseSports)
  const [error, setError] = useState('')

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
          .select('name,slug')
          .order('name')
        if (!active) return
        if (loadError) {
          setError(`Sports could not be loaded: ${loadError.message}`)
          return
        }
        setSports(data || [])
        setError('')
      } catch (loadError) {
        if (active) setError(`Sports could not be loaded: ${loadError instanceof Error ? loadError.message : 'Unknown error'}`)
      }
    }
    loadSports()
    return () => { active = false }
  }, [])

  return { sports, error }
}
