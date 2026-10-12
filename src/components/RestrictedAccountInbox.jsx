import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../auth/supabase.js'

function messageDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

export default function RestrictedAccountInbox({ userId }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadMessages = useCallback(async () => {
    if (!supabase) {
      setError('The PlayLink message inbox is unavailable without a Supabase connection.')
      setLoading(false)
      return
    }
    try {
      const { data, error: loadError } = await supabase.from('player_inbox_messages')
        .select('id,subject,body,direction,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (loadError) throw loadError
      setMessages(data || [])
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The PlayLink messages could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadMessages()
    const interval = window.setInterval(loadMessages, 6000)
    return () => window.clearInterval(interval)
  }, [loadMessages])

  async function sendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !supabase || sending) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      const { error: sendError } = await supabase.from('player_inbox_messages').insert({
        user_id: userId,
        subject: 'Message to PlayLink Team',
        body,
        direction: 'player_to_team',
      })
      if (sendError) throw sendError
      setDraft('')
      setNotice('Your message has been saved for the PlayLink team.')
      await loadMessages()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Your message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="restricted-account-inbox" aria-label="PlayLink Team messages">
      <h2>PlayLink Team messages</h2>
      {loading && <p role="status">Loading your messages…</p>}
      {error && <p className="report-user-error" role="alert">{error}</p>}
      <div className="restricted-account-messages">
        {messages.map((message) => <article key={message.id} className={message.direction === 'player_to_team' ? 'sent' : ''}>
          <b>{message.subject}</b><p>{message.body}</p><time>{messageDate(message.created_at)}</time>
        </article>)}
        {!loading && !messages.length && <p>No PlayLink Team messages yet.</p>}
      </div>
      {notice && <p className="report-user-notice" role="status">{notice}</p>}
      <form onSubmit={sendMessage}>
        <label className="visually-hidden" htmlFor="restricted-team-message">Message the PlayLink team</label>
        <textarea id="restricted-team-message" rows="3" maxLength="2000" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Contact the PlayLink team about this restriction…" required />
        <button type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send message'}</button>
      </form>
    </section>
  )
}
