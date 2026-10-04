export const venuePhotoBucket = 'playlink-venue-photos'
export const maxVenuePhotoSize = 5 * 1024 * 1024

export function validateVenuePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP venue photo.')
  }
  if (file.size > maxVenuePhotoSize) {
    throw new Error('Venue photos must be 5 MB or smaller.')
  }
}

export async function uploadVenuePhoto(supabase, userId, venueId, file) {
  validateVenuePhoto(file)
  const path = `${userId}/venues/${venueId}`
  const { error } = await supabase.storage.from(venuePhotoBucket).upload(path, file, {
    upsert: true,
    contentType: file.type,
  })
  if (error) throw error
  return supabase.storage.from(venuePhotoBucket).getPublicUrl(path).data.publicUrl
}
