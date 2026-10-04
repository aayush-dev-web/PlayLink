import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import useVenueFavorites from '../hooks/useVenueFavorites.js'
import { supabase } from '../auth/supabase.js'
import { getVenueImage } from '../data/venueImages.js'

export default function FavoriteVenues() {
  const { favoriteIds, pendingIds, loading, error, toggleFavorite } = useVenueFavorites()
  const [favorites, setFavorites] = useState([])
  const [venueLoading, setVenueLoading] = useState(true)
  const [venueError, setVenueError] = useState('')

  useEffect(() => {
    let active = true
    async function loadFavorites() {
      setVenueError('')
      if (!favoriteIds.length) {
        setFavorites([])
        setVenueLoading(false)
        return
      }
      if (!supabase) {
        setVenueError('Supabase is not configured. Saved venues cannot be loaded.')
        setVenueLoading(false)
        return
      }
      setVenueLoading(true)
      try {
        const { data, error: loadError } = await supabase.from('owner_venues').select('*').in('id', favoriteIds)
        if (loadError) throw loadError
        if (active) setFavorites(data || [])
      } catch (loadError) {
        if (active) setVenueError(loadError instanceof Error ? loadError.message : 'Saved venues could not be loaded.')
      } finally {
        if (active) setVenueLoading(false)
      }
    }
    loadFavorites()
    return () => { active = false }
  }, [favoriteIds])

  return (
    <DashboardShell path="/favorite-venues">
      <main className="dashboard-main favorite-venues-page">
        <section className="favorite-venues-heading">
          <span className="dashboard-kicker">YOUR SAVED PLACES</span>
          <h1>Favorite venues</h1>
          <p>Keep the grounds you like close by, and remove a favorite any time with the heart.</p>
        </section>

        {(error || venueError) && <p className="favorite-venues-error" role="alert">{error || venueError}</p>}
        {loading || venueLoading ? <p className="favorite-venues-state" role="status">Loading your favorite venues…</p>
          : favorites.length ? <div className="favorite-venues-grid">
            {favorites.map((venue) => (
              <article className="favorite-venue-card" key={venue.id}>
                <div className="favorite-venue-image" style={{ backgroundImage: `url("${getVenueImage(venue)}")` }}>
                  <span>{venue.sport}</span>
                  <button type="button" className="favorite-venue-heart" aria-label={`Remove ${venue.name} from favorites`} aria-pressed="true" disabled={pendingIds.includes(String(venue.id))} onClick={() => toggleFavorite(venue.id)}>
                    <Icon name="heart" size={18} />
                  </button>
                </div>
                <div className="favorite-venue-copy">
                  <h2>{venue.name}</h2>
                  <p><Icon name="pin" size={13} />{venue.area}</p>
                  <div><b>Rs {Number(venue.price_per_hour || 0).toLocaleString()}<small> / hour</small></b></div>
                  <Link to={`/venues?location=${encodeURIComponent(venue.name)}`}>View venue <Icon name="compass" size={14} /></Link>
                </div>
              </article>
            ))}
          </div>
          : <section className="favorite-venues-empty">
            <span><Icon name="heart" size={25} /></span>
            <h2>No favorite venues yet</h2>
            <p>Tap the heart on a venue card to save a place here.</p>
            <Link className="button button-primary" to="/venues">Explore venues</Link>
          </section>}
        <p className="favorite-venues-note">Venue information and prices are sample listings. Check with a venue directly before making plans.</p>
      </main>
    </DashboardShell>
  )
}
