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

  const openMapUrl = new URL(`https://www.google.com/maps/${selectedVenue && hasOrigin ? 'dir' : 'search'}/`)
  openMapUrl.searchParams.set('api', '1')
  if (selectedVenue && hasOrigin) {
    openMapUrl.searchParams.set('origin', pointQuery(origin))
    openMapUrl.searchParams.set('destination', destinationPoint)
  } else {
    openMapUrl.searchParams.set('query', selectedVenue ? destinationPoint : hasOrigin ? pointQuery(origin) : 'Kathmandu, Nepal')
  }

  const title = selectedVenue && hasOrigin
    ? `Google Maps directions to ${selectedVenue.name}`
    : selectedVenue
      ? `Google Maps location for ${selectedVenue.name}`
      : hasOrigin ? 'Google Maps centered on your location' : 'Google Maps centered on Kathmandu'
  const message = statusMessage || (selectedVenue && hasOrigin
    ? 'Google Maps is showing driving directions from your shared location.'
    : selectedVenue
      ? 'Select “Show directions here using my location” to include your current position.'
      : hasOrigin
        ? 'Your location is displayed on Google Maps.'
        : 'Select a venue to center Google Maps on its location.')

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
        {message} <a href={openMapUrl.href} target="_blank" rel="noreferrer">Open in Google Maps</a>
      </p>
    </div>
  )
}
