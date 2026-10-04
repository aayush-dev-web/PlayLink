const ownerUserId = 'playlink-local-demo-owner'
const ownerStorageKey = `playlink-owner-workspace-${ownerUserId}`

export const demoOwnerVenue = {
  id: 'local-venue-the-arena',
  owner_id: ownerUserId,
  name: 'The Arena',
  sport: 'Both',
  area: 'Thamel, Kathmandu',
  address: 'Thamel, Kathmandu, Nepal',
  description: 'A friendly futsal and cricket facility with quality playing surfaces and evening lights.',
  price_per_hour: 2500,
  image_url: '/sports/fut1.png',
  maps_url: '',
  latitude: 27.7152,
  longitude: 85.3128,
  is_active: true,
}

export function readDemoOwnerWorkspace() {
  const stored = window.localStorage.getItem(ownerStorageKey)
  if (!stored) {
    const initial = { venues: [demoOwnerVenue], bookings: [], availability: [], reviews: [] }
    window.localStorage.setItem(ownerStorageKey, JSON.stringify(initial))
    return initial
  }
  const workspace = JSON.parse(stored)
  if (!workspace || !Array.isArray(workspace.venues) || !Array.isArray(workspace.bookings)
    || !Array.isArray(workspace.availability) || !Array.isArray(workspace.reviews)) {
    throw new Error('Saved owner demo workspace data is invalid.')
  }
  return workspace
}

export function writeDemoOwnerWorkspace(workspace) {
  window.localStorage.setItem(ownerStorageKey, JSON.stringify(workspace))
}
