import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../auth/supabase.js'

function appealStatus(status) {
  return ({ pending: 'Under admin review', upheld: 'Warning upheld', reversed: 'Warning reversed' })[status] || status
}

export default function WarningAppeals() {
  const [warnings, setWarnings] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadWarnings = useCallback(async () => {
    if (!supabase) {
      setError('Appeals require a configured Supabase connection.')
      setLoading(false)
      return
    }
    try {
      const { data, error: loadError } = await supabase.rpc('get_my_playlink_warning_appeals')
      if (loadError) {
        if (['PGRST202', '42883'].includes(loadError.code)) {
          throw new Error('Warning appeals are not set up yet. Apply supabase/migrations/20261008200000_moderation_warning_appeals.sql in Supabase.')
        }
        throw loadError
      }
      setWarnings(data || [])
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Your warning history could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWarnings()
    const interval = window.setInterval(loadWarnings, 10000)
    return () => window.clearInterval(interval)
  }, [loadWarnings])

  async function submitAppeal(event, warning) {
    event.preventDefault()
    const details = drafts[warning.action_id]?.trim()
    if (!details || !supabase || sending) return
    setSending(warning.action_id)
    setError('')
    setNotice('')
    try {
      const { error: submitError } = await supabase.rpc('submit_playlink_warning_appeal', {
        p_action_id: warning.action_id,
        p_appeal_details: details,
      })
      if (submitError) throw submitError
      setDrafts((current) => ({ ...current, [warning.action_id]: '' }))
      setNotice(`Your appeal for warning ${warning.action_number} was sent to the PlayLink admin team.`)
      await loadWarnings()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your appeal could not be submitted.')
    } finally {
      setSending('')
    }
  }

  return (
    <section className="warning-appeals" aria-label="Appeal a PlayLink warning">
      <header><div><span>MODERATION</span><h3>Warnings and appeals</h3></div></header>
      {error && <p className="report-user-error" role="alert">{error}</p>}
      {notice && <p className="report-user-notice" role="status">{notice}</p>}
      {loading ? <p role="status">Loading warning history…</p>
        : !warnings.length ? <p>No PlayLink warnings are recorded for your account.</p>
          : <div className="warning-appeal-list">{warnings.map((warning) => <article key={warning.action_id}>
            <div className="warning-appeal-heading"><b>Warning {warning.action_number} of 3</b><time>{new Date(warning.action_created_at).toLocaleDateString()}</time></div>
            <p><strong>Reason:</strong> {warning.reason}</p>
            {warning.appeal_id
              ? <div className={`warning-appeal-status ${warning.appeal_status}`}><b>{appealStatus(warning.appeal_status)}</b><p>Your appeal: {warning.appeal_details}</p>{warning.admin_response && <p>PlayLink Team: {warning.admin_response}</p>}</div>
              : <form onSubmit={(event) => submitAppeal(event, warning)}>
                <label htmlFor={`warning-appeal-${warning.action_id}`}>Explain why you believe this warning should be reviewed</label>
                <textarea id={`warning-appeal-${warning.action_id}`} rows="3" maxLength="2000" required value={drafts[warning.action_id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [warning.action_id]: event.target.value }))} placeholder="Add context for the admin team…" />
                <button type="submit" disabled={sending === warning.action_id || !drafts[warning.action_id]?.trim()}>{sending === warning.action_id ? 'Submitting…' : 'Submit appeal'}</button>
              </form>}
          </article>)}</div>}
    </section>
  )
}
