import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import InlineDirectionsMap from '../components/InlineDirectionsMap.jsx'
import { supabase } from '../auth/supabase.js'
import { venueDirectory } from '../data/venueDirectory.js'
import { getVenueImage } from '../data/venueImages.js'
import usePlayLinkSports from '../hooks/usePlayLinkSports.js'
import './nearbyVenues.css'

const travelModes = [
  { id: 'walking', label: 'Walk', icon: 'walk', speedKmh: 4.5, extraMinutes: 0 },
  { id: 'bicycling', label: 'Cycle', icon: 'bike', speedKmh: 13, extraMinutes: 0 },
  { id: 'transit', label: 'Bus / transit', icon: 'bus', speedKmh: 16, extraMinutes: 10 },
  { id: 'driving', label: 'Bike / car', icon: 'car', speedKmh: 22, extraMinutes: 5 },
]

function distanceBetween(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180
  const [firstLng, firstLat] = first
  const [secondLng, secondLat] = second
  const latitudeDelta = radians(secondLat - firstLat)
  const longitudeDelta = radians(secondLng - firstLng)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(firstLat)) * Math.cos(radians(secondLat)) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function estimateMinutes(distance, mode) {
  return Math.max(1, Math.round(distance / mode.speedKmh * 60 + mode.extraMinutes))
}

const suggestedVenues = venueDirectory.map((venue, index) => ({
  ...venue,
  id: `suggested-${venue.sport.toLowerCase()}-${index + 1}`,
  area: `${venue.address}${venue.district ? ` · ${venue.district}` : ''}`,
  coordinates: null,
  isSuggested: true,
}))

