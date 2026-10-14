import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Brand from '../components/Brand.jsx'
import Icon from '../components/Icon.jsx'
import AdminMessenger from '../components/AdminMessenger.jsx'
import SocialLinks from '../components/SocialLinks.jsx'
import VenuePhotoPicker from '../components/VenuePhotoPicker.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { designatedAdminEmail } from '../auth/adminAccess.js'
import { supabase } from '../auth/supabase.js'
import { uploadVenuePhoto, validateVenuePhoto } from '../data/venuePhotos.js'
import usePlayLinkSports from '../hooks/usePlayLinkSports.js'
import useActivityNotifications from '../hooks/useActivityNotifications.js'
import LiveCricketScores from '../components/LiveCricketScores.jsx'

const sections = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'users', label: 'Users', icon: 'teams' },
  { id: 'venues', label: 'Venues', icon: 'venue' },
  { id: 'sports', label: 'Sports', icon: 'futsal' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
  { id: 'reviews', label: 'Reviews', icon: 'star' },
  { id: 'reports', label: 'Reports', icon: 'shield-check' },
  { id: 'appeals', label: 'Warning appeals', icon: 'message' },
  { id: 'feedback', label: 'Messages', icon: 'message' },
  { id: 'events', label: 'Events', icon: 'calendar' },
  { id: 'teams', label: 'Teams', icon: 'teams' },
]

const emptyData = { users: [], venues: [], sports: [], bookings: [], reviews: [], feedback: [], reports: [], moderationActions: [], appeals: [] }

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

function TableEmpty({ children, colSpan = 5 }) {
  return <tr><td className="admin-table-empty" colSpan={colSpan}>{children}</td></tr>
}

