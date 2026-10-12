import { relationData } from '../hooks/useSportmonksCricketScores.js'

function teamImage(value) {
  const team = relationData(value)[0]
  if (!team) return ''
  const candidates = [
    team.crest,
    team.logo,
    team.image_path,
    team.imagePath,
    team.imgUrl,
    team.imgURL,
    team.image,
    team.flag,
    team.flagUrl,
    team.flag_url,
    team.country_flag,
  ]
  const image = candidates.find((candidate) => typeof candidate === 'string' && candidate.startsWith('https://'))
  return image || ''
}

function teamInitials(value) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '—'
}

export default function TeamCrest({ team, name }) {
  const image = teamImage(team)
  if (!image) return <i className="scores-team-initials">{teamInitials(name)}</i>
  return (
    <span className="scores-team-crest">
      <i>{teamInitials(name)}</i>
      <img src={image} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />
    </span>
  )
}