export default function NearbyVenues() {
  const { sports: sportOptions, error: sportsError } = usePlayLinkSports()
  const [search, setSearch] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [locating, setLocating] = useState(false)
  const [sport, setSport] = useState('Any sport')
  const [selectedId, setSelectedId] = useState(null)
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    async function loadVenues() {
      setLoadError('')
      if (!supabase) {
        setLoadError('Live owner-listed venues are unavailable. You can still browse the suggested Kathmandu Valley directory below.')
        setVenues([])
        setLoading(false)
        return
      }
      try {
        const { data, error } = await supabase.from('owner_venues').select('id, name, sport, area, address, price_per_hour, latitude, longitude, image_url, maps_url')
          .eq('is_active', true).order('created_at', { ascending: false })
        if (error) throw error
        if (active) setVenues((data || []).map((venue) => {
          const hasCoordinates = venue.latitude !== null && venue.latitude !== undefined && venue.latitude !== ''
            && venue.longitude !== null && venue.longitude !== undefined && venue.longitude !== ''
          const latitude = hasCoordinates ? Number(venue.latitude) : NaN
          const longitude = hasCoordinates ? Number(venue.longitude) : NaN
          return {
            ...venue,
            coordinates: Number.isFinite(latitude) && Number.isFinite(longitude)
              ? [longitude, latitude]
              : null,
          }
        }))
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Active venue listings could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadVenues()
    return () => { active = false }
  }, [])

  const allVenues = useMemo(() => [
    ...venues.map((venue) => ({
      ...venue,
      isSuggested: false,
      mapsDestination: `${venue.name}, ${venue.address || venue.area}, Nepal`,
    })),
    ...suggestedVenues,
  ], [venues])

  const nearby = useMemo(() => allVenues
    .filter((venue) => sport === 'Any sport' || venue.sport === sport || venue.sport === 'Both')
    .filter((venue) => !search.trim() || `${venue.name} ${venue.area} ${venue.district || ''} ${venue.sport}`.toLowerCase().includes(search.trim().toLowerCase()))
    .map((venue) => ({
      ...venue,
      distanceKm: userLocation && venue.coordinates ? distanceBetween(userLocation, venue.coordinates) : null,
    }))
    .sort((first, second) => userLocation
      ? (first.distanceKm ?? Infinity) - (second.distanceKm ?? Infinity)
      : first.name.localeCompare(second.name)), [search, sport, userLocation, allVenues])

  const selectedVenue = nearby.find((venue) => venue.id === selectedId) || nearby[0]
  function useMyLocation() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('This browser does not support location. You can still browse venues.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation([coords.longitude, coords.latitude])
        setLocating(false)
      },
      (error) => {
        const messages = {
          1: 'Location permission was denied. Allow location access in your browser settings and try again.',
          2: 'Your current location could not be determined. Try again or browse without location.',
          3: 'Location lookup timed out. Try again when your connection is stable.',
        }
        setLocationError(messages[error.code] || 'Location could not be read. Try again.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  return (
    <DashboardShell path="/nearby" search={search} onSearch={setSearch}>
      <div className="nearby-venues-page">
        <div className="nearby-page-heading">
          <Link className="nearby-back-link" to="/dashboard">← Dashboard</Link>
          <span className="dashboard-kicker">FIND YOUR NEXT GROUND</span>
          <h1>Nearby Venues</h1>
          <p>Find local sports venues, compare their distance, and open turn-by-turn directions.</p>
        </div>

        <section className="nearby-location-panel">
          <span className="nearby-location-icon"><Icon name="pin" size={23} /></span>
          <div className="nearby-location-copy"><b>{userLocation ? 'Location found' : 'Find venues closest to you'}</b><small>{userLocation ? 'Your location is used in this browser session. Directions are displayed on the PlayLink map.' : 'Share your current location to sort owner-listed venues and display driving directions on the PlayLink map.'}</small></div>
          <button className="button button-primary nearby-location-button" type="button" onClick={useMyLocation} disabled={locating}><Icon name="compass" size={17} />{locating ? 'Finding you…' : userLocation ? 'Refresh location' : 'Use my location'}</button>
        </section>
        {locationError && <p className="nearby-location-error" role="alert">{locationError}</p>}
        {(loadError || sportsError) && <p className="nearby-location-error" role="alert">{loadError || sportsError}</p>}

        <div className="nearby-controls">
          <label><span><Icon name="search" size={16} /></span><input aria-label="Search venues" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search grounds or areas" /></label>
          <label><small>Sport</small><select value={sport} onChange={(event) => setSport(event.target.value)}><option>Any sport</option>{sportOptions.map((item) => <option key={item.slug}>{item.name}</option>)}</select></label>
          <span className="nearby-sort-note"><Icon name="map" size={16} />{userLocation ? 'Owner-listed places sorted by distance' : `${suggestedVenues.length} suggested Valley places`}</span>
        </div>

        <div className="nearby-content-grid">
          <section className="nearby-list" aria-label="Nearby venues">
            <div className="nearby-list-heading"><h2>{userLocation ? 'Closest grounds & suggestions' : 'Suggested places to play'}</h2><span>{nearby.length} venues</span></div>
            {loading && !nearby.length ? <div className="nearby-empty" role="status">Loading owner-listed venues…</div> : nearby.length ? nearby.map((venue) => <article className={`nearby-venue-card${selectedVenue?.id === venue.id ? ' selected' : ''}`} key={venue.id}>
              <button className="nearby-venue-title" type="button" onClick={() => setSelectedId(venue.id)} aria-label={`Show ${venue.name} on the PlayLink map`}>
                {venue.name}<Icon name="arrow-right" size={13} />
              </button>
              <button className="nearby-venue-select" type="button" onClick={() => setSelectedId(venue.id)} aria-pressed={selectedVenue?.id === venue.id}>
                {/* Show owner image when available, otherwise pick a sport-specific default thumbnail */}
                <img src={getVenueImage(venue)} alt={`${venue.sport} — ${venue.name}`} />
                <span className="nearby-venue-info"><small><Icon name="pin" size={13} />{venue.area}</small><span className="nearby-venue-tags"><i>{venue.sport}</i><i>{venue.isSuggested ? 'Suggested · check details' : `Rs ${Number(venue.price_per_hour || 0).toLocaleString()}/hr`}</i></span></span>
                <span className="nearby-distance">{venue.distanceKm === null ? '—' : `${venue.distanceKm.toFixed(1)} km`}</span>
              </button>
              {!venue.isSuggested && userLocation && venue.coordinates && <div className="nearby-travel-estimates">
                {travelModes.map((mode) => <button className="nearby-travel-mode" key={mode.id} type="button" onClick={() => setSelectedId(venue.id)} aria-label={`Show ${mode.label} estimate to ${venue.name} on this page`}>
                  <Icon name={mode.icon} size={16} /><span>{mode.label}<b>~{estimateMinutes(venue.distanceKm, mode)} min</b></span>
                </button>)}
              </div>}
            </article>) : <div className="nearby-empty"><Icon name="venue" size={24} /><b>{venues.length ? 'No grounds match that search.' : 'No active venues yet.'}</b><span>{venues.length ? 'Try another area, name, or sport.' : 'Venue owners’ published listings will appear here.'}</span></div>}
            {userLocation && <p className="nearby-estimate-note">Only owner-listed venues with coordinates can be sorted by distance. Travel-time estimates are approximate; the driving route is drawn on the map for the selected venue.</p>}
          </section>

          <aside className="nearby-map-column">
            <section className="nearby-map-panel">
              <div className="nearby-map-heading"><span><Icon name="map" size={19} /></span><div><b>PlayLink Map</b><small>{selectedVenue?.name || 'Venue area'}</small></div></div>
              {selectedVenue ? <InlineDirectionsMap key={selectedVenue.id} className="nearby-inline-map" selectedVenue={selectedVenue} origin={userLocation} /> : <div className="nearby-empty">Select a place to show it on the map.</div>}
              <p>{selectedVenue?.isSuggested ? 'Suggested location; confirm the venue is open before visiting. Driving directions are shown in Google Maps.' : 'Venue and location details are provided by the owner. Google Maps receives your location only when you request directions.'}</p>
            </section>
            {selectedVenue && <section className="nearby-directions-panel"><span className="eyebrow">{selectedVenue.isSuggested ? 'SUGGESTED PLACE' : 'SELECTED DESTINATION'}</span><h2>{selectedVenue.name}</h2><p>{selectedVenue.area} · {selectedVenue.sport}</p><p>{userLocation ? 'Google Maps is showing your driving route above.' : 'Use your location to see a route in Google Maps.'}</p>{!userLocation && <button className="button button-primary nearby-open-directions" type="button" onClick={useMyLocation} disabled={locating}><Icon name="compass" size={15} />{locating ? 'Finding your location…' : 'Show directions on this page'}</button>}</section>}
          </aside>
        </div>
      </div>
    </DashboardShell>
  )
}
