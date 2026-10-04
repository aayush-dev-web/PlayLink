import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import VenueInbox from '../components/VenueInbox.jsx'
import PlayerDirectMessages from '../components/PlayerDirectMessages.jsx'
import TeamGroupChat from '../components/TeamGroupChat.jsx'

const demoInbox = [
  {
    id: 'sam-lee',
    name: 'Sam Lee',
    initials: 'SL',
    sport: 'Futsal',
    area: 'Thamel',
    online: true,
    unreadCount: 2,
    messages: [
      { id: 'sam-1', from: 'them', text: 'Hey! Are you free for a futsal game this Friday evening?', at: '10:42 AM' },
      { id: 'sam-2', from: 'me', text: 'I might be. What time are you thinking?', at: '10:51 AM' },
      { id: 'sam-3', from: 'them', text: 'We are looking at 6:30 at the community court.', at: '11:02 AM' },
    ],
  },
  {
    id: 'maya-gurung',
    name: 'Maya Gurung',
    initials: 'MG',
    sport: 'Cricket',
    area: 'Kirtipur',
    online: false,
    unreadCount: 0,
    messages: [
      { id: 'maya-1', from: 'them', text: 'Thanks for checking out our weekend cricket group. What position do you usually play?', at: 'Yesterday' },
      { id: 'maya-2', from: 'me', text: 'Happy to play as an all-rounder.', at: 'Yesterday' },
    ],
  },
  {
    id: 'everest-fc',
    name: 'Everest FC',
    initials: 'EF',
    sport: 'Futsal team',
    area: 'Bhaktapur',
    online: false,
    unreadCount: 0,
    messages: [
      { id: 'everest-1', from: 'them', text: 'We have a spot for a friendly practice match this weekend. Let us know if you are interested.', at: 'Mon' },
    ],
  },
]

function inboxStorageKey(userId) {
  return `playlink-demo-inbox-${userId || 'guest'}`
}

