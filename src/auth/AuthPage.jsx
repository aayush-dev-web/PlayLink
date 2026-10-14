import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './supabase.js'
import { useAuth } from './AuthContext.jsx'
import { isDesignatedAdmin, isDesignatedAdminEmail } from './adminAccess.js'
import VenuePhotoPicker from '../components/VenuePhotoPicker.jsx'
import { uploadVenuePhoto, validateVenuePhoto } from '../data/venuePhotos.js'
import usePlayLinkSports from '../hooks/usePlayLinkSports.js'
import { reverseGeocodeLocation } from '../utils/locationName.js'
import './auth.css'

const CURRENT_TERMS_VERSION = '2026-10-12'

const viewContent = {
  signup: {
    eyebrow: 'WELCOME TO PLAYLINK',
    title: 'Create your account',
    description: 'Join your local sports community.',
    brandEyebrow: 'YOUR GAME. YOUR PEOPLE.',
    brandTitle: <>Find courts.<br />Join games.<br /><span>Play together.</span></>,
    brandDescription: 'Connect with players, discover teams, and make your next game happen.',
  },
  'google-complete': {
    eyebrow: 'FINISH YOUR PLAYLINK PROFILE',
    title: 'Complete your registration',
    description: 'Add your details and choose how you’ll use PlayLink.',
    brandEyebrow: 'WELCOME TO PLAYLINK',
    brandTitle: <>Your game.<br />Your people.<br /><span>Your PlayLink.</span></>,
    brandDescription: 'Your Google email is verified. Finish your profile and set a password for future sign-ins.',
  },
  login: {
    eyebrow: 'GOOD TO SEE YOU AGAIN',
    title: 'Log in to PlayLink',
    description: 'Sign in with your email address and password.',
    brandEyebrow: 'THE GAME STARTS HERE',
    brandTitle: <>Your team<br /><span>is waiting.</span></>,
    brandDescription: 'Pick up where you left off and find your next opportunity to play.',
  },
  forgot: {
    eyebrow: 'ACCOUNT RECOVERY',
    title: 'Forgot your password?',
    description: 'We’ll send a verification code to confirm your email before you reset your password.',
    brandEyebrow: 'NO WORRIES',
    brandTitle: <>Every player<br />gets a <span>reset.</span></>,
    brandDescription: 'It happens. Get back in the game with a few simple steps.',
  },
  reset: {
    eyebrow: 'SECURE YOUR ACCOUNT',
    title: 'Choose a new password',
    description: 'Use at least 8 characters. Avoid reusing an old password.',
    brandEyebrow: 'A FRESH START',
    brandTitle: <>Reset it.<br />Get back to<br /><span>the game.</span></>,
    brandDescription: 'Choose a strong password to secure your PlayLink account.',
  },
}
function ConfigurationMessage() {
  return <div className="auth-config-message" role="status">Account services are temporarily unavailable. Please try again later.</div>
}

function getPublicAuthError(error, fallback) {
  if (!(error instanceof Error)) return fallback

  const message = error.message
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (/email not confirmed/i.test(message)) return 'Please verify your email using the code we sent before logging in.'
  if (/rate limit|too many requests/i.test(message)) return 'Too many attempts. Please wait a little and try again.'
  if (/database|supabase|postgrest|postgres|migration|schema|rpc|relation|column|function|permission denied|duplicate key|violates|jwt|refresh token|edge function|server error|internal server|failed to fetch|network/i.test(message)) {
    return fallback
  }
  return message
}

function coordinatePair(latitude, longitude) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  return latitude !== '' && longitude !== ''
    && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lon) && lon >= -180 && lon <= 180
}

function requireRegistrationLocation(form) {
  const homeLocation = form.homeLocation.trim()
  if (homeLocation.length < 2 || homeLocation.length > 160
    || !coordinatePair(form.homeLatitude, form.homeLongitude)) {
    throw new Error('Enter your city or area and valid latitude and longitude, or use the GPS button and complete any missing fields.')
  }
  return {
    home_location: homeLocation,
    home_latitude: Number(form.homeLatitude),
    home_longitude: Number(form.homeLongitude),
  }
}

function requireVenueCoordinates(venue) {
  if (!coordinatePair(venue.latitude, venue.longitude)) {
    throw new Error('Venue location is required. Enter valid venue latitude and longitude, or use the GPS button.')
  }
}

function SignupLocationFields({ prefix, form, onChange, onUseLocation, busy, error }) {
  return <fieldset className="auth-signup-location">
    <legend>Your location</legend>
    <p>Share your current location with PlayLink, or enter a place and coordinates manually. GPS is used only when you tap the button.</p>
    <button className="auth-location-button" type="button" onClick={onUseLocation} disabled={busy}>{busy ? 'Getting your location…' : 'Use my current location'}</button>
    <label htmlFor={`${prefix}-home-location`}>City / area</label>
    <input id={`${prefix}-home-location`} autoComplete="address-level2" value={form.homeLocation} onChange={onChange('homeLocation')} required minLength="2" maxLength="160" placeholder="e.g. Kathmandu" />
    <div className="auth-owner-coordinate-row">
      <span><label htmlFor={`${prefix}-home-latitude`}>Latitude</label><input id={`${prefix}-home-latitude`} type="number" min="-90" max="90" step="any" value={form.homeLatitude} onChange={onChange('homeLatitude')} required /></span>
      <span><label htmlFor={`${prefix}-home-longitude`}>Longitude</label><input id={`${prefix}-home-longitude`} type="number" min="-180" max="180" step="any" value={form.homeLongitude} onChange={onChange('homeLongitude')} required /></span>
    </div>
    {error && <p className="auth-location-error" role="alert">{error}</p>}
  </fieldset>
}

