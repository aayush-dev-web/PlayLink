function isCoordinates(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
}

function pointQuery(coordinates) {
  return `${coordinates[1]},${coordinates[0]}`
}

export default function InlineDirectionsMap({
  selectedVenue,
  origin,
  className = '',
  statusMessage = '',
}) {
  const hasOrigin = isCoordinates(origin)
  const destination = selectedVenue?.coordinates
  const hasDestinationCoordinates = isCoordinates(destination)
  const venueAddress = selectedVenue?.address || ''
  const venueArea = selectedVenue?.area || ''
  const destinationQuery = [
    selectedVenue?.name,
    venueAddress,
    venueArea && !venueAddress.toLowerCase().includes(venueArea.toLowerCase()) ? venueArea : '',
    'Nepal',
  ].filter(Boolean).join(', ')
  const destinationPoint = hasDestinationCoordinates ? pointQuery(destination) : destinationQuery

  const mapUrl = new URL('https://www.google.com/maps')
  mapUrl.searchParams.set('output', 'embed')
  if (selectedVenue && hasOrigin) {
    mapUrl.searchParams.set('saddr', pointQuery(origin))
    mapUrl.searchParams.set('daddr', destinationPoint)
  } else {
    const query = selectedVenue
      ? destinationPoint
      : hasOrigin ? pointQuery(origin) : 'Kathmandu, Nepal'
    mapUrl.searchParams.set('q', query)
    mapUrl.searchParams.set('z', selectedVenue || hasOrigin ? '14' : '11')
  }

  const title = selectedVenue && hasOrigin
    ? `Directions to ${selectedVenue.name}`
    : selectedVenue
      ? `Map location for ${selectedVenue.name}`
      : hasOrigin ? 'Map centered on your location' : 'Map centered on Kathmandu'
  const message = statusMessage || (selectedVenue && hasOrigin
    ? 'Directions are displayed on the map above.'
    : selectedVenue
      ? 'Share your location to see directions to this venue on the map.'
      : hasOrigin
        ? 'Your location is shown on the map.'
        : 'Select a venue to show its location on the map.')

  return (
    <div className={`inline-directions-map ${className}`.trim()}>
      <iframe
        className="inline-directions-map-canvas"
        title={title}
        src={mapUrl.href}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <p className="inline-directions-map-status" role="status">
        {message}
      </p>
    </div>
  )
}
