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

function sameIds(first, second) {
  return first.size === second.size && [...first].every((id) => second.has(id))
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
        if (role === 'admin') {
          const { data, error: activityError } = await supabase.rpc('get_playlink_admin_notifications')
          if (activityError) throw activityError
          nextActivities = (data || []).map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            body: item.body,
            href: item.href,
            created_at: item.created_at,
          }))
        } else if (role === 'owner') {
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
      if (role === 'player') {
        const [teamResult, eventsResult, ownedTeamsResult] = await Promise.all([
          supabase.from('community_teams').select('id,name,created_at,owner_id')
            .eq('is_active', true).eq('is_public', true).neq('owner_id', user.id)
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('events').select('id,title,created_at,organizer_id')
            .in('status', ['open', 'full']).neq('organizer_id', user.id)
            .order('created_at', { ascending: false }).limit(20),
          supabase.from('community_teams').select('id,name').eq('owner_id', user.id),
        ])
        if (teamResult.error) throw teamResult.error
        if (eventsResult.error) throw eventsResult.error
        if (ownedTeamsResult.error) throw ownedTeamsResult.error
        nextActivities.push(...(eventsResult.data || []).map((event) => ({
          id: `new-event:${event.id}`,
          kind: 'event',
          title: 'New event posted',
          body: event.title,
          href: `/events/${event.id}`,
          created_at: event.created_at,
        })))
        nextActivities.push(...(teamResult.data || []).map((team) => ({
          id: `new-team:${team.id}`,
          kind: 'team',
          title: 'New team created',
          body: team.name,
          href: '/teams',
          created_at: team.created_at,
        })))
        if (ownedTeamsResult.data?.length) {
          const { data: requests, error: requestError } = await supabase.from('team_invitations')
            .select('id, team_id, created_at')
            .in('team_id', ownedTeamsResult.data.map((team) => team.id))
            .eq('kind', 'request')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
          if (requestError) throw requestError
          const teamNames = new Map(ownedTeamsResult.data.map((team) => [team.id, team.name]))
          nextActivities.push(...(requests || []).map((request) => ({
            id: `team-request:${request.id}`,
            kind: 'team_request',
            title: 'New request to join your team',
            body: teamNames.get(request.team_id) || 'Open team requests to review this player.',
            href: '/teams?tab=invitations',
            created_at: request.created_at,
          })))
        }
      }
      if (role !== 'admin' && user.id !== 'playlink-local-demo') {
        const [directConversationsResult, inboxMessagesResult, membershipsResult] = await Promise.all([
        supabase.from('player_direct_conversations')
          .select('id,user_one_id,user_two_id')
          .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
          .order('updated_at', { ascending: false })
          .limit(50),
        supabase.from('player_inbox_messages')
          .select('id,subject,body,created_at,direction')
          .eq('user_id', user.id)
          .eq('direction', 'team_to_player')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('team_memberships').select('team_id').eq('user_id', user.id),
        ])
        if (directConversationsResult.error) throw directConversationsResult.error
        if (inboxMessagesResult.error) throw inboxMessagesResult.error
        if (membershipsResult.error) throw membershipsResult.error

        const directConversations = directConversationsResult.data || []
        const otherPlayerIds = directConversations.map((conversation) => (
        conversation.user_one_id === user.id ? conversation.user_two_id : conversation.user_one_id
        ))
        if (directConversations.length) {
        const [directMessagesResult, playersResult] = await Promise.all([
          supabase.from('player_direct_messages')
            .select('id,conversation_id,sender_id,body,created_at')
            .in('conversation_id', directConversations.map((conversation) => conversation.id))
            .neq('sender_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase.from('player_listings').select('user_id,display_name').in('user_id', otherPlayerIds),
        ])
        if (directMessagesResult.error) throw directMessagesResult.error
        if (playersResult.error) throw playersResult.error
        const conversationById = new Map(directConversations.map((conversation) => [conversation.id, conversation]))
        const playerNameById = new Map((playersResult.data || []).map((player) => [player.user_id, player.display_name]))
        nextActivities.push(...(directMessagesResult.data || []).map((message) => {
          const conversation = conversationById.get(message.conversation_id)
          return {
            id: `player-message:${message.id}`,
            kind: 'message',
            title: `Message from ${playerNameById.get(message.sender_id) || 'a PlayLink player'}`,
            body: message.body,
            href: `/messages?conversation_id=${encodeURIComponent(message.conversation_id)}`,
            created_at: message.created_at,
          }
        }))
        }

        const inboxMessages = inboxMessagesResult.data || []
        const moderationMessages = inboxMessages.filter((message) => (
        /^Community warning \d+ of \d+$/.test(message.subject || '')
        || message.subject === 'PlayLink account restriction'
        || message.subject === 'Appeal decision'
        ))
        nextActivities.push(...moderationMessages.map((message) => ({
        id: `moderation:${message.id}`,
        kind: 'moderation',
        title: message.subject,
        body: (message.body || '').split('\n')[0],
        href: '/messages',
        created_at: message.created_at,
        })))
        nextActivities.push(...inboxMessages.filter((message) => !moderationMessages.includes(message)).map((message) => ({
        id: `admin-message:${message.id}`,
        kind: 'message',
        title: message.subject || 'Message from PlayLink Admin',
        body: message.body,
        href: '/messages',
        created_at: message.created_at,
        })))

        const ownedTeamsResult = await supabase.from('community_teams').select('id').eq('owner_id', user.id)
        if (ownedTeamsResult.error) throw ownedTeamsResult.error
        const teamIds = [...new Set([
        ...(ownedTeamsResult.data || []).map((team) => team.id),
        ...(membershipsResult.data || []).map((membership) => membership.team_id),
        ])]
        if (teamIds.length) {
        const [teamResult, teamMessagesResult] = await Promise.all([
          supabase.from('community_teams').select('id,name').in('id', teamIds),
          supabase.from('team_messages')
            .select('id,team_id,sender_id,sender_name,body,created_at')
            .in('team_id', teamIds)
            .neq('sender_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100),
        ])
        if (teamResult.error) throw teamResult.error
        if (teamMessagesResult.error) throw teamMessagesResult.error
        const teamNames = new Map((teamResult.data || []).map((team) => [team.id, team.name]))
        nextActivities.push(...(teamMessagesResult.data || []).map((message) => ({
          id: `team-message:${message.id}`,
          kind: 'message',
          title: `Message in ${teamNames.get(message.team_id) || 'your team'}`,
          body: `${message.sender_name}: ${message.body}`,
          href: `/messages?team_id=${encodeURIComponent(message.team_id)}`,
          created_at: message.created_at,
        })))
        }
      }
      nextActivities.sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
      let nextReadIds = new Set([...readIds, ...readStoredIds(readKey(user.id, role))])
      let nextInboxReadIds = new Set([...inboxReadIds, ...readStoredIds(inboxReadKey(user.id, role))])
      if (user.id !== 'playlink-local-demo' && nextActivities.length) {
        const activityIds = nextActivities.map((activity) => activity.id)
        const { data: readReceipts, error: readError } = await supabase
          .from('playlink_notification_reads')
          .select('notification_id')
          .eq('user_id', user.id)
          .in('notification_id', [...activityIds, ...activityIds.map((id) => `inbox:${id}`)])
        if (readError) {
          if (['PGRST205', '42P01'].includes(readError.code)) {
            throw new Error('Persistent notification status is not set up. Apply supabase/migrations/20261014120000_persistent_notification_reads.sql.')
          }
          throw readError
        }
        const receiptIds = (readReceipts || []).map((receipt) => receipt.notification_id)
        nextReadIds = new Set([...nextReadIds, ...receiptIds.filter((id) => !id.startsWith('inbox:'))])
        nextInboxReadIds = new Set([
          ...nextInboxReadIds,
          ...receiptIds.filter((id) => id.startsWith('inbox:')).map((id) => id.slice('inbox:'.length)),
        ])
        if (!sameIds(readIds, nextReadIds)) setReadIds(nextReadIds)
        if (!sameIds(inboxReadIds, nextInboxReadIds)) setInboxReadIds(nextInboxReadIds)
      }
      if (initialized.current) {
        const fresh = nextActivities.find((activity) => !knownIds.current.has(activity.id))
        if (fresh && !nextReadIds.has(fresh.id)) {
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
  }, [inboxReadIds, readIds, role, user])

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
    if (user && user.id !== 'playlink-local-demo' && supabase) {
      supabase.from('playlink_notification_reads').upsert(
        ids.map((notification_id) => ({ user_id: user.id, notification_id })),
        { onConflict: 'user_id,notification_id' },
      ).then(({ error: readError }) => {
        if (readError) setError(`Notification read status could not be saved: ${readError.message}`)
      })
    }
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
    if (user && user.id !== 'playlink-local-demo' && supabase) {
      supabase.from('playlink_notification_reads').upsert(
        ids.map((id) => ({ user_id: user.id, notification_id: `inbox:${id}` })),
        { onConflict: 'user_id,notification_id' },
      ).then(({ error: readError }) => {
        if (readError) setError(`Message read status could not be saved: ${readError.message}`)
      })
    }
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
