import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'

const directionModes = [
  { id: 'driving', flag: 'd', label: 'Drive' },
  { id: 'walking', flag: 'w', label: 'Walk' },
  { id: 'bicycling', flag: 'r', label: 'Cycle' },
  { id: 'transit', flag: 'b', label: 'Transit' },
]

export default function VenueMap({ venues, selectedVenue, onSelect, userCoordinates, directionMode, onDirectionModeChange, onFindLocation, locationMessage }) {
  const [expanded, setExpanded] = useState(false)
  const hasSelectedCoordinates = selectedVenue?.coordinates?.length === 2
  const destination = selectedVenue ? `${selectedVenue.name}, ${selectedVenue.area}` : ''
  const mapQuery = hasSelectedCoordinates
    ? `${selectedVenue.coordinates[1]},${selectedVenue.coordinates[0]}`
    : destination || 'Kathmandu Valley, Nepal'
  const mapUrl = userCoordinates && selectedVenue
    ? `https://maps.google.com/maps?saddr=${userCoordinates.latitude},${userCoordinates.longitude}&daddr=${encodeURIComponent(hasSelectedCoordinates ? `${selectedVenue.coordinates[1]},${selectedVenue.coordinates[0]}` : destination)}&dirflg=${directionModes.find((mode) => mode.id === directionMode)?.flag || 'd'}&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=${selectedVenue ? 14 : 12}&output=embed`

  useEffect(() => {
    if (!expanded) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded])

  const mapPanel = (
    <section className={`map-panel google-map-panel${expanded ? ' is-expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? 'true' : undefined} aria-label={expanded ? 'Expanded venue map' : undefined}>
      <div className="map-panel-heading">
        <span className="map-pin-icon"><Icon name="map" size={16} /></span>
        <span><b>Google Maps</b><small>{selectedVenue ? selectedVenue.name : 'Explore Kathmandu Valley'}</small></span>
        <span className="map-provider-mark" aria-label="Google Maps"><Icon name="compass" size={16} /></span>
        <button className="map-size-toggle" type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Restore map to previous size' : 'Expand map to fullscreen'} title={expanded ? 'Restore map size' : 'Expand map'}>
          <Icon name={expanded ? 'collapse' : 'expand'} size={16} />
          <span>{expanded ? 'Restore size' : 'Expand map'}</span>
        </button>
      </div>
      <iframe className="venue-map-canvas" title={selectedVenue ? `Google Map showing ${selectedVenue.name}` : 'Google Map of Kathmandu Valley'} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      {venues.length > 0 && <div className="google-map-venue-list" aria-label="Choose a venue to center on the map">
        {venues.map((venue) => <button key={venue.id} type="button" className={selectedVenue?.id === venue.id ? 'active' : ''} onClick={() => onSelect(venue)}><Icon name="pin" size={13} />{venue.name}</button>)}
      </div>}
      {selectedVenue && <section className="venue-directions-panel" aria-label={`Directions to ${selectedVenue.name}`}>
        <div className="venue-directions-heading"><span><Icon name="compass" size={15} /></span><div><b>Directions to {selectedVenue.name}</b><small>{selectedVenue.area}</small></div></div>
        {userCoordinates
          ? <div className="venue-direction-modes" aria-label="Travel mode">
            {directionModes.map((mode) => <button key={mode.id} type="button" className={directionMode === mode.id ? 'active' : ''} aria-pressed={directionMode === mode.id} onClick={() => onDirectionModeChange(mode.id)}>{mode.label}</button>)}
          </div>
          : <button type="button" className="venue-use-location" onClick={onFindLocation}>Show directions here using my location</button>}
        {locationMessage && <p className="venue-directions-message" role="status">{locationMessage}</p>}
      </section>}
      <div className="map-legend"><span>{selectedVenue?.isOwnerListing ? 'Location from venue owner' : 'Map locations are examples'}</span><span>{selectedVenue?.isOwnerListing ? 'Confirm details with the venue' : 'Venue listings are not verified'}</span></div>
    </section>
  )

  if (!expanded) return mapPanel
  return createPortal(
    <>
      <button className="map-screen-backdrop" type="button" aria-label="Close expanded map" onClick={() => setExpanded(false)} />
      {mapPanel}
    </>,
    document.body,
  )
}
