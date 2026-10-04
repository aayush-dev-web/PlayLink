import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase.js'
import { useAuth } from './AuthContext.jsx'
import Icon from '../components/Icon.jsx'
import DashboardHome from '../pages/DashboardHome.jsx'
import OwnerDashboard from '../pages/OwnerDashboard.jsx'

const allowedAccountTypes = new Set(['player', 'team_organizer', 'venue_owner'])

export default function AccountDashboardRoute({ ownerOnly = false }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [accountType, setAccountType] = useState('')
  const [profileComplete, setProfileComplete] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setAccountType('')
    setProfileComplete(true)

    async function loadAccountType() {
      if (authLoading) return
      if (!user) {
        setLoading(false)
        return
      }
      if (!supabase) {
        if (active) setError('Supabase is not configured. Set the project URL and publishable key, then reload.')
        if (active) setLoading(false)
        return
      }

      try {
        const { data, error: profileError } = await supabase.from('profiles')
          .select('account_type,onboarding_completed')
          .eq('id', user.id)
          .maybeSingle()
        if (profileError) throw profileError
        const role = data?.account_type || user.user_metadata?.account_type || 'player'
        if (!allowedAccountTypes.has(role)) throw new Error('This account has an unsupported PlayLink account type.')
        if (active) {
          setAccountType(role)
          setProfileComplete(data?.onboarding_completed !== false)
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Your account type could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadAccountType()
    return () => { active = false }
  }, [authLoading, user])

  if (authLoading || loading) return <div className="auth-loading" role="status">Loading your PlayLink workspace…</div>
  if (!user) return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (error) return <main className="owner-route-error"><span className="owner-route-error-icon"><Icon name="info" size={22} /></span><h1>Workspace unavailable</h1><p>{error}</p><p>Check your connection and confirm the PlayLink profile migration has been applied.</p></main>
  if (!profileComplete) return <Navigate to="/complete-google-profile" replace />
  if (ownerOnly && accountType !== 'venue_owner') return <Navigate to="/dashboard" replace />
  if (accountType === 'venue_owner') return <OwnerDashboard />
  if (ownerOnly) return <Navigate to="/dashboard" replace />
  return <DashboardHome />
}
