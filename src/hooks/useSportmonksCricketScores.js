import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../auth/supabase.js'

export function relationData(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  return value && typeof value === 'object' ? [value] : []
}

export function teamName(value) {
  const team = relationData(value)[0]
  return team?.name || team?.fullname || team?.code || ''
}

export function gameInnings(game) {
  const values = relationData(game.runs).length
    ? relationData(game.runs)
    : relationData(game.scoreboards)
  return values.map((item) => {
    const runs = item.total ?? item.runs ?? item.score ?? item.scoreboard?.total ?? item.scoreboard?.runs
    const wickets = item.wickets ?? item.wickets_out ?? item.scoreboard?.wickets
    const overs = item.overs ?? item.scoreboard?.overs
    const team = teamName(item.team)
    const score = runs === undefined || runs === null
      ? ''
      : `${runs}${wickets === undefined || wickets === null ? '' : `/${wickets}`}${overs ? ` (${overs} ov)` : ''}`
    return { id: item.id || `${item.team_id || team}-${item.inning || item.scoreboard || score}`, team, score }
  }).filter((inning) => inning.score)
}

async function invokeMatchRequest(sport, body, responseKey, fallbackMessage) {
  if (!supabase) throw new Error('Match details need a configured Supabase connection.')
  const { data, error } = await supabase.functions.invoke('sportmonks-live-scores', {
    body: { sport, ...body },
  })
  if (error) {
    let message = error.message || fallbackMessage
    try {
      const responseBody = await error.context?.json()
      if (typeof responseBody?.error === 'string') message = responseBody.error
    } catch {
      // The Functions error context may not contain a JSON response.
    }
    throw new Error(message)
  }
  if (!data?.[responseKey] || typeof data[responseKey] !== 'object') {
    throw new Error(data?.error || fallbackMessage)
  }
  return data[responseKey]
}

export function fetchFootballMatchDetails(matchId) {
  return invokeMatchRequest('football', { matchId }, 'details', 'Football match details could not be loaded.')
}

export function fetchCricketMatchDetails(eventKey) {
  return invokeMatchRequest(
    'cricket',
    { eventKey },
    'details',
    'Cricket match details could not be loaded.',
  )
}

export function fetchFootballMatchSection(matchId, section, competitionId) {
  return invokeMatchRequest(
    'football',
    { matchId, section, ...(competitionId ? { competitionId } : {}) },
    section,
    `Football ${section} could not be loaded.`,
  )
}

export default function useSportmonksCricketScores(sport = 'cricket') {
  const [games, setGames] = useState([])
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const requestId = useRef(0)

  const loadScores = useCallback(async () => {
    const currentRequestId = ++requestId.current
    if (!supabase) {
      setError(`Live ${sport} scores need a configured Supabase connection.`)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: invokeError } = await supabase.functions.invoke('sportmonks-live-scores', {
      body: { sport },
    })
    if (currentRequestId !== requestId.current) return
    if (invokeError) {
      let message = invokeError.message || `Live ${sport} scores could not be loaded.`
      try {
        const responseBody = await invokeError.context?.json()
        if (typeof responseBody?.error === 'string') message = responseBody.error
      } catch {
        // The Functions error context may not contain a JSON response.
      }
      if (/failed to send a request|requested function was not found/i.test(message)) {
        message = 'The live score feed is not deployed yet. Deploy sportmonks-live-scores to the Supabase project used by this app.'
      }
      if (currentRequestId !== requestId.current) return
      setLoading(false)
      setError(message)
      setWarning('')
      return
    }
    if (!Array.isArray(data?.fixtures)) {
      setError(data?.error || `The ${sport} score service returned an unexpected response.`)
      setLoading(false)
      return
    }
    setGames(data.fixtures)
    setError('')
    setWarning(typeof data.warning === 'string' ? data.warning : '')
    setUpdatedAt(new Date())
    setLoading(false)
  }, [sport])

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== 'hidden') await loadScores()
    }
    refresh()
    const interval = window.setInterval(refresh, sport === 'cricket' ? 20 * 60_000 : 10 * 60_000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      requestId.current += 1
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadScores])

  return { games, error, warning, loading, updatedAt, refresh: loadScores }
}
