import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'

const sections = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'users', label: 'Users', icon: 'teams' },
  { id: 'venues', label: 'Venues', icon: 'venue' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'reviews', label: 'Reviews', icon: 'star' },
]

const emptyData = { users: [], venues: [], bookings: [], reviews: [] }

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dateTimeLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-NP', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function StatusPill({ value }) {
  return <span className={`admin-status-pill ${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{value}</span>
}

function TableEmpty({ children }) {
  return <tr><td className="admin-table-empty" colSpan="5">{children}</td></tr>
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [section, setSection] = useState('overview')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updatingVenue, setUpdatingVenue] = useState('')

  const loadDashboard = useCallback(async () => {
    if (authLoading) return
    if (!user || user.id.startsWith('playlink-local-demo')) {
      setAuthorized(false)
      setLoading(false)
      return
    }
    if (!supabase) {
      setError('Admin access requires a configured Supabase project.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data: isAdmin, error: accessError } = await supabase.rpc('is_playlink_admin')
      if (accessError) {
        if (['PGRST202', '42883'].includes(accessError.code)) {
          throw new Error('The admin access setup has not been applied. Run the PlayLink admin access migration and add your account to playlink_admins.')
        }
        throw accessError
      }
      if (!isAdmin) {
        setAuthorized(false)
        setData(emptyData)
        setLoading(false)
        return
      }
      setAuthorized(true)
      const [usersResult, venuesResult, bookingsResult, reviewsResult] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, account_type, created_at').order('created_at', { ascending: false }),
        supabase.from('owner_venues').select('*').order('created_at', { ascending: false }),
        supabase.from('venue_bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('venue_reviews').select('*').order('created_at', { ascending: false }),
      ])
      const failed = [usersResult, venuesResult, bookingsResult, reviewsResult].find((result) => result.error)
      if (failed?.error) throw failed.error
      setData({
        users: usersResult.data || [],
        venues: venuesResult.data || [],
        bookings: bookingsResult.data || [],
        reviews: reviewsResult.data || [],
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The admin dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [authLoading, user])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const venueNames = useMemo(() => new Map(data.venues.map((venue) => [venue.id, venue.name])), [data.venues])
  const query = search.trim().toLowerCase()
  const filterRows = (rows, searchable) => rows.filter((row) => searchable(row).toLowerCase().includes(query))
  const users = useMemo(() => filterRows(data.users, (item) => `${item.display_name} ${item.username} ${item.account_type}`), [data.users, query])
  const venues = useMemo(() => filterRows(data.venues, (item) => `${item.name} ${item.area} ${item.address} ${item.sport} ${item.owner_id}`), [data.venues, query])
  const bookings = useMemo(() => filterRows(data.bookings, (item) => `${item.customer_name} ${item.customer_contact} ${venueNames.get(item.venue_id) || ''} ${item.sport} ${item.status}`), [data.bookings, query, venueNames])
  const reviews = useMemo(() => filterRows(data.reviews, (item) => `${item.reviewer_name} ${item.review} ${venueNames.get(item.venue_id) || ''}`), [data.reviews, query, venueNames])

  async function toggleVenue(venue) {
    if (!supabase) return
    setError('')
    setNotice('')
    setUpdatingVenue(venue.id)
    try {
      const { data: updated, error: updateError } = await supabase.from('owner_venues')
        .update({ is_active: !venue.is_active }).eq('id', venue.id).select('*').single()
      if (updateError) throw updateError
      setData((current) => ({ ...current, venues: current.venues.map((item) => item.id === venue.id ? updated : item) }))
      setNotice(`${venue.name} ${updated.is_active ? 'is now visible' : 'has been paused'}.`)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Venue visibility could not be updated.')
    } finally {
      setUpdatingVenue('')
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
    else window.location.assign('/sign-in')
  }

  if (authLoading || loading) return <div className="auth-loading" role="status">Loading the PlayLink admin dashboard…</div>
  if (!user) return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (!authorized && !error) return <main className="admin-access-denied"><span><Icon name="lock" size={24} /></span><h1>Admin access only</h1><p>This account is not on the PlayLink admin allowlist.</p><button type="button" onClick={signOut}>Sign out</button></main>

  const activeSection = sections.find((item) => item.id === section) || sections[0]
  const cards = [
    { title: 'Registered users', count: data.users.length, icon: 'teams', tone: 'green' },
    { title: 'Venue listings', count: data.venues.length, icon: 'venue', tone: 'blue' },
    { title: 'Booking requests', count: data.bookings.length, icon: 'calendar', tone: 'amber' },
    { title: 'Player reviews', count: data.reviews.length, icon: 'star', tone: 'violet' },
  ]

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Brand light href="/admin" />
        <div className="admin-sidebar-label">PLAYLINK CONTROL</div>
        <nav aria-label="Admin navigation">{sections.map((item) => <button key={item.id} type="button" className={section === item.id ? 'active' : ''} onClick={() => { setSection(item.id); setSearch('') }}><Icon name={item.icon} size={17} /><span>{item.label}</span></button>)}</nav>
        <div className="admin-sidebar-foot"><Icon name="shield-check" size={16} /><span>Restricted admin workspace</span></div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar"><div><small>PLAYLINK / ADMIN</small><b>{activeSection.label}</b></div><span className="admin-topbar-spacer" /><span className="admin-user-label"><i />{user.user_metadata?.full_name || user.email}</span><button type="button" onClick={signOut}>Sign out</button></header>
        <div className="admin-content">
          <header className="admin-page-heading"><div><span>PLATFORM MANAGEMENT</span><h1>{section === 'overview' ? 'Admin overview' : activeSection.label}</h1><p>{section === 'overview' ? 'A live view of PlayLink accounts, facilities, and community activity.' : `Browse and manage PlayLink ${activeSection.label.toLowerCase()}.`}</p></div><button className="admin-refresh-button" type="button" onClick={loadDashboard}><Icon name="refresh" size={15} /> Refresh data</button></header>
          {error && <p className="admin-feedback error" role="alert">{error}<button type="button" onClick={loadDashboard}>Retry</button></p>}
          {notice && <p className="admin-feedback success" role="status">{notice}</p>}
          {section === 'overview' && <>
            <div className="admin-metric-grid">{cards.map((card) => <article className="admin-metric-card" key={card.title}><span className={`admin-metric-icon ${card.tone}`}><Icon name={card.icon} size={19} /></span><small>{card.title}</small><b>{card.count.toLocaleString()}</b></article>)}</div>
            <div className="admin-overview-grid">
              <section className="admin-panel"><header><div><h2>Recent accounts</h2><p>Latest PlayLink registrations</p></div><button type="button" onClick={() => setSection('users')}>View users <Icon name="arrow-right" size={13} /></button></header><div className="admin-table-wrap"><table><thead><tr><th>Member</th><th>Account type</th><th>Joined</th></tr></thead><tbody>{data.users.slice(0, 6).map((member) => <tr key={member.id}><td><b>{member.display_name || member.username}</b><small>@{member.username}</small></td><td><StatusPill value={member.account_type.replace('_', ' ')} /></td><td>{dateLabel(member.created_at)}</td></tr>)}{!data.users.length && <TableEmpty>No user records found.</TableEmpty>}</tbody></table></div></section>
              <section className="admin-panel"><header><div><h2>Venue listings</h2><p>Active and paused facilities</p></div><button type="button" onClick={() => setSection('venues')}>Manage venues <Icon name="arrow-right" size={13} /></button></header><div className="admin-recent-venues">{data.venues.slice(0, 6).map((venue) => <article key={venue.id}><span className="admin-venue-icon"><Icon name="venue" size={16} /></span><span><b>{venue.name}</b><small>{venue.area} · {venue.sport}</small></span><StatusPill value={venue.is_active ? 'Active' : 'Paused'} /></article>)}{!data.venues.length && <p className="admin-table-empty">No venue listings found.</p>}</div></section>
            </div>
          </>}
          {section !== 'overview' && <section className="admin-panel admin-directory-panel">
            <header><div><h2>{activeSection.label}</h2><p>{({ users: data.users.length, venues: data.venues.length, bookings: data.bookings.length, reviews: data.reviews.length })[section]} records</p></div><label className="admin-search"><Icon name="search" size={15} /><input aria-label={`Search ${activeSection.label}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeSection.label.toLowerCase()}…`} /></label></header>
            <div className="admin-table-wrap"><table>
              {section === 'users' && <><thead><tr><th>Member</th><th>Username</th><th>Account type</th><th>Joined</th><th>Account ID</th></tr></thead><tbody>{users.map((member) => <tr key={member.id}><td><b>{member.display_name || 'Unnamed member'}</b></td><td>@{member.username}</td><td><StatusPill value={member.account_type.replace('_', ' ')} /></td><td>{dateLabel(member.created_at)}</td><td><code>{member.id}</code></td></tr>)}{!users.length && <TableEmpty>No users match your search.</TableEmpty>}</tbody></>}
              {section === 'venues' && <><thead><tr><th>Venue</th><th>Sport</th><th>Area</th><th>Rate / hour</th><th>Status / action</th></tr></thead><tbody>{venues.map((venue) => <tr key={venue.id}><td><b>{venue.name}</b><small>{venue.address || 'Address not provided'}</small></td><td>{venue.sport}</td><td>{venue.area}</td><td>Rs {Number(venue.price_per_hour || 0).toLocaleString('en-IN')}</td><td><div className="admin-venue-moderation"><StatusPill value={venue.is_active ? 'Active' : 'Paused'} /><button type="button" disabled={updatingVenue === venue.id} onClick={() => toggleVenue(venue)}>{updatingVenue === venue.id ? 'Saving…' : venue.is_active ? 'Pause listing' : 'Activate'}</button></div></td></tr>)}{!venues.length && <TableEmpty>No venues match your search.</TableEmpty>}</tbody></>}
              {section === 'bookings' && <><thead><tr><th>Player</th><th>Venue</th><th>Sport</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td><b>{booking.customer_name}</b><small>{booking.customer_contact || 'Contact not provided'}</small></td><td>{venueNames.get(booking.venue_id) || 'Venue unavailable'}</td><td>{booking.sport}</td><td>{dateTimeLabel(booking.starts_at)} – {new Date(booking.ends_at).toLocaleTimeString('en-NP', { hour: 'numeric', minute: '2-digit' })}</td><td><StatusPill value={booking.status} /></td></tr>)}{!bookings.length && <TableEmpty>No bookings match your search.</TableEmpty>}</tbody></>}
              {section === 'reviews' && <><thead><tr><th>Player</th><th>Venue</th><th>Rating</th><th>Comment</th><th>Submitted</th></tr></thead><tbody>{reviews.map((review) => <tr key={review.id}><td><b>{review.reviewer_name}</b></td><td>{venueNames.get(review.venue_id) || 'Venue unavailable'}</td><td><span className="admin-review-rating">{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</span></td><td className="admin-review-copy">{review.review}</td><td>{dateLabel(review.created_at)}</td></tr>)}{!reviews.length && <TableEmpty>No reviews match your search.</TableEmpty>}</tbody></>}
            </table></div>
          </section>}
          <p className="admin-footer-note"><Icon name="lock" size={13} />Admin data is protected by Supabase authentication and the PlayLink admin allowlist.</p>
        </div>
      </main>
    </div>
  )
}
