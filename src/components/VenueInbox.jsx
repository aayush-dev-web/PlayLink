import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'

const reactionEmojis = ['👍', '❤️', '😂', '🙌', '⚽', '🏏', '🔥', '👏', '😍', '🙏', '💪', '🎉', '😁', '😮', '😢', '😡', '💯', '🤝', '✅', '❌', '🏆', '🥅', '🥳', '🤩', '👀', '💚', '🫡', '😅']

function nameInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'PL'
}

function messageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-NP', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function inboxErrorMessage(error) {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
    if (error?.message?.includes('venue_message_reactions')) {
      return 'Message reactions are not set up yet. Run supabase/migrations/20261003091000_venue_message_reactions.sql, then reload the inbox.'
    }
    return 'The venue messaging database setup is missing. Run supabase/migrations/20261003070000_venue_owner_messaging.sql in your Supabase SQL Editor, then reload the inbox.'
  }
  return error instanceof Error ? error.message : 'Your messages could not be loaded.'
}

export default function VenueInbox({ mode = 'player' }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedVenueId = searchParams.get('venue_id') || ''
  const [conversations, setConversations] = useState([])
  const [venues, setVenues] = useState([])
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [reactionPickerMessage, setReactionPickerMessage] = useState('')
  const [reactionPickerPosition, setReactionPickerPosition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [reactingMessage, setReactingMessage] = useState('')
  const [error, setError] = useState('')
  const activeConversation = conversations.find((conversation) => conversation.id === activeId)
  const selectedVenue = venues.find((venue) => venue.id === requestedVenueId)

  const loadInbox = useCallback(async (initial = false) => {
    if (!user) {
      setLoading(false)
      return
    }
    if (initial) setLoading(true)
    try {
      if (!supabase) throw new Error('Messaging requires a configured Supabase connection.')
      const venueQuery = supabase.from('owner_venues').select('id, owner_id, name, sport, area, image_url').order('name')
      const conversationQuery = supabase.from('venue_conversations').select('*').order('updated_at', { ascending: false })
      if (mode === 'player') conversationQuery.eq('player_id', user.id)
      const [venueResult, conversationResult] = await Promise.all([venueQuery, conversationQuery])
      if (venueResult.error) throw venueResult.error
      if (conversationResult.error) throw conversationResult.error
      let nextVenues = venueResult.data || []
      const baseConversations = conversationResult.data || []
      const venueIds = [...new Set(baseConversations.map((conversation) => conversation.venue_id))]
      const venueMap = new Map(nextVenues.map((venue) => [venue.id, venue]))
      if (venueIds.length) {
        const { data: conversationVenues, error: conversationVenueError } = await supabase
          .from('owner_venues').select('id, owner_id, name, sport, area, image_url').in('id', venueIds)
        if (conversationVenueError) throw conversationVenueError
        for (const venue of conversationVenues || []) venueMap.set(venue.id, venue)
      }
      const conversationIds = baseConversations.map((conversation) => conversation.id)
      let messageRows = []
      let reactionRows = []
      if (conversationIds.length) {
        const { data, error: messageError } = await supabase.from('venue_messages').select('*')
          .in('conversation_id', conversationIds).order('created_at', { ascending: true })
        if (messageError) throw messageError
        messageRows = data || []
        const messageIds = messageRows.map((message) => message.id)
        if (messageIds.length) {
          const { data: reactions, error: reactionError } = await supabase.from('venue_message_reactions')
            .select('*').in('message_id', messageIds)
          if (reactionError) throw reactionError
          reactionRows = reactions || []
        }
      }
      let nextConversations = baseConversations.map((conversation) => ({
        ...conversation,
        venue: venueMap.get(conversation.venue_id) || { id: conversation.venue_id, name: 'Venue', sport: '', area: '' },
        messages: messageRows.filter((message) => message.conversation_id === conversation.id).map((message) => ({
          ...message,
          reactions: reactionRows.filter((reaction) => reaction.message_id === message.id),
        })),
      }))

      if (requestedVenueId && mode === 'player' && !nextConversations.some((item) => item.venue_id === requestedVenueId)) {
        let venue = nextVenues.find((item) => item.id === requestedVenueId)
        if (!venue && supabase) {
          const { data, error: venueError } = await supabase.from('owner_venues').select('id, owner_id, name, sport, area, image_url')
            .eq('id', requestedVenueId).eq('is_active', true).maybeSingle()
          if (venueError) throw venueError
          venue = data
        }
        if (venue) nextVenues = [...nextVenues.filter((item) => item.id !== venue.id), venue]
      }
      setVenues(nextVenues)
      setConversations(nextConversations)
      setActiveId((current) => {
        if (current && nextConversations.some((conversation) => conversation.id === current)) return current
        if (requestedVenueId && mode === 'player') {
          return nextConversations.find((conversation) => conversation.venue_id === requestedVenueId)?.id || ''
        }
        return nextConversations[0]?.id || ''
      })
      setError('')
    } catch (loadError) {
      setError(inboxErrorMessage(loadError))
    } finally {
      if (initial) setLoading(false)
    }
  }, [mode, requestedVenueId, user])

  useEffect(() => {
    loadInbox(true)
  }, [loadInbox])

  useEffect(() => {
    if (!user) return undefined
    const interval = window.setInterval(() => loadInbox(false), 6000)
    return () => {
      window.clearInterval(interval)
    }
  }, [loadInbox, user])

  const sortedConversations = useMemo(() => conversations, [conversations])
  const initialMessageVenue = requestedVenueId && mode === 'player' ? selectedVenue : null

  async function sendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !user || sending) return
    setError('')
    setSending(true)
    try {
      let conversation = activeConversation
      if (!conversation && initialMessageVenue) {
        if (!supabase) throw new Error('Messaging requires a configured Supabase connection.')
        const { data: conversationId, error: startError } = await supabase.rpc('start_venue_conversation', {
          requested_venue_id: initialMessageVenue.id,
          requested_player_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'PlayLink player',
        })
        if (startError) throw startError
        conversation = {
          id: conversationId,
          venue_id: initialMessageVenue.id,
          owner_id: initialMessageVenue.owner_id,
          player_id: user.id,
          player_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'PlayLink player',
          venue: initialMessageVenue,
          messages: [],
        }
        setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
        setActiveId(conversation.id)
      }
      if (!conversation) throw new Error('Choose a venue conversation before sending a message.')
      if (!supabase) throw new Error('Messaging requires a configured Supabase connection.')
      const { data: newMessage, error: insertError } = await supabase.from('venue_messages').insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        body,
      }).select('*').single()
      if (insertError) throw insertError
      setConversations((current) => current.map((item) => item.id === conversation.id
        ? { ...item, messages: [...item.messages, newMessage], updated_at: newMessage.created_at }
        : item).sort((first, second) => new Date(second.updated_at || 0) - new Date(first.updated_at || 0)))
      setDraft('')
      const textarea = document.getElementById(`venue-message-${mode}`)
      if (textarea) {
        textarea.style.height = ''
        textarea.style.overflowY = 'hidden'
      }
    } catch (sendError) {
      setError(inboxErrorMessage(sendError))
    } finally {
      setSending(false)
    }
  }

  const selectedConversation = activeConversation || (initialMessageVenue ? {
    venue_id: initialMessageVenue.id,
    venue: initialMessageVenue,
    player_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'PlayLink player',
    messages: [],
  } : null)
  const activeMessages = selectedConversation?.messages || []
  const otherPartyName = mode === 'owner' ? selectedConversation?.player_name || 'Player' : selectedConversation?.venue?.name || 'Venue owner'

  function changeDraft(event) {
    const textarea = event.currentTarget
    setDraft(textarea.value)
    textarea.style.height = 'auto'
    const height = Math.min(textarea.scrollHeight, 120)
    textarea.style.height = `${Math.max(39, height)}px`
    textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden'
  }

  function insertEmoji(emoji) {
    const textarea = document.getElementById(`venue-message-${mode}`)
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const value = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`
    setDraft(value)
    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + emoji.length
      textarea.setSelectionRange(cursor, cursor)
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
      textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden'
    })
  }

  async function toggleReaction(message, emoji) {
    if (!user || reactingMessage) return
    setError('')
    setReactingMessage(message.id)
    try {
      const reactions = message.reactions || []
      const existing = reactions.find((reaction) => reaction.user_id === user.id && reaction.emoji === emoji)
      if (!supabase) throw new Error('Messaging requires a configured Supabase connection.')
      const result = existing
        ? await supabase.from('venue_message_reactions').delete().eq('id', existing.id)
        : await supabase.from('venue_message_reactions').insert({ message_id: message.id, user_id: user.id, emoji })
      if (result.error) throw result.error
      await loadInbox(false)
    } catch (reactionError) {
      setError(inboxErrorMessage(reactionError))
    } finally {
      setReactingMessage('')
    }
  }

  return (
    <section className={`venue-inbox venue-inbox-${mode}`} aria-label={mode === 'owner' ? 'Owner inbox' : 'Venue messages'}>
      {error && <p className="venue-inbox-error" role="alert">{error}</p>}
      {loading ? <p className="venue-inbox-loading" role="status">Loading conversations…</p> : <>
        <aside className="venue-inbox-list">
          <header><div><h2>{mode === 'owner' ? 'Inbox' : 'Venue conversations'}</h2><small>{sortedConversations.length} conversations</small></div><Icon name="message" size={17} /></header>
          {!sortedConversations.length ? <p className="venue-inbox-empty">{mode === 'owner' ? 'When players message one of your venues, their conversations will appear here.' : 'No venue conversations yet. Open an owner-listed venue and choose Message owner to start one.'}</p>
            : sortedConversations.map((conversation) => {
              const last = conversation.messages.at(-1)
              const title = mode === 'owner' ? conversation.player_name : conversation.venue?.name
              return <button className={`venue-inbox-thread${activeId === conversation.id ? ' active' : ''}`} type="button" key={conversation.id} onClick={() => setActiveId(conversation.id)}>
                <span className="venue-inbox-avatar">{nameInitials(title)}</span>
                <span className="venue-inbox-thread-copy"><b>{title || 'PlayLink player'}</b><small>{conversation.venue?.name} · {conversation.sport || conversation.venue?.sport}</small><small>{last?.body || 'Conversation started'}</small></span>
                <time>{messageTime(last?.created_at || conversation.updated_at)}</time>
              </button>
            })}
        </aside>
        {selectedConversation ? <section className="venue-inbox-chat">
          <header><span className="venue-inbox-avatar">{nameInitials(otherPartyName)}</span><span><b>{otherPartyName}</b><small>{mode === 'owner' ? `${selectedConversation.venue?.name || 'Your venue'} · ${selectedConversation.venue?.area || ''}` : 'Venue owner conversation'}</small></span></header>
          <div className="venue-inbox-messages">
            {activeMessages.length ? activeMessages.map((message) => {
              const messageReactions = message.reactions || []
              const reactionGroups = reactionEmojis.map((emoji) => ({
                emoji,
                reactions: messageReactions.filter((reaction) => reaction.emoji === emoji),
              })).filter((group) => group.reactions.length)
              return <article key={message.id} className={`venue-inbox-message${message.sender_id === user?.id ? ' mine' : ''}`}>
                <p>{message.body}</p>
                <time>{messageTime(message.created_at)}</time>
                <div className="venue-inbox-message-actions">
                  {reactionGroups.length > 0 && <div className="venue-inbox-reactions" aria-label="Message reactions">{reactionGroups.map(({ emoji, reactions }) => {
                    const reacted = reactions.some((reaction) => reaction.user_id === user?.id)
                    return <button key={emoji} type="button" className={reacted ? 'reacted' : ''} aria-label={`React with ${emoji}, ${reactions.length} reactions`} aria-pressed={reacted} disabled={reactingMessage === message.id} onClick={() => toggleReaction(message, emoji)}>{emoji}<span>{reactions.length}</span></button>
                  })}</div>}
                  <div className="venue-inbox-react-picker-wrap">
                    <button type="button" className="venue-inbox-react-toggle" aria-label="Add reaction" title="Add reaction" aria-expanded={reactionPickerMessage === message.id} onClick={(event) => {
                      if (reactionPickerMessage === message.id) {
                        setReactionPickerMessage('')
                        setReactionPickerPosition(null)
                        return
                      }
                      const rect = event.currentTarget.getBoundingClientRect()
                      const pickerWidth = Math.min(254, window.innerWidth - 16)
                      const pickerHeight = 160
                      setReactionPickerPosition({
                        left: Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8)),
                        top: Math.max(8, Math.min(rect.top - pickerHeight - 8, window.innerHeight - pickerHeight - 8)),
                      })
                      setReactionPickerMessage(message.id)
                    }}><Icon name="smile" size={15} /></button>
                    {reactionPickerMessage === message.id && reactionPickerPosition && createPortal(
                      <div className="venue-inbox-reaction-picker" aria-label="Choose a reaction" style={reactionPickerPosition}>{reactionEmojis.map((emoji) => <button key={emoji} type="button" aria-label={`React with ${emoji}`} disabled={reactingMessage === message.id} onClick={() => { toggleReaction(message, emoji); setReactionPickerMessage(''); setReactionPickerPosition(null) }}>{emoji}</button>)}</div>,
                      document.body,
                    )}
                  </div>
                </div>
              </article>
            })
              : <p className="venue-inbox-first-message">Start the conversation with {otherPartyName}. Messages will be delivered to the venue owner.</p>}
          </div>
          <form className="venue-inbox-compose" onSubmit={sendMessage}>
            <label className="visually-hidden" htmlFor={`venue-message-${mode}`}>Write a message</label>
            <div className="venue-inbox-compose-field">
              <textarea id={`venue-message-${mode}`} rows="1" maxLength="2000" placeholder="Write a message…" value={draft} onChange={changeDraft} required />
              <div className="venue-inbox-emoji-wrap">
                <button type="button" className="venue-inbox-emoji-toggle" aria-label="Add emoji" aria-expanded={emojiPickerOpen} onClick={() => setEmojiPickerOpen((open) => !open)}>☺</button>
                {emojiPickerOpen && <div className="venue-inbox-emoji-picker" aria-label="Choose an emoji">{reactionEmojis.map((emoji) => <button type="button" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => { insertEmoji(emoji); setEmojiPickerOpen(false) }}>{emoji}</button>)}</div>}
              </div>
            </div>
            <button type="submit" className="button button-primary" disabled={sending || !draft.trim()} aria-label="Send message"><Icon name="arrow-right" size={16} />{sending ? 'Sending…' : 'Send'}</button>
          </form>
        </section> : <section className="venue-inbox-chat venue-inbox-chat-empty"><Icon name="message" size={29} /><h3>{mode === 'owner' ? 'Your inbox is ready' : 'Choose a conversation'}</h3><p>{mode === 'owner' ? 'Select a player to read and reply to their messages.' : 'Choose a venue conversation from the list.'}</p>{mode === 'player' && <Link className="button button-primary" to="/venues">Find venues</Link>}</section>}
      </>}
    </section>
  )
}
