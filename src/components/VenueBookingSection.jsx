import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'

function todayValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function showDateTime(value) {
  return new Date(value).toLocaleString('en-NP', { dateStyle: 'medium', timeStyle: 'short' })
}

function Stars({ rating }) {
  return <span className="venue-review-stars" aria-label={`${rating} out of 5 stars`}>{'★'.repeat(Number(rating))}{'☆'.repeat(5 - Number(rating))}</span>
}

export default function VenueBookingSection({ venue }) {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(Boolean(user))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ date: todayValue(), start_time: '', end_time: '', sport: venue.sport === 'Cricket' ? 'Cricket' : 'Futsal' })
  const [reviewForm, setReviewForm] = useState({ booking_id: '', rating: 5, review: '' })

  useEffect(() => {
    let active = true
    setError('')
    setBookings([])
    setReviews([])
    if (!user) {
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    async function loadPlayerActivity() {
      try {
        if (!supabase) throw new Error('Venue booking requests require a configured Supabase connection.')
        const [bookingResult, reviewResult] = await Promise.all([
          supabase.from('venue_bookings').select('*').eq('venue_id', venue.id).eq('customer_id', user.id).order('starts_at', { ascending: false }),
          supabase.from('venue_reviews').select('*').eq('venue_id', venue.id).order('created_at', { ascending: false }),
        ])
        if (bookingResult.error) throw bookingResult.error
        if (reviewResult.error) throw reviewResult.error
        const playerBookings = bookingResult.data || []
        const venueReviews = reviewResult.data || []
        if (active) {
          setBookings(playerBookings)
          setReviews(venueReviews)
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Your venue activity could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadPlayerActivity()
    return () => { active = false }
  }, [user, venue.id])

  const reviewableBookings = bookings.filter((booking) => booking.status === 'completed'
    && !reviews.some((review) => review.booking_id === booking.id))

  async function requestBooking(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!user) return
    const startsAt = new Date(`${form.date}T${form.start_time}`)
    const endsAt = new Date(`${form.date}T${form.end_time}`)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())
      || startsAt <= new Date() || endsAt <= startsAt) {
      setError('Choose a future date and a valid end time after the start time.')
      return
    }
    setSubmitting(true)
    const booking = {
      venue_id: venue.id,
      owner_id: venue.owner_id,
      customer_id: user.id,
      customer_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'PlayLink player',
      customer_contact: user.email || '',
      sport: form.sport,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'pending',
      notes: '',
    }
    try {
      if (!supabase) throw new Error('Booking requests require a configured Supabase connection.')
      const { data: saved, error: insertError } = await supabase.from('venue_bookings').insert(booking).select('*').single()
      if (insertError) throw insertError
      setBookings((current) => [saved, ...current])
      setMessage('Request sent. The venue owner will confirm or decline it.')
      setForm((current) => ({ ...current, start_time: '', end_time: '' }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Your booking request could not be sent.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitReview(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const booking = reviewableBookings.find((item) => item.id === reviewForm.booking_id)
    if (!booking) {
      setError('Select a completed booking before submitting a review.')
      return
    }
    setSubmitting(true)
    const review = {
      venue_id: venue.id,
      owner_id: venue.owner_id,
      booking_id: booking.id,
      reviewer_id: user.id,
      reviewer_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'PlayLink player',
      rating: Number(reviewForm.rating),
      review: reviewForm.review.trim(),
    }
    try {
      if (!supabase) throw new Error('Reviews require a configured Supabase connection.')
      const { data: saved, error: insertError } = await supabase.from('venue_reviews').insert(review).select('*').single()
      if (insertError) throw insertError
      setReviews((current) => [saved, ...current])
      setReviewForm({ booking_id: '', rating: 5, review: '' })
      setMessage('Thanks for sharing your experience.')
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Your review could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="venue-booking-section" aria-label={`Booking and reviews for ${venue.name}`}>
      <h3 className="modal-subhead"><Icon name="calendar" size={16} /> Request a booking</h3>
      <p className="venue-booking-intro">Choose your date and playing times. Your request goes to the venue owner for approval.</p>
      {!user ? <p className="venue-booking-login">Sign in to request a booking or review a venue. <Link to={`/sign-in?next=${encodeURIComponent('/venues')}`}>Sign in</Link></p>
        : <form className="venue-booking-form" onSubmit={requestBooking}>
          <label>Date<input type="date" min={todayValue()} required value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label>
          <label>From<input type="time" required value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} /></label>
          <label>To<input type="time" required value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} /></label>
          {venue.sport === 'Both' && <label>Sport<select value={form.sport} onChange={(event) => setForm((current) => ({ ...current, sport: event.target.value }))}><option>Futsal</option><option>Cricket</option></select></label>}
          <button className="button button-primary" type="submit" disabled={submitting}><Icon name="calendar" size={15} />{submitting ? 'Sending request…' : 'Ask to book'}</button>
        </form>}

      {message && <p className="venue-booking-feedback success" role="status">{message}</p>}
      {error && <p className="venue-booking-feedback error" role="alert">{error}</p>}
      {user && <div className="venue-player-bookings">
        <h4>Your booking requests</h4>
        {loading ? <p className="venue-booking-muted">Loading your requests…</p> : bookings.length
          ? bookings.map((booking) => <article className="venue-player-booking" key={booking.id}><span><b>{showDateTime(booking.starts_at)}</b><small>to {new Date(booking.ends_at).toLocaleTimeString('en-NP', { hour: 'numeric', minute: '2-digit' })} · {booking.sport}</small></span><span className={`venue-request-status ${booking.status}`}>{booking.status}</span></article>)
          : <p className="venue-booking-muted">Your requests and their owner decisions will appear here.</p>}
      </div>}

      <h3 className="modal-subhead venue-review-heading"><Icon name="star" size={16} /> Player reviews</h3>
      {user && reviewableBookings.length > 0 && <form className="venue-review-form" onSubmit={submitReview}>
        <p>You can review after the owner marks your approved booking as completed.</p>
        <label>Played at<select required value={reviewForm.booking_id} onChange={(event) => setReviewForm((current) => ({ ...current, booking_id: event.target.value }))}><option value="">Choose a completed booking</option>{reviewableBookings.map((booking) => <option value={booking.id} key={booking.id}>{showDateTime(booking.starts_at)} · {booking.sport}</option>)}</select></label>
        <label>Rating<select value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))}><option value="5">★★★★★ — Excellent</option><option value="4">★★★★☆ — Good</option><option value="3">★★★☆☆ — Okay</option><option value="2">★★☆☆☆ — Poor</option><option value="1">★☆☆☆☆ — Bad</option></select></label>
        <label>Comment<textarea rows="3" minLength="3" maxLength="1000" required placeholder="How was the venue and your playing experience?" value={reviewForm.review} onChange={(event) => setReviewForm((current) => ({ ...current, review: event.target.value }))} /></label>
        <button className="button button-primary" type="submit" disabled={submitting}><Icon name="star" size={15} />Submit review</button>
      </form>}
      {user && bookings.some((booking) => booking.status === 'completed') && reviewableBookings.length === 0
        && <p className="venue-booking-muted">You have reviewed your completed bookings. Thanks for helping other players.</p>}
      {!reviews.length ? <p className="venue-booking-muted">No player reviews yet.</p>
        : <div className="venue-public-reviews">{reviews.map((review) => <article key={review.id}><header><b>{review.reviewer_name}</b><Stars rating={review.rating} /></header><p>{review.review}</p></article>)}</div>}
    </section>
  )
}
