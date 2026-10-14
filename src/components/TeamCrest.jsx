import { useState } from 'react'
import { relationData } from '../hooks/useSportmonksCricketScores.js'

const countryAliases = {
  AFG: ['afghanistan'],
  AUS: ['australia', 'adelaide strikers', 'brisbane heat', 'hobart hurricanes', 'melbourne renegades', 'melbourne stars', 'perth scorchers', 'sydney sixers', 'sydney thunder', 'south australia', 'victoria', 'western australia', 'tasmania'],
  BAN: ['bangladesh'],
  BHR: ['bahrain'],
  BHU: ['bhutan'],
  CAM: ['cambodia'],
  CAN: ['canada'],
  CZE: ['czech republic', 'czechia'],
  DEN: ['denmark'],
  ENG: ['england', 'warwickshire', 'surrey', 'yorkshire', 'lancashire', 'kent', 'essex', 'middlesex', 'hampshire', 'somerset', 'nottinghamshire', 'derbyshire', 'glamorgan', 'gloucestershire', 'worcestershire', 'durham', 'sussex', 'leicestershire', 'northamptonshire'],
  FIJ: ['fiji'],
  FRA: ['france'],
  GGY: ['guernsey'],
  GHA: ['ghana'],
  GIB: ['gibraltar'],
  GRC: ['greece'],
  HUN: ['hungary'],
  IND: ['india', 'mumbai indians', 'chennai super kings', 'royal challengers bengaluru', 'royal challengers bangalore', 'kolkata knight riders', 'rajasthan royals', 'delhi capitals', 'punjab kings', 'sunrisers hyderabad', 'gujarat titans', 'lucknow super giants'],
  IRE: ['ireland'],
  ITA: ['italy'],
  JEY: ['jersey'],
  JPN: ['japan'],
  KEN: ['kenya'],
  KWT: ['kuwait'],
  MAL: ['maldives'],
  MAS: ['malaysia'],
  MOZ: ['mozambique'],
  NAM: ['namibia'],
  NEP: ['nepal', 'kathmandu', 'pokhara', 'biratnagar', 'janakpur', 'chitwan', 'lumbini', 'karnali', 'sudurpaschim'],
  NED: ['netherlands'],
  NGA: ['nigeria'],
  NZL: ['new zealand', 'auckland', 'canterbury', 'central districts', 'northern districts', 'otago', 'wellington'],
  OMN: ['oman'],
  PAK: ['pakistan'],
  PNG: ['papua new guinea'],
  PHI: ['philippines'],
  POL: ['poland'],
  SCO: ['scotland'],
  RWA: ['rwanda'],
  RSA: ['south africa', 'cape town', 'durban', 'johannesburg', 'pretoria', 'paarl', 'bloemfontein', 'benoni', 'nelspruit'],
  SLK: ['sri lanka'],
  SPA: ['spain'],
  SWE: ['sweden'],
  SWZ: ['eswatini', 'swaziland'],
  TAN: ['tanzania'],
  THA: ['thailand'],
  TUR: ['turkey', 'türkiye'],
  UAE: ['united arab emirates', 'uae'],
  UGA: ['uganda'],
  USA: ['united states', 'usa'],
  VAN: ['vanuatu'],
  WI: ['west indies'],
  ZWE: ['zimbabwe'],
  HKG: ['hong kong'],
  GER: ['germany'],
  QAT: ['qatar'],
  SAU: ['saudi arabia'],
  SIN: ['singapore'],
}

const countryIsoCodes = {
  AFG: 'af', AUS: 'au', BAN: 'bd', BHR: 'bh', BHU: 'bt', CAM: 'kh', CAN: 'ca',
  CZE: 'cz', DEN: 'dk', ENG: 'gb-eng', FIJ: 'fj', FRA: 'fr', GGY: 'gg', GHA: 'gh',
  GIB: 'gi', GRC: 'gr', HUN: 'hu', IND: 'in', IRE: 'ie', ITA: 'it', JEY: 'je',
  JPN: 'jp', KEN: 'ke', KWT: 'kw', MAL: 'mv', MAS: 'my', MOZ: 'mz', NAM: 'na',
  NEP: 'np', NED: 'nl', NGA: 'ng', NZL: 'nz', OMN: 'om', PAK: 'pk', PNG: 'pg',
  PHI: 'ph', POL: 'pl', SCO: 'gb-sct', RWA: 'rw', RSA: 'za', SLK: 'lk', SPA: 'es',
  SWE: 'se', SWZ: 'sz', TAN: 'tz', THA: 'th', TUR: 'tr', UAE: 'ae', UGA: 'ug',
  USA: 'us', VAN: 'vu', WI: 'jm', ZWE: 'zw', HKG: 'hk', GER: 'de', QAT: 'qa',
  SAU: 'sa', SIN: 'sg',
}

function teamImages(value, name) {
  const team = relationData(value)[0] || {}
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
  ].filter((candidate) => typeof candidate === 'string' && candidate.startsWith('https://'))
  const countryValue = team.country_code || team.countryCode || team.country || team.country_name || team.countryName
  const country = typeof countryValue === 'object' && countryValue
    ? countryValue.name || countryValue.code || countryValue.iso
    : countryValue
  const countryText = typeof country === 'string' ? country.trim().toLowerCase() : ''
  const countryCode = Object.entries(countryAliases).find(([code, aliases]) => {
    const iso = countryIsoCodes[code]
    return countryText === code.toLowerCase()
      || countryText === iso
      || aliases.some((alias) => countryText === alias || countryText.includes(alias))
  })?.[0] || Object.entries(countryAliases).find(([, aliases]) => aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(name)
  }))?.[0]
  const flagCode = countryCode ? countryIsoCodes[countryCode] : ''
  if (flagCode) candidates.push(`https://flagcdn.com/w40/${flagCode}.png`)
  return [...new Set(candidates)]
}

function teamInitials(value) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '—'
}

export default function TeamCrest({ team, name }) {
  const images = teamImages(team, name)
  const [failedImages, setFailedImages] = useState([])
  const image = images.find((candidate) => !failedImages.includes(candidate))
  if (!image) return <i className="scores-team-initials">{teamInitials(name)}</i>
  return (
    <span className="scores-team-crest">
      <i>{teamInitials(name)}</i>
      <img src={image} alt="" loading="lazy" onError={() => setFailedImages((failed) => [...failed, image])} />
    </span>
  )
}
