import { useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'

const defaultCenter = [85.324, 27.7172]
const routeSourceId = 'playlink-directions'
const routeLayerId = 'playlink-directions-line'
const locationCache = new Map()

function isCoordinates(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
}

export default function InlineDirectionsMap({ venues = [], selectedVenue, origin, onSelect, className = '', statusMessage = '' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const maplibreRef = useRef(null)
  const markersRef = useRef([])
  const [routeMessage, setRouteMessage] = useState('')
  const [locationMessage, setLocationMessage] = useState('')
  const [resolvedDestination, setResolvedDestination] = useState(null)
  const [mapReady, setMapReady] = useState(false)

  const destination = isCoordinates(selectedVenue?.coordinates) ? selectedVenue.coordinates : resolvedDestination
  const routeCoordinates = useMemo(
    () => isCoordinates(origin) && isCoordinates(destination) ? [origin, destination] : null,
    [origin, destination],
  )

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setResolvedDestination(null)
    setLocationMessage('')
    if (!selectedVenue || isCoordinates(selectedVenue.coordinates)) return () => { active = false }
    const address = [selectedVenue.name, selectedVenue.address, selectedVenue.area, 'Nepal'].filter(Boolean).join(', ')
    const cacheKey = address.toLowerCase()
    if (locationCache.has(cacheKey)) {
      const cachedCoordinates = locationCache.get(cacheKey)
      if (cachedCoordinates) setResolvedDestination(cachedCoordinates)
      else setLocationMessage('This place could not be located on the map.')
      return () => { active = false }
    }
    const query = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'np', q: address })
    setLocationMessage('Locating this place on the map…')
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Location search returned ${response.status}.`)
        const results = await response.json()
        if (!active) return
        const match = results[0]
        const coordinates = match ? [Number(match.lon), Number(match.lat)] : null
        if (isCoordinates(coordinates)) {
          locationCache.set(cacheKey, coordinates)
          setLocationMessage('')
          setResolvedDestination(coordinates)
        } else {
          locationCache.set(cacheKey, null)
          setLocationMessage('This place could not be located on the map.')
        }
      } catch (locationError) {
        if (active && locationError.name !== 'AbortError') {
          setLocationMessage(locationError instanceof Error ? locationError.message : 'This place could not be located on the map.')
        }
      }
    }, 1100)
    return () => {
      active = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [selectedVenue])

  useEffect(() => {
    let active = true
    let map
    import('maplibre-gl').then((maplibre) => {
      if (!active || !containerRef.current) return
      maplibreRef.current = maplibre
      map = new maplibre.Map({
        container: containerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: defaultCenter,
        zoom: 11,
        attributionControl: true,
      })
      map.addControl(new maplibre.NavigationControl(), 'top-right')
      mapRef.current = map
      setMapReady(true)
    }).catch((mapError) => {
      if (active) setRouteMessage(mapError instanceof Error ? mapError.message : 'The map could not be loaded.')
    })
    return () => {
      active = false
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map?.remove()
      mapRef.current = null
      maplibreRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const maplibre = maplibreRef.current
    if (!map || !maplibre || !mapReady) return undefined
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    venues.filter((venue) => isCoordinates(venue.coordinates)).forEach((venue) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = `venue-map-marker${venue.id === selectedVenue?.id ? ' is-selected' : ''}`
      element.setAttribute('aria-label', `Show ${venue.name} on the map`)
      element.textContent = 'P'
      element.addEventListener('click', () => onSelect?.(venue))
      markersRef.current.push(new maplibre.Marker({ element, anchor: 'bottom' }).setLngLat(venue.coordinates).addTo(map))
    })
    if (isCoordinates(destination) && !isCoordinates(selectedVenue?.coordinates)) {
      const element = document.createElement('span')
      element.className = 'venue-map-destination-marker'
      element.setAttribute('aria-label', selectedVenue?.name || 'Selected destination')
      markersRef.current.push(new maplibre.Marker({ element, anchor: 'bottom' }).setLngLat(destination).addTo(map))
    }

    if (isCoordinates(origin)) {
      const element = document.createElement('span')
      element.className = 'venue-map-origin-marker'
      element.setAttribute('aria-label', 'Your current location')
      markersRef.current.push(new maplibre.Marker({ element, anchor: 'center' }).setLngLat(origin).addTo(map))
    }

    const focus = isCoordinates(destination) ? destination : isCoordinates(origin) ? origin : defaultCenter
    map.flyTo({ center: focus, zoom: isCoordinates(destination) || isCoordinates(origin) ? 13 : 11, essential: true })
    return undefined
  }, [venues, selectedVenue, destination, origin, onSelect, mapReady])

  useEffect(() => {
    const map = mapRef.current
    const maplibre = maplibreRef.current
    if (!map || !maplibre || !mapReady) return undefined

    let active = true
    const controller = new AbortController()
    const clearRoute = () => {
      if (map.getSource(routeSourceId)) {
        map.getSource(routeSourceId).setData({ type: 'FeatureCollection', features: [] })
      }
    }

    if (!routeCoordinates) {
      clearRoute()
      setRouteMessage(selectedVenue
        ? isCoordinates(destination) ? 'Use your location to show a route on this map.' : locationMessage || 'Locating this place on the map…'
        : 'Select a venue to show its route here.')
      return () => controller.abort()
    }

    clearRoute()
    setRouteMessage('Finding a driving route…')
    const [start, end] = routeCoordinates
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`

    async function loadRoute() {
      try {
        const response = await fetch(routeUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`Routing service returned ${response.status}.`)
        const result = await response.json()
        if (result.code !== 'Ok' || !result.routes?.[0]?.geometry) {
          throw new Error('No driving route was found between your location and this venue.')
        }
        if (!active) return
        const feature = {
          type: 'Feature',
          properties: {},
          geometry: result.routes[0].geometry,
        }
        const drawRoute = () => {
          if (!active || !map.isStyleLoaded()) return
          const source = map.getSource(routeSourceId)
          if (source) source.setData({ type: 'FeatureCollection', features: [feature] })
          else {
            map.addSource(routeSourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [feature] } })
            map.addLayer({
              id: routeLayerId,
              type: 'line',
              source: routeSourceId,
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': '#12834a', 'line-width': 5, 'line-opacity': 0.9 },
            })
          }
          const bounds = new maplibre.LngLatBounds(start, start).extend(end)
          map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 500 })
        }
        if (map.isStyleLoaded()) drawRoute()
        else map.once('load', drawRoute)
        const kilometers = (result.routes[0].distance / 1000).toFixed(1)
        const minutes = Math.max(1, Math.round(result.routes[0].duration / 60))
        setRouteMessage(`Driving route · ${kilometers} km · about ${minutes} min`)
      } catch (routeError) {
        if (!active || routeError.name === 'AbortError') return
        setRouteMessage(routeError instanceof Error ? routeError.message : 'A route could not be loaded.')
      }
    }

    const timeoutId = window.setTimeout(loadRoute, 350)
    return () => {
      active = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [routeCoordinates, destination, selectedVenue, locationMessage, mapReady])

  return (
    <div className={`inline-directions-map ${className}`.trim()}>
      <div ref={containerRef} className="inline-directions-map-canvas" role="application" aria-label="Interactive PlayLink map with directions" />
      <p className="inline-directions-map-status" role="status">{statusMessage && !selectedVenue ? statusMessage : routeMessage}</p>
    </div>
  )
}
