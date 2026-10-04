import Brand from './Brand.jsx'
import Icon from './Icon.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'
import useVenueFavorites from '../hooks/useVenueFavorites.js'
import { isCoordinateLabel, reverseGeocodeLocation, visibleLocationName } from '../utils/locationName.js'
import useActivityNotifications from '../hooks/useActivityNotifications.js'

const PROFILE_EVENT = 'playlink-profile-updated'
const locationStorageKey = (userId) => `playlink-saved-location-${userId}`
const navigation = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/venues', label: 'Venues', icon: 'venue' },
  { href: '/favorite-venues', label: 'Favorite venues', icon: 'heart' },
  { href: '/events', label: 'Events', icon: 'calendar' },
  { href: '/teams', label: 'Teams', icon: 'teams' },
  { href: '/players', label: 'Players', icon: 'player' },
]

const accountNavigation = [
  { href: '/messages', label: 'Messages', icon: 'message' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export default function DashboardShell({ path, search, onSearch, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [profile, setProfile] = useState(null)
  const [openPanel, setOpenPanel] = useState('')
  const [location, setLocation] = useState(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const [notifications, setNotifications] = useState([])
  const [notificationsBusy, setNotificationsBusy] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const { user } = useAuth()
  const { favoriteIds } = useVenueFavorites()
  const routeLocation = useLocation()
  const activity = useActivityNotifications({ user, role: 'player', path, notificationOpen: openPanel === 'notifications' })
  const displayName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest player'
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url

  useEffect(() => {
    if (new URLSearchParams(routeLocation.search).get('notifications') === '1') {
      setOpenPanel('notifications')
    }
  }, [routeLocation.search])

  useEffect(() => {
    function handleDashboardKeys(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector('.dashboard-search input')?.focus()
      }
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', handleDashboardKeys)
    return () => window.removeEventListener('keydown', handleDashboardKeys)
  }, [])

  useEffect(() => {
    let active = true
    setProfile(null)
    setLocation(null)
    if (!user) return undefined
    const onProfileUpdate = (event) => {
      if (!active) return
      setProfile(event.detail)
      if (Number.isFinite(event.detail?.home_latitude) && Number.isFinite(event.detail?.home_longitude)) {
        setLocation({
          latitude: event.detail.home_latitude,
          longitude: event.detail.home_longitude,
          label: visibleLocationName(event.detail.home_location),
        })
        if (isCoordinateLabel(event.detail.home_location) || !event.detail.home_location) {
          reverseGeocodeLocation(event.detail.home_latitude, event.detail.home_longitude).then((name) => {
            if (!active) return
            setLocation((current) => current ? { ...current, label: name } : current)
            setProfile((current) => ({ ...current, home_location: name }))
          }).catch(() => {
            if (active) setLocationMessage('Saved coordinates could not be converted to a place name. Update your area in your profile.')
          })
        }
      } else if (event.detail?.home_location) {
        setLocation((previous) => previous ? { ...previous, label: event.detail.home_location } : previous)
      }
    }
    window.addEventListener(PROFILE_EVENT, onProfileUpdate)
    if (user.id === 'playlink-local-demo') {
      try {
        const savedProfile = JSON.parse(window.localStorage.getItem(`playlink-profile-${user.id}`) || 'null')
        const savedLocation = JSON.parse(window.localStorage.getItem(locationStorageKey(user.id)) || 'null')
        setProfile(savedProfile)
        setLocation(savedLocation)
        const latitude = savedLocation?.latitude ?? savedProfile?.home_latitude
        const longitude = savedLocation?.longitude ?? savedProfile?.home_longitude
        if (Number.isFinite(latitude) && Number.isFinite(longitude)
          && (isCoordinateLabel(savedLocation?.label) || isCoordinateLabel(savedProfile?.home_location) || !savedProfile?.home_location)) {
          reverseGeocodeLocation(latitude, longitude).then((name) => {
            if (!active) return
            setLocation((current) => current ? { ...current, label: name } : current)
            setProfile((current) => current ? { ...current, home_location: name } : current)
          }).catch(() => {
            if (active) setLocationMessage('Saved coordinates could not be converted to a place name. Update your area in your profile.')
          })
        }
      } catch {
        window.localStorage.removeItem(`playlink-profile-${user.id}`)
        window.localStorage.removeItem(locationStorageKey(user.id))
      }
      return () => {
        active = false
        window.removeEventListener(PROFILE_EVENT, onProfileUpdate)
      }
    }
    if (!supabase) return () => {
      active = false
      window.removeEventListener(PROFILE_EVENT, onProfileUpdate)
    }
    supabase.from('profiles').select('display_name,username,avatar_url,home_location,home_latitude,home_longitude')
      .eq('id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setAccountError('Saved profile details are unavailable. Apply the dashboard profile migration to enable them.')
          return
        }
        if (!data) return
        setProfile(data)
        if (Number.isFinite(data.home_latitude) && Number.isFinite(data.home_longitude)) {
          const label = visibleLocationName(data.home_location)
          setLocation({
            latitude: data.home_latitude,
            longitude: data.home_longitude,
            label,
          })
          if (isCoordinateLabel(data.home_location) || !data.home_location) {
            reverseGeocodeLocation(data.home_latitude, data.home_longitude).then((name) => {
              if (!active) return
              setLocation((current) => current ? { ...current, label: name } : current)
              setProfile((current) => ({ ...current, home_location: name }))
            }).catch(() => {
              if (active) setLocationMessage('Saved coordinates could not be converted to a place name. Update your area in your profile.')
            })
          }
        }
      })
      .catch(() => {
        if (active) setAccountError('Saved profile details could not be loaded. Check your connection and try again.')
      })
    return () => {
      active = false
      window.removeEventListener(PROFILE_EVENT, onProfileUpdate)
    }
  }, [user])

  useEffect(() => {
    if (openPanel !== 'notifications' || !user || user.id === 'playlink-local-demo' || !supabase) return undefined
    let active = true
    async function loadNotifications() {
      setNotificationsBusy(true)
      setNotificationError('')
      try {
        const [{ data: ownRequests, error: ownError }, { data: ownedEvents, error: eventsError }] = await Promise.all([
          supabase.from('event_join_requests').select('id,event_id,team_name,status,created_at')
            .eq('requesting_user_id', user.id),
          supabase.from('events').select('id,title').eq('organizer_id', user.id),
        ])
        if (ownError) throw ownError
        if (eventsError) throw eventsError
        const ownedIds = (ownedEvents || []).map((event) => event.id)
        let incomingRequests = []
        if (ownedIds.length) {
          const { data, error } = await supabase.from('event_join_requests')
            .select('id,event_id,team_name,status,created_at')
            .in('event_id', ownedIds).eq('status', 'pending')
          if (error) throw error
          incomingRequests = data || []
        }
        const allRequests = [...(ownRequests || []), ...incomingRequests]
        const eventIds = [...new Set(allRequests.map((request) => request.event_id))]
        let titles = new Map((ownedEvents || []).map((event) => [event.id, event.title]))
        if (eventIds.length) {
          const { data, error } = await supabase.from('events').select('id,title').in('id', eventIds)
          if (error) throw error
          titles = new Map([...(data || []), ...(ownedEvents || [])].map((event) => [event.id, event.title]))
        }
        const incomingIds = new Set(incomingRequests.map((request) => request.id))
        const items = allRequests.map((request) => ({
          ...request,
          title: titles.get(request.event_id) || 'Sporting event',
          organizerAction: incomingIds.has(request.id),
        })).sort((first, second) => new Date(second.created_at) - new Date(first.created_at))
        if (active) setNotifications(items)
      } catch {
        if (active) setNotificationError('Activity could not be loaded. Confirm the Phase 3 events migration is applied.')
      } finally {
        if (active) setNotificationsBusy(false)
      }
    }
    loadNotifications()
    return () => { active = false }
  }, [openPanel, user])

  function findCurrentLocation() {
    setLocationMessage('')
    if (!navigator.geolocation) {
      setLocationMessage('This browser does not support location sharing.')
      return
    }
    setLocationBusy(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let label = 'Current location'
        try {
          label = await reverseGeocodeLocation(coords.latitude, coords.longitude)
        } catch {
          setLocationMessage('Place name could not be found. You can enter your area in your profile.')
        }
        const current = { latitude: coords.latitude, longitude: coords.longitude, label }
        setLocation(current)
        setProfile((previous) => ({ ...previous, home_location: label, home_latitude: coords.latitude, home_longitude: coords.longitude }))
        setLocationBusy(false)
        setLocationMessage((message) => message || `Location set to ${label}. Save it to keep it after signing out.`)
      },
      (error) => {
        setLocationBusy(false)
        setLocationMessage(error.code === 1
          ? 'Location permission was denied. Allow location access in your browser settings and try again.'
          : 'Your location could not be found. Check your device settings and try again.')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  async function saveLocation() {
    if (!location || !user) return
    setLocationBusy(true)
    setLocationMessage('')
    try {
      const label = visibleLocationName(location.label || profile?.home_location, 'Current location')
      const saved = { ...location, label }
      const updatedProfile = {
        ...(profile || {}),
        home_location: label,
        home_latitude: location.latitude,
        home_longitude: location.longitude,
      }
      if (user.id === 'playlink-local-demo') {
        window.localStorage.setItem(locationStorageKey(user.id), JSON.stringify(saved))
        const storedProfile = JSON.parse(window.localStorage.getItem(`playlink-profile-${user.id}`) || '{}')
        window.localStorage.setItem(`playlink-profile-${user.id}`, JSON.stringify({ ...storedProfile, ...updatedProfile }))
      } else {
        if (!supabase) throw new Error('Saving your location needs a configured Supabase connection.')
        const { data, error } = await supabase.from('profiles').update({
          home_location: label,
          home_latitude: location.latitude,
          home_longitude: location.longitude,
        }).eq('id', user.id).select('id').maybeSingle()
        if (error) throw error
        if (!data) throw new Error('Your profile was not found. Apply the dashboard profile migration first.')
      }
      setLocation(saved)
      setProfile(updatedProfile)
      window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: updatedProfile }))
      setLocationMessage('Your location has been saved to your profile.')
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : 'Your location could not be saved.')
    } finally {
      setLocationBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setAccountError(error.message)
    else window.location.assign('/sign-in')
  }

  return (
    <div className="dashboard-app">
      <aside className={`dashboard-sidebar${menuOpen ? ' dashboard-sidebar-open' : ''}`}>
        <Brand light href="/dashboard" />
        <span className="dashboard-sidebar-heading">PLAYLINK</span>
        <nav className="dashboard-side-links" aria-label="PlayLink dashboard">
          {navigation.map((item) => <a key={item.href} href={item.href} className={path === item.href ? 'active' : ''} aria-current={path === item.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}><span><Icon name={item.icon} size={18} /></span>{item.label}{item.href === '/favorite-venues' && favoriteIds.length > 0 && <small className="dashboard-side-count">{favoriteIds.length}</small>}</a>)}
        </nav>
        <nav className="dashboard-side-links dashboard-account-links" aria-label="Account navigation">
          {accountNavigation.map((item) => item.href === '/notifications'
            ? <button key={item.href} type="button" className={openPanel === 'notifications' ? 'active' : ''} aria-expanded={openPanel === 'notifications'} onClick={() => { setMenuOpen(false); setOpenPanel((current) => current === 'notifications' ? '' : 'notifications') }}><span><Icon name={item.icon} size={18} /></span>{item.label}{activity.unreadCount > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadCount)}</small>}</button>
            : <a key={item.href} href={item.href} className={path === item.href ? 'active' : ''} aria-current={path === item.href ? 'page' : undefined} onClick={() => setMenuOpen(false)}><span><Icon name={item.icon} size={18} /></span>{item.label}{item.href === '/messages' && activity.unreadMessages > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadMessages)}</small>}</a>)}
        </nav>
        <div className="dashboard-side-promo">
          <span className="promo-symbol">◎</span>
          <b>Good games.<br />Great communities.</b>
          <p>Connect, play, and meet new friends on PlayLink.</p>
          <a href="/get-started">Get started <span>↗</span></a>
        </div>
        <small className="dashboard-side-foot">PLAYLINK · PHASE 1 DEMO</small>
      </aside>
      {menuOpen && <button className="dashboard-sidebar-backdrop" type="button" aria-label="Dismiss dashboard menu" onClick={() => setMenuOpen(false)} />}

      <div className="dashboard-content">
        <header className="dashboard-topbar">
          <button className="dashboard-menu-toggle" type="button" aria-label={menuOpen ? 'Close dashboard menu' : 'Open dashboard menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name="menu" size={17} /></button>
          <label className="dashboard-search"><span aria-hidden="true"><Icon name="search" size={16} /></span><input value={search} onChange={(event) => onSearch?.(event.target.value)} placeholder="Search venues, events, teams or players..." aria-label="Search this page" /><kbd>⌘ K</kbd></label>
          <button className="dashboard-region" type="button" aria-expanded={openPanel === 'location'} onClick={() => setOpenPanel(openPanel === 'location' ? '' : 'location')}><span><Icon name="pin" size={16} /></span><span className="dashboard-region-label">{visibleLocationName(profile?.home_location || location?.label, 'Kathmandu')}</span><Icon name="chevron-down" size={13} /></button>
          <button className="dashboard-notification-link" type="button" aria-label={`Notifications${activity.unreadCount ? ` (${activity.unreadCount} unread)` : ''}`} aria-expanded={openPanel === 'notifications'} onClick={() => setOpenPanel(openPanel === 'notifications' ? '' : 'notifications')}><Icon name="bell" size={17} />{activity.unreadCount > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadCount)}</small>}</button>
          {user
            ? <div className="dashboard-account"><a className="dashboard-user" href="/profile" aria-label="Open your profile"><span className="dashboard-user-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}</span><span>{displayName}<small>@{profile?.username || user.user_metadata?.username || user.email}</small></span></a><button type="button" onClick={signOut}>Sign out</button></div>
            : <a className="dashboard-user" href="/sign-in"><span className="dashboard-user-avatar">PL</span><span>Guest player<small>Demo account</small></span><b>⌄</b></a>}
        </header>
        {openPanel === 'location' && <section className="dashboard-topbar-popover dashboard-location-popover" aria-label="Your location">
          <div className="dashboard-popover-heading"><span><Icon name="map" size={18} /></span><div><b>Your location</b><small>{visibleLocationName(location?.label, 'Location is not being shared')}</small></div><button type="button" aria-label="Close location panel" onClick={() => setOpenPanel('')}>×</button></div>
          {location ? <iframe title="Map centered on your location" src={`https://maps.google.com/maps?q=${location.latitude},${location.longitude}&z=15&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <div className="dashboard-location-empty"><Icon name="pin" size={23} /><b>See yourself on the map</b><span>Use live location to request GPS. Google Maps receives those coordinates to show your position.</span></div>}
          {location && <a className="dashboard-map-link" href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>}
          {locationMessage && <p className="dashboard-popover-message" role="status">{locationMessage}</p>}
          <div className="dashboard-popover-actions"><button className="button button-secondary" type="button" onClick={findCurrentLocation} disabled={locationBusy}>{locationBusy ? 'Finding you…' : 'Use live location'}</button><button className="button button-primary" type="button" onClick={saveLocation} disabled={locationBusy || !location}>Save location</button></div>
        </section>}
        {openPanel === 'notifications' && <section className="dashboard-topbar-popover dashboard-notification-popover" aria-label="Notifications">
          <div className="dashboard-popover-heading"><span><Icon name="bell" size={18} /></span><div><b>Notifications</b><small>Bookings, messages, events, and team requests</small></div><button type="button" aria-label="Close notifications" onClick={() => setOpenPanel('')}>×</button></div>
          {notificationsBusy ? <p className="dashboard-notification-empty" role="status">Loading activity…</p>
            : notificationError || activity.error ? <p className="dashboard-notification-empty is-error" role="alert">{notificationError || activity.error}</p>
              : notifications.length || activity.activities.length ? <div className="dashboard-notification-list">
                {activity.activities.slice(0, 8).map((item) => <Link key={item.id} to={item.href} onClick={() => setOpenPanel('')}><span className={`dashboard-notification-status ${item.kind === 'message' ? 'status-open' : 'status-pending'}`}><Icon name={item.kind === 'message' ? 'message' : item.kind === 'team_request' ? 'teams' : 'calendar'} size={16} /></span><span><b>{item.title}</b><small>{item.body} · {new Date(item.created_at).toLocaleDateString()}</small></span></Link>)}
                {notifications.slice(0, Math.max(0, 8 - activity.activities.length)).map((item) => <Link key={`${item.id}-${item.organizerAction ? 'organizer' : 'player'}`} to={`/events/${item.event_id}`} onClick={() => setOpenPanel('')}><span className={`dashboard-notification-status status-${item.status}`}><Icon name={item.organizerAction ? 'teams' : 'calendar'} size={16} /></span><span><b>{item.organizerAction ? `${item.team_name} wants to join` : `${item.title}: ${item.status}`}</b><small>{item.organizerAction ? item.title : `Team ${item.team_name}`} · {new Date(item.created_at).toLocaleDateString()}</small></span></Link>)}
              </div>
                : <p className="dashboard-notification-empty"><b>You’re all caught up.</b><span>New booking updates, venue messages, and event activity will show here.</span></p>}
        </section>}
        {activity.notice && <Link className="dashboard-activity-toast" to={activity.notice.href} onClick={() => { activity.markRead(activity.notice.kind); activity.dismissNotice() }}><span><Icon name={activity.notice.kind === 'message' ? 'message' : activity.notice.kind === 'team_request' ? 'teams' : 'calendar'} size={16} /></span><b>{activity.notice.title}</b><small>{activity.notice.body}</small><button type="button" aria-label="Dismiss notification" onClick={(event) => { event.preventDefault(); event.stopPropagation(); activity.dismissNotice() }}><Icon name="close" size={14} /></button></Link>}
        {accountError && <p className="dashboard-account-error" role="alert">{accountError}</p>}
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  )
}
