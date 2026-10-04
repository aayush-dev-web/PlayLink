const coordinatePattern = /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/

export function isCoordinateLabel(value) {
  return typeof value === 'string' && coordinatePattern.test(value)
}

export function visibleLocationName(value, fallback = 'Current location') {
  if (typeof value !== 'string' || !value.trim() || isCoordinateLabel(value)) return fallback
  return value.trim()
}

export async function reverseGeocodeLocation(latitude, longitude) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(latitude),
    lon: String(longitude),
    zoom: '10',
    addressdetails: '1',
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: { 'Accept-Language': 'en' },
  })
  if (!response.ok) throw new Error('Location name lookup failed.')
  const result = await response.json()
  const address = result.address || {}
  const locality = address.city || address.town || address.village || address.municipality || address.county || address.state_district
  const region = address.state
  const country = address.country
  const name = [locality, region, country].filter((part, index, parts) => part && parts.indexOf(part) === index).join(', ')
  if (!name) throw new Error('No place name was found for this location.')
  return name
}
