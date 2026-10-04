import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }
    let active = true

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setLoading(false)
    }).catch((sessionError) => {
      if (!active) return
      setError(sessionError instanceof Error ? sessionError.message : 'Could not read the Supabase session.')
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setError('')
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ session, user: session?.user ?? null, loading, error, configured: supabaseConfigured }), [session, loading, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider.')
  return value
}
