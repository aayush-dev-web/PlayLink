import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { supabase } from '../auth/supabase.js'

function messageTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-NP', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function displayName(user) {
  return user?.display_name || user?.username || user?.email || 'PlayLink member'
}

export default function AdminMessenger({ users, initialMessages, adminUserId, search = '', onMessagesChanged }) {
  const [messages, setMessages] = useState(initialMessages)
  const [activeUserId, setActiveUserId] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const messageListRef = useRef(null)
  const recipientUsers = useMemo(() => users.filter((user) => user.id !== adminUserId), [adminUserId, users])

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  const refreshMessages = useCallback(async () => {
    if (!supabase) {
      setError('The PlayLink message inbox is unavailable without a Supabase connection.')
      return
    }
    setLoading(true)
    try {
      const { data, error: loadError } = await supabase.from('player_inbox_messages')
        .select('id,user_id,subject,body,direction,created_at')
        .order('created_at', { ascending: true })
      if (loadError) throw loadError
      const nextMessages = data || []
      setMessages(nextMessages)
      onMessagesChanged(nextMessages)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The PlayLink messages could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [onMessagesChanged])

  useEffect(() => {
    const interval = window.setInterval(refreshMessages, 6000)
    return () => window.clearInterval(interval)
  }, [refreshMessages])

  const conversations = useMemo(() => {
    const messagesByUser = new Map()
    for (const message of messages) {
      const previous = messagesByUser.get(message.user_id)
      if (!previous || new Date(message.created_at).getTime() > new Date(previous.created_at).getTime()) {
        messagesByUser.set(message.user_id, message)
      }
    }
    return recipientUsers
      .filter((user) => messagesByUser.has(user.id))
      .map((user) => ({ user, latest: messagesByUser.get(user.id) }))
      .filter(({ user, latest }) => `${displayName(user)} ${user.email || ''} ${latest.body}`.toLowerCase().includes(search.toLowerCase()))
      .sort((left, right) => new Date(right.latest.created_at).getTime() - new Date(left.latest.created_at).getTime())
  }, [messages, recipientUsers, search])

  const activeUser = recipientUsers.find((user) => user.id === activeUserId) || null
  const activeMessages = useMemo(() => messages
    .filter((message) => message.user_id === activeUserId)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()), [activeUserId, messages])

  useEffect(() => {
    if (activeUserId && recipientUsers.some((user) => user.id === activeUserId)) return
    setActiveUserId(conversations[0]?.user.id || recipientUsers[0]?.id || '')
  }, [activeUserId, conversations, recipientUsers])

  useEffect(() => {
    if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight
  }, [activeUserId, activeMessages.length])

  async function sendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !activeUserId || !supabase || sending) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      const { error: sendError } = await supabase.rpc('admin_send_player_inbox_message', {
        p_user_id: activeUserId,
        p_body: body,
      })
      if (sendError) throw sendError
      setDraft('')
      setNotice(`Message sent to ${displayName(activeUser)}.`)
      await refreshMessages()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="admin-messenger" aria-label="Direct messages">
      <aside className="admin-messenger-conversations">
        <header><div><h3>Conversations</h3><small>{conversations.length} active</small></div><Icon name="message" size={17} /></header>
        <label className="admin-messenger-recipient">Message a user
          <select aria-label="Choose user to message" value={activeUserId} onChange={(event) => { setActiveUserId(event.target.value); setNotice(''); setError('') }}>
            <option value="">Choose a user</option>
            {recipientUsers.map((user) => <option key={user.id} value={user.id}>{displayName(user)} · {user.email || user.account_type}</option>)}
          </select>
        </label>
        <div className="admin-messenger-conversation-list">
          {conversations.map(({ user, latest }) => <button key={user.id} type="button" className={user.id === activeUserId ? 'active' : ''} onClick={() => { setActiveUserId(user.id); setNotice(''); setError('') }}>
            <span className="admin-messenger-avatar">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : displayName(user).slice(0, 1).toUpperCase()}</span>
            <span><b>{displayName(user)}</b><small>{latest.body}</small><time>{messageTime(latest.created_at)}</time></span>
          </button>)}
          {!conversations.length && <p>{search ? 'No conversations match your search.' : 'No conversations yet. Choose a user above to send a message.'}</p>}
        </div>
      </aside>
      <section className="admin-messenger-thread" aria-label={activeUser ? `Conversation with ${displayName(activeUser)}` : 'New conversation'}>
        {activeUser
          ? <>
            <header><span className="admin-messenger-avatar">{activeUser.avatar_url ? <img src={activeUser.avatar_url} alt="" /> : displayName(activeUser).slice(0, 1).toUpperCase()}</span><div><h3>{displayName(activeUser)}</h3><small>{activeUser.email || activeUser.account_type.replace('_', ' ')}</small></div><button type="button" onClick={refreshMessages} disabled={loading} aria-label="Refresh messages"><Icon name="refresh" size={15} /></button></header>
            {error && <p className="admin-messenger-feedback error" role="alert">{error}</p>}
            {notice && <p className="admin-messenger-feedback" role="status">{notice}</p>}
            <div className="admin-messenger-body" aria-live="polite" ref={messageListRef}>
              {activeMessages.map((message) => <article key={message.id} className={message.direction === 'team_to_player' ? 'sent' : 'received'}>
                <b>{message.direction === 'team_to_player' ? 'PlayLink Admin' : displayName(activeUser)}</b>
                <p>{message.body}</p><time>{messageTime(message.created_at)}</time>
              </article>)}
              {!activeMessages.length && <div className="admin-messenger-empty"><Icon name="message" size={23} /><b>Start a conversation</b><span>Send a direct message to {displayName(activeUser)}.</span></div>}
            </div>
            <form className="admin-messenger-composer" onSubmit={sendMessage}>
              <label className="visually-hidden" htmlFor="admin-message-draft">Write a message</label>
              <textarea id="admin-message-draft" rows="2" maxLength="2000" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${displayName(activeUser)}…`} required />
              <button className="button button-primary" type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}<Icon name="arrow-right" size={14} /></button>
            </form>
          </>
          : <div className="admin-messenger-empty"><Icon name="message" size={28} /><b>Choose a user to message</b><span>Select an existing conversation or pick any user from the list above.</span></div>}
      </section>
    </section>
  )
}
