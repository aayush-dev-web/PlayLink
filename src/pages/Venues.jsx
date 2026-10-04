import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal.jsx'
import DashboardShell from '../components/DashboardShell.jsx'
import VenueMap from '../components/VenueMap.jsx'
import Icon from '../components/Icon.jsx'
import useVenueFavorites from '../hooks/useVenueFavorites.js'
import VenueBookingSection from '../components/VenueBookingSection.jsx'
import { supabase } from '../auth/supabase.js'
import { getVenueImage } from '../data/venueImages.js'

function publicVenue(venue) {
  return {
    ...venue,
    isOwnerListing: true,
    image: getVenueImage(venue),
    price: `NPR ${Number(venue.price_per_hour || 0).toLocaleString('en-IN')}`,
    rating: Number(venue.rating) || 0,
    coordinates: Number.isFinite(Number(venue.latitude)) && Number.isFinite(Number(venue.longitude))
      ? [Number(venue.longitude), Number(venue.latitude)]
      : null,
    slots: [],
  }
}

function messageHref(venue) {
  if (venue.isOwnerListing) {
    return `/messages?venue_id=${encodeURIComponent(venue.id)}`
  }
  const params = new URLSearchParams({
    recipient: `Owner - ${venue.name}`,
    type: 'venue',
    sport: venue.sport,
    area: venue.area,
  })
  return `/messages?${params.toString()}`
}

function VenueCard({ venue, onSelect, onDetails, selected, favorite, favoritePending, onFavorite }) {
  const availabilityLabel = 'Owner listed'
  return (
    <article className={`venue-card${selected ? ' is-selected' : ''}`}>
      <div className={`venue-photo venue-photo-${venue.id}${venue.sport === 'Cricket' ? ' venue-photo-cricket' : ''}`} style={{ backgroundImage: `linear-gradient(180deg,rgba(5,32,47,.04),rgba(5,32,47,.1)),url("${venue.image}")` }}>
        <span className="photo-sport"><i />{availabilityLabel}</span>
        <button className={`venue-favorite${favorite ? ' is-favorite' : ''}`} type="button" aria-label={`${favorite ? 'Remove' : 'Add'} ${venue.name} ${favorite ? 'from' : 'to'} favorites`} aria-pressed={favorite} disabled={favoritePending} onClick={onFavorite}><Icon name="heart" size={15} /></button>
        <span className="photo-mark" aria-hidden="true">{venue.sport === 'Cricket' ? 'CR' : 'FC'}<span>.</span></span>
      </div>
      <div className="venue-card-body">
        <button className="venue-name-button" type="button" onClick={onSelect}>{venue.name}</button>
        <p className="venue-location"><span aria-hidden="true"><Icon name="pin" size={11} /></span> {venue.area}</p>
        <div className="venue-sport-price"><span className={`sport-label ${venue.sport === 'Cricket' ? 'cricket-label' : ''}`}>{venue.sport}</span><b>{venue.price}<small> / hr</small></b></div>
        <div className="venue-card-bottom"><span className="rating">{venue.rating > 0 ? <>★ {venue.rating.toFixed(1)} <small>({venue.review_count} reviews)</small></> : 'No reviews yet'}</span><button className="venue-book-card-link" type="button" onClick={onDetails}><Icon name="calendar" size={13} />Book</button><Link className="venue-message-link" to={messageHref(venue)} aria-label={`Message the owner of ${venue.name}`}><Icon name="message" size={13} />Message owner</Link><button className="venue-arrow" type="button" onClick={onDetails} aria-label={`View ${venue.name} details`}><Icon name="arrow-right" size={14} /></button></div>
      </div>
    </article>
  )
}