function DemoMessages() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState(demoInbox)
  const [activeId, setActiveId] = useState(demoInbox[0].id)
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('all')
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [sendError, setSendError] = useState('')
  const storageKey = inboxStorageKey(user?.id)
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) || conversations[0]

  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const latest = conversation.messages.at(-1)?.text || ''
    return (filter !== 'unread' || conversation.unreadCount > 0)
      && `${conversation.name} ${conversation.sport} ${conversation.area} ${latest}`.toLowerCase().includes(search.toLowerCase())
  }), [conversations, filter, search])

  useEffect(() => {
    setStorageReady(false)
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed) || parsed.some((conversation) => !conversation.id || !Array.isArray(conversation.messages))) {
          throw new Error('Saved inbox data is invalid.')
        }

        setConversations(parsed)
        setActiveId(parsed[0]?.id || '')
      } else {
        setConversations(demoInbox)
        setActiveId(demoInbox[0].id)
      }
      setStorageError('')
    } catch {
      setStorageError('Saved demo messages could not be loaded. Your current changes will remain available until you leave this page.')
      setConversations(demoInbox)
      setActiveId(demoInbox[0].id)
    } finally {
      setStorageReady(true)
    }
  }, [storageKey])

  useEffect(() => {
    if (!storageReady) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(conversations))
    } catch {
      setStorageError('Your message changes could not be saved in this browser.')
    }
  }, [conversations, storageKey, storageReady])

  useEffect(() => {
    if (!storageReady) return
    const name = searchParams.get('recipient')?.trim()
    if (!name) return

    const requestedType = searchParams.get('type') || 'player'
    const type = ['player', 'team', 'venue'].includes(requestedType) ? requestedType : 'player'
    const sport = searchParams.get('sport') || 'Sports'
    const area = searchParams.get('area') || 'Local community'
    const id = `contact-${type}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

    setActiveId(id)
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === id)
      if (existing) {
        return current.map((conversation) => conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation)
      }

      const initials = name.replace(/[^a-z0-9\s]/gi, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
      const conversation = { id, name, initials, sport, area, online: false, unreadCount: 0, messages: [] }
      return [conversation, ...current]
    })
  }, [searchParams, storageReady])

  function openConversation(conversation) {
    setActiveId(conversation.id)
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unreadCount: 0 } : item))
    setSendError('')
  }

  function sendMessage(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !activeConversation) return
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: 'me',
      text,
      at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    }
    setConversations((current) => current.map((conversation) => conversation.id === activeConversation.id
      ? { ...conversation, messages: [...conversation.messages, message], unreadCount: 0 }
      : conversation))
    setDraft('')
    setSendError('')
  }

  return (
    <DashboardShell path="/messages" search={search} onSearch={setSearch}>
      <main className="messages-page">
        <header className="messages-page-heading">
          <span className="dashboard-kicker">PLAYLINK COMMUNITY</span>
          <h1>Messages</h1>
          <p>Keep up with teammates and local sports communities.</p>
        </header>
        <div className="messages-prototype-note"><Icon name="message" size={15} /><span>This is a local inbox preview. Messages and replies are stored in this browser and are not delivered to other players.</span></div>
        {storageError && <p className="messages-storage-error" role="alert">{storageError}</p>}
        <section className="messages-workspace" aria-label="Message inbox">
          <aside className="messages-inbox">
            <div className="messages-inbox-heading"><div><h2>Inbox</h2><span>{conversations.length} conversations</span></div><button type="button" aria-label="Show unread conversations" className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}><Icon name="bell" size={15} />Unread</button></div>
            <label className="messages-search"><Icon name="search" size={15} /><input aria-label="Search messages" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations..." /></label>
            <div className="messages-conversation-list">
              {visibleConversations.map((conversation) => {
                const latest = conversation.messages.at(-1)
                return <button key={conversation.id} type="button" className={`messages-conversation${conversation.id === activeId ? ' active' : ''}`} onClick={() => openConversation(conversation)}>
                  <span className="messages-avatar">{conversation.initials}</span>
                  <span className="messages-conversation-copy"><b>{conversation.name}</b><small>{latest?.text || 'Start a conversation'}</small><i>{conversation.sport} · {conversation.area}</i></span>
                  <span className="messages-conversation-meta"><small>{latest?.at}</small>{conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}</span>
                </button>
              })}
              {visibleConversations.length === 0 && <div className="messages-empty"><Icon name="message" size={22} /><b>No conversations found</b><span>Try another search or switch back to all messages.</span></div>}
            </div>
          </aside>
          {activeConversation
            ? <section className="messages-thread" aria-label={`Conversation with ${activeConversation.name}`}>
              <header className="messages-thread-heading"><span className="messages-avatar">{activeConversation.initials}</span><div><h2>{activeConversation.name}</h2><span>{activeConversation.online ? 'Online now' : `${activeConversation.sport} · ${activeConversation.area}`}</span></div><Link to={activeConversation.id.startsWith('contact-venue-') ? '/venues' : activeConversation.id.startsWith('contact-team-') ? '/teams' : '/players'} className="messages-view-profile">{activeConversation.id.startsWith('contact-venue-') ? 'Find venues' : activeConversation.id.startsWith('contact-team-') ? 'Find teams' : 'Find players'}</Link></header>
              <div className="messages-thread-context"><Icon name={activeConversation.sport.toLowerCase().includes('cricket') ? 'cricket' : 'futsal'} size={14} /><span>{activeConversation.sport} community · {activeConversation.area}</span></div>
              <div className="messages-thread-body" aria-live="polite">
                {activeConversation.messages.length > 0
                  ? <p className="messages-thread-date">Recent activity</p>
                  : <div className="messages-empty-thread"><Icon name="message" size={21} /><b>Start a conversation with {activeConversation.name}</b><span>Write a message below to begin. This local preview will not deliver it to other users.</span></div>}
                {activeConversation.messages.map((message) => <article key={message.id} className={`message-bubble ${message.from === 'me' ? 'sent' : 'received'}`}><p>{message.text}</p><time>{message.at}</time></article>)}
              </div>
              <form className="messages-composer" onSubmit={sendMessage}>
                <label className="visually-hidden" htmlFor="message-draft">Write a reply</label>
                <input id="message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="500" placeholder="Write a reply..." />
                <button type="submit" className="button button-primary" disabled={!draft.trim()}><span>Send</span><Icon name="arrow-right" size={14} /></button>
              </form>
              {sendError && <p className="messages-storage-error" role="alert">{sendError}</p>}
            </section>
            : <section className="messages-thread messages-no-thread"><Icon name="message" size={34} /><h2>Your inbox is ready</h2><p>Select a conversation to read it, or find players to connect with.</p><Link className="button button-primary" to="/players">Find players</Link></section>}
        </section>
        <p className="dashboard-demo-caption">Conversation names and content are sample data for the PlayLink UI preview.</p>
      </main>
    </DashboardShell>
  )
}

export default function Messages() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  if (searchParams.get('team_id')) {
    if (!user) {
      const next = `/messages?${searchParams.toString()}`
      return <DashboardShell path="/messages"><main className="messages-page"><header className="messages-page-heading"><span className="dashboard-kicker">TEAM GROUP CHAT</span><h1>Team chat</h1><p>Sign in with an accepted team member account to view this conversation.</p></header><Link className="button button-primary" to={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to continue</Link></main></DashboardShell>
    }
    return <TeamGroupChat />
  }
  if (searchParams.get('player_id')) {
    if (!user) {
      const next = `/messages?${searchParams.toString()}`
      return <DashboardShell path="/messages"><main className="messages-page"><header className="messages-page-heading"><span className="dashboard-kicker">PLAYLINK COMMUNITY</span><h1>Message player</h1><p>Sign in to start a private conversation with this player.</p></header><Link className="button button-primary" to={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to message</Link></main></DashboardShell>
    }
    return <PlayerDirectMessages />
  }
  if (!user) {
    if (!searchParams.get('venue_id')) return <DemoMessages />
    return <DashboardShell path="/messages"><main className="messages-page"><header className="messages-page-heading"><span className="dashboard-kicker">PLAYLINK COMMUNITY</span><h1>Message venue</h1><p>Sign in to start a conversation with this venue owner.</p></header><Link className="button button-primary" to={`/sign-in?next=${encodeURIComponent(`/messages?${searchParams.toString()}`)}`}>Sign in to message</Link></main></DashboardShell>
  }
  if (!searchParams.get('venue_id')) {
    if (user.id === 'playlink-local-demo') return <DemoMessages />
    return <PlayerDirectMessages />
  }
  return <DashboardShell path="/messages"><main className="messages-page"><header className="messages-page-heading"><span className="dashboard-kicker">VENUE CONVERSATIONS</span><h1>Messages</h1><p>Chat with venue owners about facilities, bookings, and your game.</p></header><VenueInbox mode="player" /></main></DashboardShell>
}
