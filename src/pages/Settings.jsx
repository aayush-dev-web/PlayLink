import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const defaultPreferences = {
  eventActivity: true,
  teamInvites: true,
  productUpdates: false,
  preferredSports: ['Futsal', 'Cricket'],
  distanceUnit: 'km',
}

function preferencesKey(userId) {
  return `playlink-preferences-${userId || 'guest'}`
}

export default function Settings() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const settingsStorageKey = preferencesKey(user?.id)
  const accountName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest player'

  useEffect(() => {
    setSettingsLoaded(false)
    try {
      const saved = window.localStorage.getItem(settingsStorageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setPreferences({
          ...defaultPreferences,
          ...parsed,
          preferredSports: Array.isArray(parsed.preferredSports) ? parsed.preferredSports : defaultPreferences.preferredSports,
        })
      } else {
        setPreferences(defaultPreferences)
      }
      setError('')
    } catch {
      setPreferences(defaultPreferences)
      setError('Saved preferences could not be read. You can still change them for this session.')
    } finally {
      setSettingsLoaded(true)
    }
  }, [settingsStorageKey])

  function updatePreference(name, value) {
    setPreferences((current) => ({ ...current, [name]: value }))
    setNotice('')
  }

  function toggleSport(sport) {
    const selected = preferences.preferredSports.includes(sport)
      ? preferences.preferredSports.filter((item) => item !== sport)
      : [...preferences.preferredSports, sport]
    updatePreference('preferredSports', selected)
  }

  function savePreferences() {
    try {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(preferences))
      setError('')
      setNotice('Your preferences were saved in this browser.')
    } catch {
      setError('Your preferences could not be saved. Check that browser storage is available.')
      setNotice('')
    }
  }

  function restoreDefaults() {
    setPreferences(defaultPreferences)
    try {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(defaultPreferences))
      setError('')
      setNotice('Default preferences restored.')
    } catch {
      setError('Default preferences could not be saved in this browser.')
      setNotice('')
    }
  }

  return (
    <DashboardShell path="/settings" search={search} onSearch={setSearch}>
      <main className="settings-page">
        <header className="settings-page-heading">
          <span className="dashboard-kicker">YOUR PLAYLINK ACCOUNT</span>
          <h1>Settings</h1>
          <p>Manage your profile access and discovery preferences.</p>
        </header>
        {error && <p className="settings-feedback is-error" role="alert">{error}</p>}
        <div className="settings-layout">
          <div className="settings-main-column">
            <section className="settings-card settings-account-card">
              <div className="settings-card-heading"><span><Icon name="player" size={19} /></span><div><h2>Account</h2><p>Keep your PlayLink account details up to date.</p></div><Link to={user ? '/profile' : '/sign-in'}>{user ? 'Edit profile' : 'Sign in'} <Icon name="arrow-right" size={13} /></Link></div>
              <div className="settings-account-facts"><div><small>DISPLAY NAME</small><b>{accountName}</b></div><div><small>EMAIL</small><b>{user?.email || 'Not signed in'}</b></div><div><small>ACCOUNT TYPE</small><b>{user?.user_metadata?.account_type?.replaceAll('_', ' ') || (user?.id === 'playlink-local-demo' ? 'Local demo' : 'Guest')}</b></div></div>
            </section>

            <section className="settings-card">
              <div className="settings-card-heading"><span><Icon name="bell" size={19} /></span><div><h2>Activity preferences</h2><p>Choose which community activity you want to see highlighted.</p></div></div>
              <div className="settings-option-list">
                <label className="settings-toggle"><span><b>Event activity</b><small>Updates about event requests and match activity.</small></span><input type="checkbox" checked={preferences.eventActivity} onChange={(event) => updatePreference('eventActivity', event.target.checked)} /><i aria-hidden="true" /></label>
                <label className="settings-toggle"><span><b>Team invites</b><small>Activity related to player and team connections.</small></span><input type="checkbox" checked={preferences.teamInvites} onChange={(event) => updatePreference('teamInvites', event.target.checked)} /><i aria-hidden="true" /></label>
                <label className="settings-toggle"><span><b>PlayLink product updates</b><small>Occasional information about new PlayLink features.</small></span><input type="checkbox" checked={preferences.productUpdates} onChange={(event) => updatePreference('productUpdates', event.target.checked)} /><i aria-hidden="true" /></label>
              </div>
              <p className="settings-honest-note"><Icon name="info" size={14} />Preferences are stored in this browser. Email and push delivery are not connected in this phase.</p>
            </section>

            <section className="settings-card">
              <div className="settings-card-heading"><span><Icon name="compass" size={19} /></span><div><h2>Discovery</h2><p>Choose the sports and units used in your local preview.</p></div></div>
              <fieldset className="settings-sport-options"><legend>Preferred sports</legend>
                {['Futsal', 'Cricket'].map((sport) => <label key={sport}><input type="checkbox" checked={preferences.preferredSports.includes(sport)} onChange={() => toggleSport(sport)} /><Icon name={sport === 'Cricket' ? 'cricket' : 'futsal'} size={16} />{sport}</label>)}
              </fieldset>
              <label className="settings-unit-select"><span>Distance unit</span><select value={preferences.distanceUnit} onChange={(event) => updatePreference('distanceUnit', event.target.value)}><option value="km">Kilometers (km)</option><option value="mi">Miles (mi)</option></select></label>
            </section>
          </div>

          <aside className="settings-side-column">
            <section className="settings-security-card"><span><Icon name="lock" size={20} /></span><h2>Sign-in & security</h2><p>Update your password through the secure PlayLink account recovery flow.</p><Link className="button button-outline" to="/forgot-password">Reset password <Icon name="arrow-right" size={13} /></Link></section>
            <section className="settings-security-card settings-location-card"><span><Icon name="map" size={20} /></span><h2>Location & profile</h2><p>Update your home area, sports, and public profile details.</p><Link className="button button-outline" to={user ? '/profile' : '/sign-in'}>{user ? 'Edit profile' : 'Sign in'} <Icon name="arrow-right" size={13} /></Link></section>
            <section className="settings-save-card"><b>Save your changes</b><p>Preferences apply to this browser preview and stay separate for each account.</p><button className="button button-primary button-full" type="button" onClick={savePreferences} disabled={!settingsLoaded}><Icon name="check" size={15} />Save preferences</button><button className="settings-restore-button" type="button" onClick={restoreDefaults} disabled={!settingsLoaded}>Restore defaults</button>{notice && <p className="settings-feedback" role="status">{notice}</p>}</section>
          </aside>
        </div>
      </main>
    </DashboardShell>
  )
}
