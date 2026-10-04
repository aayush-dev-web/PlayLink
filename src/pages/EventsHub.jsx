import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { eventErrorMessage, eventStatusLabel, formatEventDate, getOwnAccountType, localDateTimeToIso, supabase } from '../data/eventApi.js'

const sports = [
  { label: 'All events', value: '', icon: 'calendar' },
  { label: 'Futsal', value: 'futsal', icon: 'futsal' },
  { label: 'Cricket', value: 'cricket', icon: 'cricket' },
]

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function EventCard({ event }) {
  const openSpots = Math.max(0, event.max_teams - event.team_count)
  const image = event.sport_type === 'cricket' ? 'fut2.png' : 'fut1.png'
  return (
    <article className="dashboard-event-card event-live-card">
      <div className="dashboard-event-photo" style={{ backgroundImage: `linear-gradient(180deg,rgba(6,35,48,.04),rgba(6,35,48,.28)),url("/sports/${image}")` }}>
        <span className={`event-status-chip event-status-${event.status}`}>{eventStatusLabel(event.status)}</span>
        <span className="event-card-sport"><Icon name={event.sport_type === 'futsal' ? 'futsal' : 'cricket'} size={13} />{event.sport_type === 'futsal' ? 'Futsal' : 'Cricket'}</span>
      </div>
      <div className="dashboard-event-body">
        <div className="dashboard-event-date"><Icon name="calendar" size={13} />{formatEventDate(event.start_time)}</div>
        <h2>{event.title}</h2>
        <p className="dashboard-event-description">{event.description || 'A PlayLink community game.'}</p>
        <div className="dashboard-event-location"><Icon name="pin" size={13} /><span>{event.location_text}</span></div>
        <div className="event-organizer-caption">Organized by {event.organizer_name}</div>
        <div className="dashboard-event-foot">
          <span className="event-attending"><b>{event.team_count}/{event.max_teams}</b> teams · {openSpots} {openSpots === 1 ? 'spot' : 'spots'} left</span>
          <Link className="button button-primary event-join" to={`/events/${event.id}`}>View details <Icon name="arrow-right" size={13} /></Link>
        </div>
      </div>
    </article>
  )
}

function CreateEventForm({ busy, onSubmit, error }) {
  const today = new Date()
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return (
    <form className="demo-form event-form" onSubmit={onSubmit}>
      <p className="modal-lead">Publish a match for your community. Venue selection is not connected in this project yet, so enter a clear location or venue name.</p>
      <label>Event title<input name="title" required minLength="3" maxLength="100" placeholder="e.g. Sunday evening futsal" /></label>
      <div className="form-row">
        <label>Sport<select name="sport_type" required defaultValue=""><option value="" disabled>Choose sport</option><option value="futsal">Futsal</option><option value="cricket">Cricket</option></select></label>
        <label>Maximum teams<input name="max_teams" type="number" required min="1" max="64" defaultValue="4" /></label>
      </div>
      <label>Venue or location<input name="location_text" required minLength="2" maxLength="180" placeholder="Venue name or area, e.g. Patan, Lalitpur" /></label>
      <div className="form-row">
        <label>Date<input name="date" type="date" required min={localToday} /></label>
        <label>Start time<input name="start_time" type="time" required /></label>
      </div>
      <div className="form-row">
        <label>End time<input name="end_time" type="time" required /></label>
        <label>Your team name <span className="auth-optional">(optional)</span><input name="organizer_team_name" maxLength="80" placeholder="If your team is playing" /></label>
      </div>
      <label>Description<textarea name="description" rows="4" maxLength="3000" placeholder="Share the format, experience level, or anything teams should know." /></label>
      {error && <p className="event-feedback error" role="alert">{error}</p>}
      <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? 'Publishing event…' : 'Publish event'}</button>
    </form>
  )
}

