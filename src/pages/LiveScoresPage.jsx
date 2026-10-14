import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import Brand from '../components/Brand.jsx'
import TeamCrest from '../components/TeamCrest.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import useSportmonksCricketScores, { fetchCricketMatchDetails, fetchFootballMatchDetails, fetchFootballMatchSection, gameInnings, teamName } from '../hooks/useSportmonksCricketScores.js'

const dayFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function dateValue(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function MatchCard({ game, onOpen }) {
  const home = teamName(game.localteam) || 'Home'
  const away = teamName(game.visitorteam) || 'Away'
  const innings = gameInnings(game)
  const sportIcon = game.sport === 'football' ? 'football' : 'cricket'
  const start = dateValue(game.starting_at)
  const venue = game.venue?.name || game.venue?.city || ''
  const Card = game.sport === 'football' || Boolean(game.eventKey) ? 'button' : 'article'
  return (
    <Card
      className={`scores-match-card${Card === 'button' ? ' is-clickable' : ''}`}
      type={Card === 'button' ? 'button' : undefined}
      onClick={Card === 'button' ? () => onOpen(game) : undefined}
      aria-label={Card === 'button' ? `View details for ${home} versus ${away}` : undefined}
    >
      <header>
        <span><Icon name={sportIcon} size={15} />{game.league || game.round || (game.sport === 'football' ? 'Football' : 'Cricket')}</span>
        <span className={game.live ? 'scores-live-status' : 'scores-upcoming-status'}>
          {game.live && <i />}
          {game.live ? game.status || 'Live now' : start ? `${dayFormatter.format(start)} · ${timeFormatter.format(start)}` : 'Upcoming'}
        </span>
      </header>
      <div className="scores-match-teams">
        <div><TeamCrest team={game.localteam} name={home} /><b>{home}</b></div>
        <span>VS</span>
        <div><TeamCrest team={game.visitorteam} name={away} /><b>{away}</b></div>
      </div>
      {innings.length > 0 && <div className="scores-match-innings">
        {innings.map((inning) => <span key={inning.id}>{inning.team || 'Innings'} <b>{inning.score}</b></span>)}
      </div>}
      {!game.live && <footer>{venue || game.round || 'Scheduled fixture'}</footer>}
      {Card === 'button' && <span className="scores-match-details-cta">View live match details</span>}
    </Card>
  )
}

function MatchRow({ game }) {
  const start = dateValue(game.starting_at)
  const home = teamName(game.localteam) || 'Home'
  const away = teamName(game.visitorteam) || 'Away'
  const sportIcon = game.sport === 'football' ? 'football' : 'cricket'
  return (
    <article className="scores-upcoming-row">
      <span>{start ? <><b>{dayFormatter.format(start)}</b><small>{timeFormatter.format(start)}</small></> : '—'}</span>
      <span className="scores-row-league"><Icon name={sportIcon} size={15} />{game.league || game.round || (game.sport === 'football' ? 'Football' : 'Cricket')}</span>
      <span className="scores-row-teams"><b><TeamCrest team={game.localteam} name={home} />{home}</b><i>vs</i><b><TeamCrest team={game.visitorteam} name={away} />{away}</b></span>
      <span className="scores-row-venue">{game.venue?.name || game.venue?.city || 'Venue TBA'}</span>
      <span aria-hidden="true"><Icon name="chevron-right" size={15} /></span>
    </article>
  )
}

function RecentResultCard({ game, onOpen }) {
  const home = teamName(game.localteam) || 'Home'
  const away = teamName(game.visitorteam) || 'Away'
  const scores = gameInnings(game)
  const start = dateValue(game.starting_at)
  const sportIcon = game.sport === 'football' ? 'football' : 'cricket'
  const Card = Boolean(game.eventKey) || game.sport === 'football' ? 'button' : 'article'
  return (
    <Card
      className={`scores-result-card${Card === 'button' ? ' is-clickable' : ''}`}
      type={Card === 'button' ? 'button' : undefined}
      onClick={Card === 'button' ? () => onOpen(game) : undefined}
      aria-label={Card === 'button' ? `View details for ${home} versus ${away}` : undefined}
    >
      <header>
        <span><Icon name={sportIcon} size={15} />{game.league || game.round || (game.sport === 'football' ? 'Football' : 'Cricket')}</span>
        <time dateTime={game.starting_at}>{start ? `${dayFormatter.format(start)} · ${timeFormatter.format(start)}` : 'Recent match'}</time>
      </header>
      <div className="scores-result-teams">
        <span><TeamCrest team={game.localteam} name={home} />{home}</span>
        <b>{scores.length
          ? scores.map((score) => score.score).join(' · ')
          : game.result_info || 'Result unavailable'}</b>
        <span><TeamCrest team={game.visitorteam} name={away} />{away}</span>
      </div>
      {game.result_info && <p>{game.result_info}</p>}
      {game.venue?.name && <small>{game.venue.name}</small>}
      {Card === 'button' && <span className="scores-result-details-cta">View match details</span>}
    </Card>
  )
}

function eventMinute(event) {
  const minute = typeof event.minute === 'number' ? `${event.minute}` : ''
  const injury = typeof event.injuryTime === 'number' && event.injuryTime > 0 ? `+${event.injuryTime}` : ''
  return minute ? `${minute}${injury}'` : 'Minute unavailable'
}

function eventName(value) {
  return value && typeof value === 'object' ? value.name || '' : ''
}

function bookingCardType(card) {
  const value = typeof card === 'string' ? card.toUpperCase() : ''
  if (value.includes('RED') && (value.includes('YELLOW') || value.includes('SECOND'))) return 'second-yellow'
  if (value.includes('RED')) return 'red'
  if (value.includes('YELLOW')) return 'yellow'
  return 'other'
}

function bookingCardLabel(card) {
  const type = bookingCardType(card)
  if (type === 'second-yellow') return 'Second yellow card · sent off'
  if (type === 'red') return 'Red card · sent off'
  if (type === 'yellow') return 'Yellow card'
  return detailStatus(typeof card === 'string' ? card : 'Card')
}

function detailStatus(status) {
  return typeof status === 'string' ? status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Match details'
}

const footballStatLabels = [
  ['expected_goals', 'Expected goals (xG)'],
  ['shots_on_goal', 'Shots on target'],
  ['shots_off_goal', 'Shots off target'],
  ['blocked_shots', 'Blocked shots'],
  ['shots', 'Shots'],
  ['ball_possession', 'Possession (%)'],
  ['corner_kicks', 'Corner kicks'],
  ['offsides', 'Offsides'],
  ['fouls', 'Fouls'],
  ['throw_ins', 'Throw-ins'],
  ['yellow_cards', 'Yellow cards'],
  ['yellow_red_cards', 'Second yellow cards'],
  ['red_cards', 'Red cards'],
  ['saves', 'Saves'],
  ['free_kicks', 'Free kicks'],
  ['goal_kicks', 'Goal kicks'],
]

function numericStat(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizedStatKey(key) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).toLowerCase()
}

