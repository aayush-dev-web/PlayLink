import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'
import { getVenueImage } from '../data/venueImages.js'

const quickActions = [
  { title: 'Find Nearby Venues', description: 'Browse futsal or cricket grounds', href: '/nearby', icon: 'venue' },
  { title: 'Browse Events', description: 'Join or create sporting events', href: '/events', icon: 'calendar' },
  { title: 'Find Teams & Players', description: 'Connect with your community', href: '/teams', icon: 'teams' },
  { title: 'Create an Event', description: 'Set up your own game', href: '/events', icon: 'add' },
]

function CompactVenue({ venue }) {
  return (
    <Link className="dashboard-feature-venue" to="/venues" aria-label={`Explore ${venue.name}`}>
      <div className="dashboard-feature-photo" style={{ backgroundImage: `url("${getVenueImage(venue)}")` }}>
        <span>{venue.sport}</span>
      </div>
      <div className="dashboard-feature-copy">
        <h3>{venue.name}</h3>
        <p><Icon name="pin" size={12} />{venue.area}</p>
        <div className="dashboard-feature-tags"><span>{venue.sport}</span></div>
        <div className="dashboard-feature-meta"><b>Rs {Number(venue.price_per_hour || 0).toLocaleString()}<small>/hr</small></b></div>
      </div>
    </Link>
  )
}

function UpcomingEvent({ event }) {
  const date = new Date(event.start_time)
  return (
    <Link className="dashboard-upcoming-event" to={`/events/${event.id}`}>
      <div className={`dashboard-upcoming-image${event.sport_type === 'cricket' ? ' is-cricket' : ''}`} />
      <span className="dashboard-upcoming-copy">
        <b>{event.title}</b>
        <small><Icon name="calendar" size={12} />{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small>
        <small><Icon name="pin" size={12} />{event.location_text}</small>
        <i>{event.status}</i>
      </span>
    </Link>
  )
}

export default function DashboardHome() {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [search, setSearch] = useState('')
  const [venues, setVenues] = useState([])
  const [events, setEvents] = useState([])
  const [counts, setCounts] = useState({ venues: 0, events: 0, teams: 0, players: 0 })
  const [loading, setLoading] = useState(true)
  const fullName = profile?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Player'

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      setError('')
      if (!supabase || !user) {
        setError('Connect to PlayLink with your Supabase account to load live dashboard data.')
        setLoading(false)
        return
      }
      try {
        const [profileResult, venueResult, eventResult, venueCount, eventCount, teamCount, playerCount] = await Promise.all([
          supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
          supabase.from('owner_venues').select('id, name, sport, area, price_per_hour, image_url').eq('is_active', true).order('created_at', { ascending: false }).limit(3),
          supabase.from('events').select('id, title, sport_type, location_text, start_time, status').eq('status', 'open').gte('start_time', new Date().toISOString()).order('start_time', { ascending: true }).limit(3),
          supabase.from('owner_venues').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'open').gte('start_time', new Date().toISOString()),
          supabase.from('community_teams').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('player_listings').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ])
        const results = [profileResult, venueResult, eventResult, venueCount, eventCount, teamCount, playerCount]
        const failed = results.find((result) => result.error)
        if (failed) throw failed.error
        if (!active) return
        setProfile(profileResult.data)
        setVenues(venueResult.data || [])
        setEvents(eventResult.data || [])
        setCounts({ venues: venueCount.count || 0, events: eventCount.count || 0, teams: teamCount.count || 0, players: playerCount.count || 0 })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Dashboard data could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadDashboard()
    return () => { active = false }
  }, [user])

  const filteredVenues = venues.filter((venue) => !search.trim() || `${venue.name} ${venue.area} ${venue.sport}`.toLowerCase().includes(search.trim().toLowerCase()))
  const filteredEvents = events.filter((event) => !search.trim() || `${event.title} ${event.location_text} ${event.sport_type}`.toLowerCase().includes(search.trim().toLowerCase()))
  const metrics = [
    { title: 'Active Venues', count: counts.venues, subtitle: 'Owner listings', icon: 'field', href: '/nearby' },
    { title: 'Upcoming Events', count: counts.events, subtitle: 'Open events', icon: 'calendar', href: '/events' },
    { title: 'Active Teams', count: counts.teams, subtitle: 'Community listings', icon: 'teams', href: '/teams' },
    { title: 'Player Profiles', count: counts.players, subtitle: 'Community listings', icon: 'player', href: '/players' },
  ]

  return (
    <DashboardShell path="/dashboard" search={search} onSearch={setSearch}>
      <div className="playlink-home-dashboard">
        <div className="home-dashboard-columns">
          <div className="home-dashboard-main">
            <section className="home-dashboard-hero">
              <div>
                <h1>Welcome back,<br /><span>{fullName}.</span></h1>
                <p>Find courts, join games, and connect with your local sports community.</p>
                <Link className="button button-primary" to="/venues">Explore Venues <span>→</span></Link>
              </div>
            </section>
            {error && <p className="auth-message error" role="alert">{error}</p>}
            <section className="dashboard-metrics" aria-label="PlayLink live overview">
              {metrics.map((metric) => <Link className="dashboard-metric" to={metric.href} key={metric.title} aria-label={`Open ${metric.title}`}>
                <span className="dashboard-metric-icon"><Icon name={metric.icon} size={22} /></span>
                <div><span>{metric.title}</span><b>{loading ? '—' : metric.count}</b><small>{metric.subtitle}</small></div>
              </Link>)}
            </section>
            <section className="dashboard-featured-panel">
              <div className="dashboard-section-heading"><h2>Active Venues</h2><Link to="/venues">View All <span>→</span></Link></div>
              {loading ? <div className="dashboard-home-empty">Loading active venue listings…</div> : filteredVenues.length ? <div className="dashboard-featured-grid">{filteredVenues.map((venue) => <CompactVenue key={venue.id} venue={venue} />)}</div>
                : <div className="dashboard-home-empty"><b>No active venues yet</b><span>Venue listings published by owners will appear here.</span></div>}
            </section>
            <section className="dashboard-community-banner">
              <span aria-hidden="true"><Icon name="teams" size={26} /></span>
              <div><b>Join a Team or Find Players</b><p>Connect with local athletes and find your next team.</p></div>
              <Link className="button button-primary" to="/teams">Explore Teams <span>→</span></Link>
            </section>
          </div>
          <aside className="home-dashboard-aside">
            <section className="dashboard-quick-actions">
              <h2>Quick Actions</h2>
              {quickActions.map((action) => <Link className="dashboard-quick-action" to={action.href} key={action.title}>
                <span className="dashboard-quick-icon"><Icon name={action.icon} size={24} /></span>
                <span><b>{action.title}</b><small>{action.description}</small></span>
                <i>›</i>
              </Link>)}
            </section>
            <section className="dashboard-upcoming-panel">
              <div className="dashboard-section-heading"><h2>Upcoming Events</h2><Link to="/events">View All <span>→</span></Link></div>
              {loading ? <div className="dashboard-home-empty">Loading events…</div> : filteredEvents.length ? filteredEvents.map((event) => <UpcomingEvent key={event.id} event={event} />)
                : <div className="dashboard-home-empty"><b>No upcoming events</b><span>Published open events will appear here.</span></div>}
            </section>
          </aside>
        </div>
      </div>
    </DashboardShell>
  )
}
