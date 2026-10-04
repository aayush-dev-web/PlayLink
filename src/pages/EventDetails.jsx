import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { eventErrorMessage, eventStatusLabel, formatEventDate, formatEventDay, getOwnAccountType, localDateTimeToIso, supabase, toLocalDateTime } from '../data/eventApi.js'

function EventEditForm({ event, busy, error, onSubmit }) {
  const start = toLocalDateTime(event.start_time)
  const end = toLocalDateTime(event.end_time)
  return (
    <form className="demo-form event-form" onSubmit={onSubmit}>
      <label>Event title<input name="title" required minLength="3" maxLength="100" defaultValue={event.title} /></label>
      <div className="form-row">
        <label>Sport<select name="sport_type" required defaultValue={event.sport_type}><option value="futsal">Futsal</option><option value="cricket">Cricket</option></select></label>
        <label>Maximum teams<input name="max_teams" type="number" required min="1" max="64" defaultValue={event.max_teams} /></label>
      </div>
      <label>Venue or location<input name="location_text" required minLength="2" maxLength="180" defaultValue={event.location_text} /></label>
      <div className="form-row">
        <label>Date<input name="date" type="date" required defaultValue={start.date} /></label>
        <label>Start time<input name="start_time" type="time" required defaultValue={start.time} /></label>
      </div>
      <label>End time<input name="end_time" type="time" required defaultValue={end.time} /></label>
      <label>Description<textarea name="description" rows="4" maxLength="3000" defaultValue={event.description} /></label>
      {error && <p className="event-feedback error" role="alert">{error}</p>}
      <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? 'Saving changes…' : 'Save changes'}</button>
    </form>
  )
}

