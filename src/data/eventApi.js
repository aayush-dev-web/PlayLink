import { supabase } from '../auth/supabase.js'

export function eventErrorMessage(error) {
  const message = error?.message || ''
  const code = error?.code || ''
  const knownErrors = {
    organizer_role_required: 'An organizer account is required for this action.',
    invalid_event_details: 'Check the event details, date/time, location, and team capacity.',
    invalid_request_details: 'Check the team name and message, then try again.',
    event_not_found: 'This event could not be found.',
    event_not_open: 'This event is no longer accepting requests.',
    event_full: 'This event has reached its team capacity.',
    organizer_cannot_request: 'Event organizers cannot request to join their own event.',
    team_already_joined: 'That team is already participating in this event.',
    request_already_exists: 'A request for this team already exists. Rejected or withdrawn requests cannot be resubmitted.',
    request_not_found: 'This request is no longer available.',
    request_not_pending: 'This request has already been reviewed.',
    not_event_organizer: 'Only the event organizer can do that.',
    team_not_found: 'This participating team could not be found.',
    not_authorized: 'You are not allowed to do that.',
    team_not_active: 'This team has already withdrawn.',
    request_not_withdrawable: 'Only your pending request can be withdrawn.',
    event_not_editable: 'This event can no longer be edited.',
    event_not_cancellable: 'This event can no longer be cancelled.',
    event_not_completeable: 'An event can only be completed after its scheduled end time.',
    capacity_below_participants: 'Team capacity cannot be lower than the number of participating teams.',
  }
  const known = Object.entries(knownErrors).find(([token]) => message.includes(token))
  if (known) return known[1]
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(code)) {
    return 'The PlayLink events database setup is not applied yet. Follow the Phase 3 migration instructions in README.md.'
  }
  if (code === '23505') return 'That team already has a request or participation record for this event.'
  return 'We could not complete that event action. Please try again in a moment.'
}

export async function getOwnAccountType(user) {
  if (!user) return null
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles')
    .select('account_type').eq('id', user.id).maybeSingle()
  if (error) throw error
  return data?.account_type || user.user_metadata?.account_type || null
}

export function formatEventDate(value, options = {}) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', ...options,
  })
}

export function formatEventDay(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function eventStatusLabel(status) {
  return ({ open: 'Open', full: 'Full', completed: 'Completed', cancelled: 'Cancelled', draft: 'Draft' })[status] || status
}

export function toLocalDateTime(value) {
  if (!value) return { date: '', time: '' }
  const date = new Date(value)
  const two = (part) => String(part).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`,
    time: `${two(date.getHours())}:${two(date.getMinutes())}`,
  }
}

export function localDateTimeToIso(date, time) {
  return new Date(`${date}T${time}`).toISOString()
}

export { supabase }
