import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import InlineDirectionsMap from './InlineDirectionsMap.jsx'

export default function VenueMap({ venues, selectedVenue, onSelect, userCoordinates, onFindLocation, locationMessage }) {
  const [expanded, setExpanded] = useState(false)
  const origin = userCoordinates ? [userCoordinates.longitude, userCoordinates.latitude] : null

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
        <span><b>PlayLink Map</b><small>{selectedVenue ? selectedVenue.name : 'Explore Kathmandu Valley'}</small></span>
        <span className="map-provider-mark" aria-label="OpenStreetMap"><Icon name="compass" size={16} /></span>
        <button className="map-size-toggle" type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Restore map to previous size' : 'Expand map to fullscreen'} title={expanded ? 'Restore map size' : 'Expand map'}>
          <Icon name={expanded ? 'collapse' : 'expand'} size={16} />
          <span>{expanded ? 'Restore size' : 'Expand map'}</span>
        </button>
      </div>
      <InlineDirectionsMap
        className="venue-map-canvas"
        venues={venues}
        selectedVenue={selectedVenue}
        origin={origin}
        onSelect={onSelect}
      />
      {venues.length > 0 && <div className="google-map-venue-list" aria-label="Choose a venue to center on the map">
        {venues.map((venue) => <button key={venue.id} type="button" className={selectedVenue?.id === venue.id ? 'active' : ''} onClick={() => onSelect(venue)}><Icon name="pin" size={13} />{venue.name}</button>)}
      </div>}
      {selectedVenue && <section className="venue-directions-panel" aria-label={`Directions to ${selectedVenue.name}`}>
        <div className="venue-directions-heading"><span><Icon name="compass" size={15} /></span><div><b>Directions to {selectedVenue.name}</b><small>{selectedVenue.area}</small></div></div>
        {userCoordinates
          ? <p className="venue-directions-message">Your driving route is drawn on this page. Your current location is sent to OpenStreetMap routing to calculate it.</p>
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