export default function EventDetails({ eventId }) {
  const { user } = useAuth()
  const [details, setDetails] = useState(null)
  const [accountType, setAccountType] = useState(user?.user_metadata?.account_type || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [showRequest, setShowRequest] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const event = details?.event
  const isOrganizer = Boolean(event && user && user.id === event.organizer_id)
  const canRequest = Boolean(user && user.id !== 'playlink-local-demo' && ['team_organizer', 'venue_owner'].includes(accountType))
  const hasSpot = Boolean(event && details.team_count < event.max_teams)

  const loadEvent = useCallback(async () => {
    if (!supabase) {
      setError('Connect Supabase and apply the Phase 3 database migration to load event details.')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error: loadError } = await supabase.rpc('get_playlink_event', { p_event_id: eventId })
      if (loadError) {
        setError(eventErrorMessage(loadError))
        setDetails(null)
      } else if (!data) {
        setError('This event could not be found, or is not available publicly.')
        setDetails(null)
      } else {
        setError('')
        setDetails(data)
      }
    } catch (loadError) {
      setError(eventErrorMessage(loadError))
      setDetails(null)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { loadEvent() }, [loadEvent])

  useEffect(() => {
    let active = true
    getOwnAccountType(user).then((type) => {
      if (active) setAccountType(type)
    }).catch(() => {
      if (active) setAccountType(null)
    })
    return () => { active = false }
  }, [user])

  async function runAction(name, rpcName, args, refresh = true) {
    setActionError('')
    setBusyAction(name)
    try {
      const { error: actionFailure } = await supabase.rpc(rpcName, args)
      if (actionFailure) {
        setActionError(eventErrorMessage(actionFailure))
        return false
      }
      if (refresh) await loadEvent()
      return true
    } catch (actionFailure) {
      setActionError(eventErrorMessage(actionFailure))
      return false
    } finally {
      setBusyAction('')
    }
  }

  async function submitJoinRequest(submitEvent) {
    submitEvent.preventDefault()
    const form = new FormData(submitEvent.currentTarget)
    const ok = await runAction('request', 'request_to_join_playlink_event', {
      p_event_id: event.id,
      p_team_name: String(form.get('team_name')).trim(),
      p_message: String(form.get('message') || '').trim(),
    })
    if (ok) setShowRequest(false)
  }

  async function submitEdit(submitEvent) {
    submitEvent.preventDefault()
    const form = new FormData(submitEvent.currentTarget)
    const date = String(form.get('date'))
    const startTime = String(form.get('start_time'))
    const endTime = String(form.get('end_time'))
    if (!date || !startTime || !endTime || endTime <= startTime) {
      setActionError('Choose an end time later than the start time on the selected date.')
      return
    }
    const ok = await runAction('edit', 'update_playlink_event', {
      p_event_id: event.id,
      p_title: String(form.get('title')).trim(),
      p_sport_type: String(form.get('sport_type')),
      p_description: String(form.get('description') || '').trim(),
      p_location_text: String(form.get('location_text')).trim(),
      p_start_time: localDateTimeToIso(date, startTime),
      p_end_time: localDateTimeToIso(date, endTime),
      p_max_teams: Number(form.get('max_teams')),
    })
    if (ok) setShowEdit(false)
  }

  async function cancelEvent() {
    if (window.confirm('Cancel this event? Pending requests will be withdrawn, and the event history will remain visible.')) {
      await runAction('cancel', 'cancel_playlink_event', { p_event_id: event.id })
    }
  }

  if (loading) return <DashboardShell path="/events"><div className="event-loading" role="status">Loading event details…</div></DashboardShell>
  if (!event) return (
    <DashboardShell path="/events">
      <section className="event-page-message"><span className="dashboard-kicker">PLAYLINK EVENTS</span><h1>Event unavailable</h1><p>{error}</p><Link className="button button-primary" to="/events">Back to events</Link></section>
    </DashboardShell>
  )

  const hasStarted = new Date(event.start_time) <= new Date()
  const isEnded = new Date(event.end_time) <= new Date()
  const request = details.my_request
  const openRequest = event.status === 'open' && hasSpot && !hasStarted

  return (
    <DashboardShell path="/events">
      <div className="event-detail-page">
        <Link className="event-back-link" to="/events">← Back to events</Link>
        <section className="event-detail-hero">
          <div>
            <span className="dashboard-kicker">{event.sport_type === 'futsal' ? 'FUTSAL' : 'CRICKET'} · PLAYLINK EVENT</span>
            <h1>{event.title}</h1>
            <p>{event.description || 'A PlayLink community game.'}</p>
            <div className="event-detail-statuses"><span className={`event-status-chip event-status-${event.status}`}>{eventStatusLabel(event.status)}</span><span className="event-detail-organizer">Organized by {event.organizer_name}{event.organizer_username ? ` · @${event.organizer_username}` : ''}</span></div>
          </div>
          <div className="event-capacity-card"><b>{details.team_count}<small> / {event.max_teams}</small></b><span>Teams participating</span><i>{hasSpot && event.status === 'open' ? `${event.max_teams - details.team_count} ${event.max_teams - details.team_count === 1 ? 'spot' : 'spots'} remaining` : 'No open team spots'}</i></div>
        </section>

        {error && <p className="event-feedback error" role="alert">{error}</p>}
        {actionError && <p className="event-feedback error" role="alert">{actionError}</p>}

        <div className="event-detail-grid">
          <div className="event-detail-main">
            <section className="event-info-panel">
              <h2>Event information</h2>
              <div className="event-facts-grid">
                <div><small>DATE & TIME</small><b>{formatEventDate(event.start_time)}</b><span>Ends {formatEventDate(event.end_time)}</span></div>
                <div><small>SPORT</small><b>{event.sport_type === 'futsal' ? 'Futsal' : 'Cricket'}</b></div>
                <div><small>LOCATION</small><b>{event.location_text}</b><span>Location provided by organizer</span></div>
                <div><small>PARTICIPATION</small><b>{details.team_count} of {event.max_teams} teams</b><span>{event.status === 'full' ? 'At capacity' : `${Math.max(0, event.max_teams - details.team_count)} available spots`}</span></div>
              </div>
            </section>

            <section className="event-info-panel">
              <div className="event-section-heading"><div><span className="eyebrow">THE LINEUP</span><h2>Participating teams <small>({details.team_count})</small></h2></div></div>
              {details.teams?.length ? <div className="event-team-list">{details.teams.map((team) => <article className="event-team-row" key={team.id}><span className="event-team-avatar">{team.team_name.slice(0, 1).toUpperCase()}</span><span><b>{team.team_name}</b><small>Joined {formatEventDay(team.joined_at)}</small></span>{team.can_manage && <button className="button button-outline small-button" type="button" disabled={Boolean(busyAction)} onClick={() => runAction(`withdraw-${team.id}`, 'withdraw_playlink_event_team', { p_team_id: team.id })}>{busyAction === `withdraw-${team.id}` ? 'Withdrawing…' : isOrganizer ? 'Remove team' : 'Withdraw'}</button>}</article>)}</div>
                : <p className="event-aside-empty">No teams have joined yet. Be the first to request a spot.</p>}
            </section>

            {isOrganizer && <section className="event-info-panel organizer-panel">
              <div className="event-section-heading"><div><span className="eyebrow">EVENT MANAGEMENT</span><h2>Team requests</h2></div><span className="event-request-count">{details.requests?.filter((item) => item.status === 'pending').length || 0} pending</span></div>
              {details.requests?.length ? <div className="event-request-list">{details.requests.map((item) => <article className="event-request-card" key={item.id}>
                <div className="event-request-person"><span className="event-team-avatar">{item.team_name.slice(0, 1).toUpperCase()}</span><span><b>{item.team_name}</b><small>{item.requester_name}{item.requester_username ? ` · @${item.requester_username}` : ''} · {formatEventDate(item.created_at)}</small></span><i className={`event-request-status status-${item.status}`}>{eventStatusLabel(item.status)}</i></div>
                {item.message && <p className="event-request-message">“{item.message}”</p>}
                {item.status === 'pending' && <div className="event-request-actions"><button className="button button-primary small-button" type="button" disabled={Boolean(busyAction)} onClick={() => runAction(`approve-${item.id}`, 'review_playlink_event_request', { p_request_id: item.id, p_approve: true })}>{busyAction === `approve-${item.id}` ? 'Approving…' : 'Approve'}</button><button className="button button-outline small-button" type="button" disabled={Boolean(busyAction)} onClick={() => runAction(`reject-${item.id}`, 'review_playlink_event_request', { p_request_id: item.id, p_approve: false })}>{busyAction === `reject-${item.id}` ? 'Rejecting…' : 'Reject'}</button></div>}
              </article>)}</div> : <p className="event-aside-empty">There are no team requests yet.</p>}
            </section>}
          </div>

          <aside className="event-detail-actions">
            {isOrganizer ? <section className="event-info-panel">
              <span className="eyebrow">ORGANIZER CONTROLS</span><h2>Manage event</h2>
              <p>Only your organizer account can make changes or review requests.</p>
              {['open', 'full'].includes(event.status) && !hasStarted && <button className="button button-primary button-full" type="button" onClick={() => { setActionError(''); setShowEdit(true) }}>Edit event</button>}
              {['open', 'full'].includes(event.status) && isEnded && <button className="button button-outline button-full" type="button" disabled={Boolean(busyAction)} onClick={() => runAction('complete', 'complete_playlink_event', { p_event_id: event.id })}>{busyAction === 'complete' ? 'Updating…' : 'Mark completed'}</button>}
              {['open', 'full', 'draft'].includes(event.status) && <button className="button button-danger button-full" type="button" disabled={Boolean(busyAction)} onClick={cancelEvent}>{busyAction === 'cancel' ? 'Cancelling…' : 'Cancel event'}</button>}
            </section> : request ? <section className="event-info-panel">
              <span className="eyebrow">YOUR TEAM REQUEST</span><h2>{eventStatusLabel(request.status)}</h2><p>{request.status === 'pending' ? `${request.team_name} is waiting for the organizer to review the request.` : request.status === 'approved' ? `${request.team_name} has a confirmed place in this event.` : request.status === 'rejected' ? 'The organizer declined this team. Requests for the same team cannot be resubmitted.' : 'This request or participation has been withdrawn.'}</p>
              {request.status === 'pending' && <button className="button button-outline button-full" type="button" disabled={Boolean(busyAction)} onClick={() => runAction('withdraw-request', 'withdraw_playlink_event_request', { p_request_id: request.id })}>{busyAction === 'withdraw-request' ? 'Withdrawing…' : 'Withdraw request'}</button>}
            </section> : <section className="event-info-panel event-join-panel">
              <span className="eyebrow">READY TO PLAY?</span><h2>Bring your team</h2>
              {openRequest ? user ? canRequest ? <><p>Send the organizer a request for one of the available team spots.</p><button className="button button-primary button-full" type="button" onClick={() => { setActionError(''); setShowRequest(true) }}>Request to join</button><small>This phase uses a team name and organizer account; it does not verify team membership.</small></> : <><p>Requests are limited to accounts registered as a team organizer or venue owner.</p><Link className="button button-outline button-full" to="/dashboard">Go to your account</Link></> : <><p>Sign in with an organizer account to request a place for your team.</p><Link className="button button-primary button-full" to={`/sign-in?next=/events/${event.id}`}>Sign in to request</Link></> : <p>{event.status === 'cancelled' ? 'This event has been cancelled.' : event.status === 'completed' || isEnded ? 'This event has ended.' : hasStarted ? 'This event is already underway and is no longer accepting requests.' : !hasSpot || event.status === 'full' ? 'This event is full and is not accepting requests.' : 'This event is not accepting requests.'}</p>}
            </section>}
            <section className="event-info-panel event-aside-note"><b>PlayLink event</b><p>Event details and participation are managed by the organizer. Location information is provided by the event creator.</p></section>
          </aside>
        </div>
      </div>

      {showRequest && <Modal eyebrow="PLAYLINK EVENTS" title="Request to join" onClose={() => setShowRequest(false)}>
        <form className="demo-form event-form" onSubmit={submitJoinRequest}>
          <p className="modal-lead">Ask the organizer to include your team in {event.title}.</p>
          <label>Team you organize<input name="team_name" required minLength="2" maxLength="80" placeholder="Your team name" /></label>
          <label>Message <span className="auth-optional">(optional)</span><textarea name="message" rows="4" maxLength="1000" placeholder="Introduce your team or share a note with the organizer." /></label>
          <p className="event-team-disclaimer">Submitting means you are requesting on behalf of a team you organize. PlayLink does not currently have team membership verification.</p>
          {actionError && <p className="event-feedback error" role="alert">{actionError}</p>}
          <button className="button button-primary button-full" type="submit" disabled={Boolean(busyAction)}>{busyAction === 'request' ? 'Sending request…' : 'Send join request'}</button>
        </form>
      </Modal>}
      {showEdit && <Modal eyebrow="PLAYLINK EVENTS" title="Edit event" onClose={() => setShowEdit(false)}><EventEditForm event={event} busy={busyAction === 'edit'} error={actionError} onSubmit={submitEdit} /></Modal>}
    </DashboardShell>
  )
}