export default function EventsHub() {
  const { user } = useAuth()
  const [search, setSearch] = useState(new URLSearchParams(window.location.search).get('q') || '')
  const [sport, setSport] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState('upcoming')
  const [sort, setSort] = useState('newest')
  const [today, setToday] = useState(() => new Date())
  const [fullCalendarOpen, setFullCalendarOpen] = useState(false)
  const [fullCalendarDate, setFullCalendarDate] = useState(() => dateKey(new Date()))
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [availableOnly, setAvailableOnly] = useState(false)
  const [events, setEvents] = useState([])
  const eventsRef = useRef([])
  const [hasMore, setHasMore] = useState(false)
  const [requests, setRequests] = useState([])
  const [accountType, setAccountType] = useState(user?.user_metadata?.account_type || null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [error, setError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const todayKey = dateKey(today)
  const currentMonthDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
  const calendarOffset = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay()
  const eventDates = useMemo(() => new Set(events.map((event) => localDateKey(event.start_time))), [events])
  const sortedEvents = useMemo(() => [...events].sort((first, second) => {
    if (sort === 'title') return first.title.localeCompare(second.title)
    const difference = new Date(first.start_time) - new Date(second.start_time)
    return sort === 'soonest' ? difference : -difference
  }), [events, sort])
  const selectedDayEvents = useMemo(() => events
    .filter((event) => localDateKey(event.start_time) === fullCalendarDate)
    .sort((first, second) => new Date(first.start_time) - new Date(second.start_time)), [events, fullCalendarDate])
  const monthEventCount = useMemo(() => events.filter((event) => {
    const eventDate = new Date(event.start_time)
    return eventDate.getFullYear() === calendarMonth.getFullYear() && eventDate.getMonth() === calendarMonth.getMonth()
  }).length, [events, calendarMonth])
  const nextScheduledEvent = useMemo(() => events
    .filter((event) => !['completed', 'cancelled'].includes(event.status) && new Date(event.start_time) >= today)
    .sort((first, second) => new Date(first.start_time) - new Date(second.start_time))[0], [events, today])

  const canOrganize = Boolean(user && user.id !== 'playlink-local-demo' && ['team_organizer', 'venue_owner'].includes(accountType))

  useEffect(() => {
    let timer
    const updateAtNextMidnight = () => {
      const now = new Date()
      setToday(now)
      if (now.getDate() === 1) {
        const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        setCalendarMonth((month) => month.getFullYear() === previousMonth.getFullYear()
          && month.getMonth() === previousMonth.getMonth()
          ? new Date(now.getFullYear(), now.getMonth(), 1)
          : month)
      }
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = window.setTimeout(updateAtNextMidnight, nextMidnight.getTime() - now.getTime() + 50)
    }
    updateAtNextMidnight()
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!fullCalendarOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setFullCalendarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [fullCalendarOpen])

  const dateRange = useMemo(() => {
    if (!date) return { from: null, to: null }
    const from = new Date(`${date}T00:00:00`)
    const to = new Date(from)
    to.setDate(to.getDate() + 1)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [date])

  const loadEvents = useCallback(async (append = false) => {
    if (!supabase) {
      setError('Connect Supabase and apply the Phase 3 database migration to browse published events.')
      setEvents([])
      eventsRef.current = []
      setLoading(false)
      return
    }
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const { data, error: queryError } = await supabase.rpc('list_playlink_events', {
        p_search: search.trim() || null,
        p_sport: sport || null,
        p_location: location.trim() || null,
        p_from: dateRange.from,
        p_to: dateRange.to,
        p_available_only: availableOnly,
        p_status: status,
        p_limit: 24,
        p_offset: append ? eventsRef.current.length : 0,
      })
      if (queryError) {
        setError(eventErrorMessage(queryError))
        if (!append) {
          eventsRef.current = []
          setEvents([])
        }
        setHasMore(false)
      } else {
        setError('')
        eventsRef.current = append ? [...eventsRef.current, ...(data || [])] : data || []
        setEvents(eventsRef.current)
        setHasMore((data || []).length === 24)
      }
    } catch (queryError) {
      setError(eventErrorMessage(queryError))
      if (!append) {
        eventsRef.current = []
        setEvents([])
      }
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [search, sport, location, dateRange, availableOnly, status])

  useEffect(() => {
    const timer = window.setTimeout(loadEvents, 250)
    return () => window.clearTimeout(timer)
  }, [loadEvents])

  useEffect(() => {
    let active = true
    async function loadAccountAndRequests() {
      setRequests([])
      setAccountType(user?.user_metadata?.account_type || null)
      if (!user || user.id === 'playlink-local-demo' || !supabase) return
      try {
        const [type, result] = await Promise.all([
          getOwnAccountType(user),
          supabase.rpc('my_playlink_event_requests'),
        ])
        if (!active) return
        setAccountType(type)
        if (result.error) setRequestError(eventErrorMessage(result.error))
        else {
          setRequestError('')
          setRequests(result.data || [])
        }
      } catch (accountError) {
        if (active) setRequestError(eventErrorMessage(accountError))
      } finally {
        if (active) setRequestLoading(false)
      }
    }
    setRequestLoading(Boolean(user && user.id !== 'playlink-local-demo'))
    loadAccountAndRequests()
    return () => { active = false }
  }, [user])

  async function createEvent(submitEvent) {
    submitEvent.preventDefault()
    if (!user) {
      setCreateError('Sign in with an organizer account to publish an event.')
      return
    }
    if (!canOrganize) {
      setCreateError('An organizer account is required. Local demo sessions cannot publish real events.')
      return
    }
    const form = new FormData(submitEvent.currentTarget)
    const startDate = String(form.get('date'))
    const startTime = String(form.get('start_time'))
    const endTime = String(form.get('end_time'))
    if (!startDate || !startTime || !endTime || endTime <= startTime) {
      setCreateError('Choose an end time later than the start time on the selected date.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const { data, error: createFailure } = await supabase.rpc('create_playlink_event', {
        p_title: String(form.get('title')).trim(),
        p_sport_type: String(form.get('sport_type')),
        p_description: String(form.get('description') || '').trim(),
        p_location_text: String(form.get('location_text')).trim(),
        p_start_time: localDateTimeToIso(startDate, startTime),
        p_end_time: localDateTimeToIso(startDate, endTime),
        p_max_teams: Number(form.get('max_teams')),
        p_organizer_team_name: String(form.get('organizer_team_name') || '').trim() || null,
      })
      if (createFailure) {
        setCreateError(eventErrorMessage(createFailure))
        return
      }
      setShowCreate(false)
      await loadEvents()
      window.location.assign(`/events/${data}`)
    } catch (createFailure) {
      setCreateError(eventErrorMessage(createFailure))
    } finally {
      setCreating(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setSport('')
    setLocation('')
    setDate('')
    setStatus('upcoming')
    setAvailableOnly(false)
  }

  const upcoming = events.filter((event) => !['completed', 'cancelled'].includes(event.status)).slice(0, 3)
  const setCalendarDate = (dayKey) => {
    setFullCalendarDate(dayKey)
    setDate(dayKey)
  }
  const renderCalendarDays = () => (
    <>
      {weekdayLabels.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: calendarOffset }, (_, index) => <span className="calendar-empty-day" key={`empty-${index}`} />)}
      {Array.from({ length: currentMonthDays }, (_, index) => {
        const day = index + 1
        const dayKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const hasEvent = eventDates.has(dayKey)
        const isToday = dayKey === todayKey
        const isSelected = fullCalendarOpen ? fullCalendarDate === dayKey : date === dayKey
        return <button key={dayKey} type="button" className={`${hasEvent ? 'has-event' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' selected' : ''}`} aria-pressed={isSelected} aria-current={isToday ? 'date' : undefined} aria-label={`${calendarMonth.toLocaleDateString(undefined, { month: 'long' })} ${day}${isToday ? ', today' : ''}${hasEvent ? ', events available' : ''}`} onClick={() => setCalendarDate(dayKey)}>{day}{hasEvent && <i aria-hidden="true" />}</button>
      })}
    </>
  )
  const openFullCalendar = () => {
    const selectedDate = date || todayKey
    const calendarDate = new Date(`${selectedDate}T12:00:00`)
    setCalendarMonth(new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1))
    setFullCalendarDate(selectedDate)
    setFullCalendarOpen(true)
  }

  return (
    <DashboardShell path="/events" search={search} onSearch={setSearch}>
      <div className="events-dashboard">
        <div className="events-dashboard-grid">
          <section className="events-feed" aria-label="Discover events">
            <header className="events-page-heading">
              <h1>Sporting Events</h1>
              <p>Find and join matches, tournaments and sporting events in your area.</p>
              <div className="events-sport-tabs" aria-label="Filter events by sport">
                {sports.map((item) => <button key={item.label} type="button" aria-pressed={sport === item.value} className={sport === item.value ? 'active' : ''} onClick={() => setSport(item.value)}><Icon name={item.icon} size={15} />{item.label}</button>)}
              </div>
            </header>
            <div className="event-filter-bar event-live-filters">
              <label className="event-filter-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events..." aria-label="Search event titles and descriptions" /></label>
              <label><small>Location / Area</small><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Any area" /></label>
              <label><small>Date</small><input value={date} onChange={(event) => setDate(event.target.value)} type="date" aria-label="Filter by event date" /></label>
              <label><small>Sport</small><select value={sport} onChange={(event) => setSport(event.target.value)}><option value="">All sports</option><option value="futsal">Futsal</option><option value="cricket">Cricket</option></select></label>
              <label><small>Status</small><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="upcoming">Upcoming</option><option value="open">Open</option><option value="full">Full</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="all">All events</option></select></label>
              <button className="button button-primary create-event-button" type="button" onClick={() => { setCreateError(''); setShowCreate(true) }}><Icon name="add" size={15} /> Create Event</button>
            </div>
            <div className="events-result-bar"><span>{loading ? 'Searching events…' : `Showing ${events.length} ${events.length === 1 ? 'event' : 'events'}`}</span><label className="events-spots-toggle"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Spots available</label><label>Sort by <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="soonest">Soonest first</option><option value="title">Event name</option></select></label></div>
            {error && <p className="event-feedback error" role="alert">{error}</p>}
            {loading && !events.length ? <div className="event-loading" role="status">Loading events from PlayLink…</div>
              : events.length ? <><div className="dashboard-event-grid">{sortedEvents.map((event) => <EventCard key={event.id} event={event} />)}</div>{hasMore && <button className="button button-outline event-load-more" type="button" disabled={loading || loadingMore} onClick={() => loadEvents(true)}>{loadingMore ? 'Loading more…' : 'Load more events'}</button>}</>
                : !error && <div className="empty-state"><span><Icon name="calendar" size={24} /></span><h2>No events found</h2><p>There are no matching published events. Try changing your search or filters.</p><button className="button button-primary" type="button" onClick={clearFilters}>Clear filters</button></div>}
            <p className="dashboard-demo-caption">Events are read from Supabase. Locations are entered by organizers; venue booking is not included.</p>
          </section>

          <aside className="events-aside">
            <section className="dashboard-side-card upcoming-card">
              <div className="dashboard-aside-heading"><h2><Icon name="calendar" size={16} /> Upcoming events</h2><button type="button" onClick={() => { setStatus('upcoming'); setDate('') }}>View all <Icon name="arrow-right" size={12} /></button></div>
              {upcoming.length ? upcoming.map((event) => <Link className="upcoming-row" to={`/events/${event.id}`} key={event.id}><img src={`/sports/${event.sport_type === 'cricket' ? 'fut2.png' : 'fut1.png'}`} alt="" /><span><b>{event.title}</b><small><Icon name="calendar" size={11} />{formatEventDate(event.start_time)}</small><small><Icon name="pin" size={11} />{event.location_text}</small><i>{eventStatusLabel(event.status)}</i></span><Icon className="upcoming-chevron" name="arrow-right" size={13} /></Link>) : <p className="event-aside-empty">Upcoming published events will appear here.</p>}
            </section>
            <section className="dashboard-side-card calendar-card">
              <div className="dashboard-aside-heading"><h2><Icon name="calendar" size={16} /> Calendar</h2><button type="button" onClick={openFullCalendar}>View full calendar <Icon name="arrow-right" size={12} /></button></div>
              <div className="events-calendar-month"><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevron-left" size={14} /></button><b>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevron-right" size={14} /></button></div>
              <div className="calendar-grid events-calendar-grid" role="group" aria-label="Filter events by date">{renderCalendarDays()}</div>
            </section>
            <section className="dashboard-side-card quick-actions-card"><h2><Icon name="lightning" size={15} /> Quick actions</h2><Link to="/venues"><span className="quick-action-icon"><Icon name="venue" size={15} /></span><span><b>Browse venues</b><small>Find the perfect place to play</small></span><Icon name="arrow-right" size={13} /></Link><Link to="/teams"><span className="quick-action-icon"><Icon name="teams" size={15} /></span><span><b>Find teams</b><small>Connect with teams near you</small></span><Icon name="arrow-right" size={13} /></Link><button type="button" onClick={() => { setCreateError(''); setShowCreate(true) }}><span className="quick-action-icon"><Icon name="add" size={15} /></span><span><b>Create event</b><small>Host your own game or tournament</small></span><Icon name="arrow-right" size={13} /></button></section>
            <section className="dashboard-side-card event-requests-card">
              <div className="dashboard-aside-heading"><h2><Icon name="teams" size={15} /> My team requests</h2>{user && user.id !== 'playlink-local-demo' && <span>{requests.filter((item) => item.status === 'pending').length} pending</span>}</div>
              {!user ? <p className="event-aside-empty">Sign in to see the requests your team has made.</p>
                : user.id === 'playlink-local-demo' ? <p className="event-aside-empty">Local preview sessions do not send or save team requests.</p>
                  : requestLoading ? <p className="event-aside-empty">Loading your requests…</p>
                    : requestError ? <p className="event-feedback error" role="alert">{requestError}</p>
                      : requests.length ? requests.slice(0, 6).map((request) => <Link className="my-event-request" to={`/events/${request.event_id}`} key={request.id}><span><b>{request.team_name}</b><small>{request.event_title}</small></span><i className={`event-request-status status-${request.status}`}>{eventStatusLabel(request.status)}</i></Link>)
                        : <p className="event-aside-empty">Your team’s event requests and their status will appear here.</p>}
            </section>
          </aside>
        </div>
      </div>
      {fullCalendarOpen && createPortal(
        <div className="events-calendar-overlay" role="presentation">
          <button className="events-calendar-backdrop" type="button" aria-label="Close full calendar" onClick={() => setFullCalendarOpen(false)} />
          <section className="events-full-calendar" role="dialog" aria-modal="true" aria-labelledby="full-calendar-title">
            <header className="events-full-calendar-header">
              <span className="events-full-calendar-icon"><Icon name="calendar" size={20} /></span>
              <div><span className="events-full-calendar-kicker">PLAYLINK SCHEDULE</span><h2 id="full-calendar-title">Event calendar</h2><p>Explore match dates and check your schedule at a glance.</p></div>
              <button type="button" aria-label="Close full calendar" onClick={() => setFullCalendarOpen(false)}><Icon name="close" size={19} /></button>
            </header>
            <div className="events-full-calendar-content">
              <section className="events-full-calendar-main" aria-label="Monthly event calendar">
                <div className="events-full-calendar-controls">
                  <button type="button" className="events-today-button" onClick={() => { setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setCalendarDate(todayKey) }}>Today</button>
                  <div className="events-calendar-month"><button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevron-left" size={16} /></button><b>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevron-right" size={16} /></button></div>
                </div>
                <div className="calendar-grid events-calendar-grid is-expanded" role="group" aria-label="Select a date to filter events">{renderCalendarDays()}</div>
                <div className="events-calendar-legend"><span><i className="legend-today" /> Today</span><span><i className="legend-scheduled" /> Dates with events</span><span><i className="legend-selected" /> Selected date</span></div>
              </section>
              <aside className="events-calendar-details">
                <span className="events-calendar-details-label">SELECTED DATE</span>
                <h3>{new Date(`${fullCalendarDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                <p className="events-calendar-month-summary"><Icon name="calendar" size={15} />{monthEventCount} {monthEventCount === 1 ? 'event' : 'events'} this month</p>
                <h4>Events on this day</h4>
                {selectedDayEvents.length ? <div className="events-calendar-event-list">{selectedDayEvents.map((event) => <Link key={event.id} to={`/events/${event.id}`} onClick={() => setFullCalendarOpen(false)}><span className={`events-calendar-event-sport ${event.sport_type}`}><Icon name={event.sport_type === 'cricket' ? 'cricket' : 'futsal'} size={15} /></span><span className="events-calendar-event-copy"><b>{event.title}</b><small><Icon name="clock" size={12} />{new Date(event.start_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small><small><Icon name="pin" size={12} />{event.location_text}</small><small>{event.team_count}/{event.max_teams} teams · {Math.max(0, event.max_teams - event.team_count)} spots left</small></span><Icon name="arrow-right" size={14} /></Link>)}</div>
                  : <div className="events-calendar-no-events"><span><Icon name="calendar" size={21} /></span><b>No events on this day</b><p>Select another date, or create an event for your community.</p><button type="button" className="button button-primary" onClick={() => { setFullCalendarOpen(false); setCreateError(''); setShowCreate(true) }}><Icon name="add" size={14} /> Create Event</button></div>}
                {nextScheduledEvent && <Link className="events-calendar-next-event" to={`/events/${nextScheduledEvent.id}`} onClick={() => setFullCalendarOpen(false)}><span>UP NEXT</span><b>{nextScheduledEvent.title}</b><small>{formatEventDate(nextScheduledEvent.start_time)}</small></Link>}
              </aside>
            </div>
            <footer className="events-full-calendar-footer"><span><Icon name="pin" size={14} /> Times are shown in your local timezone.</span><button type="button" onClick={() => setFullCalendarOpen(false)}>Done</button></footer>
          </section>
        </div>,
        document.body,
      )}
      {showCreate && <Modal eyebrow="PLAYLINK EVENTS" title="Create an event" onClose={() => setShowCreate(false)}><CreateEventForm busy={creating} error={createError} onSubmit={createEvent} /></Modal>}
    </DashboardShell>
  )
}
