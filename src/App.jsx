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
import { useAuth } from './auth/AuthContext.jsx'
import { Navigate, useLocation } from 'react-router-dom'

export default function App() {
  const location = useLocation()
  const path = location.pathname.replace(/\/$/, '') || '/'
  const { user, loading } = useAuth()
  if (path === '/') {
    if (loading) return <div className="auth-loading" role="status">Loading PlayLink…</div>
    return <Navigate to={user ? '/dashboard' : '/sign-in'} replace />
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
  if (path === '/sign-in') return <AuthPage mode="login" />
  if (path === '/get-started' || path === '/sign-up') return <AuthPage mode="signup" />
  if (path === '/complete-google-profile') return <AuthPage mode="google-complete" />
  if (path === '/forgot-password') return <AuthPage mode="forgot" />
  if (path === '/reset-password') return <AuthPage mode="reset" />
  if (path === '/admin') return <AdminDashboard />
  if (path === '/owner' || path.startsWith('/owner/')) return <AccountDashboardRoute ownerOnly />
  if (path === '/dashboard') {
    if (loading) return <div className="auth-loading" role="status">Connecting to your account…</div>
    const callbackParams = new URLSearchParams({ next: '/dashboard' })
    const oauthError = new URLSearchParams(location.search).get('error_description')
    if (oauthError) callbackParams.set('oauth_error', oauthError)
    return user ? <AccountDashboardRoute /> : <Navigate to={`/sign-in?${callbackParams.toString()}`} replace />
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