export default function Venues() {
  const { pendingIds, error: favoriteError, isFavorite, toggleFavorite } = useVenueFavorites()
  const params = new URLSearchParams(window.location.search)
  const [location, setLocation] = useState(params.get('location') || '')
  const [globalSearch, setGlobalSearch] = useState('')
  const [sport, setSport] = useState(params.get('sport') || 'Any sport')
  const [price, setPrice] = useState('Any price')
  const [sort, setSort] = useState('Recommended')
  const [selected, setSelected] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [userCoordinates, setUserCoordinates] = useState(null)
  const [directionMode, setDirectionMode] = useState('driving')
  const [locationMessage, setLocationMessage] = useState('')
  const [ownerVenues, setOwnerVenues] = useState([])
  const [venueLoading, setVenueLoading] = useState(true)
  const [venueLoadError, setVenueLoadError] = useState('')
  const showVenue = useCallback((venue) => setSelected(venue), [])

  useEffect(() => {
    let active = true
    async function loadOwnerVenues() {
      setVenueLoadError('')
      if (!supabase) {
        setOwnerVenues([])
        setVenueLoadError('Supabase is not configured. Add your project URL and publishable key to load venue listings.')
        setVenueLoading(false)
        return
      }
      try {
        const { data, error } = await supabase.from('owner_venues').select('*').eq('is_active', true).order('created_at', { ascending: false })
        if (!active) return
        if (error) throw error
        const rows = data || []
        let reviews = []
        if (rows.length) {
          const { data: reviewRows, error: reviewError } = await supabase.from('venue_reviews')
            .select('venue_id, rating').in('venue_id', rows.map((venue) => venue.id))
          if (reviewError) throw reviewError
          reviews = reviewRows || []
        }
        const summaries = new Map()
        reviews.forEach(({ venue_id, rating }) => {
          const summary = summaries.get(venue_id) || { total: 0, count: 0 }
          summary.total += rating
          summary.count += 1
          summaries.set(venue_id, summary)
        })
        setOwnerVenues(rows.map((venue) => {
          const summary = summaries.get(venue.id) || { total: 0, count: 0 }
          return publicVenue({ ...venue, rating: summary.count ? summary.total / summary.count : 0, review_count: summary.count })
        }))
      } catch (loadError) {
        if (active) setVenueLoadError(`Owner-listed venues could not be loaded: ${loadError instanceof Error ? loadError.message : 'Connection failed'}. Apply the latest venue workspace migrations.`)
      } finally {
        if (active) setVenueLoading(false)
      }
    }
    loadOwnerVenues()
    return () => { active = false }
  }, [])

  function findUserLocation() {
    setLocationMessage('')
    if (!navigator.geolocation) {
      setLocationMessage('Location is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserCoordinates({ latitude: coords.latitude, longitude: coords.longitude })
        setLocationMessage('')
      },
      (error) => {
        setLocationMessage(error.code === 1 ? 'Allow location access to show directions.' : 'Your location could not be found. Try again or check device settings.')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  const filtered = useMemo(() => ownerVenues.filter((venue) => {
    const query = `${location} ${globalSearch}`.trim().toLowerCase()
    const matchesLocation = !query || `${venue.area} ${venue.name}`.toLowerCase().includes(query)
    const matchesSport = sport === 'Any sport' || venue.sport === sport
    const matchesPrice = price === 'Any price' || (price === 'Under NPR 2,500' ? Number(venue.price.replace(/\D/g, '')) < 2500 : Number(venue.price.replace(/\D/g, '')) >= 2500)
    return matchesLocation && matchesSport && matchesPrice
  }).sort((first, second) => sort === 'Price: low to high' ? Number(first.price.replace(/\D/g, '')) - Number(second.price.replace(/\D/g, '')) : sort === 'Top rated' ? second.rating - first.rating : 0), [location, globalSearch, ownerVenues, sport, price, sort])

  const resetFilters = () => {
    setLocation('')
    setGlobalSearch('')
    setSport('Any sport')
    setPrice('Any price')
    setSort('Recommended')
  }

  return (
    <DashboardShell path="/venues" search={globalSearch} onSearch={setGlobalSearch}>
      <main className="venue-dashboard">
          <section className="venue-welcome">
            <div className="venue-welcome-copy"><span className="eyebrow">YOUR NEXT GAME IS CLOSER THAN YOU THINK</span><h1>Find Your Perfect Venue</h1><p>Discover futsal and cricket venues, compare your options, and find a place for your next game.</p>
              <div className="sport-switch" aria-label="Filter venues by sport">
                <button type="button" className={sport === 'Futsal' ? 'sport-switch-button active' : 'sport-switch-button'} aria-pressed={sport === 'Futsal'} onClick={() => setSport(sport === 'Futsal' ? 'Any sport' : 'Futsal')}><Icon name="futsal" size={15} /> Futsal</button>
                <button type="button" className={sport === 'Cricket' ? 'sport-switch-button active' : 'sport-switch-button'} aria-pressed={sport === 'Cricket'} onClick={() => setSport(sport === 'Cricket' ? 'Any sport' : 'Cricket')}><Icon name="cricket" size={15} /> Cricket</button>
              </div>
            </div>
            <div className="welcome-court-art" aria-hidden="true" />
          </section>

          <section className="venue-filter-panel" aria-label="Venue filters">
            <label className="dashboard-filter location-filter"><span><Icon name="pin" size={15} /></span><span className="filter-text"><small>Location / Area</small><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Any area" /></span></label>
            <label className="dashboard-filter"><span><Icon name="currency" size={15} /></span><span className="filter-text"><small>Price range</small><select value={price} onChange={(event) => setPrice(event.target.value)}><option>Any price</option><option>Under NPR 2,500</option><option>NPR 2,500 and up</option></select></span></label>
            <button className="more-filters" type="button" onClick={resetFilters}><span><Icon name="refresh" size={14} /></span> Reset</button>
          </section>

          <div className="venue-dashboard-grid">
            <section className="venue-main-column">
              <div className="venue-list-heading"><div><span className="result-caption"><b>{filtered.length}</b> active owner-listed venues</span></div><label className="sort-select">Sort by: <select value={sort} onChange={(event) => setSort(event.target.value)}><option>Recommended</option><option>Top rated</option><option>Price: low to high</option></select></label></div>
              {venueLoadError && <p className="venue-favorite-error" role="alert">{venueLoadError}</p>}
              {favoriteError && <p className="venue-favorite-error" role="alert">{favoriteError}</p>}
              <div className="venue-results">
                {venueLoading ? <div className="empty-state" role="status">Loading active venue listings…</div> : filtered.map((venue) => <VenueCard key={venue.id} venue={venue} selected={selected?.id === venue.id} favorite={isFavorite(venue.id)} favoritePending={pendingIds.includes(String(venue.id))} onFavorite={() => toggleFavorite(venue.id)} onSelect={() => setSelected(venue)} onDetails={() => { setSelected(venue); setSelectedDetail(venue) }} />)}
                {!venueLoading && filtered.length === 0 && <div className="empty-state"><span><Icon name="venue" size={22} /></span><h2>{ownerVenues.length ? 'No venues match' : 'No active venues yet'}</h2><p>{ownerVenues.length ? 'Try a different area, sport, or price.' : 'Venue listings published by owners will appear here.'}</p>{ownerVenues.length > 0 && <button className="button button-primary" type="button" onClick={resetFilters}>Clear filters</button>}</div>}
              </div>
              <p className="venue-data-note">Listings are provided by venue owners. Confirm schedules and prices with the owner before visiting.</p>
            </section>

            <aside className="venue-dashboard-aside">
              <VenueMap venues={filtered} selectedVenue={selected} onSelect={showVenue} userCoordinates={userCoordinates} directionMode={directionMode} onDirectionModeChange={setDirectionMode} onFindLocation={findUserLocation} locationMessage={locationMessage} />
              <section className="venue-callout"><span className="callout-icon"><Icon name="futsal" size={19} /></span><div><b>Own a sports venue?</b><p>List your facility for local players.</p><Link to="/get-started">Create an owner account <span>→</span></Link></div></section>
              <section className="popular-sports"><h2>Venues by sport</h2><div><button type="button" onClick={() => setSport(sport === 'Futsal' ? 'Any sport' : 'Futsal')}><span><Icon name="futsal" size={18} /></span><b>Futsal<small>{ownerVenues.filter((venue) => venue.sport === 'Futsal' || venue.sport === 'Both').length} venues</small></b></button><button type="button" onClick={() => setSport(sport === 'Cricket' ? 'Any sport' : 'Cricket')}><span><Icon name="cricket" size={18} /></span><b>Cricket<small>{ownerVenues.filter((venue) => venue.sport === 'Cricket' || venue.sport === 'Both').length} venues</small></b></button></div></section>
              <section className="venue-quick-links"><h2>Quick links</h2><a href="/events"><span><Icon name="calendar" size={14} /></span>Explore events <i>→</i></a><a href="/favorite-venues"><span><Icon name="heart" size={14} /></span>Favorite venues <i>→</i></a><a href="/players"><span><Icon name="player" size={14} /></span>Find players <i>→</i></a><a href="/teams"><span><Icon name="teams" size={14} /></span>Find teams <i>→</i></a></section>
            </aside>
          </div>
      </main>
      {selectedDetail && <Modal title={selectedDetail.name} onClose={() => setSelectedDetail(null)}>
        <p className="modal-lead">{selectedDetail.description}</p>
        <div className="detail-facts"><span><small>AREA</small><b>{selectedDetail.area}</b></span><span><small>SPORT</small><b>{selectedDetail.sport}</b></span><span><small>{selectedDetail.isOwnerListing ? 'HOURLY RATE' : 'EXAMPLE PRICE'}</small><b>{selectedDetail.price} / hour</b></span><span><small>{selectedDetail.isOwnerListing ? 'REVIEWS' : 'DEMO RATING'}</small><b>{selectedDetail.isOwnerListing ? 'Player feedback' : `★ ${selectedDetail.rating}`}</b></span></div>
        {selectedDetail.isOwnerListing && <VenueBookingSection key={selectedDetail.id} venue={selectedDetail} />}
        <Link className="button button-primary button-full modal-action" to={messageHref(selectedDetail)}><Icon name="message" size={14} /> Message venue owner</Link>
        <p className="venue-modal-directions-note"><Icon name="map" size={15} />Directions are shown beside the venue in the map panel.</p>
        {!selectedDetail.isOwnerListing && <><h3 className="modal-subhead">Example time slots · not live availability</h3><div className="slot-list detail-slots">{selectedDetail.slots.map((slot) => <span className={`slot slot-${slot.status}`} key={slot.time}><i />{slot.time}<small>{slot.status}</small></span>)}</div><p className="modal-note">This is a sample listing; booking requests can only be sent to an active owner-listed venue.</p></>}
      </Modal>}
    </DashboardShell>
  )
}
