import { createClient } from 'npm:@supabase/supabase-js@2'

type JsonRecord = Record<string, unknown>

function corsForScoreRequest(request: Request) {
  const origin = request.headers.get('Origin')
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
  if (!origin) return { allowed: true, headers }

  try {
    const parsedOrigin = new URL(origin)
    const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname)
    if (parsedOrigin.origin !== origin || (parsedOrigin.protocol !== 'https:' && !isLocalDevelopment)) {
      return { allowed: false, headers }
    }
    headers['Access-Control-Allow-Origin'] = origin
    return { allowed: true, headers }
  } catch {
    return { allowed: false, headers }
  }
}

function json(body: JsonRecord, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function relation(value: unknown): unknown {
  if (value && typeof value === 'object' && 'data' in value) return (value as JsonRecord).data
  return value
}

function firstRelation(value: unknown): JsonRecord {
  const result = relation(value)
  if (Array.isArray(result)) return (result[0] && typeof result[0] === 'object' ? result[0] : {}) as JsonRecord
  return result && typeof result === 'object' ? result as JsonRecord : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isCricketLive(fixture: JsonRecord) {
  return fixture.live === true || fixture.live === 1 || fixture.live === '1'
}

function isCricketDataLive(match: JsonRecord) {
  const status = text(match.status)
  return /live|in.?progress|innings|stumps|day\s*[1-5]|break/i.test(status)
    && !/not.?started|complete|finish|result|abandon|cancel|no.?result/i.test(status)
}

function isNepalPremierLeague(value: unknown) {
  return /\bnepal premier league\b|\bnpl\b/i.test(text(value))
}

function normalizeFootballDataMatch(match: JsonRecord): JsonRecord {
  const score = match.score && typeof match.score === 'object' ? match.score as JsonRecord : {}
  const fullTime = score.fullTime && typeof score.fullTime === 'object' ? score.fullTime as JsonRecord : {}
  const homeTeam = match.homeTeam && typeof match.homeTeam === 'object' ? match.homeTeam as JsonRecord : {}
  const awayTeam = match.awayTeam && typeof match.awayTeam === 'object' ? match.awayTeam as JsonRecord : {}
  const competition = match.competition && typeof match.competition === 'object' ? match.competition as JsonRecord : {}
  const status = text(match.status)
  const live = ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(status)
  const currentScores = [
    { participant: 'home', goals: fullTime.home },
    { participant: 'away', goals: fullTime.away },
  ].filter((item) => typeof item.goals === 'number')
    .map((item) => ({ description: 'CURRENT', score: { data: item } }))
  const homeGoals = typeof fullTime.home === 'number' ? fullTime.home : null
  const awayGoals = typeof fullTime.away === 'number' ? fullTime.away : null
  const resultInfo = status === 'FINISHED' && homeGoals !== null && awayGoals !== null
    ? `${text(homeTeam.name)} ${homeGoals} - ${awayGoals} ${text(awayTeam.name)}`
    : ''

  return {
    id: match.id,
    starting_at: text(match.utcDate),
    status,
    state: { name: status },
    live,
    recent: false,
    league: { name: text(competition.name) },
    round: match.matchday === null || match.matchday === undefined ? '' : `Matchday ${String(match.matchday)}`,
    participants: [
      { name: text(homeTeam.name), crest: text(homeTeam.crest), meta: { location: 'home' } },
      { name: text(awayTeam.name), crest: text(awayTeam.crest), meta: { location: 'away' } },
    ],
    scores: currentScores,
    result_info: resultInfo,
    venue: { name: text(match.venue) },
  }
}

function isFinished(status: unknown) {
  return /finish|complete|result|abandon|cancel|postpon|no.?result/i.test(text(status))
}

function isCompleted(status: unknown) {
  const value = text(status).trim()
  if (/abandon|cancel|postpon|no.?result/i.test(value)) return false
  return /finish|complete|full.?time|after.?extra.?time|after.?penalt|match.?over|result/i.test(value)
    || /^(ft|aet|ap)$/i.test(value)
}

function hasEntries(value: unknown) {
  const data = relation(value)
  return Array.isArray(data) ? data.length > 0 : Boolean(data && typeof data === 'object')
}

function fixtureDate(value: unknown) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function footballDateRanges(from: string, until: string) {
  const end = new Date(`${until}T00:00:00Z`)
  const ranges: Array<{ from: string; until: string }> = []
  let cursor = new Date(`${from}T00:00:00Z`)
  while (cursor <= end) {
    const windowEnd = new Date(Math.min(cursor.getTime() + 9 * 24 * 60 * 60 * 1000, end.getTime()))
    ranges.push({ from: cursor.toISOString().slice(0, 10), until: windowEnd.toISOString().slice(0, 10) })
    cursor = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000)
  }
  return ranges
}

function normalizedTeamTokens(value: unknown) {
  if (typeof value !== 'string') return []
  const ignored = new Set(['ac', 'afc', 'ca', 'cd', 'cf', 'club', 'de', 'ec', 'fc', 'fk', 'sc', 'sv', 'the'])
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((token) => token && !ignored.has(token))
}

function sameFootballTeamName(first: unknown, second: unknown) {
  const firstTokens = normalizedTeamTokens(first)
  const secondTokens = normalizedTeamTokens(second)
  if (!firstTokens.length || !secondTokens.length) return false
  return firstTokens.every((token) => secondTokens.includes(token))
    || secondTokens.every((token) => firstTokens.includes(token))
}

function mapApiFootballEvents(events: JsonRecord[]) {
  const goals: JsonRecord[] = []
  const bookings: JsonRecord[] = []
  const substitutions: JsonRecord[] = []
  for (const event of events) {
    const time = event.time && typeof event.time === 'object' ? event.time as JsonRecord : {}
    const team = event.team && typeof event.team === 'object' ? event.team as JsonRecord : {}
    const player = event.player && typeof event.player === 'object' ? event.player as JsonRecord : {}
    const assist = event.assist && typeof event.assist === 'object' ? event.assist as JsonRecord : {}
    const fixture = event.fixture && typeof event.fixture === 'object' ? event.fixture as JsonRecord : {}
    const minute = typeof time.elapsed === 'number' ? time.elapsed : null
    const injuryTime = typeof time.extra === 'number' ? time.extra : null
    const eventType = text(event.type).toLowerCase()
    const detail = text(event.detail)
    const comment = text(event.comments)
    if (eventType === 'goal') {
      const goalType = /own goal/i.test(detail) ? 'OWN' : /penalty/i.test(detail) ? 'PENALTY' : 'REGULAR'
      const score = fixture.home !== undefined && fixture.away !== undefined
        ? { home: fixture.home, away: fixture.away }
        : null
      goals.push({
        minute,
        injuryTime,
        type: goalType,
        team: { name: text(team.name) },
        scorer: { name: text(player.name) },
        assist: text(assist.name) ? { name: text(assist.name) } : null,
        score,
      })
    } else if (eventType === 'card') {
      const card = /red/i.test(detail)
        ? 'RED_CARD'
        : /second|2nd|double/i.test(`${detail} ${comment}`)
          ? 'SECOND_YELLOW'
          : 'YELLOW_CARD'
      bookings.push({
        minute,
        injuryTime,
        card,
        team: { name: text(team.name) },
        player: { name: text(player.name) },
      })
    } else if (eventType === 'subst') {
      substitutions.push({
        minute,
        injuryTime,
        team: { name: text(team.name) },
        playerOut: { name: text(player.name) },
        playerIn: { name: text(assist.name) },
      })
    }
  }
  return { goals, bookings, substitutions }
}

async function fetchApiFootballEvents(
  token: string,
  match: JsonRecord,
  fullTime: JsonRecord,
) {
  const utcDate = text(match.utcDate)
  const date = utcDate.slice(0, 10)
  const homeTeam = match.homeTeam && typeof match.homeTeam === 'object' ? match.homeTeam as JsonRecord : {}
  const awayTeam = match.awayTeam && typeof match.awayTeam === 'object' ? match.awayTeam as JsonRecord : {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !text(homeTeam.name) || !text(awayTeam.name)) {
    return { status: 'no_match', goals: [], bookings: [], substitutions: [] }
  }

  const headers = { 'x-apisports-key': token }
  const fixturesResponse = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}&timezone=UTC`, {
    headers,
    signal: AbortSignal.timeout(12_000),
  })
  if (!fixturesResponse.ok) {
    console.error(`API-Football fixture lookup failed with HTTP ${fixturesResponse.status}.`)
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const fixturesPayload: unknown = await fixturesResponse.json()
  if (!fixturesPayload || typeof fixturesPayload !== 'object') {
    console.error('API-Football fixture lookup returned an unreadable response.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const fixturesRecord = fixturesPayload as JsonRecord
  if (fixturesRecord.errors && typeof fixturesRecord.errors === 'object'
    && Object.keys(fixturesRecord.errors as JsonRecord).length > 0) {
    console.error('API-Football rejected the fixture lookup request.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const fixtureRows = Array.isArray(fixturesRecord.response)
    ? (fixturesRecord.response as unknown[]).filter((item): item is JsonRecord => Boolean(item && typeof item === 'object'))
    : null
  if (!fixtureRows) {
    console.error('API-Football fixture lookup did not contain a response array.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }

  const teamMatches = fixtureRows.filter((row) => {
    const teams = row.teams && typeof row.teams === 'object' ? row.teams as JsonRecord : {}
    const home = teams.home && typeof teams.home === 'object' ? teams.home as JsonRecord : {}
    const away = teams.away && typeof teams.away === 'object' ? teams.away as JsonRecord : {}
    return sameFootballTeamName(homeTeam.name, home.name) && sameFootballTeamName(awayTeam.name, away.name)
  })
  const expectedHome = typeof fullTime.home === 'number' ? fullTime.home : null
  const expectedAway = typeof fullTime.away === 'number' ? fullTime.away : null
  const scoreMatches = teamMatches.filter((row) => {
    const goals = row.goals && typeof row.goals === 'object' ? row.goals as JsonRecord : {}
    return expectedHome !== null && expectedAway !== null
      && Number(goals.home) === expectedHome && Number(goals.away) === expectedAway
  })
  if (expectedHome !== null && expectedAway !== null && scoreMatches.length === 0) {
    return { status: 'no_match', goals: [], bookings: [], substitutions: [] }
  }
  const candidates = expectedHome !== null && expectedAway !== null ? scoreMatches : teamMatches
  if (candidates.length !== 1) {
    if (candidates.length > 1) console.error('API-Football event lookup found multiple matching fixtures; skipping ambiguous event data.')
    return { status: 'no_match', goals: [], bookings: [], substitutions: [] }
  }
  const matchedFixture = candidates[0].fixture && typeof candidates[0].fixture === 'object'
    ? candidates[0].fixture as JsonRecord
    : {}
  const fixtureId = Number(matchedFixture.id)
  if (!Number.isSafeInteger(fixtureId) || fixtureId < 1) {
    console.error('API-Football matching fixture did not contain a valid ID.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const eventsResponse = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
    headers,
    signal: AbortSignal.timeout(12_000),
  })
  if (!eventsResponse.ok) {
    console.error(`API-Football event request failed with HTTP ${eventsResponse.status}.`)
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const eventsPayload: unknown = await eventsResponse.json()
  if (!eventsPayload || typeof eventsPayload !== 'object') {
    console.error('API-Football event request returned an unreadable response.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const eventsRecord = eventsPayload as JsonRecord
  if (eventsRecord.errors && typeof eventsRecord.errors === 'object'
    && Object.keys(eventsRecord.errors as JsonRecord).length > 0) {
    console.error('API-Football rejected the match events request.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  if (!Array.isArray(eventsRecord.response)) {
    console.error('API-Football event response did not contain an event array.')
    return { status: 'unavailable', goals: [], bookings: [], substitutions: [] }
  }
  const events = mapApiFootballEvents(eventsRecord.response as JsonRecord[])
  const hasEvents = events.goals.length > 0 || events.bookings.length > 0 || events.substitutions.length > 0
  return { status: hasEvents ? 'loaded' : 'no_events', ...events }
}

const cachedScores: Partial<Record<'cricket' | 'football', { expiresAt: number; fixtures: JsonRecord[] }>> = {}
const cachedFootballMatchDetails = new Map<number, { expiresAt: number; details: JsonRecord }>()
const cachedFootballMatchSections = new Map<string, { expiresAt: number; data: JsonRecord }>()

Deno.serve(async (request) => {
  const cors = corsForScoreRequest(request)
  if (!cors.allowed) return json({ error: 'Origin is not allowed.' }, cors.headers, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, cors.headers, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const cricketDataToken = Deno.env.get('CRICKETDATA_API_KEY')
  const sportmonksToken = Deno.env.get('SPORTMONKS_API_TOKEN')
  const footballDataToken = Deno.env.get('FOOTBALL_DATA_API_TOKEN')
  const apiFootballToken = Deno.env.get('API_FOOTBALL_KEY')
  let sport: 'cricket' | 'football' = 'cricket'
  let matchId: number | null = null
  let matchSection: 'details' | 'head2head' | 'standings' = 'details'
  let competitionId: number | null = null
  try {
    const body: unknown = await request.json()
    const requestBody = body && typeof body === 'object' ? body as JsonRecord : {}
    const requestedSport = requestBody.sport
    if (requestedSport !== undefined && requestedSport !== 'cricket' && requestedSport !== 'football') {
      return json({ error: 'Choose cricket or football to load scores.' }, cors.headers, 400)
    }
    if (requestedSport === 'football') sport = 'football'
    if (requestBody.matchId !== undefined) {
      const parsedMatchId = Number(requestBody.matchId)
      if (!Number.isSafeInteger(parsedMatchId) || parsedMatchId < 1) {
        return json({ error: 'A valid football match ID is required.' }, cors.headers, 400)
      }
      matchId = parsedMatchId
      if (sport !== 'football') return json({ error: 'Match details are only available for football.' }, cors.headers, 400)
    }
    if (requestBody.section !== undefined) {
      if (requestBody.section !== 'details' && requestBody.section !== 'head2head' && requestBody.section !== 'standings') {
        return json({ error: 'Choose match details, head-to-head, or standings.' }, cors.headers, 400)
      }
      matchSection = requestBody.section
      if (sport !== 'football' || matchId === null) {
        return json({ error: 'Match sections require a valid football match ID.' }, cors.headers, 400)
      }
    }
    if (requestBody.competitionId !== undefined) {
      const parsedCompetitionId = Number(requestBody.competitionId)
      if (!Number.isSafeInteger(parsedCompetitionId) || parsedCompetitionId < 1) {
        return json({ error: 'A valid competition ID is required.' }, cors.headers, 400)
      }
      competitionId = parsedCompetitionId
    }
  } catch {
    return json({ error: 'A valid score request is required.' }, cors.headers, 400)
  }
  const authorization = request.headers.get('Authorization') || ''
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!projectUrl || !anonKey || (sport === 'cricket' && (!cricketDataToken || !sportmonksToken))
    || (sport === 'football' && !footballDataToken)) {
    console.error(`${sport === 'cricket' ? 'Cricket score providers' : 'football-data.org'} scores are missing Supabase or provider configuration.`)
    const missingProvider = sport === 'cricket' && !cricketDataToken
      ? 'CricketData.org'
      : sport === 'cricket' && !sportmonksToken ? 'Sportmonks'
        : sport === 'football' && !footballDataToken ? 'football-data.org' : 'Supabase'
    return json({ error: `Live ${sport} scores are not fully configured. Check the ${missingProvider} server secret.` }, cors.headers, 503)
  }
  if (!accessToken) return json({ error: `Sign in to view live ${sport} scores.` }, cors.headers, 401)

  const authClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !authData.user) return json({ error: `Sign in to view live ${sport} scores.` }, cors.headers, 401)
  if (matchId !== null && matchSection !== 'details') {
    if (matchSection === 'standings' && competitionId === null) {
      return json({ error: 'Competition standings are not available for this match.' }, cors.headers, 400)
    }
    const sectionCacheKey = `${matchSection}:${matchId}:${competitionId || ''}`
    const cachedSection = cachedFootballMatchSections.get(sectionCacheKey)
    if (cachedSection && cachedSection.expiresAt > Date.now()) {
      return json({ [matchSection]: cachedSection.data }, cors.headers)
    }
    const sectionUrl = matchSection === 'head2head'
      ? new URL(`https://api.football-data.org/v4/matches/${matchId}/head2head`)
      : new URL(`https://api.football-data.org/v4/competitions/${competitionId}/standings`)
    if (matchSection === 'head2head') sectionUrl.searchParams.set('limit', '10')
    try {
      const sectionResponse = await fetch(sectionUrl, {
        headers: { 'X-Auth-Token': footballDataToken! },
        signal: AbortSignal.timeout(12_000),
      })
      if (!sectionResponse.ok) {
        console.error(`football-data.org ${matchSection} request failed with HTTP ${sectionResponse.status}.`)
        if (sectionResponse.status === 429) {
          return json({ error: 'football-data.org request limit reached. Wait before loading this tab again.' }, cors.headers, 503)
        }
        return json({ error: `football-data.org could not load ${matchSection} (HTTP ${sectionResponse.status}).` }, cors.headers, 502)
      }
      const payload: unknown = await sectionResponse.json()
      if (!payload || typeof payload !== 'object') {
        console.error(`football-data.org ${matchSection} response was not an object.`)
        return json({ error: `football-data.org returned unreadable ${matchSection} data.` }, cors.headers, 502)
      }
      const result = payload as JsonRecord
      const sectionData: JsonRecord = matchSection === 'head2head'
        ? {
          aggregates: result.aggregates && typeof result.aggregates === 'object' ? result.aggregates : null,
          matches: Array.isArray(result.matches) ? result.matches.map((value) => {
            if (!value || typeof value !== 'object') return null
            const item = value as JsonRecord
            const home = item.homeTeam && typeof item.homeTeam === 'object' ? item.homeTeam as JsonRecord : {}
            const away = item.awayTeam && typeof item.awayTeam === 'object' ? item.awayTeam as JsonRecord : {}
            const matchScore = item.score && typeof item.score === 'object' ? item.score as JsonRecord : {}
            const fullTime = matchScore.fullTime && typeof matchScore.fullTime === 'object' ? matchScore.fullTime as JsonRecord : {}
            return {
              id: item.id,
              utcDate: text(item.utcDate),
              competition: item.competition && typeof item.competition === 'object' ? text((item.competition as JsonRecord).name) : '',
              homeTeam: text(home.name),
              awayTeam: text(away.name),
              homeCrest: text(home.crest),
              awayCrest: text(away.crest),
              status: text(item.status),
              homeScore: typeof fullTime.home === 'number' ? fullTime.home : null,
              awayScore: typeof fullTime.away === 'number' ? fullTime.away : null,
              winner: text(matchScore.winner),
            }
          }).filter(Boolean) : [],
        }
        : {
          competition: result.competition && typeof result.competition === 'object'
            ? { id: (result.competition as JsonRecord).id, name: text((result.competition as JsonRecord).name) }
            : null,
          standings: Array.isArray(result.standings) ? result.standings.map((value) => {
            if (!value || typeof value !== 'object') return null
            const standing = value as JsonRecord
            return {
              type: text(standing.type),
              stage: text(standing.stage),
              group: text(standing.group),
              table: Array.isArray(standing.table) ? standing.table.map((entry) => {
                if (!entry || typeof entry !== 'object') return null
                const row = entry as JsonRecord
                const team = row.team && typeof row.team === 'object' ? row.team as JsonRecord : {}
                return {
                  position: row.position,
                  team: { id: team.id, name: text(team.name), crest: text(team.crest) },
                  playedGames: row.playedGames,
                  won: row.won,
                  draw: row.draw,
                  lost: row.lost,
                  points: row.points,
                  goalsFor: row.goalsFor,
                  goalsAgainst: row.goalsAgainst,
                  goalDifference: row.goalDifference,
                  form: text(row.form),
                }
              }).filter(Boolean) : [],
            }
          }).filter(Boolean) : [],
        }
      const currentTime = Date.now()
      for (const [key, entry] of cachedFootballMatchSections) {
        if (entry.expiresAt <= currentTime) cachedFootballMatchSections.delete(key)
      }
      if (cachedFootballMatchSections.size >= 100) {
        const oldestKey = cachedFootballMatchSections.keys().next().value
        if (oldestKey !== undefined) cachedFootballMatchSections.delete(oldestKey)
      }
      cachedFootballMatchSections.set(sectionCacheKey, { data: sectionData, expiresAt: Date.now() + 30 * 60_000 })
      return json({ [matchSection]: sectionData }, cors.headers)
    } catch (sectionError) {
      console.error(`football-data.org ${matchSection} request failed before a usable response (${sectionError instanceof Error ? sectionError.name : 'unknown error'}).`)
      return json({ error: `football-data.org ${matchSection} is temporarily unavailable. Try again shortly.` }, cors.headers, 502)
    }
  }
  if (matchId !== null) {
    const cachedDetails = cachedFootballMatchDetails.get(matchId)
    if (cachedDetails && cachedDetails.expiresAt > Date.now()) {
      return json({ details: cachedDetails.details }, cors.headers)
    }
    try {
      const detailResponse = await fetch(`https://api.football-data.org/v4/matches/${matchId}`, {
        headers: { 'X-Auth-Token': footballDataToken! },
        signal: AbortSignal.timeout(12_000),
      })
      if (!detailResponse.ok) {
        console.error(`football-data.org match details request failed with HTTP ${detailResponse.status}.`)
        if (detailResponse.status === 429) {
          return json({ error: 'football-data.org request limit reached. Wait before opening match details again.' }, cors.headers, 503)
        }
        return json({ error: `football-data.org could not load this match details (HTTP ${detailResponse.status}).` }, cors.headers, 502)
      }
      const payload: unknown = await detailResponse.json()
      if (!payload || typeof payload !== 'object' || !('id' in payload)) {
        console.error('football-data.org match details response did not contain a match.')
        return json({ error: 'football-data.org returned incomplete match details.' }, cors.headers, 502)
      }
      const match = payload as JsonRecord
      const score = match.score && typeof match.score === 'object' ? match.score as JsonRecord : {}
      const normalizeTeamDetails = (value: unknown) => {
        if (!value || typeof value !== 'object') return null
        const team = value as JsonRecord
        const coach = team.coach && typeof team.coach === 'object' ? team.coach as JsonRecord : {}
        const statistics = team.statistics && typeof team.statistics === 'object' ? team.statistics as JsonRecord : {}
        return {
          id: team.id,
          name: text(team.name),
          shortName: text(team.shortName),
          tla: text(team.tla),
          crest: text(team.crest),
          formation: text(team.formation),
          leagueRank: team.leagueRank ?? null,
          coach: { name: text(coach.name), nationality: text(coach.nationality) },
          lineup: Array.isArray(team.lineup) ? team.lineup : [],
          bench: Array.isArray(team.bench) ? team.bench : [],
          statistics,
        }
      }
      const competition = match.competition && typeof match.competition === 'object' ? match.competition as JsonRecord : {}
      const area = match.area && typeof match.area === 'object' ? match.area as JsonRecord : {}
      const season = match.season && typeof match.season === 'object' ? match.season as JsonRecord : {}
      const goals = Array.isArray(match.goals) ? match.goals as JsonRecord[] : []
      const bookings = Array.isArray(match.bookings) ? match.bookings as JsonRecord[] : []
      const substitutions = Array.isArray(match.substitutions) ? match.substitutions as JsonRecord[] : []
      let eventDataStatus = 'not_needed'
      const matchHasStarted = ['IN_PLAY', 'PAUSED', 'SUSPENDED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'FINISHED', 'AWARDED', 'AFTER_EXTRA_TIME', 'AFTER_PENALTIES']
        .includes(text(match.status))
      if (matchHasStarted && (goals.length === 0 || bookings.length === 0 || substitutions.length === 0)) {
        if (!apiFootballToken) {
          eventDataStatus = 'not_configured'
        } else {
          try {
            const eventDetails = await fetchApiFootballEvents(apiFootballToken, match, score.fullTime && typeof score.fullTime === 'object'
              ? score.fullTime as JsonRecord
              : {})
            eventDataStatus = eventDetails.status
            const mergeEvents = (primary: JsonRecord[], fallback: JsonRecord[], fields: string[]) => {
              const existing = new Set(primary.map((event) => fields.map((field) => {
                const value = event[field]
                return value && typeof value === 'object' ? text((value as JsonRecord).name) : text(value)
              }).join('|').toLowerCase()))
              return [...primary, ...fallback.filter((event) => {
                const key = fields.map((field) => {
                  const value = event[field]
                  return value && typeof value === 'object' ? text((value as JsonRecord).name) : text(value)
                }).join('|').toLowerCase()
                if (existing.has(key)) return false
                existing.add(key)
                return true
              })]
            }
            if (eventDetails.status === 'loaded') {
              match.goals = mergeEvents(goals, eventDetails.goals, ['minute', 'team', 'scorer'])
              match.bookings = mergeEvents(bookings, eventDetails.bookings, ['minute', 'team', 'player', 'card'])
              match.substitutions = mergeEvents(substitutions, eventDetails.substitutions, ['minute', 'team', 'playerOut', 'playerIn'])
            }
          } catch (eventError) {
            eventDataStatus = 'unavailable'
            console.error(`API-Football event lookup failed before a usable response (${eventError instanceof Error ? eventError.name : 'unknown error'}).`)
          }
        }
      }
      const details: JsonRecord = {
        id: match.id,
        utcDate: text(match.utcDate),
        status: text(match.status),
        minute: typeof match.minute === 'number' ? match.minute : null,
        injuryTime: typeof match.injuryTime === 'number' ? match.injuryTime : null,
        lastUpdated: text(match.lastUpdated),
        competition: {
          id: competition.id,
          name: text(competition.name),
          code: text(competition.code),
          type: text(competition.type),
          emblem: text(competition.emblem),
        },
        area: { id: area.id, name: text(area.name), code: text(area.code), flag: text(area.flag) },
        season: {
          id: season.id,
          startDate: text(season.startDate),
          endDate: text(season.endDate),
          currentMatchday: typeof season.currentMatchday === 'number' ? season.currentMatchday : null,
          winner: season.winner && typeof season.winner === 'object' ? text((season.winner as JsonRecord).name) : text(season.winner),
        },
        matchday: typeof match.matchday === 'number' ? match.matchday : null,
        stage: text(match.stage),
        group: text(match.group),
        venue: text(match.venue),
        attendance: typeof match.attendance === 'number' ? match.attendance : null,
        homeTeam: normalizeTeamDetails(match.homeTeam),
        awayTeam: normalizeTeamDetails(match.awayTeam),
        goals: Array.isArray(match.goals) ? match.goals : [],
        bookings: Array.isArray(match.bookings) ? match.bookings : [],
        substitutions: Array.isArray(match.substitutions) ? match.substitutions : [],
        eventDataStatus,
        score: {
          winner: text(score.winner),
          duration: text(score.duration),
          fullTime: score.fullTime && typeof score.fullTime === 'object' ? score.fullTime : null,
          halfTime: score.halfTime && typeof score.halfTime === 'object' ? score.halfTime : null,
          extraTime: score.extraTime && typeof score.extraTime === 'object' ? score.extraTime : null,
          penalties: score.penalties && typeof score.penalties === 'object' ? score.penalties : null,
        },
        referees: Array.isArray(match.referees)
          ? match.referees.map((referee) => referee && typeof referee === 'object'
            ? { name: text((referee as JsonRecord).name), type: text((referee as JsonRecord).type) }
            : null).filter(Boolean)
          : [],
      }
      const currentTime = Date.now()
      for (const [cachedId, entry] of cachedFootballMatchDetails) {
        if (entry.expiresAt <= currentTime) cachedFootballMatchDetails.delete(cachedId)
      }
      if (cachedFootballMatchDetails.size >= 100) {
        const oldestId = cachedFootballMatchDetails.keys().next().value
        if (oldestId !== undefined) cachedFootballMatchDetails.delete(oldestId)
      }
      if (eventDataStatus !== 'not_configured' && eventDataStatus !== 'unavailable') {
        cachedFootballMatchDetails.set(matchId, { details, expiresAt: Date.now() + 30 * 60_000 })
      }
      return json({ details }, cors.headers)
    } catch (detailError) {
      console.error(`football-data.org match details request failed before a usable response (${detailError instanceof Error ? detailError.name : 'unknown error'}).`)
      return json({ error: 'football-data.org match details are temporarily unavailable. Try again shortly.' }, cors.headers, 502)
    }
  }
  const cached = cachedScores[sport]
  if (cached && cached.expiresAt > Date.now()) {
    return json({ fixtures: cached.fixtures }, cors.headers)
  }

  try {
    const now = new Date()
    const recentStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const from = recentStart.toISOString().slice(0, 10)
    const until = endDate.toISOString().slice(0, 10)
    const liveUrl = sport === 'cricket'
      ? new URL('https://api.cricapi.com/v1/currentMatches')
      : new URL('https://api.football-data.org/v4/matches')
    const fixturesUrl = sport === 'cricket'
      ? new URL('https://cricket.sportmonks.com/api/v2.0/fixtures')
      : new URL(liveUrl)
    const liveUrls = sport === 'cricket'
      ? [liveUrl]
      : footballDateRanges(from, until).map((range) => {
        const url = new URL(liveUrl)
        url.searchParams.set('dateFrom', range.from)
        url.searchParams.set('dateTo', range.until)
        return url
      })
    if (sport === 'cricket') {
      liveUrl.searchParams.set('apikey', cricketDataToken!)
      liveUrl.searchParams.set('offset', '0')
      fixturesUrl.searchParams.set('api_token', sportmonksToken!)
      fixturesUrl.searchParams.set('include', 'localteam,visitorteam,league,runs,scoreboards,venue')
      fixturesUrl.searchParams.set('filter[starts_between]', `${from},${until}`)
    }

    const liveRequest = Promise.all(liveUrls.map((url, index) => fetch(url, {
      headers: sport === 'football' ? { 'X-Auth-Token': footballDataToken! } : undefined,
      signal: AbortSignal.timeout(12_000),
    })
      .then((response) => ({ response, error: null }))
      .catch((requestError) => {
        if (sport === 'football') {
          const reason = requestError instanceof Error ? requestError.name : 'unknown error'
          console.error(`football-data.org date window ${index + 1} failed before receiving a response (${reason}).`)
        }
        return { response: null, error: true }
      })))
    const fixtureRequest = sport === 'cricket'
      ? fetch(fixturesUrl, { signal: AbortSignal.timeout(12_000) })
        .then((response) => ({ response, error: null }))
        .catch(() => ({ response: null, error: true }))
      : Promise.resolve({ response: null, error: null })
    const [liveResults, fixtureResult] = await Promise.all([liveRequest, fixtureRequest])

    const footballSuccessfulResults = sport === 'football'
      ? liveResults.filter(({ response }) => response?.ok)
      : []
    let footballPartial = sport === 'football' && footballSuccessfulResults.length < liveResults.length
    const liveResult = sport === 'football'
      ? footballSuccessfulResults[0] || liveResults[0]
      : liveResults[0]
    let liveResponse = liveResult.response
    let usingSportmonksLiveFallback = false
    if (sport === 'cricket' && (!liveResponse || !liveResponse.ok)) {
      const cricketDataStatus = liveResponse?.status
      console.error(`CricketData.org current-match request failed${cricketDataStatus ? ` with HTTP ${cricketDataStatus}` : ' before receiving a response'}.`)
      const fallbackUrl = new URL('https://cricket.sportmonks.com/api/v2.0/livescores')
      fallbackUrl.searchParams.set('api_token', sportmonksToken!)
      fallbackUrl.searchParams.set('include', 'localteam,visitorteam,league,runs,scoreboards,venue')
      try {
        const fallbackResponse = await fetch(fallbackUrl, { signal: AbortSignal.timeout(12_000) })
        if (fallbackResponse.ok) {
          liveResponse = fallbackResponse
          usingSportmonksLiveFallback = true
        } else {
          console.error(`Sportmonks cricket live fallback failed with HTTP ${fallbackResponse.status}.`)
        }
      } catch {
        console.error('Sportmonks cricket live fallback failed before receiving a response.')
      }
    }
    if (!liveResponse || !liveResponse.ok) {
      const provider = sport === 'cricket' ? 'CricketData.org and Sportmonks' : 'football-data.org'
      const status = liveResponse?.status || liveResult.response?.status
      if (sport === 'football') {
        console.error(`football-data.org matches request failed${status ? ` with HTTP ${status}` : ' before receiving a response'}.`)
      }
      if (status === 401 || status === 403) {
        return json({ error: `${provider} denied access to ${sport} data. Check the API keys and plan permissions.` }, cors.headers, 502)
      }
      if (status === 429) return json({ error: `${provider} request limit reached. Try again later.` }, cors.headers, 503)
      if (sport === 'football' && status) {
        return json({ error: `football-data.org returned HTTP ${status}. Check the token, date range, and competition coverage.` }, cors.headers, 502)
      }
      if (sport === 'football') {
        return json({ error: 'football-data.org could not be reached from the Supabase Edge Function. Check the function logs and retry.' }, cors.headers, 502)
      }
      return json({ error: `${provider} could not provide ${sport} current matches. Check provider connectivity and Edge Function logs.` }, cors.headers, 502)
    }

    let fixturesPayload: unknown = null
    let fixturesUnavailable = false
    if (sport === 'cricket' && (!fixtureResult.response || !fixtureResult.response.ok)) {
      fixturesUnavailable = true
      const status = fixtureResult.response?.status
      console.error(`Sportmonks ${sport} fixtures request failed${status ? ` with HTTP ${status}` : ' before receiving a response'}.`)
    } else if (sport === 'cricket' && fixtureResult.response) {
      try {
        fixturesPayload = await fixtureResult.response.json()
      } catch (parseError) {
        fixturesUnavailable = true
        console.error(`Sportmonks ${sport} fixtures response was not valid JSON: ${parseError instanceof Error ? parseError.message : 'unknown parse error'}.`)
      }
    }

    let livePayload: unknown
    try {
      if (sport === 'football') {
        const parsedResults = await Promise.allSettled(footballSuccessfulResults.map(({ response }) => response!.json()))
        const matchLists = parsedResults.map((result) => result.status === 'fulfilled' && result.value && typeof result.value === 'object'
          ? (result.value as JsonRecord).matches
          : null)
        const validMatchLists = matchLists.filter(Array.isArray)
        footballPartial ||= validMatchLists.length < liveUrls.length
        if (!validMatchLists.length) throw new Error('No football date window returned valid matches.')
        livePayload = { matches: validMatchLists.flatMap((matches) => matches as JsonRecord[]) }
      } else {
        livePayload = await liveResponse.json()
      }
    } catch {
      if (sport !== 'cricket' || usingSportmonksLiveFallback) {
        const provider = usingSportmonksLiveFallback ? 'Sportmonks' : sport === 'cricket' ? 'CricketData.org' : 'football-data.org'
        console.error(`${provider} ${sport} current-match response was not valid JSON.`)
        return json({ error: `${provider} returned an unreadable ${sport} current-match response.` }, cors.headers, 502)
      }
      console.error('CricketData.org current-match response was not valid JSON; trying Sportmonks fallback.')
      const fallbackUrl = new URL('https://cricket.sportmonks.com/api/v2.0/livescores')
      fallbackUrl.searchParams.set('api_token', sportmonksToken!)
      fallbackUrl.searchParams.set('include', 'localteam,visitorteam,league,runs,scoreboards,venue')
      try {
        const fallbackResponse = await fetch(fallbackUrl, { signal: AbortSignal.timeout(12_000) })
        if (!fallbackResponse.ok) {
          console.error(`Sportmonks cricket live fallback failed with HTTP ${fallbackResponse.status}.`)
          return json({ error: 'CricketData.org response was unreadable and Sportmonks could not provide cricket live scores.' }, cors.headers, 502)
        }
        livePayload = await fallbackResponse.json()
        usingSportmonksLiveFallback = true
      } catch {
        console.error('Sportmonks cricket live fallback failed before receiving a response.')
        return json({ error: 'CricketData.org response was unreadable and Sportmonks could not provide cricket live scores.' }, cors.headers, 502)
      }
    }
    if (sport === 'cricket' && livePayload && typeof livePayload === 'object'
      && (livePayload as JsonRecord).status === 'failure' && !usingSportmonksLiveFallback) {
      const reason = text((livePayload as JsonRecord).reason)
      console.error(`CricketData.org rejected the current matches request: ${reason || 'unknown provider error'}.`)
      const fallbackUrl = new URL('https://cricket.sportmonks.com/api/v2.0/livescores')
      fallbackUrl.searchParams.set('api_token', sportmonksToken!)
      fallbackUrl.searchParams.set('include', 'localteam,visitorteam,league,runs,scoreboards,venue')
      try {
        const fallbackResponse = await fetch(fallbackUrl, { signal: AbortSignal.timeout(12_000) })
        if (!fallbackResponse.ok) {
          console.error(`Sportmonks cricket live fallback failed with HTTP ${fallbackResponse.status}.`)
          return json({ error: 'CricketData.org rejected the current-match request and Sportmonks could not provide cricket live scores. Check the CricketData key and provider access.' }, cors.headers, 502)
        }
        livePayload = await fallbackResponse.json()
        usingSportmonksLiveFallback = true
      } catch {
        console.error('Sportmonks cricket live fallback failed before receiving a response.')
        return json({ error: 'CricketData.org rejected the current-match request and Sportmonks could not provide cricket live scores. Check the CricketData key and provider access.' }, cors.headers, 502)
      }
    }
    if (sport === 'football') fixturesPayload = livePayload
    const liveData = livePayload && typeof livePayload === 'object'
      ? (livePayload as JsonRecord)[sport === 'cricket' ? 'data' : 'matches']
      : null
    const footballMatches = sport === 'football' && Array.isArray(liveData)
      ? liveData.map((match) => normalizeFootballDataMatch(match as JsonRecord))
      : []
    const upcomingData = sport === 'football'
      ? footballMatches
      : fixturesPayload && typeof fixturesPayload === 'object' ? (fixturesPayload as JsonRecord).data : []
    const liveMatches = sport === 'cricket' && !usingSportmonksLiveFallback && Array.isArray(liveData)
      ? liveData.map((matchValue) => {
        const match = matchValue as JsonRecord
        const teamInfo = Array.isArray(match.teamInfo) ? match.teamInfo as JsonRecord[] : []
        const teams = Array.isArray(match.teams) ? match.teams : []
        const scores = Array.isArray(match.score) ? match.score as JsonRecord[] : []
        const normalizeCricketDataTeam = (team: JsonRecord | undefined, fallbackName: unknown) => ({
          name: text(team?.name) || text(fallbackName),
          crest: text(team?.imgUrl) || text(team?.imgURL) || text(team?.logo)
            || text(team?.image) || text(team?.flag) || text(team?.flagUrl),
          flag: text(team?.flag) || text(team?.flagUrl),
        })
        return {
          id: `cricketdata-${String(match.id)}`,
          sport: 'cricket',
          league: text(match.series),
          round: text(match.matchType),
          localteam: [normalizeCricketDataTeam(teamInfo[0], teams[0])],
          visitorteam: [normalizeCricketDataTeam(teamInfo[1], teams[1])],
          status: text(match.status),
          live: isCricketDataLive(match),
          recent: false,
          starting_at: text(match.dateTimeGMT) || text(match.date),
          result_info: text(match.status),
          runs: scores.map((score, index) => ({
            id: `${String(match.id)}-${index}`,
            team: { name: text(score.inning) },
            total: score.r,
            wickets: score.w,
            overs: score.o,
          })),
          scoreboards: [],
          venue: { name: text(match.venue) },
        }
      })
      : sport === 'football' ? footballMatches.filter((match) => match.live === true) : liveData
    if (!Array.isArray(liveMatches) || !Array.isArray(upcomingData)) {
      const provider = sport === 'cricket' ? 'Sportmonks' : 'football-data.org'
      console.error(`${provider} ${sport} response did not contain fixture data arrays.`)
      return json({ error: `${provider} returned an invalid ${sport} fixtures response.` }, cors.headers, 502)
    }
    const fixturePages = [...upcomingData as JsonRecord[]]
    const metadata = !fixturesUnavailable && fixturesPayload && typeof fixturesPayload === 'object' ? (fixturesPayload as JsonRecord).meta : null
    const pagination = metadata && typeof metadata === 'object' ? (metadata as JsonRecord).pagination : null
    const reportedPages = pagination && typeof pagination === 'object'
      ? Number((pagination as JsonRecord).total_pages || 1)
      : 1
    if (!Number.isInteger(reportedPages) || reportedPages < 1 || reportedPages > 8) {
      return json({ error: 'Sportmonks returned too many fixtures to display safely. Try again later.' }, cors.headers, 502)
    }
    for (let page = 2; page <= reportedPages; page += 1) {
      const pageUrl = new URL(fixturesUrl)
      pageUrl.searchParams.set('page', String(page))
      const pageResponse = await fetch(pageUrl, { signal: AbortSignal.timeout(12_000) })
      if (!pageResponse.ok) {
        console.error(`Sportmonks ${sport} fixtures page ${page} failed with status ${pageResponse.status}.`)
        return json({ error: `Sportmonks could not load all upcoming ${sport} fixtures. Try again shortly.` }, cors.headers, 502)
      }
      const pagePayload: unknown = await pageResponse.json()
      const pageData = pagePayload && typeof pagePayload === 'object' ? (pagePayload as JsonRecord).data : null
      if (!Array.isArray(pageData)) {
        console.error(`Sportmonks ${sport} fixtures page ${page} did not contain a data array.`)
        return json({ error: 'Sportmonks returned an invalid upcoming fixtures response.' }, cors.headers, 502)
      }
      fixturePages.push(...pageData as JsonRecord[])
    }

    const currentTime = Date.now()
    const normalizedFixtures = new Map<string, JsonRecord>()
    for (const fixture of liveMatches as JsonRecord[]) {
      if (fixture.live === true) {
        normalizedFixtures.set(String(fixture.id), fixture)
        continue
      }
      if (sport !== 'cricket' || !isNepalPremierLeague(fixture.league)) continue
      const start = fixtureDate(fixture.starting_at)
      if (!start) continue
      const startTime = start.getTime()
      if (startTime > currentTime && startTime <= endDate.getTime() && !isFinished(fixture.status)) {
        normalizedFixtures.set(String(fixture.id), { ...fixture, recent: false })
      } else if (startTime >= recentStart.getTime() && startTime <= currentTime
        && !/abandon|cancel|postpon|no.?result/i.test(text(fixture.status))
        && (isCompleted(fixture.status) || hasEntries(fixture.runs) || hasEntries(fixture.scoreboards))) {
        normalizedFixtures.set(String(fixture.id), { ...fixture, recent: true })
      }
    }
    for (const fixture of fixturePages) {
      const start = fixtureDate(fixture.starting_at)
      const status = sport === 'cricket' ? fixture.status : firstRelation(fixture.state).name
      if (!start || (sport === 'cricket' ? isCricketLive(fixture) : fixture.live === true)) continue
      const startTime = start.getTime()
      if (startTime > currentTime && startTime <= endDate.getTime() && !isFinished(status)) {
        normalizedFixtures.set(String(fixture.id), { ...fixture, recent: false })
      } else if (startTime >= recentStart.getTime() && startTime <= currentTime
        && !/abandon|cancel|postpon|no.?result/i.test(text(status))
        && (isCompleted(status)
          || Boolean(text(fixture.result_info))
          || hasEntries(fixture.runs)
          || hasEntries(fixture.scoreboards)
          || hasEntries(fixture.scores))) {
        normalizedFixtures.set(String(fixture.id), { ...fixture, recent: true })
      }
    }

    const fixtures = Array.from(normalizedFixtures.values(), (fixture) => {
      const participantsValue = relation(fixture.participants)
      const participants = Array.isArray(participantsValue) ? participantsValue as JsonRecord[] : []
      const home = participants.filter((team) => firstRelation(team.meta).location === 'home')
      const away = participants.filter((team) => firstRelation(team.meta).location === 'away')
      const localteam = sport === 'cricket' ? relation(fixture.localteam) : home
      const visitorteam = sport === 'cricket' ? relation(fixture.visitorteam) : away
      const scoresValue = relation(fixture.scores)
      const scores = sport === 'football' && Array.isArray(scoresValue) ? scoresValue as JsonRecord[] : []
      const currentScores = scores.filter((score) => text(score.description).toUpperCase() === 'CURRENT')
      const scoreboards = sport === 'cricket'
        ? relation(fixture.scoreboards)
        : currentScores.map((score) => {
          const scoreData = firstRelation(score.score)
          return {
            id: score.id,
            team: { name: text(scoreData.participant).toLowerCase() === 'home' ? text(home[0]?.name) : text(away[0]?.name) },
            total: scoreData.goals,
          }
        })
      return {
        id: fixture.id,
        sport,
        league: text(firstRelation(fixture.league).name),
        round: text(fixture.round) || text(firstRelation(fixture.round).name),
        localteam,
        visitorteam,
        status: sport === 'cricket' ? text(fixture.status) : text(firstRelation(fixture.state).name),
        live: sport === 'cricket' ? isCricketLive(fixture) : fixture.live === true,
        recent: fixture.recent === true,
        starting_at: fixture.starting_at,
        result_info: text(fixture.result_info),
        runs: sport === 'cricket' ? relation(fixture.runs) : [],
        scoreboards,
        venue: firstRelation(fixture.venue),
      }
    }).sort((first, second) => {
      if (first.live !== second.live) return first.live ? -1 : 1
      if (first.recent && second.recent) {
        return new Date(String(second.starting_at)).getTime() - new Date(String(first.starting_at)).getTime()
      }
      if (first.recent !== second.recent) return first.recent ? -1 : 1
      return new Date(String(first.starting_at)).getTime() - new Date(String(second.starting_at)).getTime()
    })

    cachedScores[sport] = { fixtures, expiresAt: Date.now() + (sport === 'cricket' ? 20 * 60_000 : 10 * 60_000) }
    return json({
      fixtures,
      warning: usingSportmonksLiveFallback
        ? 'CricketData.org is temporarily unreachable or rejected its request; current cricket matches are being shown from Sportmonks instead. Nepal Premier League matches will appear when CricketData.org is available again.'
        : sport === 'football' && footballPartial
          ? 'football-data.org temporarily failed to return some date ranges; showing matches from the ranges that loaded.'
          : fixturesUnavailable ? `Sportmonks ${sport} fixtures are temporarily unavailable; showing current ${sport} matches only.` : undefined,
    }, cors.headers)
  } catch (requestError) {
    console.error(`Sportmonks ${sport} score handler failed: ${requestError instanceof Error ? requestError.name : 'unknown error type'}.`)
    return json({ error: `The ${sport} score handler failed while processing a provider response. Check the Edge Function logs.` }, cors.headers, 502)
  }
})
