import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'
import VenueInbox from '../components/VenueInbox.jsx'
import VenuePhotoPicker from '../components/VenuePhotoPicker.jsx'
import useActivityNotifications from '../hooks/useActivityNotifications.js'
import { uploadVenuePhoto, validateVenuePhoto } from '../data/venuePhotos.js'
import { getVenueImage } from '../data/venueImages.js'

const ownerNavigation = [
  { href: '/owner', label: 'Dashboard', icon: 'home' },
  { href: '/owner/bookings', label: 'Bookings', icon: 'calendar' },
  { href: '/owner/inbox', label: 'Inbox', icon: 'message' },
  { href: '/owner/schedule', label: 'Schedule', icon: 'clock' },
  { href: '/owner/venue', label: 'Your Venue', icon: 'venue' },
  { href: '/owner/reviews', label: 'Reviews', icon: 'star' },
  { href: '/owner/settings', label: 'Settings', icon: 'settings' },
]
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function todayInputValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function money(amount) {
  return `Rs ${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatDateTime(value, options = {}) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return date.toLocaleString('en-NP', { day: 'numeric', month: 'short', ...options })
}

function initials(value = '') {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'VO'
}

function OwnerShell({ path, children, user, venue, activity, notificationsOpen, setNotificationsOpen, onSignOut, onNotifications }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const pendingCount = activity.unreadBookings
  const ownerName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Venue Owner'
  const activePage = ownerNavigation.find((item) => item.href === path)

  return (
    <div className="owner-app">
      <aside className={`owner-sidebar${menuOpen ? ' is-open' : ''}`}>
        <Brand light href="/owner" />
        <div className="owner-venue-identity">
          <span className="owner-venue-thumb"><img src={getVenueImage(venue)} alt="" /></span>
          <span><b>{venue?.name || 'Add your venue'} {venue?.is_active && <i aria-label="Active venue">✓</i>}</b><small>{venue?.sport === 'Both' ? 'Futsal & Cricket' : venue?.sport ? `${venue.sport} Venue` : 'Venue owner workspace'}</small></span>
          <Icon name="chevron-right" size={15} />
        </div>
        <nav className="owner-nav" aria-label="Venue owner workspace">
          {ownerNavigation.map((item) => <Link key={item.href} to={item.href} className={item.href === path ? 'active' : ''} aria-current={item.href === path ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.href === '/owner/inbox' && activity.unreadMessages > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadMessages)}</small>}{item.href === '/owner/bookings' && activity.unreadBookings > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadBookings)}</small>}</Link>)}
        </nav>
      </aside>
      {menuOpen && <button className="owner-sidebar-backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Close owner menu" />}
      <div className="owner-main">
        <header className="owner-topbar">
          <button className="owner-menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name="menu" size={18} /></button>
          <span className="owner-topbar-spacer" />
          <div className="owner-notifications">
            <button className="owner-topbar-notice" type="button" aria-label={`Notifications${activity.unreadCount ? ` (${activity.unreadCount} unread)` : ''}`} title="Notifications" aria-expanded={notificationsOpen} onClick={() => { const nextOpen = !notificationsOpen; setNotificationsOpen(nextOpen); if (nextOpen) activity.markRead(); setAccountOpen(false) }}><Icon name="bell" size={18} />{activity.unreadCount > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadCount)}</small>}</button>
            {notificationsOpen && <section className="owner-notification-popover" aria-label="Booking request notifications">
              <header><span><b>Notifications</b><small>{pendingCount ? `${pendingCount} new booking request${pendingCount === 1 ? '' : 's'}` : activity.unreadMessages ? `${activity.unreadMessages} unread message${activity.unreadMessages === 1 ? '' : 's'}` : 'You are all caught up'}</small></span><button type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}><Icon name="close" size={14} /></button></header>
              {activity.activities.length ? <div className="owner-notification-list">{activity.activities.slice(0, 8).map((item) => <Link key={item.id} to={item.href} onClick={() => setNotificationsOpen(false)}>
                <span className="owner-notification-icon"><Icon name={item.kind === 'message' ? 'message' : 'calendar'} size={15} /></span>
                <span><b>{item.title}</b><small>{item.body}</small><small>{formatDateTime(item.created_at, { year: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></span>
              </Link>)}</div> : <p className="owner-notification-empty">New booking requests and messages from players will appear here.</p>}
              <button className="owner-notification-all" type="button" onClick={onNotifications}>Open bookings <Icon name="arrow-right" size={13} /></button>
            </section>}
          </div>
          <div className="owner-user-menu"><span>{initials(ownerName)}</span><b>{ownerName}</b><button type="button" aria-label="Open account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}><Icon name="chevron-down" size={14} /></button>{accountOpen && <div className="owner-account-popover"><b>{ownerName}</b><small>{user?.email}</small><button type="button" onClick={onSignOut}>Sign out</button></div>}</div>
        </header>
        <main className="owner-content">
          <div className="owner-mobile-title"><span>{activePage?.label || 'Venue Owner'}</span><small>The Arena · Owner workspace</small></div>
          {children}
        </main>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow = 'VENUE OWNER', title, description, action }) {
  return <header className="owner-page-heading"><div><span>{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>
}

function MetricCard({ icon, title, value, change, tone }) {
  return <article className="owner-metric-card"><span className={`owner-metric-icon ${tone}`}><Icon name={icon} size={18} /></span><small>{title}</small><b>{value}</b><span className="owner-metric-change"><Icon name="arrow-right" size={11} />{change}</span></article>
}

function BookingStatus({ status }) {
  return <span className={`owner-booking-status ${status}`}><i />{status}</span>
}

function OwnerDashboard() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname.replace(/\/$/, '') || '/owner'
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const activity = useActivityNotifications({ user, role: 'owner', path, notificationOpen: notificationsOpen })
  const [workspace, setWorkspace] = useState({ venues: [], bookings: [], availability: [], reviews: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [newBookingNotice, setNewBookingNotice] = useState(null)
  const [notificationError, setNotificationError] = useState('')
  const knownBookingIds = useRef(null)
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [bookingFilter, setBookingFilter] = useState('all')
  const [selectedWeekday, setSelectedWeekday] = useState(new Date().getDay())
  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    if (!supabase || !user) {
      setLoadError('Owner workspace data requires an authenticated Supabase account.')
      setLoading(false)
      return
    }
    try {
      const [venuesResult, bookingsResult, availabilityResult, reviewsResult] = await Promise.all([
        supabase.from('owner_venues').select('*').order('created_at', { ascending: true }),
        supabase.from('venue_bookings').select('*').order('starts_at', { ascending: true }),
        supabase.from('venue_availability').select('*').order('weekday').order('start_time'),
        supabase.from('venue_reviews').select('*').order('created_at', { ascending: false }),
      ])
      const failed = [venuesResult, bookingsResult, availabilityResult, reviewsResult].find((result) => result.error)
      if (failed?.error) throw failed.error
      setWorkspace({
        venues: venuesResult.data || [],
        bookings: bookingsResult.data || [],
        availability: availabilityResult.data || [],
        reviews: reviewsResult.data || [],
      })
    } catch (error) {
      setLoadError(error instanceof Error
        ? `${error.message} Apply supabase/migrations/20261003050000_venue_owner_workspace.sql if the owner workspace tables are missing.`
        : 'Owner workspace data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    knownBookingIds.current = null
    loadWorkspace()
  }, [loadWorkspace])
  useEffect(() => {
    if (loading || !user) return undefined
    knownBookingIds.current = new Set(workspace.bookings.map((booking) => booking.id))
    return undefined
  }, [loading, user, workspace.bookings.length])
  useEffect(() => {
    if (!user) return undefined
    let active = true
    let refreshing = false
    async function refreshBookingRequests() {
      if (refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        if (!supabase) throw new Error('Supabase is not configured.')
        const { data, error } = await supabase.from('venue_bookings').select('*').order('starts_at', { ascending: true })
        if (error) throw error
        const bookings = data || []
        if (!active) return
        const previousIds = knownBookingIds.current
        const newPending = previousIds ? bookings.find((booking) => booking.status === 'pending'
          && booking.customer_id && !previousIds.has(booking.id)) : null
        knownBookingIds.current = new Set(bookings.map((booking) => booking.id))
        setWorkspace((current) => ({ ...current, bookings }))
        setNotificationError('')
        if (newPending) {
          setNewBookingNotice(newPending)
          window.setTimeout(() => setNewBookingNotice((current) => current?.id === newPending.id ? null : current), 8000)
        }
      } catch (error) {
        if (active) setNotificationError(error instanceof Error ? error.message : 'Booking notifications could not be refreshed.')
      } finally {
        refreshing = false
      }
    }
    const interval = window.setInterval(refreshBookingRequests, 15000)
    const onFocus = () => refreshBookingRequests()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [loading, user])
  useEffect(() => {
    if (!ownerNavigation.some((item) => item.href === path)) navigate('/owner', { replace: true })
  }, [navigate, path])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (path === '/owner/bookings' && params.get('new') === '1') setShowBookingForm(true)
    if (path === '/owner/bookings') setBookingFilter(params.get('filter') === 'pending' ? 'pending' : 'all')
  }, [location.search, path])

  function clearFeedback() {
    setActionError('')
    setSuccessMessage('')
  }

  async function saveVenue(form, venueId, photoFile) {
    clearFeedback()
    const savedVenueId = venueId || crypto.randomUUID()
    const venueData = {
      name: form.name.trim(),
      sport: form.sport,
      area: form.area.trim(),
      address: form.address.trim(),
      description: form.description.trim(),
      price_per_hour: Number(form.price_per_hour),
      image_url: form.image_url?.trim() || '',
      maps_url: form.maps_url.trim(),
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      is_active: form.is_active,
    }
    try {
      let saved
      if (!supabase) throw new Error('Supabase is not configured.')
      if (photoFile) {
        validateVenuePhoto(photoFile)
        venueData.image_url = await uploadVenuePhoto(supabase, user.id, savedVenueId, photoFile)
      }
      if (venueId) {
        const { data, error } = await supabase.from('owner_venues').update(venueData).eq('id', venueId).select('*').single()
        if (error) throw error
        saved = data
      } else {
        const { data, error } = await supabase.from('owner_venues').insert({ ...venueData, id: savedVenueId, owner_id: user.id }).select('*').single()
        if (error) throw error
        saved = data
      }
      setWorkspace((current) => venueId
        ? { ...current, venues: current.venues.map((venue) => venue.id === venueId ? saved : venue) }
        : { ...current, venues: [...current.venues, saved] })
      setSuccessMessage(venueId ? 'Venue details saved.' : 'Your venue is now in your owner workspace.')
      if (!venueId) navigate(`/owner/venue?venue=${encodeURIComponent(saved.id)}`)
      return saved
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Venue details could not be saved.')
      return null
    }
  }

  async function saveBooking(form) {
    clearFeedback()
    if (!form.venue_id) {
      setActionError('Add your venue details before creating a booking.')
      return
    }
    const starts = new Date(`${form.date}T${form.start_time}`)
    const ends = new Date(`${form.date}T${form.end_time}`)
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
      setActionError('Choose a valid booking date and an end time later than the start time.')
      return
    }
    const bookingData = {
      venue_id: form.venue_id,
      owner_id: user.id,
      sport: form.sport,
      customer_name: form.customer_name.trim(),
      customer_contact: form.customer_contact.trim(),
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status: form.status,
      notes: form.notes.trim(),
    }
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.from('venue_bookings').insert(bookingData).select('*').single()
      if (error) throw error
      setWorkspace((current) => ({ ...current, bookings: [...current.bookings, data] }))
      setShowBookingForm(false)
      setSuccessMessage('Booking added to your venue schedule.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Booking could not be created.')
    }
  }

  async function setBookingStatus(booking, status) {
    clearFeedback()
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.from('venue_bookings').update({ status }).eq('id', booking.id).select('*').single()
      if (error) throw error
      setWorkspace((current) => ({ ...current, bookings: current.bookings.map((item) => item.id === booking.id ? data : item) }))
      setSuccessMessage(`Booking marked ${status}.`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Booking status could not be updated.')
    }
  }

  async function saveSlot(form) {
    clearFeedback()
    const venue = workspace.venues.find((item) => item.id === form.venue_id)
    if (!venue) {
      setActionError('Add your venue before setting its weekly schedule.')
      return
    }
    if (!form.start_time || !form.end_time || form.end_time <= form.start_time) {
      setActionError('Choose a valid time range. The end must be later than the start.')
      return
    }
    const conflict = workspace.availability.some((slot) => slot.venue_id === form.venue_id && Number(slot.weekday) === Number(form.weekday)
      && form.start_time < slot.end_time && form.end_time > slot.start_time)
    if (conflict) {
      setActionError('This time overlaps an existing slot for that day.')
      return
    }
    const slotData = {
      venue_id: form.venue_id,
      owner_id: user.id,
      weekday: Number(form.weekday),
      start_time: form.start_time,
      end_time: form.end_time,
      is_available: true,
      price_per_hour: Number(form.price_per_hour || venue.price_per_hour),
    }
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.from('venue_availability').insert(slotData).select('*').single()
      if (error) throw error
      setWorkspace((current) => ({ ...current, availability: [...current.availability, data] }))
      setShowSlotForm(false)
      setSelectedWeekday(Number(form.weekday))
      setSuccessMessage('Availability added to the weekly schedule.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Availability could not be saved.')
    }
  }

  async function toggleAvailability(slot) {
    clearFeedback()
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.from('venue_availability').update({ is_available: !slot.is_available }).eq('id', slot.id).select('*').single()
      if (error) throw error
      setWorkspace((current) => ({ ...current, availability: current.availability.map((item) => item.id === slot.id ? data : item) }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Availability could not be updated.')
    }
  }

  async function deleteAvailability(slot) {
    clearFeedback()
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.from('venue_availability').delete().eq('id', slot.id)
      if (error) throw error
      setWorkspace((current) => ({ ...current, availability: current.availability.filter((item) => item.id !== slot.id) }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Availability could not be removed.')
    }
  }

  async function toggleVenueActive(venue) {
    clearFeedback()
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { data, error } = await supabase.from('owner_venues').update({ is_active: !venue.is_active }).eq('id', venue.id).select('*').single()
      if (error) throw error
      setWorkspace((current) => ({ ...current, venues: current.venues.map((item) => item.id === venue.id ? data : item) }))
      setSuccessMessage(venue.is_active ? 'Venue listing paused.' : 'Venue listing is active again.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Venue listing status could not be changed.')
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setActionError(error.message)
    else window.location.assign('/sign-in')
  }

  const allBookings = useMemo(() => [...workspace.bookings].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)), [workspace.bookings])
  const todayBookings = useMemo(() => allBookings.filter((booking) => new Date(booking.starts_at).toDateString() === new Date().toDateString() && !['cancelled', 'rejected'].includes(booking.status)), [allBookings])
  const recentBookings = useMemo(() => workspace.bookings.filter((booking) => new Date(booking.starts_at) >= new Date(Date.now() - 7 * 86400000) && ['confirmed', 'completed'].includes(booking.status)), [workspace.bookings])
  const playingHours = useMemo(() => recentBookings.reduce((total, booking) => total + Math.max(0, (new Date(booking.ends_at) - new Date(booking.starts_at)) / 3600000), 0), [recentBookings])
  const rating = useMemo(() => workspace.reviews.length ? (workspace.reviews.reduce((total, review) => total + Number(review.rating), 0) / workspace.reviews.length).toFixed(1) : '—', [workspace.reviews])
  const visibleBookings = useMemo(() => allBookings.filter((booking) => bookingFilter === 'all' || booking.status === bookingFilter), [allBookings, bookingFilter])
  const selectedDaySlots = useMemo(() => workspace.availability.filter((slot) => Number(slot.weekday) === selectedWeekday).sort((a, b) => a.start_time.localeCompare(b.start_time)), [workspace.availability, selectedWeekday])
  const activeVenue = workspace.venues[0]

  if (loading) return <div className="auth-loading" role="status">Loading your owner workspace…</div>

  return (
    <OwnerShell path={path} user={user} venue={activeVenue} activity={activity} notificationsOpen={notificationsOpen} setNotificationsOpen={setNotificationsOpen} onSignOut={signOut} onNotifications={() => navigate('/owner/bookings?filter=pending')}>
      {activity.error && <p className="owner-alert error" role="alert">New activity could not refresh: {activity.error}<button type="button" onClick={activity.refresh}>Retry</button></p>}
      {activity.notice?.kind === 'message' && <Link className="owner-new-request-toast" to={activity.notice.href} onClick={activity.dismissNotice}><span><Icon name="message" size={16} /></span><b>{activity.notice.title}</b><small>{activity.notice.body}</small><button type="button" aria-label="Dismiss message notification" onClick={(event) => { event.preventDefault(); event.stopPropagation(); activity.dismissNotice() }}><Icon name="close" size={14} /></button></Link>}
      {newBookingNotice && <Link className="owner-new-request-toast" to="/owner/bookings?filter=pending" onClick={() => setNewBookingNotice(null)}><span><Icon name="bell" size={16} /></span><b>New booking request</b><small>{newBookingNotice.customer_name} requested {newBookingNotice.sport} · review now</small><button type="button" aria-label="Dismiss booking notification" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setNewBookingNotice(null) }}><Icon name="close" size={14} /></button></Link>}
      <div className="owner-alerts" aria-live="polite">
        {loadError && <p className="owner-alert error" role="alert">{loadError}<button type="button" onClick={loadWorkspace}>Retry</button></p>}
        {notificationError && <p className="owner-alert error" role="alert">Booking notifications could not refresh: {notificationError}<button type="button" onClick={() => setNotificationError('')}><Icon name="close" size={14} /></button></p>}
        {actionError && <p className="owner-alert error" role="alert">{actionError}<button type="button" aria-label="Dismiss error" onClick={() => setActionError('')}><Icon name="close" size={14} /></button></p>}
        {successMessage && <p className="owner-alert success" role="status">{successMessage}<button type="button" aria-label="Dismiss message" onClick={() => setSuccessMessage('')}><Icon name="close" size={14} /></button></p>}
      </div>
      {path === '/owner' && <section className="owner-page owner-overview">
        <PageHeading eyebrow="WELCOME BACK," title={<>Venue Owner <span aria-hidden="true">👋</span></>} description={`Here's what's happening at ${activeVenue?.name || 'your venue'} today.`} action={<span className="owner-date-chip"><Icon name="calendar" size={14} />{new Date().toLocaleDateString('en-NP', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>} />
        <div className="owner-metrics-grid">
          <MetricCard icon="calendar" title="Total Bookings" value={workspace.bookings.filter((booking) => !['cancelled', 'rejected'].includes(booking.status)).length} change={`${todayBookings.length} today`} tone="green" />
          <MetricCard icon="clock" title="Total Playing Hours" value={`${Math.round(playingHours)} hrs`} change="Confirmed · last 7 days" tone="blue" />
          <MetricCard icon="star" title="Average Rating" value={rating} change={`${workspace.reviews.length} guest reviews`} tone="amber" />
        </div>
        <div className="owner-overview-grid">
          <div className="owner-overview-main">
            <section className="owner-panel owner-booking-chart">
              <div className="owner-panel-heading"><div><h2>Booking Overview</h2><p>Venue bookings · Last 7 days</p></div><Link to="/owner/bookings">View bookings <Icon name="arrow-right" size={13} /></Link></div>
              <BookingChart bookings={workspace.bookings} venues={workspace.venues} />
            </section>
            <div className="owner-lower-grid">
              <section className="owner-panel owner-usage-panel"><div className="owner-panel-heading"><div><h2>Venue Usage</h2><p>Confirmed playing hours this week</p></div></div><VenueUsage venues={workspace.venues} bookings={recentBookings} /></section>
              <section className="owner-panel owner-review-panel"><div className="owner-panel-heading"><div><h2>Recent Reviews</h2><p>Feedback from players</p></div><Link to="/owner/reviews">View all <Icon name="arrow-right" size={13} /></Link></div><ReviewList reviews={workspace.reviews.slice(0, 3)} compact /></section>
            </div>
          </div>
          <aside className="owner-overview-aside">
            <section className="owner-panel owner-upcoming-panel"><div className="owner-panel-heading"><div><h2>Upcoming Bookings</h2><p>{todayBookings.length} today</p></div><Link to="/owner/bookings">View all</Link></div><BookingList bookings={allBookings.filter((booking) => new Date(booking.starts_at).getTime() >= Date.now() && booking.status !== 'cancelled').slice(0, 5)} venues={workspace.venues} compact /></section>
            <section className="owner-panel owner-quick-actions"><div className="owner-panel-heading"><h2>Quick Actions</h2></div><Link to="/owner/bookings?new=1"><Icon name="calendar" size={16} /><span><b>Add New Booking</b><small>Manually create a booking</small></span></Link><Link to="/owner/schedule"><Icon name="clock" size={16} /><span><b>View Full Schedule</b><small>Check upcoming availability</small></span></Link><Link to="/owner/venue"><Icon name="settings" size={16} /><span><b>Manage Venue</b><small>Update details and pricing</small></span></Link></section>
          </aside>
        </div>
      </section>}
      {path === '/owner/bookings' && <section className="owner-page">
        <PageHeading title="Bookings" description="Review requests, manage confirmed games, and add bookings made offline." action={<button className="owner-primary-button" type="button" onClick={() => setShowBookingForm((open) => !open)}><Icon name="add" size={16} /> Add new booking</button>} />
        {showBookingForm && <BookingForm venues={workspace.venues} onCancel={() => setShowBookingForm(false)} onSave={saveBooking} />}
        <section className="owner-panel owner-table-panel"><div className="owner-panel-heading"><div><h2>All bookings</h2><p>{visibleBookings.length} records in your workspace</p></div><label className="owner-filter-label">Status <select value={bookingFilter} onChange={(event) => setBookingFilter(event.target.value)}><option value="all">All bookings</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div><BookingList bookings={visibleBookings} venues={workspace.venues} onStatus={setBookingStatus} /></section>
      </section>}
      {path === '/owner/inbox' && <section className="owner-page">
        <PageHeading title="Inbox" description="Read and reply to messages from players who contacted your venues." />
        <VenueInbox mode="owner" />
      </section>}
      {path === '/owner/schedule' && <section className="owner-page">
        <PageHeading title="Schedule" description="Set weekly opening slots and control when players can request a booking." action={<button className="owner-primary-button" type="button" onClick={() => setShowSlotForm((open) => !open)} disabled={!workspace.venues.length}><Icon name="add" size={16} /> Add availability</button>} />
        {showSlotForm && <ScheduleForm venues={workspace.venues} weekday={selectedWeekday} onCancel={() => setShowSlotForm(false)} onSave={saveSlot} />}
        <section className="owner-panel owner-schedule-panel">        <div className="owner-weekday-tabs" role="group" aria-label="Select day of week">{weekdayNames.map((day, index) => <button key={day} type="button" aria-pressed={selectedWeekday === index} className={selectedWeekday === index ? 'active' : ''} onClick={() => setSelectedWeekday(index)}><span>{day.slice(0, 3)}</span><small>{workspace.availability.filter((slot) => Number(slot.weekday) === index).length} slots</small></button>)}</div><div className="owner-panel-heading"><div><h2>{weekdayNames[selectedWeekday]} availability</h2><p>Availability changes apply to your weekly schedule.</p></div></div>{selectedDaySlots.length ? <div className="owner-slot-list">{selectedDaySlots.map((slot) => <article className={`owner-slot-row${slot.is_available ? '' : ' unavailable'}`} key={slot.id}><span className="owner-slot-time"><Icon name="clock" size={16} />{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</span><b>{money(slot.price_per_hour)} <small>/ hour</small></b><span className={`owner-slot-status ${slot.is_available ? 'open' : 'closed'}`}><i />{slot.is_available ? 'Available' : 'Unavailable'}</span><button className="owner-outline-button" type="button" onClick={() => toggleAvailability(slot)}>{slot.is_available ? 'Close slot' : 'Open slot'}</button><button className="owner-icon-button danger" type="button" aria-label={`Remove ${slot.start_time} schedule slot`} onClick={() => deleteAvailability(slot)}><Icon name="trash" size={15} /></button></article>)}</div> : <EmptyState icon="clock" title="No availability set for this day" text="Add a time slot so players can see when your venue is open." action={<button className="owner-primary-button" type="button" onClick={() => setShowSlotForm(true)} disabled={!workspace.venues.length}>Add time slot</button>} />}</section>
        <p className="owner-helper-note"><Icon name="info" size={14} />Weekly availability is a repeating schedule. Bookings are managed separately and do not automatically block recurring slots.</p>
      </section>}
      {path === '/owner/venue' && <VenuePage venues={workspace.venues} onSave={saveVenue} onToggleActive={toggleVenueActive} />}
      {path === '/owner/reviews' && <section className="owner-page"><PageHeading title="Reviews" description="See what players are saying about their visits." /><section className="owner-panel owner-review-page"><div className="owner-rating-summary"><span><Icon name="star" size={22} /></span><div><b>{rating}</b><small>{workspace.reviews.length} reviews</small></div><p>Average venue rating</p></div><ReviewList reviews={workspace.reviews} /></section><p className="owner-helper-note"><Icon name="info" size={14} />Reviews are submitted by players only after an accepted booking is completed.</p></section>}
      {path === '/owner/settings' && <section className="owner-page"><PageHeading title="Settings" description="Manage your venue listing and account workspace." /><OwnerSettings user={user} venues={workspace.venues} onToggleActive={toggleVenueActive} /></section>}
    </OwnerShell>
  )
}

function BookingChart({ bookings, venues }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + index)
    const dayBookings = bookings.filter((booking) => new Date(booking.starts_at).toDateString() === date.toDateString() && booking.status !== 'cancelled')
    const countForSport = (sport) => dayBookings.filter((booking) => {
      const venue = venues.find((item) => item.id === booking.venue_id)
      return (booking.sport || (venue?.sport === 'Both' ? '' : venue?.sport)) === sport
    }).length
    return { date, futsal: countForSport('Futsal'), cricket: countForSport('Cricket') }
  }), [bookings, venues])
  const maximum = Math.max(4, ...days.map((day) => Math.max(day.futsal, day.cricket)))
  return <div className="owner-chart" role="img" aria-label={`Futsal and cricket bookings over the past seven days: ${days.map((day) => `${day.futsal} futsal and ${day.cricket} cricket on ${day.date.toLocaleDateString('en', { weekday: 'short' })}`).join(', ')}`}><div className="owner-chart-axis">{[maximum, Math.ceil(maximum * .75), Math.ceil(maximum * .5), Math.ceil(maximum * .25), 0].map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}</div><div className="owner-chart-bars">{days.map((day) => <div className="owner-chart-day" key={day.date.toISOString()}><div className="owner-chart-columns"><span className="futsal" style={{ height: `${day.futsal ? Math.max(3, day.futsal / maximum * 100) : 0}%` }} title={`${day.futsal} futsal bookings`} /><span className="cricket" style={{ height: `${day.cricket ? Math.max(3, day.cricket / maximum * 100) : 0}%` }} title={`${day.cricket} cricket bookings`} /></div><b>{day.date.toLocaleDateString('en-NP', { month: 'short', day: 'numeric' })}</b><small>{day.date.toLocaleDateString('en-NP', { weekday: 'short' })}</small></div>)}</div><div className="owner-chart-legend"><span><i className="futsal" />Futsal</span><span><i className="cricket" />Cricket</span></div></div>
}

function VenueUsage({ venues, bookings }) {
  if (!venues.length) return <EmptyState icon="venue" title="Add your venue first" text="Venue usage will appear here after you create bookings." />
  return <div className="owner-usage-list">{venues.slice(0, 2).map((venue, index) => {
    const booked = bookings.filter((booking) => booking.venue_id === venue.id).reduce((total, booking) => total + Math.max(0, (new Date(booking.ends_at) - new Date(booking.starts_at)) / 3600000), 0)
    const hours = Math.min(40, Math.round(booked))
    const percent = Math.round(hours / 40 * 100)
    return <article className="owner-usage-item" key={venue.id}><span className={`owner-usage-ring ${index ? 'blue' : ''}`} style={{ '--usage': `${percent * 3.6}deg` }}><b>{percent}%</b></span><strong>{venue.sport === 'Both' ? 'Futsal & Cricket' : `${venue.sport} venue`}</strong><small>{hours} / 40 hours</small></article>
  })}</div>
}

function BookingList({ bookings, venues, compact = false, onStatus }) {
  if (!bookings.length) return <EmptyState icon="calendar" title="No bookings yet" text="Add a booking manually or set your weekly availability so your workspace is ready." />
  return <div className={`owner-booking-list${compact ? ' compact' : ''}`}>{bookings.map((booking) => {
    const venue = venues.find((item) => item.id === booking.venue_id)
    const canComplete = booking.status === 'confirmed' && new Date(booking.ends_at).getTime() <= Date.now()
    return <article className={`owner-booking-row${booking.customer_id ? ' is-request' : ''}`} key={booking.id}><span className="owner-booking-date"><b>{formatDateTime(booking.starts_at, { hour: 'numeric', minute: '2-digit' })}</b><small>{formatDateTime(booking.ends_at, { hour: 'numeric', minute: '2-digit' })} · {formatDateTime(booking.starts_at)}</small></span><span className="owner-booking-customer"><b>{booking.customer_name}</b><small>{booking.customer_id ? 'Player booking request · ' : ''}{venue?.name || 'Venue'} · {booking.sport || venue?.sport || 'Sport'} · {booking.customer_contact || 'Contact not provided'}</small></span><span className="owner-booking-meta"><BookingStatus status={booking.status} /></span>{!compact && onStatus && booking.customer_id && booking.status === 'pending' ? <span className="owner-request-actions"><button className="owner-primary-button" type="button" onClick={() => onStatus(booking, 'confirmed')}>Accept</button><button className="owner-outline-button" type="button" onClick={() => onStatus(booking, 'rejected')}>Reject</button></span> : !compact && onStatus && <label className="owner-booking-action">Booking<select aria-label={`Update booking status for ${booking.customer_name}`} value={booking.status} onChange={(event) => onStatus(booking, event.target.value)}><option value={booking.status}>{booking.status}</option>{booking.status === 'pending' && <option value="confirmed">Confirmed</option>}{booking.status === 'pending' && !booking.customer_id && <option value="rejected">Rejected</option>}{canComplete && <option value="completed">Completed</option>}{!['cancelled', 'completed', 'rejected'].includes(booking.status) && <option value="cancelled">Cancel</option>}</select></label>}</article>
  })}</div>
}

function BookingForm({ venues, onCancel, onSave }) {
  const [form, setForm] = useState({ venue_id: venues[0]?.id || '', sport: venues[0]?.sport === 'Cricket' ? 'Cricket' : 'Futsal', customer_name: '', customer_contact: '', date: todayInputValue(), start_time: '09:00', end_time: '10:00', status: 'confirmed', notes: '' })
  function change(key) { return (event) => setForm((current) => ({ ...current, [key]: event.target.value })) }
  function changeVenue(event) {
    const venue = venues.find((item) => item.id === event.target.value)
    setForm((current) => ({ ...current, venue_id: event.target.value, sport: venue?.sport === 'Cricket' ? 'Cricket' : 'Futsal' }))
  }
  const selectedVenue = venues.find((venue) => venue.id === form.venue_id)
  if (!venues.length) return <div className="owner-form-card"><EmptyState icon="venue" title="Add a venue before booking" text="Each booking needs a venue to be linked to." action={<Link className="owner-primary-button" to="/owner/venue">Add venue details</Link>} /></div>
  return <form className="owner-form-card owner-booking-form" onSubmit={(event) => { event.preventDefault(); onSave(form) }}><div className="owner-panel-heading"><div><h2>New booking</h2><p>Manually record a venue reservation.</p></div><button className="owner-icon-button" type="button" aria-label="Close booking form" onClick={onCancel}><Icon name="close" size={16} /></button></div><div className="owner-form-grid"><label>Venue<select value={form.venue_id} onChange={changeVenue} required>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label><label>Sport<select value={form.sport} onChange={change('sport')} disabled={selectedVenue?.sport !== 'Both'}>{(selectedVenue?.sport === 'Both' ? ['Futsal', 'Cricket'] : [form.sport]).map((sport) => <option key={sport}>{sport}</option>)}</select></label><label>Customer or team name<input value={form.customer_name} onChange={change('customer_name')} required minLength="2" maxLength="120" placeholder="e.g. Valley Cricket Club" /></label><label>Contact <span>(optional)</span><input value={form.customer_contact} onChange={change('customer_contact')} maxLength="120" placeholder="Phone or email" /></label><label>Date<input type="date" value={form.date} onChange={change('date')} required /></label><label>Start time<input type="time" value={form.start_time} onChange={change('start_time')} required /></label><label>End time<input type="time" value={form.end_time} onChange={change('end_time')} required /></label><label>Booking status<select value={form.status} onChange={change('status')}><option value="confirmed">Confirmed</option><option value="pending">Pending</option></select></label><label className="owner-form-span">Notes <span>(optional)</span><textarea value={form.notes} onChange={change('notes')} maxLength="500" rows="2" placeholder="Any booking notes" /></label></div><p className="owner-form-hint"><Icon name="info" size={13} />Manually recorded bookings do not notify the customer.</p><div className="owner-form-actions"><button className="owner-outline-button" type="button" onClick={onCancel}>Cancel</button><button className="owner-primary-button" type="submit"><Icon name="check" size={15} /> Save booking</button></div></form>
}

function ScheduleForm({ venues, weekday, onCancel, onSave }) {
  const [form, setForm] = useState({ venue_id: venues[0]?.id || '', weekday, start_time: '09:00', end_time: '10:00', price_per_hour: venues[0]?.price_per_hour || 0 })
  function change(key) { return (event) => setForm((current) => ({ ...current, [key]: event.target.value })) }
  return <form className="owner-form-card" onSubmit={(event) => { event.preventDefault(); onSave(form) }}><div className="owner-panel-heading"><div><h2>Add weekly availability</h2><p>Set a recurring time slot for one venue.</p></div><button className="owner-icon-button" type="button" aria-label="Close availability form" onClick={onCancel}><Icon name="close" size={16} /></button></div><div className="owner-form-grid"><label>Venue<select value={form.venue_id} onChange={change('venue_id')} required>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label><label>Day of week<select value={form.weekday} onChange={change('weekday')}>{weekdayNames.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Start time<input type="time" value={form.start_time} onChange={change('start_time')} required /></label><label>End time<input type="time" value={form.end_time} onChange={change('end_time')} required /></label><label>Rate per hour (Rs)<input type="number" min="0" step="50" value={form.price_per_hour} onChange={change('price_per_hour')} required /></label></div><div className="owner-form-actions"><button className="owner-outline-button" type="button" onClick={onCancel}>Cancel</button><button className="owner-primary-button" type="submit"><Icon name="check" size={15} /> Add slot</button></div></form>
}

function VenuePage({ venues, onSave, onToggleActive }) {
  const location = useLocation()
  const [selectedId, setSelectedId] = useState(venues[0]?.id || '')
  const [form, setForm] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  useEffect(() => {
    const requestedVenue = new URLSearchParams(location.search).get('venue')
    if (requestedVenue && venues.some((venue) => venue.id === requestedVenue)) setSelectedId(requestedVenue)
  }, [location.search, venues])
  useEffect(() => {
    const venue = venues.find((item) => item.id === selectedId)
    setPhotoFile(null)
    setForm(venue ? { ...venue, price_per_hour: String(venue.price_per_hour), latitude: venue.latitude ?? '', longitude: venue.longitude ?? '', maps_url: venue.maps_url || '' } : { name: '', sport: 'Futsal', area: '', address: '', description: '', price_per_hour: '2500', image_url: '', maps_url: '', latitude: '', longitude: '', is_active: true })
  }, [selectedId, venues])
  if (!form) return null
  const selectedVenue = venues.find((venue) => venue.id === selectedId)
  function change(key) { return (event) => setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })) }
  function changeVenueName(event) {
    const name = event.target.value
    setForm((current) => ({ ...current, name }))
  }
  return <section className="owner-page">
    <PageHeading title="Your Venue" description="Keep your public venue information, sport, and pricing up to date." action={<button className="owner-primary-button" type="button" onClick={() => setSelectedId('')}><Icon name="add" size={16} /> Add another venue</button>} />
    {venues.length > 1 && <label className="owner-venue-select">Choose venue<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label>}
    <form className="owner-panel owner-venue-form" onSubmit={async (event) => { event.preventDefault(); const saved = await onSave(form, selectedId || undefined, photoFile); if (saved?.id) setSelectedId(saved.id) }}>
      <div className="owner-venue-form-top"><div><span className="owner-form-kicker">VENUE PROFILE</span><h2>{selectedVenue ? 'Update venue details' : 'Add your venue'}</h2><p>This information belongs to your venue owner account.</p></div>{selectedVenue && <span className={`owner-listing-state ${selectedVenue.is_active ? 'active' : 'paused'}`}><i />{selectedVenue.is_active ? 'Listing active' : 'Listing paused'}</span>}</div>
      <div className="owner-form-grid"><label>Venue name<input value={form.name} onChange={changeVenueName} required minLength="2" maxLength="120" placeholder="Your venue’s name" /></label><label>Sport<select value={form.sport} onChange={change('sport')}><option>Futsal</option><option>Cricket</option><option>Both</option></select></label><label>District / area<input value={form.area} onChange={change('area')} required minLength="2" maxLength="160" placeholder="Kathmandu, Lalitpur, or Bhaktapur" /></label><label>Street address<input value={form.address} onChange={change('address')} maxLength="240" placeholder="Full address" /></label><label>Hourly rate (Rs)<input type="number" min="0" step="50" value={form.price_per_hour} onChange={change('price_per_hour')} required /></label><label>Latitude <span>(optional)</span><input type="number" min="-90" max="90" step="any" value={form.latitude} onChange={change('latitude')} placeholder="27.7152" /></label><label>Longitude <span>(optional)</span><input type="number" min="-180" max="180" step="any" value={form.longitude} onChange={change('longitude')} placeholder="85.3128" /></label><label className="owner-form-span">Google Maps link<input type="url" value={form.maps_url} onChange={change('maps_url')} placeholder="https://www.google.com/maps/search/..." /></label><div className="owner-form-span"><VenuePhotoPicker id="owner-venue-photo" file={photoFile} currentUrl={form.image_url} onChange={setPhotoFile} /></div><label className="owner-form-span">About this venue<textarea rows="4" maxLength="1000" value={form.description} onChange={change('description')} placeholder="Tell players about your facilities, surface, changing rooms, or lights." /></label></div>
      {form.maps_url && <a className="owner-maps-preview" href={form.maps_url} target="_blank" rel="noreferrer"><Icon name="pin" size={14} />Preview venue location in Google Maps <Icon name="arrow-right" size={13} /></a>}
      <label className="owner-listing-toggle"><input type="checkbox" checked={Boolean(form.is_active)} onChange={change('is_active')} /><span><b>Show this venue to players</b><small>Pause the public listing without deleting your bookings or schedule.</small></span></label>
      <div className="owner-form-actions"><button className="owner-primary-button" type="submit"><Icon name="check" size={15} /> {selectedVenue ? 'Save changes' : 'Create venue'}</button>{selectedVenue && <button className="owner-outline-button" type="button" onClick={() => onToggleActive(selectedVenue)}>{selectedVenue.is_active ? 'Pause listing' : 'Activate listing'}</button>}</div>
    </form>
  </section>
}

function ReviewList({ reviews, compact = false }) {
  if (!reviews.length) return <EmptyState icon="star" title="No reviews yet" text="Players can review after their accepted booking is marked completed." />
  return <div className={`owner-review-list${compact ? ' compact' : ''}`}>{reviews.map((review) => <article className="owner-review-row" key={review.id}><span className="owner-review-avatar">{initials(review.reviewer_name)}</span><div><b>{review.reviewer_name}</b><span className="owner-review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</span><p>{review.review}</p><small>{formatDateTime(review.created_at, { year: 'numeric' })}</small></div></article>)}</div>
}

function OwnerSettings({ user, venues, onToggleActive }) {
  return <div className="owner-settings-layout"><section className="owner-panel"><div className="owner-panel-heading"><div><h2>Owner account</h2><p>Your signed-in PlayLink account.</p></div></div><div className="owner-settings-facts"><div><small>NAME</small><b>{user?.user_metadata?.full_name || 'Venue Owner'}</b></div><div><small>EMAIL</small><b>{user?.email || '—'}</b></div><div><small>ACCOUNT TYPE</small><b>Venue owner</b></div><div><small>VENUE COUNT</small><b>{venues.length}</b></div></div></section><section className="owner-panel"><div className="owner-panel-heading"><div><h2>Venue listings</h2><p>Control which venues are visible to players.</p></div></div>{venues.length ? <div className="owner-settings-venue-list">{venues.map((venue) => <div key={venue.id}><span><b>{venue.name}</b><small>{venue.area} · {venue.sport}</small></span><button className={`owner-outline-button${venue.is_active ? '' : ' is-paused'}`} type="button" onClick={() => onToggleActive(venue)}>{venue.is_active ? 'Pause listing' : 'Activate listing'}</button></div>)}</div> : <EmptyState icon="venue" title="No venue listing" text="Add your first venue profile to get started." action={<Link className="owner-primary-button" to="/owner/venue">Add venue</Link>} />}</section><p className="owner-helper-note"><Icon name="lock" size={14} />Owner access is verified through your PlayLink account type and Supabase row-level security.</p></div>
}

function EmptyState({ icon, title, text, action }) {
  return <div className="owner-empty-state"><span><Icon name={icon} size={21} /></span><b>{title}</b><p>{text}</p>{action}</div>
}

export default OwnerDashboard
