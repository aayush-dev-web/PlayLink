import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DashboardShell from './DashboardShell.jsx'
import Icon from './Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'
import WarningAppeals from './WarningAppeals.jsx'

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'PL'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-NP', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatTeamMessage(body = '') {
  return body.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

function playerChatError(error) {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
    return 'Player messaging is not set up yet. Run supabase/migrations/20261004102000_player_direct_messaging.sql in your Supabase SQL Editor.'
  }
  if (error?.code === '42501') return error.message || 'You do not have permission to access this conversation.'
  return error instanceof Error ? error.message : 'Player messages could not be loaded.'
}

export default function PlayerDirectMessages() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedPlayerId = searchParams.get('player_id') || ''
  const requestedConversationId = searchParams.get('conversation_id') || ''
  const openAdminContact = searchParams.get('contact') === 'admin'
  const [conversations, setConversations] = useState([])
  const [teamMessages, setTeamMessages] = useState([])
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const threadBodyRef = useRef(null)

  const teamConversation = useMemo(() => ({
    id: 'playlink-team',
    name: 'PlayLink Admin',
    sport: 'Direct support',
    area: 'Message the PlayLink admin',
    messages: teamMessages,
    latest: teamMessages.at(-1),
  }), [teamMessages])
  const inboxConversations = useMemo(() => [teamConversation, ...conversations], [conversations, teamConversation])
  const activeConversation = inboxConversations.find((conversation) => conversation.id === activeId)
  const visibleConversations = useMemo(() => inboxConversations.filter((conversation) => (
    `${conversation.name} ${conversation.sport} ${conversation.area} ${conversation.latest?.body || ''}`
      .toLowerCase().includes(search.toLowerCase())
  )), [inboxConversations, search])

  const loadInbox = useCallback(async (initial = false, playerId = '', conversationId = '') => {
    if (!user || !supabase) {
      setLoading(false)
      return
    }
    if (initial) setLoading(true)
    try {
      let startedConversationId = ''
      if (playerId) {
        if (!/^[0-9a-f-]{36}$/i.test(playerId)) throw new Error('That player profile link is not valid.')
        const { data, error: startError } = await supabase.rpc('start_player_conversation', {
          requested_player_id: playerId,
        })
        if (startError) throw startError
        startedConversationId = data
      }

      const [{ data: rows, error: conversationError }, { data: teamRows, error: teamError }] = await Promise.all([
        supabase.from('player_direct_conversations')
          .select('*')
          .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
          .order('updated_at', { ascending: false }),
        supabase.from('player_inbox_messages')
          .select('id,user_id,subject,body,direction,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
      ])
      if (conversationError) throw conversationError
      if (teamError) throw teamError
      setTeamMessages(teamRows || [])
      const baseRows = rows || []
      const participantIds = [...new Set(baseRows.flatMap((conversation) => [conversation.user_one_id, conversation.user_two_id]))]
      const conversationIds = baseRows.map((conversation) => conversation.id)
      let listingRows = []
      let messageRows = []
      if (conversationIds.length) {
        const [listingsResult, messagesResult] = await Promise.all([
          supabase.from('player_listings').select('user_id,display_name,sport,area').in('user_id', participantIds),
          supabase.from('player_direct_messages').select('*').in('conversation_id', conversationIds).order('created_at', { ascending: true }),
        ])
        if (listingsResult.error) throw listingsResult.error
        if (messagesResult.error) throw messagesResult.error
        listingRows = listingsResult.data || []
        messageRows = messagesResult.data || []
      }
      const listingByUserId = new Map((listingRows || []).map((listing) => [listing.user_id, listing]))
      const nextConversations = baseRows.map((conversation) => {
        const otherUserId = conversation.user_one_id === user.id ? conversation.user_two_id : conversation.user_one_id
        const listing = listingByUserId.get(otherUserId)
        const messages = (messageRows || []).filter((message) => message.conversation_id === conversation.id)
        return {
          ...conversation,
          otherUserId,
          name: listing?.display_name || 'PlayLink player',
          sport: listing?.sport || 'Player',
          area: listing?.area || 'Community',
          messages,
          latest: messages.at(-1),
        }
      })
      setConversations(nextConversations)
      setActiveId((current) => startedConversationId
        || (conversationId && nextConversations.some((conversation) => conversation.id === conversationId) ? conversationId : '')
        || (openAdminContact ? 'playlink-team' : '')
        || (current && (current === 'playlink-team' || nextConversations.some((conversation) => conversation.id === current))
          ? current
          : 'playlink-team'))
      setError('')
    } catch (loadError) {
      setError(playerChatError(loadError))
    } finally {
      if (initial) setLoading(false)
    }
  }, [user, openAdminContact])

  useEffect(() => {
    loadInbox(true, requestedPlayerId, requestedConversationId)
  }, [loadInbox, requestedConversationId, requestedPlayerId])

  useEffect(() => {
    if (!user) return undefined
    const interval = window.setInterval(() => loadInbox(), 6000)
    return () => window.clearInterval(interval)
  }, [loadInbox, user])

  useEffect(() => {
    if (threadBodyRef.current) threadBodyRef.current.scrollTop = threadBodyRef.current.scrollHeight
  }, [activeId, activeConversation?.messages.length])

  async function sendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !activeConversation || !user || sending) return
    setSending(true)
    setError('')
    try {
      const { error: sendError } = activeConversation.id === 'playlink-team'
        ? await supabase.from('player_inbox_messages').insert({
          user_id: user.id,
          subject: 'Message to PlayLink Team',
          body,
          direction: 'player_to_team',
        })
        : await supabase.from('player_direct_messages').insert({
          conversation_id: activeConversation.id,
          sender_id: user.id,
          body,
        })
      if (sendError) throw sendError
      setDraft('')
      await loadInbox()
    } catch (sendError) {
      setError(playerChatError(sendError))
    } finally {
      setSending(false)
    }
  }

  return (
    <DashboardShell path="/messages" search={search} onSearch={setSearch}>
      <main className="messages-page">
        <header className="messages-page-heading">
          <span className="dashboard-kicker">PLAYLINK COMMUNITY</span>
          <h1>Messages</h1>
          <p>Contact the PlayLink admin or have private conversations with players in the community.</p>
        </header>
        <div className="messages-prototype-note"><Icon name="message" size={15} /><span>Your PlayLink Team messages are saved in this inbox. Player conversations are private to the two people in each chat.</span></div>
        {error && <p className="messages-storage-error" role="alert">{error}</p>}
        <section className="messages-workspace" aria-label="Player message inbox">
          <aside className="messages-inbox">
            <div className="messages-inbox-heading"><div><h2>Inbox</h2><span>{conversations.length} player conversations + PlayLink Team</span></div></div>
            <label className="messages-search"><Icon name="search" size={15} /><input aria-label="Search player conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations..." /></label>
            <div className="messages-conversation-list">
              {loading ? <div className="messages-empty" role="status">Loading conversations…</div> : visibleConversations.map((conversation) => (
                <button key={conversation.id} type="button" className={`messages-conversation${conversation.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(conversation.id)}>
                  <span className="messages-avatar">{initials(conversation.name)}</span>
                  <span className="messages-conversation-copy"><b>{conversation.name}</b><small>{conversation.latest?.body || 'Start a conversation'}</small><i>{conversation.sport} · {conversation.area}</i></span>
                  <span className="messages-conversation-meta"><small>{formatTime(conversation.latest?.created_at)}</small></span>
                </button>
              ))}
              {!loading && visibleConversations.length === 0 && <div className="messages-empty"><Icon name="message" size={22} /><b>No matching conversations</b><span>Open a player profile to start a conversation.</span></div>}
            </div>
          </aside>
          {activeConversation
            ? <section className="messages-thread" aria-label={`Conversation with ${activeConversation.name}`}>
              <header className="messages-thread-heading"><span className="messages-avatar">{initials(activeConversation.name)}</span><div><h2>{activeConversation.name}</h2><span>{activeConversation.sport} · {activeConversation.area}</span></div>{activeConversation.id !== 'playlink-team' && <Link to="/players" className="messages-view-profile">Find players</Link>}</header>
              <div className="messages-thread-context"><Icon name="message" size={14} /><span>{activeConversation.id === 'playlink-team' ? 'Direct PlayLink Admin conversation · messages are saved' : 'Private player conversation'}</span></div>
              <div className="messages-thread-body" aria-live="polite" ref={threadBodyRef}>
                {activeConversation.messages.length > 0
                  ? activeConversation.messages.map((message) => {
                    const mine = activeConversation.id === 'playlink-team'
                      ? message.direction === 'player_to_team'
                      : message.sender_id === user.id
                    return <article key={message.id} className={`message-bubble ${mine ? 'sent' : 'received'}`}>
                      {activeConversation.id === 'playlink-team' && message.subject && <b className="messages-team-subject">{mine ? 'You messaged PlayLink Team' : message.subject}</b>}
                      <p>{activeConversation.id === 'playlink-team' ? formatTeamMessage(message.body) : message.body}</p><time>{formatTime(message.created_at)}</time>
                    </article>
                  })
                  : <div className="messages-empty-thread"><Icon name="message" size={21} /><b>Start a conversation with {activeConversation.name}</b><span>Send a direct message to get in touch.</span></div>}
              </div>
              {activeConversation.id === 'playlink-team' && <WarningAppeals />}
              <form className="messages-composer" onSubmit={sendMessage}>
                <label className="visually-hidden" htmlFor="player-message-draft">Write a message</label>
                <input id="player-message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="2000" placeholder={activeConversation.id === 'playlink-team' ? 'Message the PlayLink admin…' : 'Write a message...'} />
                <button type="submit" className="button button-primary" disabled={!draft.trim() || sending}><span>{sending ? 'Sending…' : 'Send'}</span><Icon name="arrow-right" size={14} /></button>
              </form>
            </section>
            : <section className="messages-thread messages-no-thread"><Icon name="message" size={34} /><h2>Your player inbox</h2><p>Select a conversation or open a player profile to start chatting.</p><Link className="button button-primary" to="/players">Find players</Link></section>}
        </section>
      </main>
    </DashboardShell>
  )
}
