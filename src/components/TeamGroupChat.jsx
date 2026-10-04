import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DashboardShell from './DashboardShell.jsx'
import Icon from './Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'

function groupChatError(error) {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
    return 'Team invitations and group chat are not set up yet. Run supabase/migrations/20261004103000_team_invitations_and_group_chat.sql in Supabase SQL Editor.'
  }
  return error instanceof Error ? error.message : 'The team group chat could not be loaded.'
}

function timeLabel(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-NP', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function TeamGroupChat() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const teamId = searchParams.get('team_id') || ''
  const [team, setTeam] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const loadChat = useCallback(async (initial = false) => {
    if (!user || !supabase) {
      setLoading(false)
      return
    }
    if (!/^[0-9a-f-]{36}$/i.test(teamId)) {
      setError('This team chat link is not valid.')
      setLoading(false)
      return
    }
    if (initial) setLoading(true)
    try {
      const { data: teamRow, error: teamError } = await supabase.from('community_teams')
        .select('id,name,sport,area,owner_id')
        .eq('id', teamId)
        .maybeSingle()
      if (teamError) throw teamError
      if (!teamRow) throw new Error('This team is unavailable or you are not allowed to view it.')
      const isOwner = teamRow.owner_id === user.id
      if (!isOwner) {
        const { data: membership, error: membershipError } = await supabase.from('team_memberships')
          .select('team_id')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (membershipError) throw membershipError
        if (!membership) throw new Error('Accept the team invitation before opening its group chat.')
      }
      const { data: rows, error: messageError } = await supabase.from('team_messages')
        .select('id,team_id,sender_id,sender_name,body,created_at')
        .eq('team_id', teamId)
        .order('created_at', { ascending: true })
      if (messageError) throw messageError
      setTeam(teamRow)
      setMessages(rows || [])
      setError('')
    } catch (loadError) {
      setError(groupChatError(loadError))
    } finally {
      if (initial) setLoading(false)
    }
  }, [teamId, user])

  useEffect(() => {
    loadChat(true)
  }, [loadChat])

  useEffect(() => {
    if (!user || !teamId) return undefined
    const interval = window.setInterval(() => loadChat(), 6000)
    return () => window.clearInterval(interval)
  }, [loadChat, teamId, user])

  async function sendMessage(event) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || !team || !user || sending) return
    setSending(true)
    setError('')
    try {
      const { error: sendError } = await supabase.from('team_messages').insert({
        team_id: team.id,
        sender_id: user.id,
        body,
      })
      if (sendError) throw sendError
      setDraft('')
      await loadChat()
    } catch (sendError) {
      setError(groupChatError(sendError))
    } finally {
      setSending(false)
    }
  }

  return (
    <DashboardShell path="/messages">
      <main className="messages-page">
        <header className="messages-page-heading">
          <span className="dashboard-kicker">TEAM GROUP CHAT</span>
          <h1>{team?.name || 'Team chat'}</h1>
          <p>{team ? `${team.sport} · ${team.area}` : 'A private space for accepted team members.'}</p>
        </header>
        {error && <p className="messages-storage-error" role="alert">{error}</p>}
        <section className="messages-thread team-group-chat" aria-label="Team group conversation">
          <header className="messages-thread-heading"><span className="messages-avatar"><Icon name="teams" size={17} /></span><div><h2>{team?.name || 'Loading team…'}</h2><span>Team owner and accepted members</span></div><Link to="/teams" className="messages-view-profile">Teams</Link></header>
          <div className="messages-thread-body" aria-live="polite">
            {loading ? <p className="messages-empty" role="status">Loading team chat…</p> : messages.length
              ? messages.map((message) => <article key={message.id} className={`message-bubble ${message.sender_id === user?.id ? 'sent' : 'received'}`}><b className="team-message-sender">{message.sender_id === user?.id ? 'You' : message.sender_name}</b><p>{message.body}</p><time>{timeLabel(message.created_at)}</time></article>)
              : <div className="messages-empty-thread"><Icon name="message" size={21} /><b>Start the team conversation</b><span>Messages are visible only to this team’s owner and accepted members.</span></div>}
          </div>
          <form className="messages-composer" onSubmit={sendMessage}>
            <label className="visually-hidden" htmlFor="team-message-draft">Write a team message</label>
            <input id="team-message-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Write to your team..." />
            <button type="submit" className="button button-primary" disabled={!draft.trim() || sending}><span>{sending ? 'Sending…' : 'Send'}</span><Icon name="arrow-right" size={14} /></button>
          </form>
        </section>
      </main>
    </DashboardShell>
  )
}
