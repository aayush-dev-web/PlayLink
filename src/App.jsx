import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Venues from './pages/Venues.jsx'
import FavoriteVenues from './pages/FavoriteVenues.jsx'
import NearbyVenues from './pages/NearbyVenues.jsx'
import Events from './pages/Events.jsx'
import EventDetails from './pages/EventDetails.jsx'
import Community from './pages/Community.jsx'
import Placeholder from './pages/Placeholder.jsx'
import DashboardProfile from './pages/DashboardProfile.jsx'
import Messages from './pages/Messages.jsx'
import Settings from './pages/Settings.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import AuthPage from './auth/AuthPage.jsx'
import AccountDashboardRoute from './auth/AccountDashboardRoute.jsx'
import DashboardHome from './pages/DashboardHome.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import { isDesignatedAdmin } from './auth/adminAccess.js'
import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './auth/supabase.js'
import RestrictedAccountInbox from './components/RestrictedAccountInbox.jsx'
import LiveScoresPage from './pages/LiveScoresPage.jsx'
import Terms from './pages/Terms.jsx'

export default function App() {
  const location = useLocation()
  const path = location.pathname.replace(/\/$/, '') || '/'
  const { user, loading } = useAuth()
  const [restriction, setRestriction] = useState({ userId: '', loading: false, data: null, error: '' })
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    if (!user || user.id === 'playlink-local-demo') {
      setRestriction({ userId: user?.id || '', loading: false, data: null, error: '' })
      return undefined
    }
    let active = true
    async function checkRestriction() {
      if (!supabase) {
        if (active) setRestriction({ userId: user.id, loading: false, data: null, error: 'Account status cannot be checked without a Supabase connection.' })
        return
      }
      try {
        const { data, error } = await supabase.rpc('get_my_playlink_restriction')
        if (!active) return
        if (error && ['PGRST202', '42883'].includes(error.code)) {
          setRestriction({ userId: user.id, loading: false, data: { restricted: false }, error: '' })
          return
        }
        setRestriction(error
          ? { userId: user.id, loading: false, data: null, error: 'Account status could not be checked. Apply the PlayLink reports migration, then retry.' }
          : { userId: user.id, loading: false, data, error: '' })
      } catch {
        if (active) setRestriction({ userId: user.id, loading: false, data: null, error: 'Account status could not be checked because the server could not be reached. Retry when PlayLink is online.' })
      }
    }
    setRestriction((current) => ({ userId: user.id, loading: current.userId !== user.id || !current.data, data: current.userId === user.id ? current.data : null, error: '' }))
    checkRestriction()
    const timer = window.setInterval(checkRestriction, 60000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [user])

  if (user && user.id !== 'playlink-local-demo' && restriction.userId !== user.id) {
    return <div className="auth-loading" role="status">Checking your PlayLink account…</div>
  }
  if (user && user.id !== 'playlink-local-demo' && restriction.loading) {
    return <div className="auth-loading" role="status">Checking your PlayLink account…</div>
  }
  if (user && user.id !== 'playlink-local-demo' && restriction.error) {
    return <main className="account-restriction-screen"><h1>Account status unavailable</h1><p>{restriction.error}</p><button type="button" onClick={() => window.location.reload()}>Retry</button></main>
  }
  if (user && restriction.data?.restricted) {
    const until = restriction.data.permanent
      ? 'This account has been permanently suspended.'
      : `Account access is restricted until ${new Date(restriction.data.banned_until).toLocaleString()}.`
    return <main className="account-restriction-screen"><span className="dashboard-kicker">PLAYLINK ACCOUNT REVIEW</span><h1>Account restricted</h1><p>{until}</p><p>You can still review your PlayLink Team messages and contact the team about this decision.</p><RestrictedAccountInbox userId={user.id} /><button type="button" onClick={async () => {
      setSignOutError('')
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) setSignOutError(error.message)
      else window.location.assign('/sign-in')
    }}>Sign out</button>{signOutError && <p role="alert">{signOutError}</p>}</main>
  }
  const requiresAccount = path === '/favorite-venues'
    || path === '/messages'
    || path === '/settings'
    || path === '/profile'
    || path === '/notifications'
    || path === '/list-venue'
  if (requiresAccount && !user) {
    if (loading) return <div className="auth-loading" role="status">Loading PlayLink…</div>
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  if (path === '/') {
    if (loading) return <div className="auth-loading" role="status">Loading PlayLink…</div>
    return user
      ? <Navigate to={isDesignatedAdmin(user) ? '/admin' : '/dashboard'} replace />
      : <DashboardHome />
  }
  if (path === '/venues') return <Venues />
  if (path === '/favorite-venues') return <FavoriteVenues />
  if (path === '/nearby') return <NearbyVenues />
  if (path === '/events') return <Events />
  const eventDetailMatch = path.match(/^\/events\/([0-9a-f-]+)$/i)
  if (eventDetailMatch) return <EventDetails eventId={eventDetailMatch[1]} key={eventDetailMatch[1]} />
  if (path === '/community' || path === '/teams') return <Community mode="teams" />
  if (path === '/players') return <Community mode="players" />
  if (path === '/messages') return <Messages />
  if (path === '/settings') return <Settings />
  if (path === '/live-scores') {
    if (loading) return <div className="auth-loading" role="status">Connecting to your account…</div>
    return <LiveScoresPage backHref={user && isDesignatedAdmin(user) ? '/admin' : undefined} />
  }
  if (path === '/sign-in') return <AuthPage key="login" mode="login" />
  if (path === '/get-started' || path === '/sign-up') return <AuthPage key="signup" mode="signup" />
  if (path === '/terms') return <Terms />
  if (path === '/complete-google-profile') return <AuthPage key="google-complete" mode="google-complete" />
  if (path === '/forgot-password') return <AuthPage key="forgot" mode="forgot" />
  if (path === '/reset-password') return <AuthPage key="reset" mode="reset" />
  if (path === '/admin') return <AdminDashboard />
  if (path === '/owner' || path.startsWith('/owner/')) return <AccountDashboardRoute ownerOnly />
  if (path === '/dashboard') {
    if (loading) return <div className="auth-loading" role="status">Connecting to your account…</div>
    if (user && isDesignatedAdmin(user)) return <Navigate to="/admin" replace />
    return user ? <AccountDashboardRoute /> : <DashboardHome />
  }
  if (path === '/profile') {
    if (loading) return <div className="auth-loading" role="status">Connecting to your account…</div>
    return user ? <DashboardProfile /> : <Navigate to="/sign-in?next=/profile" replace />
  }
  if (path === '/notifications') {
    if (loading) return <div className="auth-loading" role="status">Connecting to your account…</div>
    return user ? <Navigate to="/dashboard?notifications=1" replace /> : <Navigate to="/sign-in?next=/notifications" replace />
  }
  const pages = {
    '/list-venue': <Placeholder kind="list-venue" />,
  }
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header path={path} />
      <main id="main-content">{pages[path] || <Placeholder kind="not-found" />}</main>
      <Footer />
    </>
  )
}