function passwordStrength(value) {
  if (!value) return 0
  return [
    value.length >= 8,
    value.length >= 12,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length
}

const passwordStrengthLabels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong']
const resendCooldownSeconds = 60
const challengeDurationSeconds = 120

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function isInvalidOtpError(error) {
  return error?.code === 'otp_expired'
    || (error?.status === 400 && /token has expired or is invalid|invalid (?:otp|token|code)|(?:otp|token|code) (?:is )?(?:invalid|expired|incorrect)/i.test(error.message || ''))
}

function PenaltyOtpGame({ value, onChange, length = 6, label = 'verification code', secondsRemaining, onResend, resendDisabled, resendLabel }) {
  const stageRef = useRef(null)
  const gameRef = useRef(null)
  const slotsRef = useRef([])
  const timersRef = useRef([])
  const dragTrailRef = useRef([])
  const [shot, setShot] = useState(null)
  const [phase, setPhase] = useState('')
  const [dragTrail, setDragTrail] = useState([])
  const [glowingIndex, setGlowingIndex] = useState(-1)
  const [kicking, setKicking] = useState(false)

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), [])

  function kick(digit, target, drawnTrail = []) {
    if (kicking || secondsRemaining <= 0 || value.length >= length) return
    const stage = stageRef.current
    const game = gameRef.current
    if (!stage || !game || !target) return
    const stageRect = stage.getBoundingClientRect()
    const gameRect = game.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const slotRect = slotsRef.current[value.length]?.getBoundingClientRect()
    if (!slotRect) return
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
    const ballRect = stage.querySelector('.penalty-ball')?.getBoundingClientRect()
    const start = drawnTrail[0] || (ballRect ? {
      x: ballRect.left + ballRect.width / 2 - stageRect.left,
      y: ballRect.top + ballRect.height / 2 - stageRect.top,
    } : { x: stageRect.width / 2, y: stageRect.height - 40 })
    const end = {
      x: targetRect.left + targetRect.width / 2 - stageRect.left,
      y: targetRect.top + targetRect.height / 2 - stageRect.top,
    }
    const trajectory = drawnTrail.length > 1
      ? [...drawnTrail, end]
      : [start, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 + 48 }, end]
    const nextShot = {
      id: Date.now(),
      digit,
      x: end.x,
      y: end.y,
      gameX: targetRect.left + targetRect.width / 2 - gameRect.left,
      gameY: targetRect.top + targetRect.height / 2 - gameRect.top,
      ballPath: `M ${trajectory.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`,
      endX: slotRect.left + slotRect.width / 2 - gameRect.left,
      endY: slotRect.top + slotRect.height / 2 - gameRect.top,
      midX: (slotRect.left + slotRect.width / 2 - gameRect.left - (targetRect.left + targetRect.width / 2 - gameRect.left)) * .5,
      midY: (slotRect.top + slotRect.height / 2 - gameRect.top - (targetRect.top + targetRect.height / 2 - gameRect.top)) * .5 - 105,
      targetWidth: targetRect.width,
      targetHeight: targetRect.height,
    }
    setKicking(true)
    dragTrailRef.current = []
    setDragTrail([])
    setShot(nextShot)
    setPhase('shot')
    timersRef.current.push(
      window.setTimeout(() => setPhase('impact'), 500),
      window.setTimeout(() => setPhase('number'), 700),
      window.setTimeout(() => setPhase('flight'), 1500),
      window.setTimeout(() => {
        onChange(`${value}${digit}`)
        setGlowingIndex(value.length)
        timersRef.current.push(window.setTimeout(() => setGlowingIndex(-1), 700))
        setShot(null)
        setPhase('')
        setKicking(false)
      }, 2000),
    )
  }

  function handlePointerDown(event) {
    if (!event.target.closest('.penalty-ball') || kicking || secondsRemaining <= 0 || value.length >= length) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const stageRect = event.currentTarget.getBoundingClientRect()
    const ballRect = event.target.closest('.penalty-ball').getBoundingClientRect()
    const start = {
      x: ballRect.left + ballRect.width / 2 - stageRect.left,
      y: ballRect.top + ballRect.height / 2 - stageRect.top,
    }
    dragTrailRef.current = [start]
    setDragTrail([start])
  }

  function handlePointerMove(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const nextTrail = [...dragTrailRef.current, point]
    dragTrailRef.current = nextTrail
    setDragTrail(nextTrail)
  }

  function handlePointerUp(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-penalty-digit]')
    if (target) kick(target.dataset.penaltyDigit, target, dragTrailRef.current)
    else clearTrail()
  }

  function handlePointerCancel(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    clearTrail()
  }

  function clearTrail() {
    dragTrailRef.current = []
    setDragTrail([])
  }

  function eraseDigit(index) {
    if (kicking) return
    onChange(value.slice(0, index))
  }

  return (
    <div className="penalty-game" ref={gameRef}>
      <div className="penalty-code-area">
        <div className="penalty-code-slots" role="group" aria-label={`Entered ${label}; tap a digit to remove it and all later digits`}>
          {Array.from({ length }, (_, index) => (
            <button
              ref={(element) => { slotsRef.current[index] = element }}
              className={`penalty-code-slot${value[index] ? ' has-digit' : ''}${glowingIndex === index ? ' is-captured' : ''}`}
              type="button"
              key={index}
              disabled={!value[index] || kicking}
              onClick={() => eraseDigit(index)}
              aria-label={value[index] ? `Remove digit ${value[index]} in position ${index + 1} and later digits` : `Empty ${label} position ${index + 1}`}
            >
              {value[index] || <span aria-hidden="true">·</span>}
            </button>
          ))}
        </div>
        {value.length > 0 && <button className="penalty-remove-last" type="button" disabled={kicking} onClick={() => onChange(value.slice(0, -1))}>Remove last digit</button>}
      </div>
      <div
        className={`penalty-stage${kicking ? ' is-kicking' : ''}${secondsRemaining <= 0 ? ' is-expired' : ''}`}
        ref={stageRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="penalty-number-grid" role="group" aria-label="Penalty goal number targets">
          {Array.from({ length: 10 }, (_, digit) => {
            const broken = phase === 'impact' && shot?.digit === String(digit)
            const removed = (phase === 'number' || phase === 'flight') && shot?.digit === String(digit)
            return (
              <div
                role="img"
                className={`penalty-number${broken ? ' is-broken' : ''}${removed ? ' is-removed' : ''}`}
                data-penalty-digit={digit}
                key={digit}
                aria-label={`Goal number ${digit}`}
              >
                <span>{digit}</span>
              </div>
            )
          })}
        </div>
        {shot && (phase === 'impact' || phase === 'flight') && <div
          className="penalty-fragments"
          style={{ left: `${shot.x}px`, top: `${shot.y}px`, '--fragment-half-width': `${shot.targetWidth / 2}px`, '--fragment-half-height': `${shot.targetHeight / 2}px` }}
          aria-hidden="true"
        >
          {Array.from({ length: 8 }, (_, index) => {
            const column = index % 4
            const row = Math.floor(index / 4)
            return <i key={index} style={{
              '--fragment-index': index,
              '--fragment-width': `${shot.targetWidth / 4}px`,
              '--fragment-height': `${shot.targetHeight / 2}px`,
              '--fragment-left': `${(column - 1.5) * shot.targetWidth / 4}px`,
              '--fragment-top': `${(row - .5) * shot.targetHeight / 2}px`,
              '--fragment-fall-x': `${(column - 1.5) * 22}px`,
              '--fragment-fall-y': `${(row - .5) * 30 + 90}px`,
              '--fragment-spin': `${(index % 2 ? 1 : -1) * (220 + index * 24)}deg`,
            }} />
          })}
        </div>}
        {shot && <div
          className="penalty-ball-flight"
          style={{ offsetPath: `path('${shot.ballPath}')` }}
          aria-hidden="true"
        ><img src="/playlink-football.png" alt="" /></div>}
        <div className={`penalty-ball${shot ? ' is-hidden' : ''}`} aria-hidden="true">
          <img src="/playlink-football.png" alt="" draggable="false" />
        </div>
        {secondsRemaining <= 0 && <div className="penalty-expired-overlay">
          <strong>Challenge time is up</strong>
          <button type="button" onClick={onResend} disabled={resendDisabled}>{resendLabel}</button>
        </div>}
        {dragTrail.length > 1 && !shot && <svg className="penalty-drag-trail" aria-hidden="true">
          <polyline points={dragTrail.map(({ x, y }) => `${x},${y}`).join(' ')} />
        </svg>}
      </div>
      {shot && (phase === 'number' || phase === 'flight') && <span
        className="penalty-flying-digit"
        key={shot.id}
        data-phase={phase}
        style={{
          left: `${shot.gameX}px`,
          top: `${shot.gameY}px`,
          '--digit-flight-x': `${shot.endX - shot.gameX}px`,
          '--digit-flight-y': `${shot.endY - shot.gameY}px`,
          '--digit-near-x': `${(shot.endX - shot.gameX) * .86}px`,
          '--digit-near-y': `${(shot.endY - shot.gameY) * .86}px`,
          '--digit-mid-x': `${shot.midX}px`,
          '--digit-mid-y': `${shot.midY}px`,
        }}
        aria-hidden="true"
      >{shot.digit}</span>}
    </div>
  )
}

