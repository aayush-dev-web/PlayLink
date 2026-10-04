export function getVenueImage(venue) {
  if (venue?.image_url?.trim()) return venue.image_url
  if (venue?.sport === 'Futsal' || venue?.sport === 'Both') return '/sports/default-futsal.jpg'
  if (venue?.sport === 'Cricket') return '/sports/default-cricket.jpg'
  return '/sports/footballground-icon.png'
}
