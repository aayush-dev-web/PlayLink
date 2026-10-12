import Icon from './Icon.jsx'
import TeamCrest from './TeamCrest.jsx'
import useSportmonksCricketScores, { gameInnings, teamName } from '../hooks/useSportmonksCricketScores.js'

function formatUpdatedAt(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : `Updated ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function LiveCricketScores({ variant = 'player' }) {
  const { games, error, loading, updatedAt, refresh } = useSportmonksCricketScores()

  return (
    <section className={`live-cricket-panel live-cricket-panel-${variant}`} aria-labelledby={`live-cricket-title-${variant}`}>
      <header className="live-cricket-heading">
        <div>
          <span className="live-cricket-eyebrow"><i /> CRICKET DATA · LIVE</span>
          <h2 id={`live-cricket-title-${variant}`}>Live scores</h2>
        </div>
        <span className="live-cricket-actions"><a href="/live-scores">View all</a><button type="button" onClick={refresh} disabled={loading} aria-label="Refresh live cricket scores"><Icon name="refresh" size={14} /></button></span>
      </header>
      {error
        ? <p className="live-cricket-message is-error" role="alert">{error}</p>
        : loading
          ? <p className="live-cricket-message" role="status">Loading live cricket scores…</p>
          : games.filter((game) => game.live).length
            ? <div className="live-cricket-list">
              {games.filter((game) => game.live).slice(0, 3).map((game) => {
                const home = teamName(game.localteam)
                const away = teamName(game.visitorteam)
                const innings = gameInnings(game)
                return <article className="live-cricket-game" key={game.id}>
                  <div className="live-cricket-game-heading">
                    <b>{game.league || game.round || 'Cricket'}</b>
                    <span>{game.status || 'Live'}</span>
                  </div>
                  <div className="live-cricket-teams">
                    <b><TeamCrest team={game.localteam} name={home || 'Home team'} />{home || 'Home team'}</b>
                    <span>vs</span>
                    <b><TeamCrest team={game.visitorteam} name={away || 'Away team'} />{away || 'Away team'}</b>
                  </div>
                  {innings.length > 0 && <div className="live-cricket-innings">
                    {innings.map((inning) => <span key={inning.id}>{inning.team || 'Innings'} <b>{inning.score}</b></span>)}
                  </div>}
                </article>
              })}
            </div>
            : <p className="live-cricket-message">No cricket matches are live right now.</p>}
      {updatedAt && !error && <p className="live-cricket-updated">{formatUpdatedAt(updatedAt.toISOString())} · cached up to 20 minutes on the free plan</p>}
    </section>
  )
}
