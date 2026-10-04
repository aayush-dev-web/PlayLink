import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'
import { isCoordinateLabel, reverseGeocodeLocation, visibleLocationName } from '../utils/locationName.js'

const PROFILE_EVENT = 'playlink-profile-updated'
const demoProfileKey = (userId) => `playlink-profile-${userId}`
const initialProfile = {
  display_name: '',
  username: '',
  avatar_url: '',
  bio: '',
  preferred_sport: '',
  player_position: '',
  skill_level: '',
  instagram_url: '',
  facebook_url: '',
  tiktok_url: '',
  home_location: '',
  home_latitude: null,
  home_longitude: null,
}

const socialNetworks = [
  { key: 'instagram_url', label: 'Instagram', icon: 'instagram', host: /^(www\.)?instagram\.com$/i },
  { key: 'facebook_url', label: 'Facebook', icon: 'facebook', host: /^(www\.)?facebook\.com$/i },
  { key: 'tiktok_url', label: 'TikTok', icon: 'tiktok', host: /^(www\.)?tiktok\.com$/i },
]

function SocialMark({ name }) {
  if (name === 'instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.7" cy="6.6" r=".8" className="social-icon-fill" /></svg>
  if (name === 'facebook') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-8h2.8l.4-3.2h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.2H7.2V13H10v8z" className="social-icon-fill" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.2 3c.2 2.1 1.4 3.5 3.5 3.7v3.1a8 8 0 0 1-3.5-1v6.4c0 3.3-3.7 5.4-6.6 3.7-2.9-1.7-2.3-6.1.9-7.1a5 5 0 0 1 2.3-.2v3.3c-1.8-.6-3.3.1-3.1 1.5.2 1.3 2.5 1.7 3.2.2.1-.3.2-.7.2-1V3z" className="social-icon-fill" /></svg>
}

function normalizeSocialUrl(value, network) {
  if (!value.trim()) return ''
  let parsed
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error(`Enter a complete ${network.label} profile URL, including https://.`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !network.host.test(parsed.hostname) || parsed.pathname === '/') {
    throw new Error(`Enter a valid ${network.label} profile URL.`)
  }
  return parsed.toString()
}

export default function DashboardProfile() {
  const { user } = useAuth()
  const isDemo = user?.id === 'playlink-local-demo'
  const [form, setForm] = useState({ ...initialProfile })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [error, setError] = useState('')
  const [usernameSuggestions, setUsernameSuggestions] = useState([])
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    async function loadProfile() {
      setLoading(true)
      setError('')
      if (isDemo) {
        let saved = {}
        try {
          saved = JSON.parse(window.localStorage.getItem(demoProfileKey(user.id)) || '{}')
        } catch {
          window.localStorage.removeItem(demoProfileKey(user.id))
        }
        if (active) {
          const currentProfile = { ...initialProfile, display_name: user.user_metadata?.full_name || 'Demo Player', username: user.user_metadata?.username || 'demo', ...saved }
          const needsPlaceName = Number.isFinite(currentProfile.home_latitude) && Number.isFinite(currentProfile.home_longitude)
            && (!currentProfile.home_location || isCoordinateLabel(currentProfile.home_location))
          if (needsPlaceName) currentProfile.home_location = visibleLocationName(currentProfile.home_location)
          setForm(currentProfile)
          if (needsPlaceName) {
            reverseGeocodeLocation(currentProfile.home_latitude, currentProfile.home_longitude).then((name) => {
              if (active) setForm((current) => ({ ...current, home_location: name }))
            }).catch(() => {
              if (active) setError('Saved coordinates could not be converted to a place name. Enter your area manually.')
            })
          }
        }
        setLoading(false)
        return
      }
      if (!supabase) {
        setError('Profile editing needs a configured Supabase connection.')
        setLoading(false)
        return
      }
      const { data, error: profileError } = await supabase.from('profiles')
        .select('display_name,username,avatar_url,bio,preferred_sport,player_position,skill_level,instagram_url,facebook_url,tiktok_url,home_location,home_latitude,home_longitude')
        .eq('id', user.id).maybeSingle()
      if (!active) return
      if (profileError) setError('Could not load your profile. Apply the dashboard profile migration, then reload this page.')
      else {
        const loadedProfile = {
          ...initialProfile,
          display_name: user.user_metadata?.full_name || '',
          username: user.user_metadata?.username || '',
          ...data,
        }
        const needsPlaceName = Number.isFinite(loadedProfile.home_latitude) && Number.isFinite(loadedProfile.home_longitude)
          && (!loadedProfile.home_location || isCoordinateLabel(loadedProfile.home_location))
        if (needsPlaceName) loadedProfile.home_location = visibleLocationName(loadedProfile.home_location)
        else loadedProfile.home_location = visibleLocationName(loadedProfile.home_location, '')
        setForm(loadedProfile)
        if (needsPlaceName) {
          reverseGeocodeLocation(loadedProfile.home_latitude, loadedProfile.home_longitude).then((name) => {
            if (active) setForm((current) => ({ ...current, home_location: name }))
          }).catch(() => {
            if (active) setError('Saved coordinates could not be converted to a place name. Enter your area manually.')
          })
        }
      }
      setLoading(false)
    }
    loadProfile().catch((loadError) => {
      if (!active) return
      setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.')
      setLoading(false)
    })
    return () => { active = false }
  }, [isDemo, user])

  function setField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
    if (event.target.name === 'username') setUsernameSuggestions([])
    setSuccess('')
  }

  function selectPhoto(event) {
    const input = event.currentTarget
    const file = input.files?.[0] || null
    input.value = ''
    if (!file) return
    const sizeLimit = (isDemo ? 2 : 5) * 1024 * 1024
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoFile(null)
      setError('Choose a JPG, PNG, or WebP profile photo.')
      setSuccess('')
      return
    }
    if (file.size > sizeLimit) {
      setPhotoFile(null)
      setError(`This image is larger than ${isDemo ? '2' : '5'} MB. Upload an image smaller than ${isDemo ? '2' : '5'} MB.`)
      setSuccess('')
      return
    }
    setPhotoFile(file)
    setError('')
    setSuccess('')
  }

  async function suggestUsernames(requestedUsername) {
    if (isDemo) {
      const base = requestedUsername.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'player'
      setUsernameSuggestions([1, 2, 3].map((number) => `${base}_${String(number).padStart(2, '0')}`))
      return
    }
    if (!supabase) throw new Error('Username checks need a configured Supabase connection.')
    const { data, error: suggestionError } = await supabase.rpc('suggest_profile_usernames', {
      requested_username: requestedUsername,
    })
    if (suggestionError) throw suggestionError
    setUsernameSuggestions((data || []).slice(0, 5))
  }

  async function showTakenUsername(requestedUsername) {
    setError('This username has already been taken. Try one of these suggestions:')
    try {
      await suggestUsernames(requestedUsername)
    } catch {
      setUsernameSuggestions([])
      setError('This username has already been taken. Apply the latest profile migration for username suggestions.')
    }
  }

  async function saveProfile(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    const username = form.username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setError('Username must be 3–24 characters and use only letters, numbers, or underscores.')
      return
    }
    if (form.display_name.trim().length < 2 || form.display_name.trim().length > 80) {
      setError('Enter a name between 2 and 80 characters.')
      return
    }
    if (photoFile && (!['image/jpeg', 'image/png', 'image/webp'].includes(photoFile.type) || photoFile.size > (isDemo ? 2 : 5) * 1024 * 1024)) {
      setError(`Choose a JPG, PNG, or WebP image smaller than ${isDemo ? '2' : '5'} MB.`)
      return
    }

    let socialUrls
    try {
      socialUrls = Object.fromEntries(socialNetworks.map((network) => [network.key, normalizeSocialUrl(form[network.key] || '', network) || null]))
    } catch (validationError) {
      setError(validationError.message)
      return
    }

    setSaving(true)
    try {
      if (!isDemo) {
        if (!supabase) throw new Error('Profile editing needs a configured Supabase connection.')
        const { data: usernameAvailable, error: availabilityError } = await supabase.rpc('is_profile_username_available', {
          requested_username: username,
        })
        if (availabilityError) {
          if (['PGRST202', '42883'].includes(availabilityError.code)) {
            throw new Error('Apply the latest profile migration to enable username uniqueness checks.')
          }
          throw availabilityError
        }
        if (!usernameAvailable) {
          await showTakenUsername(username)
          return
        }
      }

      let avatarUrl = form.avatar_url || null
      if (photoFile && !isDemo) {
        if (!supabase) throw new Error('Photo upload needs a configured Supabase connection.')
        const extension = photoFile.type === 'image/png' ? 'png' : photoFile.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `${user.id}/avatar.${extension}`
        const { error: uploadError } = await supabase.storage.from('playlink-avatars').upload(path, photoFile, { upsert: true, contentType: photoFile.type })
        if (uploadError) throw uploadError
        avatarUrl = `${supabase.storage.from('playlink-avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
      } else if (photoFile && isDemo) {
        avatarUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('The selected photo could not be read.'))
          reader.readAsDataURL(photoFile)
        })
      }

      const profile = {
        ...form,
        username,
        display_name: form.display_name.trim(),
        avatar_url: avatarUrl || '',
        bio: form.bio.trim(),
        player_position: form.player_position.trim(),
        home_location: form.home_location.trim(),
        home_latitude: form.home_latitude,
        home_longitude: form.home_longitude,
        ...socialUrls,
      }
      if (isDemo) {
        window.localStorage.setItem(demoProfileKey(user.id), JSON.stringify(profile))
      } else {
        if (!supabase) throw new Error('Profile editing needs a configured Supabase connection.')
        const { data, error: updateError } = await supabase.from('profiles').update({
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url || null,
          bio: profile.bio,
          preferred_sport: profile.preferred_sport,
          player_position: profile.player_position,
          skill_level: profile.skill_level,
          home_location: profile.home_location,
          home_latitude: profile.home_latitude,
          home_longitude: profile.home_longitude,
          ...socialUrls,
        }).eq('id', user.id).select('id').maybeSingle()
        if (updateError?.code === '23505') {
          await showTakenUsername(username)
          return
        }
        if (updateError) throw updateError
        if (!data) throw new Error('Your profile could not be found. Apply the PlayLink profile migration and try again.')
      }
      setForm(profile)
      setPhotoFile(null)
      window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: profile }))
      setSuccess('Your profile has been saved.')
    } catch (saveError) {
      setError(saveError?.code === '23514'
        ? 'One of the profile links or details is not valid. Check the social profile URLs and try again.'
        : saveError?.code === '42501'
          ? 'The profile database permissions are not set up. Apply the dashboard profile migration and try again.'
          : saveError instanceof Error && saveError.message
            ? saveError.message
            : 'Your profile could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardShell path="/profile">
      <section className="dashboard-profile-page">
        <Link className="nearby-back-link" to="/dashboard">← Dashboard</Link>
        <span className="dashboard-kicker">YOUR PLAYLINK ACCOUNT</span>
        <h1>Player profile</h1>
        <p className="dashboard-profile-intro">Share the details that help teammates and organizers get to know you.</p>

        {error && <p className="dashboard-profile-message is-error" role="alert">{error}</p>}
        {usernameSuggestions.length > 0 && <div className="profile-username-suggestions" aria-label="Suggested available usernames">{usernameSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setForm((current) => ({ ...current, username: suggestion })); setUsernameSuggestions([]); setError('') }}>@{suggestion}</button>)}</div>}
        {success && <p className="dashboard-profile-message is-success" role="status">{success}</p>}
        {loading ? <div className="dashboard-profile-loading" role="status">Loading your profile…</div> : <form className="dashboard-profile-form" onSubmit={saveProfile}>
          <section className="profile-photo-panel">
            <span className="profile-photo-avatar">{form.avatar_url ? <img src={form.avatar_url} alt="Profile preview" /> : (form.display_name || 'P').slice(0, 1).toUpperCase()}</span>
            <div><b>Profile photo</b><p>Use a JPG, PNG, or WebP image up to {isDemo ? '2' : '5'} MB.</p><label className="profile-upload-button">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></label>{photoFile && <small>{photoFile.name}</small>}</div>
          </section>

          <section className="profile-form-section">
            <h2>Basic information</h2>
            <div className="profile-field-grid">
              <label>Display name<input name="display_name" value={form.display_name} onChange={setField} maxLength={80} required /></label>
              <label>Username<input name="username" value={form.username} onChange={setField} minLength={3} maxLength={24} autoComplete="username" required /><small>{isDemo ? 'Local demo only; global availability checks require a Supabase account.' : 'Letters, numbers, and underscores. Availability is checked against all PlayLink accounts.'}</small></label>
              <label className="profile-field-wide">Location or home area<input name="home_location" value={form.home_location} onChange={setField} maxLength={100} placeholder="e.g. Kathmandu, Nepal" /><small>Use the dashboard location menu to fill this from GPS, or enter/edit your area here. Only a place name is shown.</small></label>
              <label className="profile-field-wide">About you<textarea name="bio" value={form.bio} onChange={setField} maxLength={500} rows={3} placeholder="Tell your future teammates a little about yourself." /></label>
            </div>
          </section>

          <section className="profile-form-section">
            <h2>Player details</h2>
            <div className="profile-field-grid">
              <label>Preferred sport<select name="preferred_sport" value={form.preferred_sport} onChange={setField}><option value="">Choose a sport</option><option>Futsal</option><option>Cricket</option><option>Both</option></select></label>
              <label>Position or role<input name="player_position" value={form.player_position} onChange={setField} maxLength={60} placeholder="e.g. Goalkeeper, bowler" /></label>
              <label>Experience level<select name="skill_level" value={form.skill_level} onChange={setField}><option value="">Choose a level</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
            </div>
          </section>

          <section className="profile-form-section">
            <h2>Link your socials</h2>
            <p className="profile-social-intro">Add any combination of Instagram, Facebook, or TikTok. Only links you provide appear on your profile.</p>
            <div className="profile-social-fields">{socialNetworks.map((network) => <label key={network.key}><span><SocialMark name={network.icon} />{network.label}</span><input type="url" name={network.key} value={form[network.key] || ''} onChange={setField} placeholder={`https://${network.label.toLowerCase()}.com/your-profile`} /></label>)}</div>
            <div className="profile-social-preview" aria-label="Linked social accounts">{socialNetworks.filter((network) => form[network.key]).map((network) => <a key={network.key} href={form[network.key]} target="_blank" rel="noreferrer" aria-label={`Open linked ${network.label} account`} title={network.label}><SocialMark name={network.icon} /></a>)}</div>
          </section>

          <div className="profile-form-footer"><span><Icon name="lock" size={15} /> Your profile details are managed by you.</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>
        </form>}
      </section>
    </DashboardShell>
  )
}
