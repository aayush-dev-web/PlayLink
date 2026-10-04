import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './supabase.js'
import { useAuth } from './AuthContext.jsx'
import VenuePhotoPicker from '../components/VenuePhotoPicker.jsx'
import { uploadVenuePhoto, validateVenuePhoto } from '../data/venuePhotos.js'
import './auth.css'

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
    description: 'We’ll email you a secure link to choose a new password.',
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
  return <div className="auth-config-message" role="status">Authentication is not configured yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your local <code>.env.local</code>, then restart Vite.</div>
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
  if (!supabase) throw new Error('Venue photo upload needs a configured Supabase connection.')
  const { data: venue, error: venueError } = await supabase.from('owner_venues')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (venueError) throw venueError
  if (!venue) throw new Error('Your venue profile could not be found. Confirm the venue owner signup migration has been applied.')
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
  const { user } = useAuth()
  const requestedReturnTo = new URLSearchParams(location.search).get('next')
  const postLoginPath = requestedReturnTo?.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/dashboard'
  const view = viewContent[mode] || viewContent.signup
  const [form, setForm] = useState({ fullName: '', username: '', email: '', phone: '', password: '', confirmPassword: '', otp: '', accountType: 'player', ownerVenue: { name: '', sport: 'Futsal', area: '', address: '', price_per_hour: '', image_url: '', latitude: '', longitude: '', maps_url: '', description: '', is_active: true } })
  const [busy, setBusy] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [recoveryLinkSent, setRecoveryLinkSent] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('error')
  const [usernameSuggestions, setUsernameSuggestions] = useState([])
  const [venuePhotoFile, setVenuePhotoFile] = useState(null)
  const [pendingOwnerPhotoUserId, setPendingOwnerPhotoUserId] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

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
    if (user && (mode === 'signup' || mode === 'login')) {
      navigate(mode === 'login' ? postLoginPath : '/dashboard', { replace: true })
    }
  }, [user, mode, navigate, postLoginPath])

  function change(key) {
    return (event) => {
      setForm((current) => ({ ...current, [key]: event.target.value }))
      if (key === 'email' && mode === 'forgot') setRecoveryLinkSent(false)
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
    }
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
        showMessage('That username is taken. Apply the latest profile migration to see available suggestions.')
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
      showMessage('Connect a Supabase project in .env.local to enable authentication.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'google-complete') {
        if (!user) throw new Error('Sign in with Google before completing your PlayLink profile.')
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
        if (venuePhotoFile) validateVenuePhoto(venuePhotoFile)
        const { data: existingProfile, error: profileError } = await supabase.from('profiles')
          .select('account_type,onboarding_completed')
          .eq('id', user.id)
          .maybeSingle()
        if (profileError) throw profileError
        if (existingProfile?.onboarding_completed !== true) {
          const { error: passwordError } = await supabase.auth.updateUser({ password: form.password })
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
        if (form.accountType === 'venue_owner' && venuePhotoFile) await uploadInitialOwnerVenuePhoto(user.id, venuePhotoFile)
        navigate('/dashboard', { replace: true })
      } else if (mode === 'signup') {
        if (pendingOwnerPhotoUserId) {
          if (venuePhotoFile) await uploadInitialOwnerVenuePhoto(pendingOwnerPhotoUserId, venuePhotoFile)
          setPendingOwnerPhotoUserId('')
          navigate('/dashboard', { replace: true })
          return
        }
        if (otpSent) {
          const { data, error } = await supabase.auth.verifyOtp({
            email: form.email.trim(),
            token: form.otp.trim(),
            type: 'signup',
          })
          if (error) throw error
          if (data.session && data.user) {
            setPendingOwnerPhotoUserId(data.user.id)
            if (form.accountType === 'venue_owner' && venuePhotoFile) await uploadInitialOwnerVenuePhoto(data.user.id, venuePhotoFile)
            setPendingOwnerPhotoUserId('')
            navigate('/dashboard', { replace: true })
          }
          else {
            showMessage(form.accountType === 'venue_owner' && venuePhotoFile
              ? 'Your email is verified. Sign in, then add your venue photo from Your Venue in the owner workspace.'
              : 'Your email is verified. You can now log in.', 'success')
            window.setTimeout(() => navigate('/sign-in', { replace: true }), 900)
          }
          return
        }
        if (!/^[A-Za-z0-9_]{3,24}$/.test(form.username)) {
          showMessage('Username must be 3–24 characters and contain only letters, numbers, or underscores.')
          return
        }
        if (form.password !== form.confirmPassword) {
          showMessage('Your passwords do not match.')
          return
        }
        if (form.accountType === 'venue_owner' && (form.ownerVenue.name.trim().length < 2 || form.ownerVenue.area.trim().length < 2)) {
          showMessage('Add your venue name and district or area to create a venue-owner account.')
          return
        }
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
          navigate('/dashboard', { replace: true })
        }
        else {
          setOtpSent(true)
          setResendCooldown(resendCooldownSeconds)
          showMessage('Supabase accepted your signup request. Check your inbox and spam folder for a verification email. If it does not arrive, check Supabase Auth logs and your email provider delivery status.', 'success')
        }
      } else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        })
        if (error) throw error
        const session = data.session
        if (!session) throw new Error('Sign-in did not return an active session.')
        navigate(postLoginPath, { replace: true })
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setRecoveryLinkSent(true)
        setResendCooldown(resendCooldownSeconds)
        showMessage('If an account exists for that email, a reset link has been sent. Open it to choose your new password.', 'success')
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
      showMessage(authError instanceof Error ? authError.message : 'Authentication failed. Please try again.')
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
      if (mode === 'forgot') setRecoveryLinkSent(true)
      setResendCooldown(resendCooldownSeconds)
      showMessage(mode === 'signup'
        ? 'Supabase accepted the resend request. Check your inbox and spam folder; if no email arrives, check Supabase Auth logs and your email provider delivery status.'
        : 'Supabase accepted the reset request. Check your inbox and spam folder; if no email arrives, check Supabase Auth logs and your email provider delivery status.', 'success')
    } catch (authError) {
      showMessage(authError instanceof Error ? authError.message : 'A new code could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (!supabase) {
      showMessage('Connect a Supabase project in .env.local to enable authentication.')
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
      showMessage(authError instanceof Error ? authError.message : 'Google sign-in could not be started.')
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="auth-brand-panel">
          <Link to="/dashboard" className="auth-brand" aria-label="PlayLink dashboard"><img src="/playlink-auth-logo.png" alt="PlayLink — Find Courts. Join Games. Play Together." /></Link>
          <div className="auth-brand-copy"><span>{view.brandEyebrow}</span><h1>{view.brandTitle}</h1><p>{view.brandDescription}</p></div>
        </section>
        <section className="auth-form-panel">
          <div className="auth-form-wrap">
            <Link to="/dashboard" className="auth-mobile-brand" aria-label="PlayLink dashboard"><img src="/playlink-auth-logo.png" alt="PlayLink — Find Courts. Join Games. Play Together." /></Link>
            {mode === 'reset' && <Link className="auth-back-link" to="/sign-in">← Back to login</Link>}
            {mode === 'google-complete' && <Link className="auth-back-link" to="/sign-in">← Back to login</Link>}
            <div className="auth-form-heading"><span>{view.eyebrow}</span><h2>{view.title}</h2><p>{view.description}</p></div>
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
                {form.accountType === 'venue_owner' && <fieldset className="auth-owner-venue">
                  <legend>Venue profile</legend>
                  <p>Enter your venue details to publish it after registration.</p>
                  <label htmlFor="auth-google-venue-name">Venue name</label><input id="auth-google-venue-name" value={form.ownerVenue.name} onChange={changeOwnerVenue('name')} required minLength="2" maxLength="120" placeholder="Your venue’s name" />
                  <label htmlFor="auth-google-venue-sport">Sport</label><select className="auth-select" id="auth-google-venue-sport" value={form.ownerVenue.sport} onChange={changeOwnerVenue('sport')}><option>Futsal</option><option>Cricket</option><option>Both</option></select>
                  <label htmlFor="auth-google-venue-area">District / area</label><input id="auth-google-venue-area" value={form.ownerVenue.area} onChange={changeOwnerVenue('area')} required minLength="2" maxLength="160" placeholder="Kathmandu, Lalitpur, or Bhaktapur" />
                  <label htmlFor="auth-google-venue-address">Street address</label><input id="auth-google-venue-address" value={form.ownerVenue.address} onChange={changeOwnerVenue('address')} maxLength="240" placeholder="Full address" />
                  <label htmlFor="auth-google-venue-price">Hourly rate (Rs)</label><input id="auth-google-venue-price" type="number" min="0" step="50" value={form.ownerVenue.price_per_hour} onChange={changeOwnerVenue('price_per_hour')} required />
                  <VenuePhotoPicker id="auth-google-venue-photo" file={venuePhotoFile} currentUrl={form.ownerVenue.image_url} onChange={changeVenuePhoto} />
                  <div className="auth-owner-coordinate-row"><span><label htmlFor="auth-google-venue-latitude">Latitude <span className="auth-optional">(optional)</span></label><input id="auth-google-venue-latitude" type="number" min="-90" max="90" step="any" value={form.ownerVenue.latitude} onChange={changeOwnerVenue('latitude')} /></span><span><label htmlFor="auth-google-venue-longitude">Longitude <span className="auth-optional">(optional)</span></label><input id="auth-google-venue-longitude" type="number" min="-180" max="180" step="any" value={form.ownerVenue.longitude} onChange={changeOwnerVenue('longitude')} /></span></div>
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
                {form.accountType === 'venue_owner' && <fieldset className="auth-owner-venue">
                  <legend>Venue profile</legend>
                  <p>Add the venue you want to list. You can update these details later in your owner dashboard.</p>
                  <label htmlFor="auth-venue-name">Venue name</label><input id="auth-venue-name" value={form.ownerVenue.name} onChange={changeOwnerVenue('name')} required minLength="2" maxLength="120" placeholder="Your venue’s registered name" />
                  <small className="auth-field-hint">Enter accurate venue details. Your listing can be edited after registration.</small>
                  <label htmlFor="auth-venue-sport">Sport</label><select className="auth-select" id="auth-venue-sport" value={form.ownerVenue.sport} onChange={changeOwnerVenue('sport')}><option>Futsal</option><option>Cricket</option><option>Both</option></select>
                  <label htmlFor="auth-venue-area">District / area</label><input id="auth-venue-area" value={form.ownerVenue.area} onChange={changeOwnerVenue('area')} required minLength="2" maxLength="160" placeholder="Kathmandu, Lalitpur, Bhaktapur…" />
                  <label htmlFor="auth-venue-address">Street address</label><input id="auth-venue-address" value={form.ownerVenue.address} onChange={changeOwnerVenue('address')} maxLength="240" placeholder="Full address" />
                  <label htmlFor="auth-venue-price">Hourly rate (Rs)</label><input id="auth-venue-price" type="number" min="0" step="50" value={form.ownerVenue.price_per_hour} onChange={changeOwnerVenue('price_per_hour')} required />
                  <VenuePhotoPicker id="auth-venue-photo" file={venuePhotoFile} currentUrl={form.ownerVenue.image_url} onChange={changeVenuePhoto} />
                  <div className="auth-owner-coordinate-row"><span><label htmlFor="auth-venue-latitude">Latitude <span className="auth-optional">(optional)</span></label><input id="auth-venue-latitude" type="number" min="-90" max="90" step="any" value={form.ownerVenue.latitude} onChange={changeOwnerVenue('latitude')} placeholder="27.7152" /></span><span><label htmlFor="auth-venue-longitude">Longitude <span className="auth-optional">(optional)</span></label><input id="auth-venue-longitude" type="number" min="-180" max="180" step="any" value={form.ownerVenue.longitude} onChange={changeOwnerVenue('longitude')} placeholder="85.3128" /></span></div>
                  <label htmlFor="auth-venue-maps">Google Maps link <span className="auth-optional">(optional)</span></label><input id="auth-venue-maps" type="url" value={form.ownerVenue.maps_url} onChange={changeOwnerVenue('maps_url')} placeholder="https://www.google.com/maps/search/…" />
                  <label htmlFor="auth-venue-description">About this venue <span className="auth-optional">(optional)</span></label><textarea className="auth-owner-description" id="auth-venue-description" rows="3" maxLength="1000" value={form.ownerVenue.description} onChange={changeOwnerVenue('description')} placeholder="Tell players about your facilities, surface, changing rooms or lights." />
                  <label className="auth-owner-active"><input type="checkbox" checked={form.ownerVenue.is_active} onChange={changeOwnerVenue('is_active')} /><span>Show this venue to players after registration</span></label>
                </fieldset>}
                <label htmlFor="auth-phone">Phone number <span className="auth-optional">(optional)</span></label><input id="auth-phone" type="tel" autoComplete="tel" value={form.phone} onChange={change('phone')} placeholder="e.g. +977-9812345678" />
                <PasswordField id="auth-signup-password" label="Password" autoComplete="new-password" value={form.password} onChange={change('password')} showStrength />
                <PasswordField id="auth-confirm-password" label="Confirm password" autoComplete="new-password" value={form.confirmPassword} onChange={change('confirmPassword')} />
              </>}
              {mode === 'signup' && otpSent && <>
                <label htmlFor="auth-signup-email-confirm">Email address</label><input id="auth-signup-email-confirm" type="email" value={form.email} readOnly />
                <label htmlFor="auth-signup-otp">6-digit verification code</label><input id="auth-signup-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={form.otp} onChange={change('otp')} placeholder="Enter the code from your email" required />
                <small className="auth-field-hint">If your email has a confirmation link instead of a code, open that link from your inbox to verify your account. You do not need to enter a code in that case.</small>
                <button className="auth-resend-code" type="button" disabled={busy || resendCooldown > 0} onClick={resendCode}>{resendCooldown > 0 ? `Resend verification email in ${resendCooldown}s` : 'Resend verification email'}</button>
              </>}
              {mode === 'login' && <>
                <label htmlFor="auth-login-email">Email address</label><input id="auth-login-email" type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@example.com" required />
                <PasswordField id="auth-login-password" label="Password" autoComplete="current-password" value={form.password} onChange={change('password')} />
                <div className="auth-options"><span>Secure password sign-in</span><Link to="/forgot-password">Forgot password?</Link></div>
              </>}
              {mode === 'forgot' && <>
                <label htmlFor="auth-reset-email">Email address</label><input id="auth-reset-email" type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@example.com" required />
                {recoveryLinkSent && <button className="auth-resend-code" type="button" disabled={busy || resendCooldown > 0} onClick={resendCode}>{resendCooldown > 0 ? `Resend reset link in ${resendCooldown}s` : 'Resend reset link'}</button>}
              </>}
              {mode === 'reset' && <>
                <PasswordField id="auth-new-password" label="New password" autoComplete="new-password" value={form.password} onChange={change('password')} showStrength />
                <PasswordField id="auth-new-password-confirm" label="Confirm new password" autoComplete="new-password" value={form.confirmPassword} onChange={change('confirmPassword')} />
              </>}
              <button className="auth-submit" type="submit" disabled={busy || (mode === 'forgot' && recoveryLinkSent && resendCooldown > 0)}>{busy ? 'Please wait…' : mode === 'google-complete' ? 'Complete registration' : mode === 'signup' ? otpSent ? 'Verify code' : 'Create account' : mode === 'login' ? 'Log in' : mode === 'forgot' ? recoveryLinkSent ? resendCooldown > 0 ? `Resend link in ${resendCooldown}s` : 'Resend reset link' : 'Send reset link' : 'Save new password'} <span>→</span></button>
              {mode === 'login' && <>
                <div className="auth-divider"><span>or continue with</span></div>
                <button className="auth-google" type="button" disabled={busy} onClick={signInWithGoogle}><svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" /><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.7 15.2 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 5.1 29.3 3 24 3 16 3 9.1 7.5 6.3 14.7z" /><path fill="#FBBC05" d="M12.9 19.5l-6.6-4.8a21 21 0 000 18.6l6.6-4.8a12 12 0 010-9z" /><path fill="#EA4335" d="M24 45c5.3 0 10.1-1.8 13.5-5l-6.3-5.2c-1.8 1.2-4.2 2-7.2 2-5 0-9.3-3.2-11.1-7.7l-6.6 4.8C9.4 40.5 16.2 45 24 45z" /></svg> Continue with Google</button>
              </>}
              {message && <p className={`auth-message ${messageType}`} role="status">{message}</p>}
              {mode === 'signup' && usernameSuggestions.length > 0 && <div className="auth-username-suggestions" aria-label="Suggested available usernames">{usernameSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setForm((current) => ({ ...current, username: suggestion })); setUsernameSuggestions([]); setMessage('') }}>@{suggestion}</button>)}</div>}
              {!supabaseConfigured && <ConfigurationMessage />}
            </form>
            {mode === 'signup' && <p className="auth-switch-copy">Already have an account? <Link to="/sign-in">Log in</Link></p>}
            {mode === 'google-complete' && <p className="auth-switch-copy">Your Google account is connected. Your PlayLink profile will be saved when you complete this form.</p>}
            {mode === 'login' && <p className="auth-switch-copy">New to PlayLink? <Link to="/get-started">Create an account</Link></p>}
            {mode === 'forgot' && <p className="auth-switch-copy">Remembered it? <Link to="/sign-in">Log in</Link></p>}
            {mode === 'reset' && <p className="auth-switch-copy"><Link to="/sign-in">Return to login</Link></p>}
          </div>
        </section>
      </div>
    </main>
  )
}
