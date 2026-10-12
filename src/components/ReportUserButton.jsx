import { useState } from 'react'
import { supabase } from '../auth/supabase.js'

const reportReasons = [
  'Harassment or bullying',
  'Threats or unsafe behavior',
  'Hate or discrimination',
  'Spam or scams',
  'Inappropriate content',
  'Impersonation or fake profile',
  'Other',
]

export default function ReportUserButton({ targetUserId, targetName = 'this account' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(reportReasons[0])
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submitReport(event) {
    event.preventDefault()
    if (!supabase || sending) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      const { error: submitError } = await supabase.rpc('submit_playlink_user_report', {
        p_target_user_id: targetUserId,
        p_reason: reason,
        p_details: details.trim(),
      })
      if (submitError) {
        if (submitError.code === '23505') {
          throw new Error(`You already have an open report about ${targetName}.`)
        }
        throw submitError
      }
      setNotice('Your report has been sent to the PlayLink admin team for review.')
      setDetails('')
      setOpen(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your report could not be submitted.')
    } finally {
      setSending(false)
    }
  }

  if (!targetUserId) return null

  return (
    <div className="report-user">
      {notice
        ? <p className="report-user-notice" role="status">{notice}</p>
        : <button className="report-user-trigger" type="button" aria-expanded={open} onClick={() => { setOpen((current) => !current); setError('') }}>
          {open ? 'Cancel report' : `Report ${targetName}`}
        </button>}
      {error && <p className="report-user-error" role="alert">{error}</p>}
      {open && <form className="report-user-form" onSubmit={submitReport}>
        <label>Reason
          <select value={reason} onChange={(event) => setReason(event.target.value)} required>
            {reportReasons.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
        </label>
        <label>What happened? <span>(optional)</span>
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows="3" maxLength="2000" placeholder="Add relevant context. Please do not include passwords or sensitive information." />
        </label>
        <button className="button button-primary" type="submit" disabled={sending}>{sending ? 'Sending report…' : 'Send report to admin'}</button>
      </form>}
    </div>
  )
}