function PasswordField({ id, label, autoComplete, value, onChange, required = true, showStrength = false }) {
  const [visible, setVisible] = useState(false)
  const strength = passwordStrength(value)
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrap">
        <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} minLength="8" required={required} />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button>
      </div>
      {showStrength && value && <div className={`auth-password-strength strength-${strength}`} aria-live="polite">
        <div className="auth-password-strength-track" role="progressbar" aria-label="Password strength" aria-valuemin="0" aria-valuemax="5" aria-valuenow={strength}>
          {Array.from({ length: 5 }, (_, index) => <span className={index < strength ? 'filled' : ''} key={index} />)}
        </div>
        <span>{passwordStrengthLabels[strength]}</span>
      </div>}
    </>
  )
}

async function uploadInitialOwnerVenuePhoto(userId, file) {
  if (!file) return
  if (!supabase) throw new Error('Account services are temporarily unavailable.')
  const { data: venue, error: venueError } = await supabase.from('owner_venues')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (venueError) throw venueError
  if (!venue) throw new Error('Your venue details could not be saved. Please try again.')
  const imageUrl = await uploadVenuePhoto(supabase, userId, venue.id, file)
  const { error: updateError } = await supabase.from('owner_venues')
    .update({ image_url: imageUrl })
    .eq('id', venue.id)
    .eq('owner_id', userId)
  if (updateError) throw updateError
}

