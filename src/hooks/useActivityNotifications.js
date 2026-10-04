import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../auth/supabase.js'

const readKey = (userId, role) => `playlink-read-activity-${role}-${userId}`
const inboxReadKey = (userId, role) => `playlink-read-inbox-${role}-${userId}`
const badgeLabel = (count) => count > 9 ? '9+' : String(count)

function readStoredIds(key) {
  try {
    const ids = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(ids) ? new Set(ids) : new Set()
  } catch {
    return new Set()
  }
}

export { badgeLabel }

export default function useActivityNotifications({ user, role, path, notificationOpen = false }) {
  const [activities, setActivities] = useState([])
  const [readIds, setReadIds] = useState(() => user ? readStoredIds(readKey(user.id, role)) : new Set())
  const [inboxReadIds, setInboxReadIds] = useState(() => user ? readStoredIds(inboxReadKey(user.id, role)) : new Set())
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState('')
  const initialized = useRef(false)
  const knownIds = useRef(new Set())

  useEffect(() => {
    setReadIds(user ? readStoredIds(readKey(user.id, role)) : new Set())
    setInboxReadIds(user ? readStoredIds(inboxReadKey(user.id, role)) : new Set())
    setActivities([])
    setNotice(null)
    setError('')
    initialized.current = false
    knownIds.current = new Set()
  }, [role, user])

  const loadActivity = useCallback(async () => {
    if (!user) return
    try {
      let nextActivities = []
      if (!supabase) throw new Error('Notifications require a configured Supabase connection.')
        if (role === 'owner') {
          const [bookingResult, conversationResult] = await Promise.all([
            supabase.from('venue_bookings').select('id, customer_name, sport, starts_at, created_at, status, customer_id')
              .eq('status', 'pending').not('customer_id', 'is', null).order('created_at', { ascending: false }),
            supabase.from('venue_conversations').select('id, player_name').order('updated_at', { ascending: false }),
          ])
          if (bookingResult.error) throw bookingResult.error
          if (conversationResult.error) throw conversationResult.error
          nextActivities = (bookingResult.data || []).map((booking) => ({
            id: `booking:${booking.id}`,
            kind: 'booking',
            title: 'New booking request',
            body: `${booking.customer_name} · ${booking.sport}`,
            href: '/owner/bookings?filter=pending',
            created_at: booking.created_at || booking.starts_at,
          }))
          const conversationIds = (conversationResult.data || []).map((conversation) => conversation.id)
          if (conversationIds.length) {
            const { data: messages, error: messageError } = await supabase.from('venue_messages')
              .select('id, conversation_id, body, created_at, sender_id')
              .in('conversation_id', conversationIds).neq('sender_id', user.id).order('created_at', { ascending: false })
            if (messageError) throw messageError
            const playerNames = new Map((conversationResult.data || []).map((conversation) => [conversation.id, conversation.player_name]))
            nextActivities.push(...(messages || []).map((message) => ({
              id: `message:${message.id}`,
              kind: 'message',
              title: `Message from ${playerNames.get(message.conversation_id) || 'a player'}`,
              body: message.body,
              href: '/owner/inbox',
              created_at: message.created_at,
            })))
          }
        } else {
          const [bookingResult, conversationResult] = await Promise.all([
            supabase.from('venue_bookings').select('id, venue_id, status, created_at, starts_at, customer_id')
              .eq('customer_id', user.id).neq('status', 'pending').order('created_at', { ascending: false }),
            supabase.from('venue_conversations').select('id, venue_id').eq('player_id', user.id)
              .order('updated_at', { ascending: false }),
          ])
          if (bookingResult.error) throw bookingResult.error
          if (conversationResult.error) throw conversationResult.error
          const previousStatusesKey = `playlink-booking-statuses-${user.id}`
          const storedStatuses = window.localStorage.getItem(previousStatusesKey)
          const previousStatuses = (() => {
            try { return JSON.parse(storedStatuses || '{}') } catch { return {} }
          })()
          nextActivities = (bookingResult.data || []).flatMap((booking) => {
            if (!storedStatuses) return []
            if (previousStatuses[booking.id] === booking.status) return []
            return [{
              id: `booking:${booking.id}:${booking.status}`,
              kind: 'booking',
              title: `Booking ${booking.status}`,
              body: 'Check your venue booking details.',
              href: '/dashboard?notifications=1',
              created_at: booking.created_at || booking.starts_at,
            }]
          })
          window.localStorage.setItem(previousStatusesKey, JSON.stringify(Object.fromEntries((bookingResult.data || []).map((booking) => [booking.id, booking.status]))))
          const conversationIds = (conversationResult.data || []).map((conversation) => conversation.id)
          if (conversationIds.length) {
            const { data: messages, error: messageError } = await supabase.from('venue_messages')
              .select('id, conversation_id, body, created_at, sender_id')
              .in('conversation_id', conversationIds).neq('sender_id', user.id).order('created_at', { ascending: false })
            if (messageError) throw messageError
            nextActivities.push(...(messages || []).map((message) => ({
              id: `message:${message.id}`,
              kind: 'message',
              title: 'New venue message',
              body: message.body,
              href: '/messages',
              created_at: message.created_at,
            })))
          }
      }
      const { data: ownedTeams, error: ownedTeamsError } = await supabase.from('community_teams')
        .select('id, name')
        .eq('owner_id', user.id)
      if (ownedTeamsError) throw ownedTeamsError
      if (ownedTeams?.length) {
        const { data: requests, error: requestError } = await supabase.from('team_invitations')
          .select('id, team_id, created_at')
          .in('team_id', ownedTeams.map((team) => team.id))
          .eq('kind', 'request')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
        if (requestError) throw requestError
        const teamNames = new Map(ownedTeams.map((team) => [team.id, team.name]))
        nextActivities.push(...(requests || []).map((request) => ({
          id: `team-request:${request.id}`,
          kind: 'team_request',
          title: 'New request to join your team',
          body: teamNames.get(request.team_id) || 'Open team requests to review this player.',
          href: '/teams?tab=invitations',
          created_at: request.created_at,
        })))
      }
      nextActivities.sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
      if (initialized.current) {
        const fresh = nextActivities.find((activity) => !knownIds.current.has(activity.id))
        if (fresh && !readIds.has(fresh.id)) {
          setNotice(fresh)
          window.setTimeout(() => setNotice((current) => current?.id === fresh.id ? null : current), 8000)
        }
      }
      knownIds.current = new Set(nextActivities.map((activity) => activity.id))
      initialized.current = true
      setActivities(nextActivities)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'New activity could not be refreshed.')
    }
  }, [readIds, role, user])

  useEffect(() => {
    if (!user) return undefined
    loadActivity()
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') loadActivity()
    }, 10000)
    const onFocus = () => loadActivity()
    const onStorage = (event) => {
      if (event.key === readKey(user.id, role)) setReadIds(readStoredIds(event.key))
      if (event.key === inboxReadKey(user.id, role)) setInboxReadIds(readStoredIds(event.key))
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [loadActivity, user])

  const markRead = useCallback((kind) => {
    const ids = activities.filter((activity) => (!kind || activity.kind === kind) && !readIds.has(activity.id)).map((activity) => activity.id)
    if (!ids.length) return
    setReadIds((current) => {
      const updated = new Set([...current, ...ids])
      if (user) window.localStorage.setItem(readKey(user.id, role), JSON.stringify([...updated]))
      return updated
    })
    setNotice((current) => current && (!kind || current.kind === kind) ? null : current)
  }, [activities, readIds, role, user])

  const markInboxRead = useCallback(() => {
    const ids = activities.filter((activity) => activity.kind === 'message' && !inboxReadIds.has(activity.id)).map((activity) => activity.id)
    if (!ids.length) return
    setInboxReadIds((current) => {
      const updated = new Set([...current, ...ids])
      if (user) window.localStorage.setItem(inboxReadKey(user.id, role), JSON.stringify([...updated]))
      return updated
    })
  }, [activities, inboxReadIds, role, user])

  useEffect(() => {
    if (notificationOpen) markRead()
    if (role === 'owner' && path === '/owner/inbox') {
      markRead('message')
      markInboxRead()
    }
    else if (role === 'owner' && path === '/owner/bookings') markRead('booking')
    else if (role !== 'owner' && path === '/messages') {
      markRead('message')
      markInboxRead()
    }
  }, [markInboxRead, markRead, notificationOpen, path, role])

  const unread = useMemo(() => activities.filter((activity) => !readIds.has(activity.id)), [activities, readIds])
  const unreadInboxMessages = useMemo(() => activities.filter((activity) => activity.kind === 'message' && !inboxReadIds.has(activity.id)), [activities, inboxReadIds])
  return {
    activities,
    unreadCount: unread.length,
    unreadMessages: unreadInboxMessages.length,
    unreadBookings: unread.filter((activity) => activity.kind === 'booking').length,
    unread,
    notice,
    dismissNotice: () => setNotice(null),
    error,
    markRead,
    markInboxRead,
    refresh: loadActivity,
    formatCount: badgeLabel,
  }
}