function FootballMatchDetails({ game, details, loading, error, onClose, onRetry, sections, sectionLoading, sectionErrors, onLoadSection }) {
  const [activeTab, setActiveTab] = useState('Summary')
  const home = details?.homeTeam?.name || teamName(game.localteam) || 'Home'
  const away = details?.awayTeam?.name || teamName(game.visitorteam) || 'Away'
  const score = details?.score?.fullTime || {}
  const fallbackScores = gameInnings(game).map((inning) => {
    const match = inning.score.match(/^\s*(\d+)/)
    return match ? Number(match[1]) : null
  })
  const homeScore = numericStat(score.home) ?? fallbackScores[0]
  const awayScore = numericStat(score.away) ?? fallbackScores[1]
  const goals = Array.isArray(details?.goals)
    ? [...details.goals].sort((first, second) => (first.minute || 0) - (second.minute || 0))
    : []
  const bookings = Array.isArray(details?.bookings) ? details.bookings : []
  const substitutions = Array.isArray(details?.substitutions) ? details.substitutions : []
  const matchEvents = [
    ...goals.map((data) => ({ kind: 'goal', data })),
    ...bookings.map((data) => ({ kind: 'booking', data })),
    ...substitutions.map((data) => ({ kind: 'substitution', data })),
  ]
  const hasPeriodScore = (period) => numericStat(period?.home) !== null && numericStat(period?.away) !== null
  const isFinishedMatch = game.recent || /FINISHED|AWARDED|AFTER_EXTRA_TIME|AFTER_PENALTIES/.test(details?.status || '')
  const timelineEntries = [
    ...matchEvents.map((event) => ({
      ...event,
      sortMinute: (numericStat(event.data.minute) ?? Number.MAX_SAFE_INTEGER)
        + (numericStat(event.data.injuryTime) ?? 0) / 100,
    })),
    ...(hasPeriodScore(details?.score?.halfTime)
      ? [{ kind: 'period', label: 'Half-time', abbreviation: 'HT', score: details.score.halfTime, sortMinute: 45.99 }]
      : []),
    ...(isFinishedMatch && hasPeriodScore({ home: homeScore, away: awayScore })
      ? [{ kind: 'period', label: 'Full-time', abbreviation: 'FT', score: { home: homeScore, away: awayScore }, sortMinute: Number.MAX_SAFE_INTEGER }]
      : []),
  ].sort((first, second) => first.sortMinute - second.sortMinute)
  const eventAvailabilityMessage = details?.eventDataStatus === 'not_configured'
    ? 'Add API_FOOTBALL_KEY to the Supabase Edge Function secrets to load player-by-player goal and card events.'
    : details?.eventDataStatus === 'unavailable'
      ? 'The event-data provider could not be reached. Try opening this match again later.'
      : details?.eventDataStatus === 'no_match'
        ? 'The event provider could not confidently match this fixture, so no goal or card details are shown.'
        : details?.eventDataStatus === 'no_events'
          ? 'The event provider has no goal or card events for this fixture.'
          : 'Goal and card details are unavailable for this match from the provider.'
  const start = dateValue(details?.utcDate || game.starting_at)
  const homeStatistics = details?.homeTeam?.statistics || {}
  const awayStatistics = details?.awayTeam?.statistics || {}
  const statDefinitions = new Map(footballStatLabels.map(([key, label]) => [key, label]))
  for (const key of [...Object.keys(homeStatistics), ...Object.keys(awayStatistics)]) {
    const normalizedKey = normalizedStatKey(key)
    if (!statDefinitions.has(normalizedKey)) {
      statDefinitions.set(normalizedKey, normalizedKey.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))
    }
  }
  const readStat = (statistics, key) => {
    const matchingKey = Object.keys(statistics).find((candidate) => normalizedStatKey(candidate) === key)
    return matchingKey ? numericStat(statistics[matchingKey]) : null
  }
  const statRows = Array.from(statDefinitions, ([key, label]) => ({
    key,
    label,
    home: readStat(homeStatistics, key),
    away: readStat(awayStatistics, key),
  })).filter((row) => row.home !== null || row.away !== null)
  const displayStatRows = statRows.length
    ? statRows
    : homeScore !== null && homeScore !== undefined && awayScore !== null && awayScore !== undefined
      ? [{ key: 'goals', label: 'Goals', home: homeScore, away: awayScore }]
      : []
  const infoItems = [
    ['Competition', details?.competition?.name],
    ['Country / area', details?.area?.name],
    ['Competition code', details?.competition?.code],
    ['Competition type', details?.competition?.type && detailStatus(details.competition.type)],
    ['Season', details?.season?.startDate && details?.season?.endDate
      ? `${details.season.startDate} – ${details.season.endDate}`
      : details?.season?.startDate || details?.season?.endDate],
    ['Matchday', details?.matchday ? `Matchday ${details.matchday}` : null],
    ['Stage', details?.stage && detailStatus(details.stage)],
    ['Group', details?.group],
    ['Kickoff', start ? `${dayFormatter.format(start)} · ${timeFormatter.format(start)}` : null],
    ['Venue', details?.venue],
    ['Attendance', numericStat(details?.attendance)?.toLocaleString()],
    ['Match minute', numericStat(details?.minute) !== null
      ? `${details.minute}${numericStat(details.injuryTime) ? ` + ${details.injuryTime} added` : ''}`
      : null],
    ['Duration', details?.score?.duration && detailStatus(details.score.duration)],
    ['Half-time', numericStat(details?.score?.halfTime?.home) !== null && numericStat(details?.score?.halfTime?.away) !== null
      ? `${details.score.halfTime.home} – ${details.score.halfTime.away}`
      : null],
    ['Season winner', details?.season?.winner],
    ['Home league position', numericStat(details?.homeTeam?.leagueRank)],
    ['Away league position', numericStat(details?.awayTeam?.leagueRank)],
    ...(Array.isArray(details?.referees) ? details.referees.map((referee) => [referee.type || 'Official', referee.name]) : []),
    ['Home formation', details?.homeTeam?.formation],
    ['Home coach', details?.homeTeam?.coach?.name && `${details.homeTeam.coach.name}${details.homeTeam.coach.nationality ? ` · ${details.homeTeam.coach.nationality}` : ''}`],
    ['Away formation', details?.awayTeam?.formation],
    ['Away coach', details?.awayTeam?.coach?.name && `${details.awayTeam.coach.name}${details.awayTeam.coach.nationality ? ` · ${details.awayTeam.coach.nationality}` : ''}`],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '')
  const Card = ({ children, className = '' }) => <section className={`scores-detail-section ${className}`}>{children}</section>
  const tabs = ['Info', 'Summary', 'Stats', 'Line-ups', 'Table', 'H2H']

  return (
    <div className="scores-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="scores-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="scores-detail-title">
        <button className="scores-detail-close" type="button" onClick={onClose} aria-label="Close match details">×</button>
        <header className="scores-detail-heading">
          <span>{details?.competition?.name || game.league || 'Football'}{details?.matchday ? ` · Matchday ${details.matchday}` : ''}</span>
          <h2 id="scores-detail-title">{home} <i>vs</i> {away}</h2>
          <p>{start ? `${dayFormatter.format(start)} · ${timeFormatter.format(start)}` : 'Kickoff time unavailable'}{details?.venue ? ` · ${details.venue}` : ''}</p>
        </header>

        {loading
          ? <div className="scores-detail-loading" role="status"><span className="scores-spinner" />Loading match details…</div>
          : error
            ? <div className="scores-detail-error" role="alert"><p>{error}</p><button type="button" onClick={() => onRetry(game)}>Try again</button></div>
            : details && <>
              <div className="scores-detail-score">
                <div><TeamCrest team={details.homeTeam} name={home} /><b>{home}</b></div>
                <strong>{homeScore ?? '–'} <i>:</i> {awayScore ?? '–'}</strong>
                <div><TeamCrest team={details.awayTeam} name={away} /><b>{away}</b></div>
                <small>{detailStatus(details.status)}{details.score?.winner ? ` · ${details.score.winner === 'HOME_TEAM' ? `${home} won` : details.score.winner === 'AWAY_TEAM' ? `${away} won` : 'Draw'}` : ''}</small>
              </div>
              <nav className="scores-detail-tabs" role="tablist" aria-label="Match details">
                {tabs.map((tab) => <button
                  key={tab}
                  id={`scores-tab-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls="scores-tab-panel"
                  onClick={() => {
                    setActiveTab(tab)
                    if (tab === 'H2H' || tab === 'Table') onLoadSection(tab === 'H2H' ? 'head2head' : 'standings', details.competition?.id)
                  }}
                >{tab}</button>)}
              </nav>
              <div id="scores-tab-panel" className="scores-detail-tab-panel" role="tabpanel" aria-labelledby={`scores-tab-${activeTab.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                {activeTab === 'Summary' && <>
                  <Card>
                    <h3>Events{goals.length ? ` · ${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}` : ''}</h3>
                    {timelineEntries.length
                      ? <ol className="scores-detail-events">
                        {timelineEntries.map((entry, index) => {
                          if (entry.kind === 'period') {
                            return <li className="scores-detail-event-period" key={`period-${entry.abbreviation}`}>
                              <time>{entry.abbreviation}</time>
                              <span><b>{entry.label}</b></span>
                              <strong>{entry.score.home}–{entry.score.away}</strong>
                            </li>
                          }
                          const { kind, data } = entry
                          const cardType = kind === 'booking' ? bookingCardType(data.card) : ''
                          const team = eventName(data.team)
                          const player = kind === 'goal'
                            ? eventName(data.scorer) || 'Unknown scorer'
                            : kind === 'booking'
                              ? eventName(data.player) || 'Player'
                              : `${eventName(data.playerIn) || 'Player on'} for ${eventName(data.playerOut) || 'Player off'}`
                          const eventLabel = kind === 'goal'
                            ? data.type === 'OWN' ? 'Own goal' : data.type === 'PENALTY' ? 'Penalty goal' : 'Goal'
                            : kind === 'booking' ? bookingCardLabel(data.card) : 'Substitution'
                          const scoreAtEvent = data.score && data.score.home !== undefined && data.score.away !== undefined
                            ? `${data.score.home}–${data.score.away}`
                            : ''
                          return <li className={`scores-detail-event-${kind}`} key={`${kind}-${data.minute}-${index}`}>
                            <time>{eventMinute(data)}</time>
                            <span className="scores-detail-event-description">
                              <b>{player}</b>
                              <small>{[eventLabel, team, kind === 'goal' && eventName(data.assist) ? `Assist: ${eventName(data.assist)}` : ''].filter(Boolean).join(' · ')}</small>
                            </span>
                            {kind === 'goal'
                              ? <strong className="scores-detail-event-icon" aria-label="Goal">⚽{scoreAtEvent && <small>{scoreAtEvent}</small>}</strong>
                              : kind === 'booking'
                                ? <i className={`scores-detail-card-icon is-${cardType}`} aria-label={eventLabel} />
                                : <strong className="scores-detail-event-substitution" aria-label="Substitution">↔</strong>}
                          </li>
                        })}
                      </ol>
                      : <p className="scores-detail-empty">{eventAvailabilityMessage} The final score is shown above.</p>}
                    {!matchEvents.length && timelineEntries.length > 0 && <p className="scores-detail-empty">{eventAvailabilityMessage}</p>}
                  </Card>
                </>}
                {activeTab === 'Info' && <Card className="scores-detail-facts">
                  <h3>Match information</h3>
                  {infoItems.length
                    ? infoItems.map(([label, value], index) => <span key={`${label}-${index}`}><small>{label}</small><b>{value}</b></span>)
                    : <p className="scores-detail-empty">The provider has not supplied additional information for this fixture.</p>}
                </Card>}
                {activeTab === 'Stats' && <Card>
                  <h3>Match statistics</h3>
                  {displayStatRows.length
                    ? <div className="scores-detail-stat-list">{displayStatRows.map((row) => {
                      const homeValue = row.home ?? 0
                      const awayValue = row.away ?? 0
                      const total = homeValue + awayValue
                      const canCompare = row.home !== null && row.away !== null
                      const homePercent = total ? homeValue / total * 100 : 50
                      return <div className="scores-detail-stat" key={row.key}>
                        <div><b>{row.home ?? '—'}</b><span>{row.label}</span><b>{row.away ?? '—'}</b></div>
                        <div className="scores-detail-stat-bars" aria-hidden="true">
                          <i><span style={{ width: canCompare ? `${homePercent}%` : '0%' }} /></i>
                          <i><span style={{ width: canCompare ? `${100 - homePercent}%` : '0%' }} /></i>
                        </div>
                      </div>
                    })}</div>
                    : <p className="scores-detail-empty">football-data.org didn’t return match statistics for this fixture.</p>}
                  {!statRows.length && displayStatRows.length > 0 && <p className="scores-detail-empty">Only the official goal score is available; this fixture has no provider data for shots, possession, cards, or other detailed statistics.</p>}
                </Card>}
                {activeTab === 'Line-ups' && <div className="scores-detail-lineups">
                  {[['home', details.homeTeam], ['away', details.awayTeam]].map(([side, team]) => {
                    const lineup = Array.isArray(team?.lineup) ? team.lineup : []
                    const bench = Array.isArray(team?.bench) ? team.bench : []
                    const coach = team?.coach?.name
                    return <Card key={side}>
                      <h3>{side === 'home' ? home : away}{team?.formation ? ` · ${team.formation}` : ''}</h3>
                      {coach && <p className="scores-detail-coach">Coach · {coach}{team.coach.nationality ? ` (${team.coach.nationality})` : ''}</p>}
                      {lineup.length
                        ? <ol className="scores-detail-player-list">{lineup.map((player, index) => <li key={player.id || `${side}-lineup-${index}`}>
                          <span>{player.shirtNumber ?? '—'}</span><b>{player.name || 'Player'}</b><small>{player.position || ''}</small>
                        </li>)}</ol>
                        : <p className="scores-detail-empty">Starting line-up not provided.</p>}
                      {bench.length > 0 && <>
                        <h4 className="scores-detail-bench-heading">Substitutes</h4>
                        <ol className="scores-detail-player-list">{bench.map((player, index) => <li key={player.id || `${side}-bench-${index}`}>
                          <span>{player.shirtNumber ?? '—'}</span><b>{player.name || 'Player'}</b><small>{player.position || ''}</small>
                        </li>)}</ol>
                      </>}
                    </Card>
                  })}
                </div>}
                {(activeTab === 'Table' || activeTab === 'H2H') && <Card className="scores-detail-remote-data">
                  <h3>{activeTab === 'Table' ? 'Competition table' : 'Head to head'}</h3>
                  {sectionLoading[activeTab === 'Table' ? 'standings' : 'head2head']
                    ? <div className="scores-detail-loading" role="status"><span className="scores-spinner" />Loading {activeTab === 'Table' ? 'standings' : 'past meetings'}…</div>
                    : sectionErrors[activeTab === 'Table' ? 'standings' : 'head2head']
                      ? <div className="scores-detail-error" role="alert"><p>{sectionErrors[activeTab === 'Table' ? 'standings' : 'head2head']}</p><button type="button" onClick={() => onLoadSection(activeTab === 'Table' ? 'standings' : 'head2head', details.competition?.id, true)}>Try again</button></div>
                      : activeTab === 'Table'
                        ? (() => {
                          const standings = sections.standings?.standings || []
                          const table = standings.find((standing) => standing.type === 'TOTAL') || standings[0]
                          return table?.table?.length
                            ? <div className="scores-detail-table-wrap"><table className="scores-detail-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>{table.table.map((row) => <tr key={row.team.id}><td>{row.position}</td><td><span>{row.team.crest && <img src={row.team.crest} alt="" loading="lazy" />}{row.team.name}</span></td><td>{row.playedGames}</td><td>{row.won}</td><td>{row.draw}</td><td>{row.lost}</td><td>{row.goalDifference}</td><td><b>{row.points}</b></td></tr>)}</tbody></table></div>
                            : <p className="scores-detail-empty">No competition table was returned for this competition.</p>
                        })()
                        : (() => {
                          const h2h = sections.head2head || {}
                          const matches = Array.isArray(h2h.matches) ? h2h.matches : []
                          const aggregates = h2h.aggregates || {}
                          return <div className="scores-detail-h2h">
                            {aggregates.numberOfMatches !== undefined && <p className="scores-detail-h2h-summary">{aggregates.numberOfMatches} previous meetings</p>}
                            {matches.length
                              ? <ol className="scores-detail-h2h-list">{matches.map((match) => <li key={match.id}>
                                <time>{dateValue(match.utcDate) ? dayFormatter.format(dateValue(match.utcDate)) : '—'}</time>
                                <span>{match.homeTeam} <b>{match.homeScore ?? '–'} – {match.awayScore ?? '–'}</b> {match.awayTeam}</span>
                                <small>{match.competition}</small>
                              </li>)}</ol>
                              : <p className="scores-detail-empty">No previous meetings were returned for these teams.</p>}
                          </div>
                        })()}
                </Card>}
              </div>
              <p className="scores-detail-provider-note">Match details are limited to the events and information football-data.org provides for this competition.</p>
            </>}
      </section>
    </div>
  )
}

function CricketMatchDetails({ game, details, loading, error, onClose, onRetry }) {
  const [activeTab, setActiveTab] = useState('Summary')
  const home = details?.homeTeam || teamName(game.localteam) || 'Home'
  const away = details?.awayTeam || teamName(game.visitorteam) || 'Away'
  const innings = details?.scorecard && typeof details.scorecard === 'object'
    ? Object.entries(details.scorecard)
    : []
  const info = [
    ['Competition', details?.competition],
    ['Format', details?.format],
    ['Match date', details?.date],
    ['Start time', details?.time],
    ['Venue', details?.venue],
    ['Toss', details?.toss],
    ['Player of the match', details?.playerOfMatch],
    ['Result', details?.result],
  ].filter(([, value]) => value)
  const wickets = details?.wickets && typeof details.wickets === 'object' ? details.wickets : {}
  const comments = details?.comments && typeof details.comments === 'object' ? details.comments : {}
  const extras = details?.extras && typeof details.extras === 'object' ? details.extras : {}
  const Card = ({ children }) => <section className="scores-detail-section">{children}</section>
  const tabs = ['Info', 'Summary', 'Scorecard', 'Commentary']

  return (
    <div className="scores-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="scores-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="cricket-detail-title">
        <button className="scores-detail-close" type="button" onClick={onClose} aria-label="Close match details">×</button>
        <header className="scores-detail-heading">
          <span>{details?.competition || game.league || 'Cricket'}{details?.format ? ` · ${details.format}` : ''}</span>
          <h2 id="cricket-detail-title">{home} <i>vs</i> {away}</h2>
          <p>{[details?.date || (dateValue(game.starting_at) && dayFormatter.format(dateValue(game.starting_at))), details?.venue].filter(Boolean).join(' · ') || 'Match information unavailable'}</p>
        </header>
        {loading
          ? <div className="scores-detail-loading" role="status"><span className="scores-spinner" />Loading cricket scorecard…</div>
          : error
            ? <div className="scores-detail-error" role="alert"><p>{error}</p><button type="button" onClick={() => onRetry(game)}>Try again</button></div>
            : details && <>
              <div className="scores-detail-score">
                <div><TeamCrest team={{ name: home, crest: details.homeLogo }} name={home} /><b>{home}</b></div>
                <strong>{details.homeScore || '–'} <i>·</i> {details.awayScore || '–'}</strong>
                <div><TeamCrest team={{ name: away, crest: details.awayLogo }} name={away} /><b>{away}</b></div>
                <small>{details.result || details.status || 'Match details'}</small>
              </div>
              <nav className="scores-detail-tabs" role="tablist" aria-label="Cricket match details">
                {tabs.map((tab) => <button
                  key={tab}
                  id={`cricket-tab-${tab.toLowerCase()}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls="cricket-tab-panel"
                  onClick={() => setActiveTab(tab)}
                >{tab}</button>)}
              </nav>
              <div id="cricket-tab-panel" className="scores-detail-tab-panel" role="tabpanel" aria-labelledby={`cricket-tab-${activeTab.toLowerCase()}`}>
                {activeTab === 'Info' && <Card>
                  <h3>Match information</h3>
                  {info.length
                    ? <dl className="scores-detail-info">{info.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                    : <p className="scores-detail-empty">No additional match information was provided.</p>}
                </Card>}
                {activeTab === 'Summary' && <>
                  <Card>
                    <h3>Match summary</h3>
                    <p className="scores-detail-cricket-summary">{details.result || details.status || 'Match result is not available yet.'}</p>
                    {details.toss && <p className="scores-detail-cricket-summary"><b>Toss:</b> {details.toss}</p>}
                    {details.playerOfMatch && <p className="scores-detail-cricket-summary"><b>Player of the match:</b> {details.playerOfMatch}</p>}
                  </Card>
                  {Object.entries(wickets).some(([, values]) => Array.isArray(values) && values.length > 0) && <Card>
                    <h3>Fall of wickets</h3>
                    {Object.entries(wickets).map(([label, values]) => Array.isArray(values) && values.length > 0 && <div className="scores-detail-cricket-events" key={label}>
                      <b>{label}</b>
                      {values.map((item, index) => <p key={`${label}-${index}`}><time>{item.fall || '—'}</time> {item.score || ''} · {item.batsman || ''}{(item.bowler || item.balwer) ? ` · ${item.bowler || item.balwer}` : ''}</p>)}
                    </div>)}
                  </Card>}
                </>}
                {activeTab === 'Scorecard' && <Card>
                  <h3>Innings scorecards</h3>
                  {innings.length
                    ? innings.map(([label, value]) => {
                      const rows = Array.isArray(value) ? value : []
                      const batting = rows.filter((row) => /bat/i.test(row.type || ''))
                      const bowling = rows.filter((row) => /bowl/i.test(row.type || ''))
                      const extra = extras[label]
                      return <section className="scores-detail-cricket-innings" key={label}>
                        <h4>{label}</h4>
                        {batting.length > 0 && <div className="scores-detail-table-wrap"><table className="scores-detail-table">
                          <thead><tr><th>Batter</th><th>Dismissal</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
                          <tbody>{batting.map((row, index) => <tr key={`${label}-bat-${index}`}><td>{row.player || '—'}</td><td>{row.status || '—'}</td><td><b>{row.R ?? '—'}</b></td><td>{row.B ?? '—'}</td><td>{row['4s'] ?? '—'}</td><td>{row['6s'] ?? '—'}</td><td>{row.SR ?? '—'}</td></tr>)}</tbody>
                        </table></div>}
                        {extra && <p className="scores-detail-cricket-extra"><b>Extras:</b> {extra.total || '—'} {extra.text ? `(${extra.text})` : ''}{extra.overs ? ` · ${extra.overs} overs` : ''}</p>}
                        {bowling.length > 0 && <div className="scores-detail-table-wrap"><table className="scores-detail-table">
                          <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Economy</th></tr></thead>
                          <tbody>{bowling.map((row, index) => <tr key={`${label}-bowl-${index}`}><td>{row.player || '—'}</td><td>{row.O ?? '—'}</td><td>{row.M ?? '—'}</td><td>{row.R ?? '—'}</td><td><b>{row.W ?? '—'}</b></td><td>{row.ER ?? '—'}</td></tr>)}</tbody>
                        </table></div>}
                        {!batting.length && !bowling.length && <p className="scores-detail-empty">No batting or bowling figures were provided for this innings.</p>}
                      </section>
                    })
                    : <p className="scores-detail-empty">The provider has not returned an innings scorecard for this match.</p>}
                </Card>}
                {activeTab === 'Commentary' && <Card>
                  <h3>Ball-by-ball commentary</h3>
                  {Object.entries(comments).some(([, values]) => Array.isArray(values) && values.length > 0)
                    ? Object.entries(comments).map(([label, values]) => Array.isArray(values) && values.length > 0 && <div className="scores-detail-cricket-events" key={label}>
                      <b>{label}</b>
                      {values.slice(0, 60).map((item, index) => <p key={`${label}-comment-${index}`}><time>{item.overs || '—'}</time> {item.post || `${item.runs ?? ''} runs`}</p>)}
                    </div>)
                    : <p className="scores-detail-empty">Ball-by-ball commentary is not available for this match.</p>}
                </Card>}
              </div>
              <p className="scores-detail-provider-note">Scorecard information is supplied by API-Cricket and may not be available for every match.</p>
            </>}
      </section>
    </div>
  )
}

export default function LiveScoresPage({ embedded = false, backHref }) {
  const { user } = useAuth()
  const [sport, setSport] = useState('cricket')
  const { games, error, warning, loading, updatedAt, refresh } = useSportmonksCricketScores(sport)
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [league, setLeague] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [matchDetails, setMatchDetails] = useState(null)
  const [matchDetailsError, setMatchDetailsError] = useState('')
  const [matchDetailsLoading, setMatchDetailsLoading] = useState(false)
  const [matchSections, setMatchSections] = useState({})
  const [matchSectionLoading, setMatchSectionLoading] = useState({})
  const [matchSectionErrors, setMatchSectionErrors] = useState({})
  const detailsRequestId = useRef(0)

  async function openMatchDetails(game) {
    const requestId = ++detailsRequestId.current
    setSelectedMatch(game)
    setMatchDetails(null)
    setMatchDetailsError('')
    setMatchDetailsLoading(true)
    setMatchSections({})
    setMatchSectionLoading({})
    setMatchSectionErrors({})
    try {
      const details = game.sport === 'cricket'
        ? await fetchCricketMatchDetails(game.eventKey)
        : await fetchFootballMatchDetails(game.id)
      if (requestId === detailsRequestId.current) setMatchDetails(details)
    } catch (detailError) {
      if (requestId === detailsRequestId.current) {
        setMatchDetailsError(detailError instanceof Error ? detailError.message : 'Match details could not be loaded.')
      }
    } finally {
      if (requestId === detailsRequestId.current) setMatchDetailsLoading(false)
    }
  }

  async function loadMatchSection(section, competitionId, force = false) {
    if ((!force && matchSections[section]) || matchSectionLoading[section]) return
    if (section === 'standings' && !competitionId) {
      setMatchSectionErrors((current) => ({ ...current, [section]: 'This match has no competition ID, so standings cannot be requested.' }))
      return
    }
    setMatchSectionLoading((current) => ({ ...current, [section]: true }))
    setMatchSectionErrors((current) => ({ ...current, [section]: '' }))
    try {
      const data = await fetchFootballMatchSection(selectedMatch.id, section, competitionId)
      setMatchSections((current) => ({ ...current, [section]: data }))
    } catch (sectionError) {
      setMatchSectionErrors((current) => ({
        ...current,
        [section]: sectionError instanceof Error ? sectionError.message : `Football ${section} could not be loaded.`,
      }))
    } finally {
      setMatchSectionLoading((current) => ({ ...current, [section]: false }))
    }
  }

  function closeMatchDetails() {
    detailsRequestId.current += 1
    setSelectedMatch(null)
    setMatchDetails(null)
    setMatchDetailsError('')
    setMatchDetailsLoading(false)
  }

  useEffect(() => {
    if (!selectedMatch) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMatchDetails()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [selectedMatch])

  const now = Date.now()
  const liveGames = useMemo(() => games.filter((game) => game.live), [games])
  const upcomingGames = useMemo(() => games.filter((game) => !game.live
    && !game.recent
    && dateValue(game.starting_at)?.getTime() > now
    && dateValue(game.starting_at)?.getTime() <= now + 30 * 24 * 60 * 60 * 1000), [games, now])
  const recentGames = useMemo(() => games.filter((game) => game.recent), [games])
  const filteredGames = useMemo(() => {
    const statusMatches = status === 'live'
      ? liveGames
      : status === 'upcoming'
        ? upcomingGames
        : status === 'results'
          ? recentGames
          : [...liveGames, ...upcomingGames, ...recentGames]
    const needle = query.trim().toLowerCase()
    return statusMatches.filter((game) => {
      const names = `${teamName(game.localteam)} ${teamName(game.visitorteam)} ${game.league || ''} ${game.round || ''}`.toLowerCase()
      return (!needle || names.includes(needle)) && (!league || game.league === league)
    })
  }, [league, liveGames, query, recentGames, status, upcomingGames])
  const visibleLiveGames = filteredGames.filter((game) => game.live)
  const visibleUpcomingGames = filteredGames.filter((game) => !game.live && !game.recent)
  const visibleRecentGames = filteredGames.filter((game) => game.recent)
  const leagues = useMemo(() => [...new Set([...liveGames, ...upcomingGames, ...recentGames]
    .map((game) => game.league)
    .filter(Boolean))].sort((a, b) => a.localeCompare(b)), [liveGames, recentGames, upcomingGames])
  const sportLabel = sport === 'football' ? 'Football' : 'Cricket'
  const scoreProvider = sport === 'football' ? 'football-data.org' : 'API-Cricket / Sportmonks'
  const sportIcon = sport === 'football' ? 'football' : 'cricket'
  const feedNotDeployed = /live score feed is not deployed yet/i.test(error)
  const returnHref = backHref || (user?.user_metadata?.account_type === 'venue_owner' ? '/owner' : '/dashboard')
  const navigation = [
    { href: returnHref, label: 'Home', icon: 'home' },
    { href: '/venues', label: 'Venues', icon: 'venue' },
    { href: '/favorite-venues', label: 'Favorite venues', icon: 'heart' },
    { href: '/events', label: 'Events', icon: 'calendar' },
    { href: '/teams', label: 'Teams', icon: 'teams' },
    { href: '/players', label: 'Players', icon: 'player' },
    { href: '/live-scores', label: 'Live scores', icon: 'chart', active: true },
    { href: '/messages', label: 'Messages', icon: 'message' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ]

  return (
    <main className={`scores-page${embedded ? ' scores-page-embedded' : ''}`}>
      {!embedded && <>
        <aside className={`scores-sidebar${sidebarOpen ? ' is-open' : ''}`}>
          <Brand light href={returnHref} />
          <span className="scores-sidebar-label">PLAYLINK</span>
          <nav aria-label="PlayLink navigation">
            {navigation.filter((item) => user || !['/favorite-venues', '/messages', '/settings'].includes(item.href)).map((item) => <Link key={`${item.href}-${item.label}`} to={item.href} className={item.active ? 'active' : ''} aria-current={item.active ? 'page' : undefined} onClick={() => setSidebarOpen(false)}>
              <span>{item.href === '/settings' ? <img src="/settings-icon.png" alt="" /> : <Icon name={item.icon} size={17} />}</span>{item.label}
            </Link>)}
            {returnHref === '/admin' && <Link to="/admin" onClick={() => setSidebarOpen(false)}><span><Icon name="shield-check" size={17} /></span>Admin overview</Link>}
          </nav>
          <div className="scores-sidebar-promo"><span>◎</span><b>Good games.<br />Great communities.</b><small>Connect, play, and meet new friends on PlayLink.</small></div>
          <small className="scores-sidebar-foot">PLAYLINK · LIVE SCORES</small>
        </aside>
        {sidebarOpen && <button className="scores-sidebar-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setSidebarOpen(false)} />}
      </>}
      <div className={`scores-workspace${embedded ? ' scores-workspace-embedded' : ''}`}>
      <div className={`scores-layout${embedded ? ' scores-layout-embedded' : ''}`}>
        <div className="scores-main">
          {!embedded && <section className="scores-hero">
            <button className="scores-menu-toggle" type="button" aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}><Icon name="menu" size={18} /></button>
            <span>LIVE SCORES</span>
            <h1>Cricket &amp; Football <b>Live Scores</b></h1>
            <p>Live matches and upcoming fixtures for the next 30 days, in one place.</p>
            <div className="scores-hero-switch">
              <button type="button" className={sport === 'cricket' ? 'active' : ''} onClick={() => { setSport('cricket'); setLeague('') }}><Icon name="cricket" size={17} /> Cricket</button>
              <button type="button" className={sport === 'football' ? 'active' : ''} onClick={() => { setSport('football'); setLeague('') }}><Icon name="football" size={17} /> Football</button>
            </div>
          </section>}
          {embedded && <header className="scores-embedded-heading"><span>LIVE SCORES</span><h1>Cricket &amp; Football <b>Live Scores</b></h1><p>Live matches and upcoming fixtures for the next 30 days.</p></header>}
          <section className="scores-filter-bar" aria-label="Filter matches">
            <div className="scores-status-filters">
              {[['all', 'All'], ['live', 'Live'], ['upcoming', 'Upcoming'], ['results', 'Results']].map(([value, label]) => <button key={value} type="button" className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === 'live' && <i />} {label}{value === 'live' && !loading && !error ? ` ${liveGames.length}` : value === 'results' && !loading && !error ? ` ${recentGames.length}` : ''}</button>)}
            </div>
            <label className="scores-league-select"><Icon name={sportIcon} size={16} /><select aria-label="Select league" value={league} onChange={(event) => setLeague(event.target.value)} disabled={loading || !leagues.length}><option value="">All {sportLabel} leagues</option>{leagues.map((item) => <option key={item} value={item}>{item}</option>)}</select><Icon name="chevron-down" size={13} /></label>
            <label className="scores-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search matches or leagues…" /><span>⌕</span></label>
            <button className="scores-refresh" type="button" onClick={refresh} disabled={loading} aria-label="Refresh scores"><Icon name="refresh" size={15} /></button>
          </section>
          {error
              ? feedNotDeployed
                ? <section className="scores-connection-state" role="alert">
                  <span><Icon name="chart" size={22} /></span>
                  <div><small>LIVE DATA CONNECTION</small><h2>Scores will appear here when the feed is connected</h2>
                    <p>The match list is empty because the <code>sportmonks-live-scores</code> Supabase Edge Function is not deployed to this app’s project yet. Cricket and football provider keys belong only in Supabase Function Secrets, never browser code.</p>
                    <p>Cricket and football are requested separately. Football match coverage depends on the competitions available to your football-data.org account.</p>
                    <button type="button" onClick={refresh}>Check connection again</button>
                  </div>
                </section>
                : <section className="scores-error" role="alert"><Icon name="info" size={19} /><div><b>{sportLabel} scores aren’t available</b><p>{error}</p></div><button type="button" onClick={refresh}>Retry</button></section>
              : loading
                ? <section className="scores-empty" role="status"><span className="scores-spinner" /><h2>Loading {sportLabel.toLowerCase()} fixtures…</h2><p>Checking live matches and upcoming fixtures.</p></section>
                : <>
                    {warning && <section className="scores-warning" role="status"><Icon name="info" size={17} /><p>{warning}</p></section>}
                    {(query.trim() || league) && filteredGames.length === 0
                      ? <section className="scores-empty"><span><Icon name="search" size={21} /></span><h2>No matches found</h2><p>Try a different team, league, or search term.</p></section>
                      : <>
                    {(status === 'all' || status === 'live') && <section className="scores-section">
                    <header><div><span className="scores-live-indicator" /><h2>Live Now</h2><small>{visibleLiveGames.length} {visibleLiveGames.length === 1 ? 'match' : 'matches'}</small></div><button type="button" onClick={() => setStatus('live')}>View all <Icon name="arrow-right" size={14} /></button></header>
                    {visibleLiveGames.length
                      ? <div className="scores-live-grid">{visibleLiveGames.map((game) => <MatchCard key={game.id} game={game} onOpen={openMatchDetails} />)}</div>
                      : <div className="scores-empty scores-section-empty"><span><Icon name={sportIcon} size={21} /></span><b>No live {sportLabel.toLowerCase()} matches right now</b><small>Live matches covered by your {scoreProvider} plan appear here.</small></div>}
                  </section>}
                  {(status === 'all' || status === 'upcoming') && <section className="scores-section">
                    <header><div><Icon name="calendar" size={18} /><h2>Upcoming Matches</h2><small>Next 30 days · {visibleUpcomingGames.length} {visibleUpcomingGames.length === 1 ? 'fixture' : 'fixtures'}</small></div><button type="button" onClick={() => setStatus('upcoming')}>View all <Icon name="arrow-right" size={14} /></button></header>
                    {visibleUpcomingGames.length
                      ? <div className="scores-upcoming-list">
                        <div className="scores-upcoming-labels"><span>Date &amp; Time</span><span>Tournament</span><span>Teams</span><span>Venue</span><span /></div>
                        {visibleUpcomingGames.map((game) => <MatchRow key={game.id} game={game} />)}
                      </div>
                      : <div className="scores-empty scores-section-empty"><span><Icon name="calendar" size={21} /></span><b>No upcoming matches in the next 30 days</b><small>Fixtures are limited to tournaments included in your {scoreProvider} plan. Nepal Premier League (NPL) appears when it is covered by this account.</small></div>}
                  </section>}
                  {(status === 'all' || status === 'results') && <section className="scores-section">
                    <header><div><Icon name="chart" size={18} /><h2>Recent Results</h2><small>Last 3 days · {visibleRecentGames.length} {visibleRecentGames.length === 1 ? 'match' : 'matches'}</small></div><button type="button" onClick={() => setStatus('results')}>View all <Icon name="arrow-right" size={14} /></button></header>
                    {visibleRecentGames.length
                      ? <div className="scores-results-grid">{visibleRecentGames.map((game) => <RecentResultCard key={game.id} game={game} onOpen={openMatchDetails} />)}</div>
                      : <div className="scores-empty scores-section-empty"><span><Icon name="chart" size={21} /></span><b>No completed matches in the last 3 days</b><small>Completed results from competitions covered by your {scoreProvider} plan will appear here.</small></div>}
                  </section>}
                    </>}
                </>}
          {updatedAt && !error && <p className="scores-updated">Scores checked {timeFormatter.format(updatedAt)} · {sport === 'cricket' ? 'CricketData current scores are cached for up to 20 minutes on the free plan' : 'Automatically refreshed about every 10 minutes to respect the provider request limit'}</p>}
        </div>
        <aside className="scores-aside">
          <section className="scores-side-panel">
            <header><Icon name="filter" size={16} /><h2>Quick Filters</h2></header>
            <div className="scores-side-sports">
              <button type="button" className={sport === 'cricket' ? 'active' : ''} onClick={() => { setSport('cricket'); setLeague('') }}><Icon name="cricket" size={15} />Cricket</button>
              <button type="button" className={sport === 'football' ? 'active' : ''} onClick={() => { setSport('football'); setLeague('') }}><Icon name="football" size={15} />Football</button>
            </div>
            {leagues.length
              ? leagues.map((name) => <button className="scores-side-link" key={name} type="button" onClick={() => setLeague(league === name ? '' : name)}><span><Icon name={sportIcon} size={16} /></span><b>{name}</b><Icon name={league === name ? 'check' : 'chevron-right'} size={15} /></button>)
              : <p className="scores-side-note">{loading ? `Loading covered ${sportLabel.toLowerCase()} leagues…` : error ? 'League filters appear when the score feed is available.' : 'No covered fixtures in the next 30 days.'}</p>}
          </section>
          <section className="scores-side-panel scores-plan-note">
            <span><Icon name="info" size={17} /></span><div><b>Covered competitions only</b><p>{scoreProvider} returns only leagues and matches included in the account’s plan.</p></div>
          </section>
        </aside>
      </div>
      </div>
      {selectedMatch && (selectedMatch.sport === 'cricket'
        ? <CricketMatchDetails
          game={selectedMatch}
          details={matchDetails}
          loading={matchDetailsLoading}
          error={matchDetailsError}
          onClose={closeMatchDetails}
          onRetry={openMatchDetails}
        />
        : <FootballMatchDetails
          game={selectedMatch}
          details={matchDetails}
          loading={matchDetailsLoading}
          error={matchDetailsError}
          sections={matchSections}
          sectionLoading={matchSectionLoading}
          sectionErrors={matchSectionErrors}
          onLoadSection={loadMatchSection}
          onClose={closeMatchDetails}
          onRetry={openMatchDetails}
        />)}
    </main>
  )
}