function AccountManagement({ member, sportOptions, onAction, busy }) {
  const [passwordError, setPasswordError] = useState('')
  const restrictedUntil = member.banned_until ? Date.parse(member.banned_until) : 0
  const isRestricted = Number.isFinite(restrictedUntil) && restrictedUntil > Date.now()
  const isDeactivated = isRestricted && restrictedUntil - Date.now() > 5 * 365 * 24 * 60 * 60 * 1000

  return <details className="admin-account-management">
    <summary>Manage account</summary>
    <form className="admin-create-form" onSubmit={(event) => {
      event.preventDefault()
      const values = Object.fromEntries(new FormData(event.currentTarget))
      onAction('update_profile', member, values)
    }}>
      <h4>Edit account and profile</h4>
      <div className="admin-create-grid">
        <label>Email<input name="email" type="email" maxLength="254" defaultValue={member.email || ''} required /></label>
        <label>Username<input name="username" minLength="3" maxLength="24" pattern="[A-Za-z0-9_]+" defaultValue={member.username || ''} required /></label>
        <label>Display name<input name="display_name" minLength="2" maxLength="120" defaultValue={member.display_name || ''} required /></label>
        <label>Phone<input name="phone" maxLength="40" defaultValue={member.phone || ''} /></label>
        <label>Account type<select name="account_type" defaultValue={member.account_type}><option value="player">Player</option><option value="team_organizer">Team organizer</option><option value="venue_owner">Venue owner</option></select></label>
        <label>Preferred sport<select name="preferred_sport" defaultValue={member.preferred_sport || ''}><option value="">Not provided</option>{sportOptions.map((sport) => <option key={sport.slug} value={sport.name}>{sport.name}</option>)}<option value="Both">Both</option></select></label>
        <label>Home area<input name="home_location" maxLength="160" defaultValue={member.home_location || ''} /></label>
        <label>Home latitude<input name="home_latitude" type="number" min="-90" max="90" step="any" defaultValue={member.home_latitude ?? ''} /></label>
        <label>Home longitude<input name="home_longitude" type="number" min="-180" max="180" step="any" defaultValue={member.home_longitude ?? ''} /></label>
        <label>Position<input name="player_position" maxLength="80" defaultValue={member.player_position || ''} /></label>
        <label>Experience level<input name="skill_level" maxLength="80" defaultValue={member.skill_level || ''} /></label>
        <label>Avatar URL<input name="avatar_url" type="url" defaultValue={member.avatar_url || ''} /></label>
        <label>Instagram URL<input name="instagram_url" type="url" defaultValue={member.instagram_url || ''} /></label>
        <label>Facebook URL<input name="facebook_url" type="url" defaultValue={member.facebook_url || ''} /></label>
        <label>TikTok URL<input name="tiktok_url" type="url" defaultValue={member.tiktok_url || ''} /></label>
        <label className="admin-create-wide">About<textarea name="bio" rows="3" maxLength="2000" defaultValue={member.bio || ''} /></label>
      </div>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save account details'}</button>
    </form>
    <form className="admin-create-form" onSubmit={(event) => {
      event.preventDefault()
      const values = new FormData(event.currentTarget)
      const password = String(values.get('password') || '')
      if (password !== values.get('password_confirm')) {
        setPasswordError('The passwords do not match.')
        return
      }
      setPasswordError('')
      onAction('change_password', member, { password }, event.currentTarget)
    }}>
      <h4>Set a new password</h4>
      <div className="admin-create-grid"><label>New password<input name="password" type="password" minLength="8" maxLength="256" autoComplete="new-password" required /></label><label>Confirm password<input name="password_confirm" type="password" minLength="8" maxLength="256" autoComplete="new-password" required /></label></div>
      {passwordError && <small className="auth-location-error" role="alert">{passwordError}</small>}
      <button className="button button-secondary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Change password'}</button>
    </form>
    <div className="admin-account-access">
      <span>Account access: <b>{isDeactivated ? 'Deactivated' : isRestricted ? `Suspended until ${dateTimeLabel(member.banned_until)}` : 'Active'}</b></span>
      {isRestricted
        ? <button type="button" disabled={busy} onClick={() => onAction('restore', member)}>{busy ? 'Updating…' : 'Restore access'}</button>
        : <form onSubmit={(event) => {
          event.preventDefault()
          const duration = String(new FormData(event.currentTarget).get('duration') || '')
          onAction('suspend', member, { duration })
        }}>
          <label>Suspend for<select name="duration" defaultValue="72h"><option value="24h">24 hours</option><option value="72h">3 days</option><option value="168h">7 days</option><option value="720h">30 days</option></select></label>
          <button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Suspend account'}</button>
          <button type="button" className="is-danger" disabled={busy} onClick={() => onAction('deactivate', member)}>{busy ? 'Updating…' : 'Ban / deactivate account'}</button>
        </form>}
      <small>Deactivation blocks sign-in but retains the account and its data. You can restore access later.</small>
    </div>
  </details>
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [section, setSection] = useState('overview')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updatingVenue, setUpdatingVenue] = useState('')
  const [reviewingReport, setReviewingReport] = useState('')
  const [appealResponses, setAppealResponses] = useState({})
  const [reviewingAppeal, setReviewingAppeal] = useState('')
  const [newAccountType, setNewAccountType] = useState('player')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [updatingAccount, setUpdatingAccount] = useState('')
  const [creatingVenue, setCreatingVenue] = useState(false)
  const [newVenuePhoto, setNewVenuePhoto] = useState(null)
  const [updatingSport, setUpdatingSport] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { sports: sportOptions, venueSports: venueSportOptions, refresh: refreshSports } = usePlayLinkSports()
  const activity = useActivityNotifications({ user, role: 'admin', path: location.pathname, notificationOpen: notificationsOpen })
  const updateInboxMessages = useCallback((messages) => {
    setData((current) => ({ ...current, feedback: messages }))
  }, [])

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
      const [usersResult, venuesResult, sportsResult, bookingsResult, reviewsResult, feedbackResult, reportsResult, actionsResult, appealsResult, adminProfileResult] = await Promise.all([
        supabase.rpc('get_admin_user_profiles'),
        supabase.from('owner_venues').select('*').order('created_at', { ascending: false }),
        supabase.from('playlink_sports').select('name,slug,is_game').order('name'),
        supabase.from('venue_bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('venue_reviews').select('*').order('created_at', { ascending: false }),
        supabase.from('player_inbox_messages').select('id,user_id,subject,body,direction,created_at').order('created_at', { ascending: false }),
        supabase.from('playlink_user_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('playlink_moderation_actions').select('*').order('created_at', { ascending: false }),
        supabase.from('playlink_moderation_appeals').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ])
      const failed = [usersResult, venuesResult, sportsResult, bookingsResult, reviewsResult, feedbackResult, reportsResult, actionsResult, appealsResult, adminProfileResult].find((result) => result.error)
      if (usersResult.error && ['PGRST202', '42883'].includes(usersResult.error.code)) {
        throw new Error('The full admin profile directory is not set up yet. Apply supabase/migrations/20261008170000_player_admin_profiles_and_inbox.sql.')
      }
      if (feedbackResult.error && ['PGRST205', '42P01'].includes(feedbackResult.error.code)) {
        throw new Error('The player feedback inbox is not set up yet. Apply supabase/migrations/20261008170000_player_admin_profiles_and_inbox.sql.')
      }
      if ((reportsResult.error || actionsResult.error) && ['PGRST205', '42P01'].includes(reportsResult.error?.code || actionsResult.error?.code)) {
        throw new Error('The report and moderation system is not set up yet. Apply supabase/migrations/20261008190000_reports_moderation_and_player_events.sql.')
      }
      if (appealsResult.error && ['PGRST205', '42P01'].includes(appealsResult.error.code)) {
        throw new Error('The warning appeal system is not set up yet. Apply supabase/migrations/20261008200000_moderation_warning_appeals.sql.')
      }
      if (sportsResult.error && ['PGRST205', '42P01'].includes(sportsResult.error.code)) {
        throw new Error('Admin-managed sports are not set up yet. Apply supabase/migrations/20261010000000_admin_managed_users_venues_and_sports.sql.')
      }
      if (failed?.error) throw failed.error
      setData({
        users: usersResult.data || [],
        venues: venuesResult.data || [],
        sports: sportsResult.data || [],
        bookings: bookingsResult.data || [],
        reviews: reviewsResult.data || [],
        feedback: feedbackResult.data || [],
        reports: reportsResult.data || [],
        moderationActions: actionsResult.data || [],
        appeals: appealsResult.data || [],
      })
      setAdminDisplayName(user.email?.toLowerCase() === designatedAdminEmail ? 'aayush' : adminProfileResult.data?.display_name || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The admin dashboard could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [authLoading, user])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const venueNames = useMemo(() => new Map(data.venues.map((venue) => [venue.id, venue.name])), [data.venues])
  const memberById = useMemo(() => new Map(data.users.map((member) => [member.id, member])), [data.users])
  const query = search.trim().toLowerCase()
  const filterRows = (rows, searchable) => rows.filter((row) => searchable(row).toLowerCase().includes(query))
  const users = useMemo(() => filterRows(data.users, (item) => `${item.email} ${item.display_name} ${item.username} ${item.account_type} ${item.phone} ${item.bio} ${item.preferred_sport} ${item.player_position} ${item.skill_level} ${item.home_location}`), [data.users, query])
  const venues = useMemo(() => filterRows(data.venues, (item) => `${item.name} ${item.area} ${item.address} ${item.sport} ${item.owner_id}`), [data.venues, query])
  const sports = useMemo(() => filterRows(data.sports, (item) => `${item.name} ${item.slug}`), [data.sports, query])
  const bookings = useMemo(() => filterRows(data.bookings, (item) => `${item.customer_name} ${item.customer_contact} ${venueNames.get(item.venue_id) || ''} ${item.sport} ${item.status}`), [data.bookings, query, venueNames])
  const reviews = useMemo(() => filterRows(data.reviews, (item) => `${item.reviewer_name} ${item.review} ${venueNames.get(item.venue_id) || ''}`), [data.reviews, query, venueNames])
  const reports = useMemo(() => filterRows(data.reports, (item) => `${memberById.get(item.reporter_id)?.display_name || ''} ${memberById.get(item.target_user_id)?.display_name || ''} ${item.reason} ${item.details} ${item.status}`), [data.reports, query, memberById])

  function openAdminActivity(item) {
    const sectionByKind = {
      account: 'users',
      venue: 'venues',
      booking: 'bookings',
      review: 'reviews',
      report: 'reports',
      appeal: 'appeals',
      message: 'feedback',
      event: 'events',
      team: 'teams',
    }
    setSection(sectionByKind[item.kind] || 'overview')
    setSearch('')
    setNotificationsOpen(false)
    activity.markRead(item.kind)
  }

  async function reviewReport(report, decision) {
    if (!supabase || reviewingReport) return
    setReviewingReport(report.id)
    setError('')
    setNotice('')
    try {
      const { data: result, error: reviewError } = await supabase.rpc('admin_review_playlink_report', {
        p_report_id: report.id,
        p_decision: decision,
      })
      if (reviewError) throw reviewError
      if (result?.ban_duration) {
        const { error: banError } = await supabase.functions.invoke('apply-playlink-restriction', {
          body: { report_id: report.id },
        })
        if (banError) {
          await loadDashboard()
          throw new Error(`The report was actioned, but the sign-in suspension could not be applied: ${banError.message}. Retry it from the Reports list.`)
        }
      }
      setNotice(decision === 'dismiss'
        ? 'Report dismissed and saved.'
        : result?.decision === 'warning'
          ? `Warning ${result.action_number} of 3 sent to the reported user.`
          : 'The account restriction was recorded and applied.')
      await loadDashboard()
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'The report could not be reviewed.')
    } finally {
      setReviewingReport('')
    }
  }

  async function retryAccountRestriction(reportId) {
    if (!supabase || reviewingReport) return
    setReviewingReport(reportId)
    setError('')
    setNotice('')
    try {
      const { error: banError } = await supabase.functions.invoke('apply-playlink-restriction', {
        body: { report_id: reportId },
      })
      if (banError) throw banError
      setNotice('The saved account restriction has now been applied.')
      await loadDashboard()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'The account restriction could not be applied.')
    } finally {
      setReviewingReport('')
    }
  }

  async function reviewAppeal(appeal, decision) {
    if (!supabase || reviewingAppeal) return
    setReviewingAppeal(appeal.id)
    setError('')
    setNotice('')
    try {
      const { error: reviewError } = await supabase.rpc('admin_review_playlink_warning_appeal', {
        p_appeal_id: appeal.id,
        p_decision: decision,
        p_response: appealResponses[appeal.id]?.trim() || '',
      })
      if (reviewError) throw reviewError
      setNotice(decision === 'reverse' ? 'The warning was reversed and removed from the active warning count.' : 'The warning appeal was reviewed and the warning remains in effect.')
      setAppealResponses((current) => ({ ...current, [appeal.id]: '' }))
      await loadDashboard()
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'The warning appeal could not be reviewed.')
    } finally {
      setReviewingAppeal('')
    }
  }

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

  async function createAccount(event) {
    event.preventDefault()
    if (!supabase || creatingAccount) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setCreatingAccount(true)
    setError('')
    setNotice('')
    try {
      const accountType = String(fields.get('account_type'))
      const body = {
        email: String(fields.get('email') || ''),
        username: String(fields.get('username') || ''),
        display_name: String(fields.get('display_name') || ''),
        password: String(fields.get('password') || ''),
        account_type: accountType,
        phone: String(fields.get('phone') || ''),
        home_location: String(fields.get('home_location') || ''),
        home_latitude: String(fields.get('home_latitude') || ''),
        home_longitude: String(fields.get('home_longitude') || ''),
      }
      if (accountType === 'venue_owner') {
        body.venue = {
          name: String(fields.get('venue_name') || ''),
          area: String(fields.get('venue_area') || ''),
          sport: String(fields.get('venue_sport') || ''),
          latitude: String(fields.get('venue_latitude') || ''),
          longitude: String(fields.get('venue_longitude') || ''),
        }
      }
      const { data: result, error: createError } = await supabase.functions.invoke('admin-create-playlink-account', { body })
      if (createError) {
        let message = result?.error || createError.message
        if (createError.context instanceof Response) {
          const response = await createError.context.json()
          message = response.error || message
        }
        throw new Error(message)
      }
      if (result?.error) throw new Error(result.error)
      await loadDashboard()
      form.reset()
      setNewAccountType('player')
      setNotice('Account created and email confirmed. Give the user their temporary password securely.')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The account could not be created.')
    } finally {
      setCreatingAccount(false)
    }
  }

  async function manageAccount(action, member, details = {}, form = null) {
    if (!supabase || updatingAccount) return
    if (action === 'deactivate' && !window.confirm(`Deactivate ${member.display_name || member.email}'s account? Their data will be kept and access can be restored later.`)) return
    setUpdatingAccount(member.id)
    setError('')
    setNotice('')
    try {
      const { data: result, error: actionError } = await supabase.functions.invoke('admin-manage-playlink-account', {
        body: { action, user_id: member.id, ...details },
      })
      if (actionError) {
        let message = result?.error || 'The account could not be updated. Please try again.'
        if (actionError.context instanceof Response) {
          const response = await actionError.context.json()
          message = response.error || message
        }
        throw new Error(message)
      }
      if (result?.error) throw new Error(result.error)
      await loadDashboard()
      if (form instanceof HTMLFormElement) form.reset()
      setNotice(action === 'update_profile' ? 'Account details saved.'
        : action === 'change_password' ? 'Password changed.'
          : action === 'suspend' ? 'Account temporarily suspended.'
            : action === 'deactivate' ? 'Account deactivated. User data has been retained.'
              : 'Account access restored.')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The account could not be updated. Please try again.')
    } finally {
      setUpdatingAccount('')
    }
  }

  async function createVenue(event) {
    event.preventDefault()
    if (!supabase || creatingVenue) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setCreatingVenue(true)
    setError('')
    setNotice('')
    try {
      const latitudeValue = String(fields.get('latitude') || '').trim()
      const longitudeValue = String(fields.get('longitude') || '').trim()
      if (!latitudeValue || !longitudeValue) {
        throw new Error('Venue latitude and longitude are required.')
      }

      const latitude = Number(latitudeValue)
      const longitude = Number(longitudeValue)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('Enter valid coordinates: latitude from -90 to 90 and longitude from -180 to 180.')
      }
      if (newVenuePhoto) validateVenuePhoto(newVenuePhoto)
      const venue = {
        owner_id: String(fields.get('owner_id') || ''),
        name: String(fields.get('name') || '').trim(),
        sport: String(fields.get('sport') || ''),
        area: String(fields.get('area') || '').trim(),
        address: String(fields.get('address') || '').trim(),
        description: String(fields.get('description') || '').trim(),
        price_per_hour: Number(fields.get('price_per_hour') || 0),
        latitude,
        longitude,
        maps_url: String(fields.get('maps_url') || '').trim(),
        image_url: '',
        is_active: fields.get('is_active') === 'on',
      }
      const { data: created, error: createError } = await supabase.from('owner_venues').insert(venue).select('*').single()
      if (createError) throw createError
      form.reset()
      setNewVenuePhoto(null)
      let savedVenue = created
      if (newVenuePhoto) {
        try {
          const imageUrl = await uploadVenuePhoto(supabase, created.owner_id, created.id, newVenuePhoto)
          const { data: updated, error: updateError } = await supabase.from('owner_venues').update({ image_url: imageUrl }).eq('id', created.id).select('*').single()
          if (updateError) throw updateError
          savedVenue = updated
        } catch (photoError) {
          await loadDashboard()
          throw new Error(`${created.name} was added, but its photo could not be saved: ${photoError instanceof Error ? photoError.message : 'Unknown storage error.'}`)
        }
      }
      setData((current) => ({ ...current, venues: [savedVenue, ...current.venues] }))
      setNotice(`${savedVenue.name} was added and is visible in the venue finder.`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'The venue could not be created.')
    } finally {
      setCreatingVenue(false)
    }
  }

  async function createSport(event) {
    event.preventDefault()
    if (!supabase || updatingSport) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const name = String(fields.get('name') || '').trim()
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (slug.length < 2) {
      setError('Use a sport name containing at least two English letters or numbers.')
      return
    }
    setUpdatingSport(true)
    setError('')
    setNotice('')
    try {
      const { error: insertError } = await supabase.from('playlink_sports').insert({
        name,
        slug,
        is_game: fields.get('is_game') === 'true',
      })
      if (insertError) throw insertError
      await loadDashboard()
      refreshSports()
      form.reset()
      setNotice(`${name} has been added to the PlayLink sport choices.`)
    } catch (sportError) {
      setError(sportError instanceof Error ? sportError.message : 'The sport could not be added.')
    } finally {
      setUpdatingSport(false)
    }
  }

  async function deleteSport(sport) {
    if (!supabase || updatingSport) return
    if (!window.confirm(`Delete ${sport.name} from PlayLink? It cannot be removed while profiles, games, venues, or bookings use it.`)) return
    setUpdatingSport(true)
    setError('')
    setNotice('')
    try {
      const { error: deleteError } = await supabase.rpc('admin_delete_playlink_sport', { p_slug: sport.slug })
      if (deleteError) throw deleteError
      await loadDashboard()
      refreshSports()
      setNotice(`${sport.name} has been removed from the PlayLink sport choices.`)
    } catch (sportError) {
      setError(sportError instanceof Error ? sportError.message : 'The sport could not be deleted.')
    } finally {
      setUpdatingSport(false)
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
    { title: 'Open reports', count: data.reports.filter((report) => report.status === 'pending').length, icon: 'shield-check', tone: 'amber' },
    { title: 'Pending appeals', count: data.appeals.filter((appeal) => appeal.status === 'pending').length, icon: 'message', tone: 'violet' },
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
        <header className="admin-topbar"><div><small>PLAYLINK / ADMIN</small><b>{activeSection.label}</b></div><span className="admin-topbar-spacer" /><span className="admin-notifications"><button className="admin-notification-button" type="button" aria-label={`Notifications${activity.unreadCount ? ` (${activity.unreadCount} unread)` : ''}`} aria-expanded={notificationsOpen} onClick={() => { if (!notificationsOpen) activity.markRead(); setNotificationsOpen((open) => !open) }}><Icon name="bell" size={17} />{activity.unreadCount > 0 && <small className="activity-badge">{activity.formatCount(activity.unreadCount)}</small>}</button>{notificationsOpen && <section className="admin-notification-popover" aria-label="Admin notifications"><header><span><b>Platform activity</b><small>New accounts, events, teams, reports, and more</small></span><button type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}>×</button></header>{activity.error ? <p className="admin-notification-empty is-error" role="alert">{activity.error}</p> : activity.activities.length ? <div className="admin-notification-list">{activity.activities.map((item) => <button type="button" key={item.id} onClick={() => openAdminActivity(item)}><span><Icon name={item.kind === 'report' ? 'shield-check' : item.kind === 'team' ? 'teams' : item.kind === 'event' || item.kind === 'booking' ? 'calendar' : item.kind === 'message' || item.kind === 'appeal' ? 'message' : item.kind === 'review' ? 'star' : item.kind === 'venue' ? 'venue' : 'player'} size={15} /></span><span><b>{item.title}</b><small>{item.body} · {new Date(item.created_at).toLocaleDateString()}</small></span></button>)}</div> : <p className="admin-notification-empty">There is no recent platform activity.</p>}</section>}</span><span className="admin-user-label"><i />{adminDisplayName || user.user_metadata?.full_name || user.email}</span><button type="button" onClick={signOut}>Sign out</button></header>
        <div className="admin-content">
          <header className="admin-page-heading"><div><span>PLATFORM MANAGEMENT</span><h1>{section === 'overview' ? 'Admin overview' : activeSection.label}</h1><p>{section === 'overview' ? 'A live view of PlayLink accounts, facilities, and community activity.' : `Browse and manage PlayLink ${activeSection.label.toLowerCase()}.`}</p></div><button className="admin-refresh-button" type="button" onClick={loadDashboard}><Icon name="refresh" size={15} /> Refresh data</button></header>
          {error && <p className="admin-feedback error" role="alert">{error}<button type="button" onClick={loadDashboard}>Retry</button></p>}
          {notice && <p className="admin-feedback success" role="status">{notice}</p>}
          {section === 'overview' && <>
            <div className="admin-metric-grid">{cards.map((card) => <article className="admin-metric-card" key={card.title}><span className={`admin-metric-icon ${card.tone}`}><Icon name={card.icon} size={19} /></span><small>{card.title}</small><b>{card.count.toLocaleString()}</b></article>)}</div>
            <div className="admin-overview-grid">
              <section className="admin-panel"><header><div><h2>Recent accounts</h2><p>Latest PlayLink registrations</p></div><button type="button" onClick={() => setSection('users')}>View users <Icon name="arrow-right" size={13} /></button></header><div className="admin-table-wrap"><table><thead><tr><th>Member</th><th>Account type</th><th>Joined</th></tr></thead><tbody>{data.users.slice(0, 6).map((member) => <tr key={member.id}><td><div className="admin-profile-cell"><span className="admin-profile-avatar">{member.avatar_url ? <img src={member.avatar_url} alt={`${member.display_name || member.username} profile`} /> : <span>{(member.display_name || member.username || 'P').slice(0, 1).toUpperCase()}</span>}</span><div><b>{member.display_name || member.username}</b><small>@{member.username}</small></div></div></td><td><StatusPill value={member.account_type.replace('_', ' ')} /></td><td>{dateLabel(member.created_at)}</td></tr>)}{!data.users.length && <TableEmpty>No user records found.</TableEmpty>}</tbody></table></div></section>
              <section className="admin-panel"><header><div><h2>Venue listings</h2><p>Active and paused facilities</p></div><button type="button" onClick={() => setSection('venues')}>Manage venues <Icon name="arrow-right" size={13} /></button></header><div className="admin-recent-venues">{data.venues.slice(0, 6).map((venue) => <article key={venue.id}><span className="admin-venue-icon"><Icon name="venue" size={16} /></span><span><b>{venue.name}</b><small>{venue.area} · {venue.sport}</small></span><StatusPill value={venue.is_active ? 'Active' : 'Paused'} /></article>)}{!data.venues.length && <p className="admin-table-empty">No venue listings found.</p>}</div></section>
              <div className="admin-live-scores"><LiveCricketScores variant="admin" /><a href="/live-scores">Open all live scores <Icon name="arrow-right" size={13} /></a></div>
            </div>
          </>}
          {section !== 'overview' && <section className="admin-panel admin-directory-panel">
            <header><div><h2>{activeSection.label}</h2><p>{({ users: data.users.length, venues: data.venues.length, sports: data.sports.length, bookings: data.bookings.length, reviews: data.reviews.length, reports: data.reports.length, appeals: data.appeals.length, feedback: data.feedback.length, events: activity.activities.filter((item) => item.kind === 'event').length, teams: activity.activities.filter((item) => item.kind === 'team').length })[section]} records</p></div><label className="admin-search"><Icon name="search" size={15} /><input aria-label={`Search ${activeSection.label}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeSection.label.toLowerCase()}…`} /></label></header>
            {section === 'users' && <form className="admin-create-form" onSubmit={createAccount}>
              <h3>Create account</h3>
              <p>New accounts are active immediately. Share the temporary password securely with the user.</p>
              <div className="admin-create-grid">
                <label>Email<input name="email" type="email" autoComplete="off" maxLength="254" required /></label>
                <label>Username<input name="username" minLength="3" maxLength="24" pattern="[A-Za-z0-9_]+" autoComplete="off" required /></label>
                <label>Display name<input name="display_name" minLength="2" maxLength="120" required /></label>
                <label>Phone <span>(optional)</span><input name="phone" maxLength="40" /></label>
                <label>Account type<select name="account_type" value={newAccountType} onChange={(event) => setNewAccountType(event.target.value)}><option value="player">Player</option><option value="team_organizer">Team organizer</option><option value="venue_owner">Venue owner</option></select></label>
                <label>Temporary password<input name="password" type="password" minLength="8" maxLength="256" autoComplete="new-password" required /></label>
                <label>Home area<input name="home_location" minLength="2" maxLength="160" placeholder="City or district" required /></label>
                <label>Home latitude<input name="home_latitude" type="number" min="-90" max="90" step="any" required /></label>
                <label>Home longitude<input name="home_longitude" type="number" min="-180" max="180" step="any" required /></label>
                {newAccountType === 'venue_owner' && <>
                  <label>First venue name<input name="venue_name" minLength="2" maxLength="120" required /></label>
                  <label>First venue area<input name="venue_area" minLength="2" maxLength="160" required /></label>
                  <label>First venue sport<select name="venue_sport" required><option value="">Choose sport</option>{venueSportOptions.map((item) => <option key={item.slug} value={item.name}>{item.name}</option>)}</select></label>
                  <label>First venue latitude<input name="venue_latitude" type="number" min="-90" max="90" step="any" required /></label>
                  <label>First venue longitude<input name="venue_longitude" type="number" min="-180" max="180" step="any" required /></label>
                </>}
              </div>
              <button className="button button-primary" type="submit" disabled={creatingAccount}>{creatingAccount ? 'Creating account…' : 'Create account'}</button>
            </form>}
            {section === 'venues' && <form className="admin-create-form" onSubmit={createVenue}>
              <h3>Add venue</h3>
              <p>Enter the same venue details a venue owner can provide. Active venues appear in the venue finder and nearby venues pages.</p>
              <div className="admin-create-grid">
                <label>Venue name<input name="name" minLength="2" maxLength="120" required /></label>
                <label>Venue owner<select name="owner_id" required defaultValue=""><option value="" disabled>Choose an owner</option>{data.users.filter((member) => member.account_type === 'venue_owner').map((owner) => <option key={owner.id} value={owner.id}>{owner.display_name || owner.username} · {owner.email}</option>)}</select></label>
                <label>Sport<select name="sport" required defaultValue=""><option value="" disabled>Choose sport</option>{venueSportOptions.map((item) => <option key={item.slug} value={item.name}>{item.name}</option>)}</select></label>
                <label>Area<input name="area" minLength="2" maxLength="160" required /></label>
                <label>Address<input name="address" maxLength="240" /></label>
                <label>Hourly rate (NPR)<input name="price_per_hour" type="number" min="0" max="99999999" step="50" defaultValue="2500" required /></label>
                <label>Venue latitude<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="27.7152" required /></label>
                <label>Venue longitude<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="85.3128" required /></label>
                <label className="admin-create-wide">Google Maps link<input name="maps_url" type="url" placeholder="https://www.google.com/maps/search/..." /></label>
                <div className="admin-create-wide"><VenuePhotoPicker id="admin-venue-photo" file={newVenuePhoto} currentUrl="" onChange={setNewVenuePhoto} /></div>
                <label className="admin-create-wide">About this venue<textarea name="description" maxLength="1000" rows="4" placeholder="Tell players about the facilities, surface, changing rooms, or lights." /></label>
              </div>
              <label className="admin-create-active"><input type="checkbox" name="is_active" defaultChecked /> Active and visible in venue listings</label>
              <button className="button button-primary" type="submit" disabled={creatingVenue || !data.users.some((member) => member.account_type === 'venue_owner')}>{creatingVenue ? 'Adding venue…' : 'Add venue'}</button>
              {!data.users.some((member) => member.account_type === 'venue_owner') && <small>Create a venue-owner account first.</small>}
            </form>}
            {section === 'sports' && <form className="admin-create-form" onSubmit={createSport}>
              <h3>Add sport</h3>
              <p>Game sports become available for player profiles, teams, and events. Every sport is also available for venue listings.</p>
              <div className="admin-create-grid">
                <label>Sport name<input name="name" minLength="2" maxLength="40" pattern="[A-Za-z0-9][A-Za-z0-9 .'-]*" title="Use letters, numbers, spaces, apostrophes, periods, or hyphens." required /></label>
                <label>Available for games<select name="is_game" defaultValue="true"><option value="true">Yes — games and venues</option><option value="false">No — venues only</option></select></label>
              </div>
              <button className="button button-primary" type="submit" disabled={updatingSport}>{updatingSport ? 'Adding…' : 'Add sport'}</button>
            </form>}
            {section === 'feedback'
              ? <AdminMessenger users={data.users} initialMessages={data.feedback} adminUserId={user.id} search={search} onMessagesChanged={updateInboxMessages} />
              : <div className="admin-table-wrap"><table>
              {section === 'users' && <><thead><tr><th>Profile</th><th>Username</th><th>Account type</th><th>Joined</th><th>Account status</th></tr></thead><tbody>{users.map((member) => {
                const blockedUntil = member.banned_until ? Date.parse(member.banned_until) : 0
                const blocked = Number.isFinite(blockedUntil) && blockedUntil > Date.now()
                const deactivated = blocked && blockedUntil - Date.now() > 5 * 365 * 24 * 60 * 60 * 1000
                const accessLabel = deactivated ? 'Deactivated' : blocked ? 'Suspended' : 'Active'
                return <tr key={member.id}><td><div className="admin-profile-cell"><span className="admin-profile-avatar">{member.avatar_url ? <img src={member.avatar_url} alt={`${member.display_name || member.username} profile`} /> : <span>{(member.display_name || member.username || 'P').slice(0, 1).toUpperCase()}</span>}</span><div><b>{member.display_name || 'Unnamed member'}</b><small>{member.email || 'Email unavailable'}</small><small>{member.home_location || 'Location not provided'}</small><SocialLinks profile={member} className="admin-profile-socials" /><details className="admin-profile-details"><summary>Full profile</summary><dl><dt>Phone</dt><dd>{member.phone || 'Not provided'}</dd><dt>About</dt><dd>{member.bio || 'Not provided'}</dd><dt>Preferred sport</dt><dd>{member.preferred_sport || 'Not provided'}</dd><dt>Position</dt><dd>{member.player_position || 'Not provided'}</dd><dt>Experience</dt><dd>{member.skill_level || 'Not provided'}</dd><dt>Avatar</dt><dd>{member.avatar_url || 'Not provided'}</dd><dt>Instagram</dt><dd>{member.instagram_url || 'Not provided'}</dd><dt>Facebook</dt><dd>{member.facebook_url || 'Not provided'}</dd><dt>TikTok</dt><dd>{member.tiktok_url || 'Not provided'}</dd><dt>Home coordinates</dt><dd>{member.home_latitude ?? '—'}, {member.home_longitude ?? '—'}</dd><dt>Joined</dt><dd>{dateTimeLabel(member.created_at)}</dd></dl></details><AccountManagement key={JSON.stringify(member)} member={member} sportOptions={sportOptions} busy={updatingAccount === member.id} onAction={manageAccount} /></div></div></td><td>@{member.username}</td><td><StatusPill value={member.account_type.replace('_', ' ')} /></td><td>{dateLabel(member.created_at)}</td><td><StatusPill value={accessLabel} />{blocked && <small>{dateTimeLabel(member.banned_until)}</small>}</td></tr>
              })}{!users.length && <TableEmpty colSpan={5}>No users match your search.</TableEmpty>}</tbody></>}
              {section === 'venues' && <><thead><tr><th>Venue</th><th>Sport</th><th>Area</th><th>Rate / hour</th><th>Status / action</th></tr></thead><tbody>{venues.map((venue) => <tr key={venue.id}><td><b>{venue.name}</b><small>{venue.address || 'Address not provided'}</small></td><td>{venue.sport}</td><td>{venue.area}</td><td>Rs {Number(venue.price_per_hour || 0).toLocaleString('en-IN')}</td><td><div className="admin-venue-moderation"><StatusPill value={venue.is_active ? 'Active' : 'Paused'} /><button type="button" disabled={updatingVenue === venue.id} onClick={() => toggleVenue(venue)}>{updatingVenue === venue.id ? 'Saving…' : venue.is_active ? 'Pause listing' : 'Activate'}</button></div></td></tr>)}{!venues.length && <TableEmpty>No venues match your search.</TableEmpty>}</tbody></>}
              {section === 'sports' && <><thead><tr><th>Sport</th><th>Identifier</th><th>Used for</th><th>Action</th></tr></thead><tbody>{sports.map((sport) => <tr key={sport.slug}><td><b>{sport.name}</b></td><td><code>{sport.slug}</code></td><td>{sport.is_game ? 'Games, teams, player profiles, and venues' : 'Venues only'}</td><td><button className="admin-sport-delete" type="button" disabled={updatingSport} onClick={() => deleteSport(sport)}>{updatingSport ? 'Working…' : 'Delete sport'}</button></td></tr>)}{!sports.length && <TableEmpty colSpan={4}>No sports match your search.</TableEmpty>}</tbody></>}
              {section === 'bookings' && <><thead><tr><th>Player</th><th>Venue</th><th>Sport</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td><b>{booking.customer_name}</b><small>{booking.customer_contact || 'Contact not provided'}</small></td><td>{venueNames.get(booking.venue_id) || 'Venue unavailable'}</td><td>{booking.sport}</td><td>{dateTimeLabel(booking.starts_at)} – {new Date(booking.ends_at).toLocaleTimeString('en-NP', { hour: 'numeric', minute: '2-digit' })}</td><td><StatusPill value={booking.status} /></td></tr>)}{!bookings.length && <TableEmpty>No bookings match your search.</TableEmpty>}</tbody></>}
              {section === 'reviews' && <><thead><tr><th>Player</th><th>Venue</th><th>Rating</th><th>Comment</th><th>Submitted</th></tr></thead><tbody>{reviews.map((review) => <tr key={review.id}><td><b>{review.reviewer_name}</b></td><td>{venueNames.get(review.venue_id) || 'Venue unavailable'}</td><td><span className="admin-review-rating">{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</span></td><td className="admin-review-copy">{review.review}</td><td>{dateLabel(review.created_at)}</td></tr>)}{!reviews.length && <TableEmpty>No reviews match your search.</TableEmpty>}</tbody></>}
              {section === 'reports' && <><thead><tr><th>Submitted</th><th>Reported by</th><th>Account reported</th><th>Report details</th><th>Review action</th></tr></thead><tbody>{reports.map((report) => {
                const reporter = memberById.get(report.reporter_id)
                const target = memberById.get(report.target_user_id)
                const sanction = data.moderationActions.find((action) => action.report_id === report.id)
                return <tr key={report.id}>
                  <td>{dateTimeLabel(report.created_at)}</td>
                  <td><b>{reporter?.display_name || 'PlayLink member'}</b><small>{reporter?.email || report.reporter_id}</small></td>
                  <td><b>{target?.display_name || 'PlayLink member'}</b><small>{target?.email || report.target_user_id}</small><small>{target?.account_type?.replace('_', ' ') || 'Account'}</small></td>
                  <td className="admin-report-details"><b>{report.reason}</b><p>{report.details || 'No additional details provided.'}</p></td>
                  <td><StatusPill value={report.status} />{report.status === 'pending' ? <div className="admin-report-actions">
                    <button type="button" disabled={reviewingReport === report.id} onClick={() => reviewReport(report, 'warn')}>{reviewingReport === report.id ? 'Reviewing…' : 'Send warning'}</button>
                    <button type="button" disabled={reviewingReport === report.id} onClick={() => reviewReport(report, 'dismiss')}>Dismiss</button>
                  </div> : <small>{report.reviewed_at ? `Reviewed ${dateTimeLabel(report.reviewed_at)}` : 'Reviewed'}</small>}
                  {sanction && ['temporary_ban', 'permanent_ban'].includes(sanction.action_type) && !sanction.auth_ban_applied_at && <button className="admin-report-retry" type="button" disabled={reviewingReport === report.id} onClick={() => retryAccountRestriction(report.id)}>{reviewingReport === report.id ? 'Applying…' : 'Retry sign-in suspension'}</button>}
                  {sanction && <small>Action {sanction.action_number}: {sanction.action_type.replace('_', ' ')}</small>}</td>
                </tr>
              })}{!reports.length && <TableEmpty>No reports match your search.</TableEmpty>}</tbody></>}
              {section === 'appeals' && <><thead><tr><th>Submitted</th><th>Player</th><th>Warning</th><th>Appeal statement</th><th>Review</th></tr></thead><tbody>{data.appeals.filter((appeal) => `${memberById.get(appeal.user_id)?.display_name || ''} ${memberById.get(appeal.user_id)?.email || ''} ${appeal.appeal_details} ${appeal.status}`.toLowerCase().includes(query)).map((appeal) => {
                const member = memberById.get(appeal.user_id)
                const action = data.moderationActions.find((item) => item.id === appeal.action_id)
                return <tr key={appeal.id}>
                  <td>{dateTimeLabel(appeal.created_at)}</td>
                  <td><b>{member?.display_name || 'PlayLink member'}</b><small>{member?.email || appeal.user_id}</small></td>
                  <td><b>Warning {action?.action_number ?? '—'} of 3</b><small>{action?.reason || 'Reason unavailable'}</small></td>
                  <td className="admin-report-details">{appeal.appeal_details}</td>
                  <td><StatusPill value={appeal.status} />{appeal.status === 'pending'
                    ? <div className="admin-appeal-actions"><textarea rows="2" maxLength="2000" value={appealResponses[appeal.id] || ''} onChange={(event) => setAppealResponses((current) => ({ ...current, [appeal.id]: event.target.value }))} placeholder="Optional response to the player" /><button type="button" disabled={reviewingAppeal === appeal.id} onClick={() => reviewAppeal(appeal, 'uphold')}>{reviewingAppeal === appeal.id ? 'Saving…' : 'Uphold warning'}</button><button type="button" disabled={reviewingAppeal === appeal.id} onClick={() => reviewAppeal(appeal, 'reverse')}>Reverse warning</button></div>
                    : <><small>{appeal.admin_response || 'No response added.'}</small><small>Reviewed {dateTimeLabel(appeal.reviewed_at)}</small></>}
                  </td>
                </tr>
              })}{!data.appeals.length && <TableEmpty>No warning appeals have been submitted.</TableEmpty>}</tbody></>}
              {(section === 'events' || section === 'teams') && <><thead><tr><th>Created</th><th>{section === 'events' ? 'Event' : 'Team'}</th><th>Activity</th></tr></thead><tbody>{activity.activities.filter((item) => item.kind === (section === 'events' ? 'event' : 'team')).filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(query)).map((item) => <tr key={item.id}><td>{dateTimeLabel(item.created_at)}</td><td><b>{item.body}</b></td><td>{item.title}</td></tr>)}{!activity.activities.some((item) => item.kind === (section === 'events' ? 'event' : 'team')) && <TableEmpty colSpan={3}>No recent {section} found.</TableEmpty>}</tbody></>}
            </table></div>}
          </section>}
          <p className="admin-footer-note"><Icon name="lock" size={13} />Admin data is protected by Supabase authentication and the PlayLink admin allowlist.</p>
        </div>
      </main>
    </div>
  )
}