export default function AuthPage({ mode = 'signup' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { sports: sportOptions, venueSports: venueSportOptions, error: sportsError } = usePlayLinkSports()
  const { user } = useAuth()
  const requestedReturnTo = new URLSearchParams(location.search).get('next')
  const postLoginPath = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : isDesignatedAdmin(user) ? '/admin' : '/dashboard'
  const returnQuery = requestedReturnTo ? `?next=${encodeURIComponent(postLoginPath)}` : ''
  const view = viewContent[mode] || viewContent.signup
  const [form, setForm] = useState({ fullName: '', username: '', email: '', phone: '', password: '', confirmPassword: '', otp: '', recoveryOtp: '', accountType: 'player', preferredSport: 'Football', homeLocation: '', homeLatitude: '', homeLongitude: '', acceptedTerms: false, ownerVenue: { name: '', sport: 'Futsal', area: '', address: '', price_per_hour: '', image_url: '', latitude: '', longitude: '', maps_url: '', description: '', is_active: true } })
  const [busy, setBusy] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [recoveryOtpSent, setRecoveryOtpSent] = useState(false)
  const otpScreen = (mode === 'signup' && otpSent) || (mode === 'forgot' && recoveryOtpSent)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [usernameSuggestions, setUsernameSuggestions] = useState([])
  const [venuePhotoFile, setVenuePhotoFile] = useState(null)
  const [pendingOwnerPhotoUserId, setPendingOwnerPhotoUserId] = useState('')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [venueLocationBusy, setVenueLocationBusy] = useState(false)
  const [venueLocationError, setVenueLocationError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [challengeExpiresAt, setChallengeExpiresAt] = useState(0)
  const [challengeSecondsRemaining, setChallengeSecondsRemaining] = useState(0)
  const activeOtpValue = mode === 'signup' ? form.otp : form.recoveryOtp

  useEffect(() => {
    if (mode !== 'google-complete') return
    if (!user) {
      navigate('/sign-in', { replace: true })
      return
    }
    const isGoogleUser = user.app_metadata?.provider === 'google'
      || user.identities?.some((identity) => identity.provider === 'google')
    if (!isGoogleUser) {
      navigate('/dashboard', { replace: true })
      return
    }
    setForm((current) => ({
      ...current,
      email: user.email || '',
      fullName: user.user_metadata?.full_name || user.user_metadata?.name || '',
      preferredSport: user.user_metadata?.preferred_sport === 'Futsal' ? 'Football' : user.user_metadata?.preferred_sport || 'Football',
    }))
  }, [mode, user, navigate])

  useEffect(() => {
    const oauthError = new URLSearchParams(location.search).get('oauth_error')
    if (oauthError) showMessage(`Google sign-in failed: ${oauthError}`)
  }, [location.search])

  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timeoutId = window.setTimeout(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => window.clearTimeout(timeoutId)
  }, [resendCooldown])

  useEffect(() => {
    if (!otpScreen || !challengeExpiresAt) {
      setChallengeSecondsRemaining(0)
      return undefined
    }
    const updateRemaining = () => {
      setChallengeSecondsRemaining(Math.max(0, Math.ceil((challengeExpiresAt - Date.now()) / 1000)))
    }
    updateRemaining()
    const intervalId = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(intervalId)
  }, [otpScreen, challengeExpiresAt])

  useEffect(() => {
    if (user && (mode === 'signup' || mode === 'login')) {
      navigate(isDesignatedAdmin(user) ? '/admin' : postLoginPath, { replace: true })
    }
  }, [user, mode, navigate, postLoginPath])

  function change(key) {
    return (event) => {
      const value = event.target.value
      setForm((current) => ({ ...current, [key]: value, ...(key === 'email' && mode === 'forgot' ? { recoveryOtp: '' } : {}) }))
      if (['homeLocation', 'homeLatitude', 'homeLongitude'].includes(key)) setLocationError('')
      if (key === 'email' && mode === 'forgot') {
        setRecoveryOtpSent(false)
        setResendCooldown(0)
        setChallengeExpiresAt(0)
      }
      if (key === 'username') {
        setUsernameSuggestions([])
        setMessage('')
      }
    }
  }

  function changeOwnerVenue(key) {
    return (event) => {
      const value = key === 'is_active' ? event.target.checked : event.target.value
      setForm((current) => ({ ...current, ownerVenue: { ...current.ownerVenue, [key]: value } }))
      if (key === 'latitude' || key === 'longitude') setVenueLocationError('')
    }
  }

  function captureLocation(target) {
    const setBusyState = target === 'home' ? setLocationBusy : setVenueLocationBusy
    const setErrorState = target === 'home' ? setLocationError : setVenueLocationError
    setBusyState(true)
    setErrorState('')
    if (!navigator.geolocation) {
      setErrorState('GPS is unavailable in this browser. Enter the location and coordinates manually.')
      setBusyState(false)
      return
    }
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const latitude = coords.latitude.toFixed(6)
      const longitude = coords.longitude.toFixed(6)
      if (target === 'venue') {
        setForm((current) => ({ ...current, ownerVenue: { ...current.ownerVenue, latitude, longitude } }))
        setBusyState(false)
        return
      }
      try {
        const label = await reverseGeocodeLocation(coords.latitude, coords.longitude)
        setForm((current) => ({ ...current, homeLocation: label, homeLatitude: latitude, homeLongitude: longitude }))
      } catch {
        setForm((current) => ({ ...current, homeLatitude: latitude, homeLongitude: longitude }))
        setErrorState('Coordinates captured, but the place name could not be found. Enter the location name manually.')
      } finally {
        setBusyState(false)
      }
    }, (error) => {
      const reason = error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied.'
        : error.code === error.TIMEOUT
          ? 'Location lookup timed out.'
          : 'Your current location could not be determined.'
      setErrorState(`${reason} Enter the location and coordinates manually.`)
      setBusyState(false)
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  function changeVenuePhoto(event) {
    const file = event.target.files?.[0] || null
    if (file) {
      try {
        validateVenuePhoto(file)
      } catch (photoError) {
        event.target.value = ''
        showMessage(photoError.message)
        return
      }
    }
    setVenuePhotoFile(file)
    setMessage('')
  }

  function showMessage(text, type = 'error') {
    setMessage(text)
    setMessageType(type)
  }

  async function showUsernameSuggestions(username) {
    const { data, error: suggestionsError } = await supabase.rpc('suggest_profile_usernames', {
      requested_username: username,
    })
    if (suggestionsError) {
      if (['PGRST202', '42883'].includes(suggestionsError.code)) {
        showMessage('That username is taken. Please try a different username.')
      } else {
        throw suggestionsError
      }
      return
    }
    setUsernameSuggestions((data || []).slice(0, 5))
    showMessage('That username has already been taken. Try one of these suggestions.')
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    if (!supabase) {
      showMessage('Account services are temporarily unavailable. Please try again later.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'google-complete') {
        if (!user) throw new Error('Sign in with Google before completing your profile.')
        if (!form.acceptedTerms) throw new Error('You must agree to the Terms and Conditions to continue.')
        const registrationLocation = requireRegistrationLocation(form)
        if (!/^[A-Za-z0-9_]{3,24}$/.test(form.username)) {
          showMessage('Username must be 3–24 characters and contain only letters, numbers, or underscores.')
          return
        }
        if (form.fullName.trim().length < 2 || form.fullName.trim().length > 80) {
          showMessage('Enter a name between 2 and 80 characters.')
          return
        }
        if (form.password.length < 8) {
          showMessage('Choose a password with at least 8 characters.')
          return
        }
        if (form.password !== form.confirmPassword) {
          showMessage('Your passwords do not match.')
          return
        }
        if (form.accountType === 'venue_owner'
          && (form.ownerVenue.name.trim().length < 2 || form.ownerVenue.area.trim().length < 2)) {
          showMessage('Add your venue name and district or area to continue as a venue owner.')
          return
        }
        if (form.accountType === 'venue_owner') requireVenueCoordinates(form.ownerVenue)
        if (venuePhotoFile) validateVenuePhoto(venuePhotoFile)
        const { data: existingProfile, error: profileError } = await supabase.from('profiles')
          .select('account_type,onboarding_completed')
          .eq('id', user.id)
          .maybeSingle()
        if (profileError) throw profileError
        if (existingProfile?.onboarding_completed !== true) {
          const { error: passwordError } = await supabase.auth.updateUser({
            password: form.password,
            data: {
              ...registrationLocation,
              terms_accepted: true,
              terms_version: CURRENT_TERMS_VERSION,
              terms_accepted_at: new Date().toISOString(),
            },
          })
          if (passwordError) throw passwordError
          const { error } = await supabase.rpc('complete_google_profile', {
            requested_username: form.username.trim().toLowerCase(),
            requested_display_name: form.fullName.trim(),
            requested_phone: form.phone.trim() || null,
            requested_account_type: form.accountType,
            requested_owner_venue: form.ownerVenue,
          })
          if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') {
              throw new Error('Google registration setup is not applied in Supabase yet. Apply the 20261003100000_google_onboarding.sql migration.')
            }
            throw error
          }
        }
        const { error: sportError } = await supabase.from('profiles')
          .update({ preferred_sport: form.preferredSport })
          .eq('id', user.id)
        if (sportError) throw sportError
        if (form.accountType === 'venue_owner' && venuePhotoFile) await uploadInitialOwnerVenuePhoto(user.id, venuePhotoFile)
        navigate(postLoginPath, { replace: true })
      } else if (mode === 'signup') {
        if (pendingOwnerPhotoUserId) {
          if (venuePhotoFile) await uploadInitialOwnerVenuePhoto(pendingOwnerPhotoUserId, venuePhotoFile)
          setPendingOwnerPhotoUserId('')
          navigate(postLoginPath, { replace: true })
          return
        }
        if (otpSent) {
          if (!/^\d{6}$/.test(form.otp)) throw new Error('Take six penalty kicks to enter the 6-digit verification code.')
          let { data, error } = await supabase.auth.verifyOtp({
            email: form.email.trim(),
            token: form.otp.trim(),
            type: 'signup',
          })
          if (error?.name === 'AuthInvalidTokenResponseError') {
            const signInResult = await supabase.auth.signInWithPassword({
              email: form.email.trim(),
              password: form.password,
            })
            if (signInResult.error) {
              throw new Error('We could not finish verifying your email. Please request a new code and try again.')
            }
            data = signInResult.data
            error = null
          }
          if (error) throw error
          if (data.session && data.user) {
            setPendingOwnerPhotoUserId(data.user.id)
            if (form.accountType === 'venue_owner' && venuePhotoFile) await uploadInitialOwnerVenuePhoto(data.user.id, venuePhotoFile)
            setPendingOwnerPhotoUserId('')
            navigate(postLoginPath, { replace: true })
          }
          else {
            showMessage(form.accountType === 'venue_owner' && venuePhotoFile
              ? 'Your email is verified. Sign in, then add your venue photo from Your Venue in the owner workspace.'
              : 'Your email is verified. You can now log in.', 'success')
            window.setTimeout(() => navigate(`/sign-in${returnQuery}`, { replace: true }), 900)
          }
          return
        }
        if (!/^[A-Za-z0-9_]{3,24}$/.test(form.username)) {
          showMessage('Username must be 3–24 characters and contain only letters, numbers, or underscores.')
          return
        }
        if (!form.acceptedTerms) throw new Error('You must agree to the Terms and Conditions to create an account.')
        if (form.password !== form.confirmPassword) {
          showMessage('Your passwords do not match.')
          return
        }
        if (form.accountType === 'venue_owner' && (form.ownerVenue.name.trim().length < 2 || form.ownerVenue.area.trim().length < 2)) {
          showMessage('Add your venue name and district or area to create a venue-owner account.')
          return
        }
        const registrationLocation = requireRegistrationLocation(form)
        if (form.accountType === 'venue_owner') requireVenueCoordinates(form.ownerVenue)
        if (form.accountType === 'venue_owner' && venuePhotoFile) validateVenuePhoto(venuePhotoFile)
        const { data: isAvailable, error: usernameError } = await supabase.rpc('is_username_available', {
          requested_username: form.username.trim().toLowerCase(),
        })
        if (usernameError) {
          if (usernameError.code === 'PGRST202' || usernameError.code === '42883') {
            throw new Error('PlayLink profile setup is not applied to Supabase yet. Apply the SQL migration in supabase/migrations, then try again.')
          }
          throw usernameError
        }
        if (!isAvailable) {
          await showUsernameSuggestions(form.username.trim().toLowerCase())
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: form.fullName.trim(),
              username: form.username.trim().toLowerCase(),
              phone: form.phone.trim(),
              account_type: form.accountType,
              preferred_sport: form.preferredSport,
              terms_accepted: true,
              terms_version: CURRENT_TERMS_VERSION,
              terms_accepted_at: new Date().toISOString(),
              ...registrationLocation,
              ...(form.accountType === 'venue_owner' ? { owner_venue: { ...form.ownerVenue, image_url: '' } } : {}),
            },
          },
        })
        if (error) {
          if (error.code === 'user_already_exists' || /already (?:registered|exists)/i.test(error.message || '')) {
            showMessage('An account already exists for this email address. Log in instead, or use Forgot password if you cannot access it.')
            return
          }
          if (error.code === '23505' && error.message?.includes('profiles_username_lower_unique')) {
            await showUsernameSuggestions(form.username.trim().toLowerCase())
            return
          }
          throw error
        }
        if (data.user && data.user.identities?.length === 0) {
          showMessage('An account already exists for this email address. Log in instead, or use Forgot password if you cannot access it.')
          return
        }
        if (data.session) {
          if (data.user) setPendingOwnerPhotoUserId(data.user.id)
          if (form.accountType === 'venue_owner' && venuePhotoFile) await uploadInitialOwnerVenuePhoto(data.user.id, venuePhotoFile)
          setPendingOwnerPhotoUserId('')
          navigate(postLoginPath, { replace: true })
        }
        else {
          setOtpSent(true)
          setChallengeExpiresAt(Date.now() + challengeDurationSeconds * 1000)
          setResendCooldown(resendCooldownSeconds)
          showMessage('We sent a 6-digit verification code to your email. Enter it below to finish creating your account.', 'success')
        }
      } else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        })
        if (error) throw error
        const session = data.session
        if (!session) throw new Error('Sign-in did not return an active session.')
        navigate(isDesignatedAdmin(session.user) ? '/admin' : postLoginPath, { replace: true })
      } else if (mode === 'forgot') {
        if (recoveryOtpSent) {
          if (!/^\d{6}$/.test(form.recoveryOtp)) throw new Error('Take six penalty kicks to enter the 6-digit password-reset code.')
          const { data, error: verificationError } = await supabase.auth.verifyOtp({
            email: form.email.trim(),
            token: form.recoveryOtp.trim(),
            type: 'recovery',
          })
          let recoverySession = data.session
          let error = verificationError
          if (!verificationError || verificationError.name === 'AuthInvalidTokenResponseError') {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) throw sessionError
            recoverySession ||= sessionData.session
            if (verificationError?.name === 'AuthInvalidTokenResponseError'
              && recoverySession?.user.email?.toLowerCase() === form.email.trim().toLowerCase()) {
              error = null
            }
          }
          if (error?.name === 'AuthInvalidTokenResponseError') {
            setForm((current) => ({ ...current, recoveryOtp: '' }))
            showMessage('We could not verify that code. Request a new code and try again.')
            return
          }
          if (error) throw error
          if (!recoverySession || recoverySession.user.email?.toLowerCase() !== form.email.trim().toLowerCase()) {
            setForm((current) => ({ ...current, recoveryOtp: '' }))
            showMessage('We could not verify that code. Request a new code and try again.')
            return
          }
          navigate('/reset-password', { replace: true })
          return
        }
        const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setRecoveryOtpSent(true)
        setChallengeExpiresAt(Date.now() + challengeDurationSeconds * 1000)
        setResendCooldown(resendCooldownSeconds)
        showMessage('If an account exists for this Gmail address, a code has been sent. Check your inbox, spam, and Promotions.', 'success')
      } else if (mode === 'reset') {
        if (form.password !== form.confirmPassword) {
          showMessage('Your passwords do not match.')
          return
        }
        const { error } = await supabase.auth.updateUser({ password: form.password })
        if (error) throw error
        showMessage('Your password has been updated. You can now log in.', 'success')
        window.setTimeout(() => navigate('/sign-in', { replace: true }), 900)
      }
    } catch (authError) {
      if (mode === 'login' && isDesignatedAdminEmail(form.email)
        && /invalid login credentials/i.test(authError instanceof Error ? authError.message : '')) {
        showMessage('Email or password is incorrect. If you cannot access your account, reset your password.')
      } else if (((mode === 'signup' && otpSent) || (mode === 'forgot' && recoveryOtpSent)) && isInvalidOtpError(authError)) {
        showMessage('Code does not match. Check the code and try again.')
      } else {
        showMessage(getPublicAuthError(authError, 'We could not complete your request. Please try again.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function resendCode() {
    if (!supabase) return
    if (resendCooldown > 0) return
    setBusy(true)
    setMessage('')
    try {
      const result = mode === 'signup'
        ? await supabase.auth.resend({ type: 'signup', email: form.email.trim() })
        : await supabase.auth.resetPasswordForEmail(form.email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      if (result.error) throw result.error
      setForm((current) => ({ ...current, ...(mode === 'signup' ? { otp: '' } : { recoveryOtp: '' }) }))
      setChallengeExpiresAt(Date.now() + challengeDurationSeconds * 1000)
      setResendCooldown(resendCooldownSeconds)
      showMessage(mode === 'signup'
        ? 'If signup is still awaiting verification, a new verification code has been sent.'
        : 'If an account exists for this Gmail address, a new code has been sent. Check your inbox, spam, and Promotions.', 'success')
    } catch (authError) {
      showMessage(getPublicAuthError(authError, 'We could not send a new code. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function sendFallbackLink(type) {
    if (!supabase) return
    if (resendCooldown > 0) return
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.functions.invoke('send-auth-fallback-link', {
        body: {
          type,
          email: form.email.trim(),
          ...(type === 'signup' ? { password: form.password } : {}),
        },
      })
      if (error) throw error
      setResendCooldown(resendCooldownSeconds)
      showMessage(type === 'signup'
        ? 'If signup is still awaiting verification, a one-time sign-in link has been sent. Check your inbox and spam folder.'
        : 'If an account exists for that email, a password-reset link has been sent. Check your inbox and spam folder.', 'success')
    } catch (authError) {
      showMessage(getPublicAuthError(authError, 'We could not send the sign-in link. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (!supabase) {
      showMessage('Account services are temporarily unavailable. Please try again later.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` },
      })
      if (error) throw error
    } catch (authError) {
      showMessage(getPublicAuthError(authError, 'Google sign-in could not be started. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className={`auth-shell${otpScreen ? ' auth-shell-otp' : ''}`}>
        <section className="auth-brand-panel">
          <Link to="/dashboard" className="auth-brand" aria-label="PlayLink dashboard"><img src="/playlink-auth-logo.png" alt="PlayLink — Find Courts. Join Games. Play Together." /></Link>
          <div className="auth-brand-copy"><span>{view.brandEyebrow}</span><h1>{view.brandTitle}</h1><p>{view.brandDescription}</p></div>
        </section>
        <section className="auth-form-panel">
          <div className={`auth-form-wrap${otpScreen ? ' auth-form-wrap-otp' : ''}`}>
            <Link to="/dashboard" className="auth-mobile-brand" aria-label="PlayLink dashboard"><img src="/playlink-auth-logo.png" alt="PlayLink — Find Courts. Join Games. Play Together." /></Link>
            {mode === 'reset' && <Link className="auth-back-link" to="/sign-in">← Back to login</Link>}
            {mode === 'google-complete' && <Link className="auth-back-link" to="/sign-in">← Back to login</Link>}
            <div className="auth-form-heading">
              <div>
                <span>{otpScreen ? mode === 'signup' ? 'WELCOME TO PLAYLINK' : 'ACCOUNT RECOVERY' : view.eyebrow}</span>
                <h2>{otpScreen ? mode === 'signup' ? 'Verify your account' : 'Reset your password' : view.title}</h2>
                <p>{otpScreen ? 'Enter the 6-digit code by scoring goals.' : view.description}</p>
              </div>
              {otpScreen && <div className={`penalty-countdown${challengeSecondsRemaining > 0 && challengeSecondsRemaining <= 5 ? ' is-warning' : ''}${challengeSecondsRemaining <= 0 ? ' is-finished' : ''}`} role="timer" aria-label={challengeSecondsRemaining <= 0 ? 'Challenge time is up' : `Time left ${formatCountdown(challengeSecondsRemaining)}`}>
                <span className="penalty-countdown-icon" aria-hidden="true">
                  <svg viewBox="0 0 64 64" focusable="false">
                    <path className="penalty-hourglass-frame" d="M12 8h40v8H12zM12 48h40v8H12zM18 16v9l12 7-12 7v9M46 16v9l-12 7 12 7v9" />
                    <path className="penalty-hourglass-top-sand" d="M21 19h22l-11 10z" />
                    <path className="penalty-hourglass-stream" d="M32 31v9" />
                    <path className="penalty-hourglass-bottom-sand" d="m20 45 12-14 12 14z" />
                  </svg>
                </span>
                <span><small>{challengeSecondsRemaining <= 0 ? 'Challenge' : 'Time left'}</small><strong>{challengeSecondsRemaining <= 0 ? 'Time up' : formatCountdown(challengeSecondsRemaining)}</strong></span>
              </div>}
            </div>
            <form onSubmit={submit}>
              {mode === 'google-complete' && <>
                <label htmlFor="auth-google-full-name">Full name</label><input id="auth-google-full-name" autoComplete="name" value={form.fullName} onChange={change('fullName')} placeholder="Your full name" minLength="2" maxLength="80" required />
                <label htmlFor="auth-google-username">Username</label><input id="auth-google-username" autoComplete="username" value={form.username} onChange={change('username')} placeholder="Choose a unique username" minLength="3" maxLength="24" required /><small className="auth-field-hint">3–24 characters; letters, numbers, and underscores.</small>
                <label htmlFor="auth-google-email">Google email</label><input id="auth-google-email" type="email" autoComplete="email" value={form.email} readOnly required />
                <small className="auth-field-hint">Verified by Google; it cannot be changed here.</small>
                <label htmlFor="auth-google-phone">Phone number <span className="auth-optional">(optional)</span></label><input id="auth-google-phone" type="tel" autoComplete="tel" value={form.phone} onChange={change('phone')} placeholder="e.g. +977-9812345678" />
                <PasswordField id="auth-google-password" label="Password" autoComplete="new-password" value={form.password} onChange={change('password')} showStrength />
                <PasswordField id="auth-google-confirm-password" label="Confirm password" autoComplete="new-password" value={form.confirmPassword} onChange={change('confirmPassword')} />
                <label htmlFor="auth-google-account-type">I’m joining as</label><select className="auth-select" id="auth-google-account-type" value={form.accountType} onChange={change('accountType')}><option value="player">Player</option><option value="venue_owner">Venue owner</option></select>
                <label htmlFor="auth-google-preferred-sport">Preferred sport</label><select className="auth-select" id="auth-google-preferred-sport" value={form.preferredSport} onChange={change('preferredSport')}>{sportOptions.map((item) => <option key={item.slug}>{item.name}</option>)}<option>Both</option></select>
                <SignupLocationFields prefix="auth-google" form={form} onChange={change} onUseLocation={() => captureLocation('home')} busy={locationBusy} error={locationError} />
                <label className="auth-terms-acceptance">
                  <input type="checkbox" checked={form.acceptedTerms} onChange={(event) => setForm((current) => ({ ...current, acceptedTerms: event.target.checked }))} required />
                  <span>I have read and agree to the <Link to="/terms" target="_blank" rel="noreferrer">Terms and Conditions</Link>.</span>
                </label>
                {sportsError && <p className="auth-message error" role="alert">{sportsError}</p>}
                {form.accountType === 'venue_owner' && <fieldset className="auth-owner-venue">
                  <legend>Venue profile</legend>
                  <p>Enter your venue details to publish it after registration.</p>
                  <label htmlFor="auth-google-venue-name">Venue name</label><input id="auth-google-venue-name" value={form.ownerVenue.name} onChange={changeOwnerVenue('name')} required minLength="2" maxLength="120" placeholder="Your venue’s name" />
                  <label htmlFor="auth-google-venue-sport">Sport</label><select className="auth-select" id="auth-google-venue-sport" value={form.ownerVenue.sport} onChange={changeOwnerVenue('sport')}>{venueSportOptions.map((item) => <option key={item.slug}>{item.name}</option>)}<option>Both</option></select>
                  {sportsError && <p className="auth-message error" role="alert">{sportsError}</p>}
                  <label htmlFor="auth-google-venue-area">District / area</label><input id="auth-google-venue-area" value={form.ownerVenue.area} onChange={changeOwnerVenue('area')} required minLength="2" maxLength="160" placeholder="Kathmandu, Lalitpur, or Bhaktapur" />
                  <label htmlFor="auth-google-venue-address">Street address</label><input id="auth-google-venue-address" value={form.ownerVenue.address} onChange={changeOwnerVenue('address')} maxLength="240" placeholder="Full address" />
                  <label htmlFor="auth-google-venue-price">Hourly rate (Rs)</label><input id="auth-google-venue-price" type="number" min="0" step="50" value={form.ownerVenue.price_per_hour} onChange={changeOwnerVenue('price_per_hour')} required />
                  <VenuePhotoPicker id="auth-google-venue-photo" file={venuePhotoFile} currentUrl={form.ownerVenue.image_url} onChange={changeVenuePhoto} />
                  <button className="auth-location-button" type="button" onClick={() => captureLocation('venue')} disabled={venueLocationBusy}>{venueLocationBusy ? 'Getting venue coordinates…' : 'Use current location for venue'}</button>
                  <div className="auth-owner-coordinate-row"><span><label htmlFor="auth-google-venue-latitude">Venue latitude</label><input id="auth-google-venue-latitude" type="number" min="-90" max="90" step="any" value={form.ownerVenue.latitude} onChange={changeOwnerVenue('latitude')} required /></span><span><label htmlFor="auth-google-venue-longitude">Venue longitude</label><input id="auth-google-venue-longitude" type="number" min="-180" max="180" step="any" value={form.ownerVenue.longitude} onChange={changeOwnerVenue('longitude')} required /></span></div>
                  {venueLocationError && <p className="auth-location-error" role="alert">{venueLocationError}</p>}
                  <label htmlFor="auth-google-venue-maps">Google Maps link <span className="auth-optional">(optional)</span></label><input id="auth-google-venue-maps" type="url" value={form.ownerVenue.maps_url} onChange={changeOwnerVenue('maps_url')} placeholder="https://www.google.com/maps/search/…" />
                  <label htmlFor="auth-google-venue-description">About this venue <span className="auth-optional">(optional)</span></label><textarea className="auth-owner-description" id="auth-google-venue-description" rows="3" maxLength="1000" value={form.ownerVenue.description} onChange={changeOwnerVenue('description')} placeholder="Describe your facilities." />
                </fieldset>}
                <p className="auth-field-hint">Google verified your email. Your password will also work for future PlayLink sign-ins.</p>
              </>}
              {mode === 'signup' && !otpSent && <>
                <label htmlFor="auth-full-name">Full name</label><input id="auth-full-name" autoComplete="name" value={form.fullName} onChange={change('fullName')} placeholder="e.g. Binaya Adhikari" required />
                <label htmlFor="auth-username">Username</label><input id="auth-username" autoComplete="username" value={form.username} onChange={change('username')} placeholder="Choose a unique username" minLength="3" maxLength="24" required /><small className="auth-field-hint">3–24 characters; letters, numbers, and underscores.</small>
                <label htmlFor="auth-signup-email">Email address</label><input id="auth-signup-email" type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@example.com" required />
                <label htmlFor="auth-account-type">I’m joining as</label><select className="auth-select" id="auth-account-type" value={form.accountType} onChange={change('accountType')}><option value="player">Player</option><option value="venue_owner">Venue owner</option></select>
                <label htmlFor="auth-preferred-sport">Preferred sport</label><select className="auth-select" id="auth-preferred-sport" value={form.preferredSport} onChange={change('preferredSport')}>{sportOptions.map((item) => <option key={item.slug}>{item.name}</option>)}<option>Both</option></select>
                <SignupLocationFields prefix="auth-signup" form={form} onChange={change} onUseLocation={() => captureLocation('home')} busy={locationBusy} error={locationError} />
                <label className="auth-terms-acceptance">
                  <input type="checkbox" checked={form.acceptedTerms} onChange={(event) => setForm((current) => ({ ...current, acceptedTerms: event.target.checked }))} required />
                  <span>I have read and agree to the <Link to="/terms" target="_blank" rel="noreferrer">Terms and Conditions</Link>.</span>
                </label>
                {sportsError && <p className="auth-message error" role="alert">{sportsError}</p>}
                {form.accountType === 'venue_owner' && <fieldset className="auth-owner-venue">
                  <legend>Venue profile</legend>
                  <p>Add the venue you want to list. You can update these details later in your owner dashboard.</p>
                  <label htmlFor="auth-venue-name">Venue name</label><input id="auth-venue-name" value={form.ownerVenue.name} onChange={changeOwnerVenue('name')} required minLength="2" maxLength="120" placeholder="Your venue’s registered name" />
                  <small className="auth-field-hint">Enter accurate venue details. Your listing can be edited after registration.</small>
                  <label htmlFor="auth-venue-sport">Sport</label><select className="auth-select" id="auth-venue-sport" value={form.ownerVenue.sport} onChange={changeOwnerVenue('sport')}>{venueSportOptions.map((item) => <option key={item.slug}>{item.name}</option>)}<option>Both</option></select>
                  {sportsError && <p className="auth-message error" role="alert">{sportsError}</p>}
                  <label htmlFor="auth-venue-area">District / area</label><input id="auth-venue-area" value={form.ownerVenue.area} onChange={changeOwnerVenue('area')} required minLength="2" maxLength="160" placeholder="Kathmandu, Lalitpur, Bhaktapur…" />
                  <label htmlFor="auth-venue-address">Street address</label><input id="auth-venue-address" value={form.ownerVenue.address} onChange={changeOwnerVenue('address')} maxLength="240" placeholder="Full address" />
                  <label htmlFor="auth-venue-price">Hourly rate (Rs)</label><input id="auth-venue-price" type="number" min="0" step="50" value={form.ownerVenue.price_per_hour} onChange={changeOwnerVenue('price_per_hour')} required />
                  <VenuePhotoPicker id="auth-venue-photo" file={venuePhotoFile} currentUrl={form.ownerVenue.image_url} onChange={changeVenuePhoto} />
                  <button className="auth-location-button" type="button" onClick={() => captureLocation('venue')} disabled={venueLocationBusy}>{venueLocationBusy ? 'Getting venue coordinates…' : 'Use current location for venue'}</button>
                  <div className="auth-owner-coordinate-row"><span><label htmlFor="auth-venue-latitude">Venue latitude</label><input id="auth-venue-latitude" type="number" min="-90" max="90" step="any" value={form.ownerVenue.latitude} onChange={changeOwnerVenue('latitude')} required placeholder="27.7152" /></span><span><label htmlFor="auth-venue-longitude">Venue longitude</label><input id="auth-venue-longitude" type="number" min="-180" max="180" step="any" value={form.ownerVenue.longitude} onChange={changeOwnerVenue('longitude')} required placeholder="85.3128" /></span></div>
                  {venueLocationError && <p className="auth-location-error" role="alert">{venueLocationError}</p>}
                  <label htmlFor="auth-venue-maps">Google Maps link <span className="auth-optional">(optional)</span></label><input id="auth-venue-maps" type="url" value={form.ownerVenue.maps_url} onChange={changeOwnerVenue('maps_url')} placeholder="https://www.google.com/maps/search/…" />
                  <label htmlFor="auth-venue-description">About this venue <span className="auth-optional">(optional)</span></label><textarea className="auth-owner-description" id="auth-venue-description" rows="3" maxLength="1000" value={form.ownerVenue.description} onChange={changeOwnerVenue('description')} placeholder="Tell players about your facilities, surface, changing rooms or lights." />
                  <label className="auth-owner-active"><input type="checkbox" checked={form.ownerVenue.is_active} onChange={changeOwnerVenue('is_active')} /><span>Show this venue to players after registration</span></label>
                </fieldset>}
                <label htmlFor="auth-phone">Phone number <span className="auth-optional">(optional)</span></label><input id="auth-phone" type="tel" autoComplete="tel" value={form.phone} onChange={change('phone')} placeholder="e.g. +977-9812345678" />
                <PasswordField id="auth-signup-password" label="Password" autoComplete="new-password" value={form.password} onChange={change('password')} showStrength />
                <PasswordField id="auth-confirm-password" label="Confirm password" autoComplete="new-password" value={form.confirmPassword} onChange={change('confirmPassword')} />
              </>}
              {mode === 'signup' && otpSent && <>
                <span className="penalty-code-label">Verification code</span>
                <PenaltyOtpGame key={challengeExpiresAt} value={form.otp} onChange={(otp) => setForm((current) => ({ ...current, otp }))} label="signup verification code" secondsRemaining={challengeSecondsRemaining} onResend={resendCode} resendDisabled={busy || resendCooldown > 0} resendLabel={resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : busy ? 'Sending code…' : 'Resend code'} />
                {challengeSecondsRemaining > 0 && <div className="penalty-auth-actions">
                  <button className="auth-resend-code" type="button" disabled={busy || resendCooldown > 0} onClick={resendCode}>{resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}</button>
                  <button className="auth-resend-code" type="button" disabled={busy || resendCooldown > 0} onClick={() => sendFallbackLink('signup')}>{resendCooldown > 0 ? `Send link in ${resendCooldown}s` : 'Send sign-in link'}</button>
                </div>}
              </>}
              {mode === 'login' && <>
                <label htmlFor="auth-login-email">Email address</label><input id="auth-login-email" type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@example.com" required />
                <PasswordField id="auth-login-password" label="Password" autoComplete="current-password" value={form.password} onChange={change('password')} />
                <div className="auth-options"><span>Secure password sign-in</span><Link to="/forgot-password">Forgot password?</Link></div>
              </>}
              {mode === 'forgot' && <>
                {!recoveryOtpSent && <><label htmlFor="auth-reset-email">Email address</label><input id="auth-reset-email" type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@example.com" required /> </>}
                {recoveryOtpSent && <>
                  <span className="penalty-code-label">Password-reset code</span>
                  <PenaltyOtpGame key={challengeExpiresAt} value={form.recoveryOtp} onChange={(recoveryOtp) => setForm((current) => ({ ...current, recoveryOtp }))} label="password-reset code" secondsRemaining={challengeSecondsRemaining} onResend={resendCode} resendDisabled={busy || resendCooldown > 0} resendLabel={resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : busy ? 'Sending code…' : 'Resend code'} />
                  {challengeSecondsRemaining > 0 && <div className="penalty-auth-actions">
                    <button className="auth-resend-code" type="button" disabled={busy || resendCooldown > 0} onClick={resendCode}>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}</button>
                  </div>}
                </>}
              </>}
              {mode === 'reset' && <>
                <PasswordField id="auth-new-password" label="New password" autoComplete="new-password" value={form.password} onChange={change('password')} showStrength />
                <PasswordField id="auth-new-password-confirm" label="Confirm new password" autoComplete="new-password" value={form.confirmPassword} onChange={change('confirmPassword')} />
              </>}
              <button className={`auth-submit${otpScreen ? ' penalty-submit' : ''}`} type="submit" disabled={busy || (otpScreen && activeOtpValue.length !== 6)}>{busy ? 'Please wait…' : mode === 'google-complete' ? 'Complete registration' : mode === 'signup' ? otpSent ? 'Verify code' : 'Create account' : mode === 'login' ? 'Log in' : mode === 'forgot' ? recoveryOtpSent ? 'Verify code' : 'Send verification code' : 'Save new password'} <span>→</span></button>
              {mode === 'login' && <>
                <div className="auth-divider"><span>or continue with</span></div>
                <button className="auth-google" type="button" disabled={busy} onClick={signInWithGoogle}><svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" /><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.7 15.2 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 5.1 29.3 3 24 3 16 3 9.1 7.5 6.3 14.7z" /><path fill="#FBBC05" d="M12.9 19.5l-6.6-4.8a21 21 0 000 18.6l6.6-4.8a12 12 0 010-9z" /><path fill="#EA4335" d="M24 45c5.3 0 10.1-1.8 13.5-5l-6.3-5.2c-1.8 1.2-4.2 2-7.2 2-5 0-9.3-3.2-11.1-7.7l-6.6 4.8C9.4 40.5 16.2 45 24 45z" /></svg> Continue with Google</button>
              </>}
              {message && <p className={`auth-message ${messageType}`} role="status">{message}</p>}
              {mode === 'signup' && usernameSuggestions.length > 0 && <div className="auth-username-suggestions" aria-label="Suggested available usernames">{usernameSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setForm((current) => ({ ...current, username: suggestion })); setUsernameSuggestions([]); setMessage('') }}>@{suggestion}</button>)}</div>}
              {!supabaseConfigured && <ConfigurationMessage />}
            </form>
            {mode === 'signup' && <p className="auth-switch-copy">Already have an account? <Link to={`/sign-in${returnQuery}`}>Log in</Link></p>}
            {mode === 'google-complete' && <p className="auth-switch-copy">Your Google account is connected. Your PlayLink profile will be saved when you complete this form.</p>}
            {mode === 'login' && <p className="auth-switch-copy">New to PlayLink? <Link to={`/get-started${returnQuery}`}>Create an account</Link></p>}
            {mode === 'login' && isDesignatedAdminEmail(form.email) && <p className="auth-switch-copy">First admin setup? <Link to={`/get-started${returnQuery}`}>Create and verify this account</Link>, or <Link to="/forgot-password">reset its password</Link> if it already exists.</p>}
            {mode === 'forgot' && <p className="auth-switch-copy"><Link to="/sign-in">Log in</Link></p>}
            {mode === 'reset' && <p className="auth-switch-copy"><Link to="/sign-in">Return to login</Link></p>}
          </div>
        </section>
      </div>
    </main>
  )
}
