import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell.jsx'
import Icon from '../components/Icon.jsx'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../auth/supabase.js'

const levels = ['Any level', 'Beginner', 'Intermediate', 'Advanced', 'Competitive', 'All levels']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const tableFor = (isTeams) => isTeams ? 'community_teams' : 'player_listings'

function teamFeatureError(error) {
  if (['PGRST202', '42883'].includes(error?.code) && String(error?.message || '').includes('get_team_join_request_profile')) {
    return 'Join-request profiles are not set up yet. Run supabase/migrations/20261004107000_team_request_player_profiles.sql in Supabase SQL Editor.'
  }
  if (['PGRST202', '42883'].includes(error?.code) && String(error?.message || '').includes('search_players_for_team_invite')) {
    return 'Username search is not set up yet. Run supabase/migrations/20261004105000_team_days_and_invite_player_search.sql in Supabase SQL Editor.'
  }
  if (['42703', 'PGRST204'].includes(error?.code) && String(error?.message || '').includes('available_days')) {
    return 'Team listing fields are not fully set up. Run supabase/migrations/20261004105000_team_days_and_invite_player_search.sql in Supabase SQL Editor.'
  }
  if (['PGRST204', '42703'].includes(error?.code)) {
    return 'Team visibility and public join requests are not set up yet. After the team invitations and group chat migration, run supabase/migrations/20261004104000_public_team_requests.sql in Supabase SQL Editor.'
  }
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
    return 'Team invitations and group chat are not set up yet. Run supabase/migrations/20261004103000_team_invitations_and_group_chat.sql, then supabase/migrations/20261004104000_public_team_requests.sql, in Supabase SQL Editor.'
  }
  return error?.message || (error instanceof Error ? error.message : 'The team action could not be completed.')
}

function listingSaveError(error) {
  if (error?.code === '42501') {
    return 'Supabase denied saving this team. Check that the 20261004104000_public_team_requests.sql migration ran successfully and that you are signed in.'
  }
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    if (String(error?.message || '').includes('is_public')) {
      return 'The team visibility database update is missing. Run supabase/migrations/20261004104000_public_team_requests.sql in Supabase SQL Editor.'
    }
    return `The database is missing a team field (${error.message || error.details || error.code}). Run supabase/migrations/20261004105000_team_days_and_invite_player_search.sql in Supabase SQL Editor.`
  }
  return error?.message || (error instanceof Error ? error.message : 'Your listing could not be saved.')
}

function initials(value = '') {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'PL'
}

function openSpotsFor(team) {
  return Math.max(0, Number(team?.members_needed) || 0)
}

function ListingCard({ item, mode, onView, currentUserId, onRequestJoin, joinRequestPending, isMember }) {
  const isTeam = mode === 'teams'
  const isOwnPlayerListing = !isTeam && item.user_id === currentUserId
  const name = isTeam ? item.name : item.display_name
  const openSpots = openSpotsFor(item)
  const isRecruiting = Boolean(item.recruiting) && openSpots > 0
  const teamStatus = openSpots === 0 ? 'Team full' : isRecruiting ? 'Recruiting' : 'Not recruiting'
  return (
    <article className={`community-listing-card ${isTeam ? 'team-listing-card' : 'player-listing-card player-profile-card'}`}>
      {isTeam ? <div className="community-listing-photo team-listing-photo">
        <span className="team-sport-chip"><Icon name={item.sport === 'Cricket' ? 'cricket' : 'futsal'} size={13} />{item.sport}</span>
        <span className="team-crest" aria-hidden="true"><Icon name={item.sport === 'Cricket' ? 'cricket' : 'futsal'} size={20} /></span>
      </div> : <div className="player-card-identity">
        <div className="player-avatar">{item.avatar_url ? <img src={item.avatar_url} alt={`${name} profile`} /> : <span>{initials(name)}</span>}</div>
        <div className="player-card-name"><div className="player-card-name-line"><h2>{name}</h2>{isOwnPlayerListing && <span className="player-you-badge">You</span>}</div><span>{item.position || 'Player'}</span></div>
      </div>}
      <div className="community-listing-body">
        {isTeam ? <div className="team-listing-heading"><h2>{name}</h2><span className={`recruiting-chip${isRecruiting ? '' : ' not-recruiting'}`}>{teamStatus}</span></div> : null}
        <div className={isTeam ? 'team-listing-location' : 'player-profile-location'}><Icon name="pin" size={12} />{item.area}</div>
        {!isTeam && <div className="player-sports-tags"><span><Icon name={item.sport === 'Cricket' ? 'cricket' : 'futsal'} size={12} />{item.sport}</span></div>}
        <p className="community-listing-desc">{item.description || (isTeam ? 'No team introduction provided.' : 'No player introduction provided.')}</p>
        <div className={isTeam ? 'community-listing-tags team-listing-tags' : 'player-day-chips'}>
          <span>{item.level}</span>
          {isTeam ? <span>{openSpots > 0 ? `${openSpots} spots open` : 'Team full'}</span> : item.looking_for_team && <span>Looking for a team</span>}
          <span>{item.availability}</span>
          {(item.available_days || []).slice(0, 3).map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="community-listing-footer">
          <span>{isTeam ? 'Team listing' : 'Player profile'}</span>
          <button type="button" className="button button-outline small-button" onClick={() => onView(item)}>View details</button>
        </div>
        {isTeam && item.owner_id !== currentUserId && !isMember && (
          item.is_public && isRecruiting
            ? currentUserId
              ? <button className="button button-primary team-card-join-button" type="button" disabled={joinRequestPending} onClick={() => onRequestJoin(item)}>
                {joinRequestPending ? 'Join request sent' : 'Join team'}
              </button>
              : <Link className="button button-primary team-card-join-button" to="/sign-in?next=%2Fteams">Sign in to join team</Link>
            : <small className="team-card-join-note">
              {!item.is_public ? 'This team is not accepting public join requests.' : openSpots === 0 ? 'This team is full.' : 'The team is not recruiting right now.'}
            </small>
        )}
        {isTeam && item.owner_id === currentUserId && <small className="team-card-join-note">Your team</small>}
        {isTeam && item.owner_id !== currentUserId && isMember && <div className="team-card-member-actions">
            <span className="team-card-member-label">Team member</span>
            <Link className="button button-outline team-card-join-button" to={`/messages?team_id=${encodeURIComponent(item.id)}`}><Icon name="message" size={13} /> Open team chat</Link>
        </div>}
      </div>
    </article>
  )
}

export default function Community({ mode: initialMode = 'teams' }) {
  const isTeams = initialMode === 'teams'
  const { user } = useAuth()
  const routeLocation = useLocation()
  const [teams, setTeams] = useState([])
  const [invitations, setInvitations] = useState([])
  const [ownedTeams, setOwnedTeams] = useState([])
  const [teamMembershipIds, setTeamMembershipIds] = useState([])
  const [teamJoinRequestIds, setTeamJoinRequestIds] = useState([])
  const [requestProfile, setRequestProfile] = useState(null)
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteSearchResults, setInviteSearchResults] = useState([])
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false)
  const [inviteSearchError, setInviteSearchError] = useState('')
  const [initialInvitePlayer, setInitialInvitePlayer] = useState(null)
  const [teamTab, setTeamTab] = useState(() => new URLSearchParams(window.location.search).get('tab') === 'invitations' ? 'invitations' : 'discover')
  const [players, setPlayers] = useState([])
  const [search, setSearch] = useState('')
  const [sport, setSport] = useState('Any sport')
  const [location, setLocation] = useState('')
  const [level, setLevel] = useState('Any level')
  const [availability, setAvailability] = useState('Any time')
  const [availableDay, setAvailableDay] = useState('')
  const [lookingForTeamOnly, setLookingForTeamOnly] = useState(false)
  const [recruitingFilter, setRecruitingFilter] = useState('all')
  const [sort, setSort] = useState('Newest first')
  const [showForm, setShowForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviting, setInviting] = useState(false)
  const [respondingInvitationId, setRespondingInvitationId] = useState('')
  const [selectedInviteTeamId, setSelectedInviteTeamId] = useState('')
  const [teamVisibilityBusy, setTeamVisibilityBusy] = useState(false)
  const [requestingTeamId, setRequestingTeamId] = useState('')
  const [deletingTeamId, setDeletingTeamId] = useState('')

  useEffect(() => {
    const requestedTab = new URLSearchParams(routeLocation.search).get('tab')
    if (isTeams && requestedTab === 'invitations') setTeamTab('invitations')
  }, [isTeams, routeLocation.search])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    if (!supabase) {
      setError('Supabase is not configured. Add your project URL and publishable key to load community listings.')
      setLoading(false)
      return () => { active = false }
    }
    if (isTeams && teamTab === 'invitations') {
      if (!user) {
        setInvitations([])
        setLoading(false)
        return () => { active = false }
      }
      Promise.all([
        supabase.from('team_invitations')
        .select('id,team_id,player_id,invited_by,kind,status,created_at')
        .eq('player_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('community_teams').select('id').eq('owner_id', user.id),
      ]).then(async ([ownInvitationResult, ownedTeamResult]) => {
          if (!active) return
          if (ownInvitationResult.error) throw ownInvitationResult.error
          if (ownedTeamResult.error) throw ownedTeamResult.error
          const ownedTeamIds = (ownedTeamResult.data || []).map((team) => team.id)
          const { data: ownedRequests, error: requestError } = ownedTeamIds.length
            ? await supabase.from('team_invitations')
              .select('id,team_id,player_id,invited_by,kind,status,created_at')
              .in('team_id', ownedTeamIds)
              .eq('kind', 'request')
              .order('created_at', { ascending: false })
            : { data: [], error: null }
          if (requestError) throw requestError
          const rows = [...(ownInvitationResult.data || []), ...(ownedRequests || [])]
          const teamIds = [...new Set(rows.map((invitation) => invitation.team_id))]
          const { data: teamRows, error: teamError } = teamIds.length
            ? await supabase.from('community_teams').select('*').in('id', teamIds)
            : { data: [], error: null }
          if (teamError) throw teamError
          if (!active) return
          const teamById = new Map((teamRows || []).map((team) => [team.id, team]))
          const pendingRequests = rows.filter((invitation) => invitation.kind === 'request'
            && invitation.status === 'pending'
            && teamById.get(invitation.team_id)?.owner_id === user.id)
          const profileResults = await Promise.all(pendingRequests.map(async (invitation) => {
            const { data, error: profileError } = await supabase.rpc('get_team_join_request_profile', {
              requested_invitation_id: invitation.id,
            })
            if (profileError) throw profileError
            return [invitation.id, data?.[0] || null]
          }))
          if (!active) return
          const profileByInvitationId = new Map(profileResults)
          setInvitations(rows.map((invitation) => ({
            ...invitation,
            kind: invitation.kind || 'invite',
            team: teamById.get(invitation.team_id),
            player: profileByInvitationId.get(invitation.id) || null,
          })))
          setTeams([])
        }).catch((loadError) => {
              if (active) setError(teamFeatureError(loadError))
        }).finally(() => {
          if (active) setLoading(false)
        })
      return () => { active = false }
    }
    const query = supabase.from(tableFor(isTeams)).select('*').order('created_at', { ascending: false })
    if (isTeams && teamTab === 'mine' && user) query.eq('owner_id', user.id)
    else {
      query.eq('is_active', true)
      if (isTeams) query.eq('is_public', true)
    }
    query.then(async ({ data, error: queryError }) => {
      if (!active) return
      if (queryError) throw queryError
      if (isTeams) {
        setTeams(data || [])
        return
      }
      const playerListings = data || []
      if (!playerListings.length) {
        setPlayers([])
        return
      }
      const { data: avatars, error: avatarError } = await supabase.rpc('get_public_player_avatars', {
        requested_user_ids: playerListings.map((listing) => listing.user_id),
      })
      if (avatarError) throw avatarError
      if (!active) return
      const avatarByUserId = new Map((avatars || []).map((profile) => [profile.user_id, profile.avatar_url]))
      setPlayers(playerListings.map((listing) => ({
        ...listing,
        avatar_url: avatarByUserId.get(listing.user_id) || '',
      })))
    }).catch((loadError) => {
      if (active) setError(teamFeatureError(loadError))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [isTeams, teamTab, user])

  useEffect(() => {
    let active = true
    if (!user || !supabase) {
      setOwnedTeams([])
      setTeamMembershipIds([])
      setTeamJoinRequestIds([])
      return () => { active = false }
    }
    Promise.all([
      supabase.from('community_teams').select('id,name,members_needed,recruiting,is_public').eq('owner_id', user.id).eq('is_active', true),
      supabase.from('team_memberships').select('team_id').eq('user_id', user.id),
      supabase.from('team_invitations').select('team_id,status').eq('player_id', user.id).eq('kind', 'request'),
    ]).then(([ownedResult, membershipResult, requestsResult]) => {
      if (!active) return
      if (ownedResult.error) throw ownedResult.error
      if (membershipResult.error) throw membershipResult.error
      if (requestsResult.error) throw requestsResult.error
      setOwnedTeams(ownedResult.data || [])
      setSelectedInviteTeamId((current) => current || ownedResult.data?.[0]?.id || '')
      setTeamMembershipIds((membershipResult.data || []).map((membership) => membership.team_id))
      setTeamJoinRequestIds((requestsResult.data || []).filter((request) => request.status === 'pending').map((request) => request.team_id))
    }).catch((loadError) => {
      if (active) setError(teamFeatureError(loadError))
    })
    return () => { active = false }
  }, [user])

  const inviteableTeams = ownedTeams.filter((team) => team.recruiting && team.members_needed > 0)

  useEffect(() => {
    const eligibleTeams = ownedTeams.filter((team) => team.recruiting && team.members_needed > 0)
    if (!eligibleTeams.length) {
      setSelectedInviteTeamId('')
      return
    }
    if (!eligibleTeams.some((team) => team.id === selectedInviteTeamId)) {
      setSelectedInviteTeamId(eligibleTeams[0].id)
    }
  }, [ownedTeams, selectedInviteTeamId])

  useEffect(() => {
    if (!showForm || !isTeams || !supabase || initialInvitePlayer || inviteSearch.trim().replace(/^@/, '').length < 2) {
      setInviteSearchResults([])
      setInviteSearchLoading(false)
      setInviteSearchError('')
      return undefined
    }
    let active = true
    const timeout = window.setTimeout(async () => {
      setInviteSearchLoading(true)
      setInviteSearchError('')
      try {
        const { data, error: searchError } = await supabase.rpc('search_players_for_team_invite', {
          search_query: inviteSearch.trim(),
        })
        if (searchError) throw searchError
        if (active) setInviteSearchResults(data || [])
      } catch (searchError) {
        if (active) {
          setInviteSearchResults([])
          setInviteSearchError(teamFeatureError(searchError))
        }
      } finally {
        if (active) setInviteSearchLoading(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [showForm, isTeams, inviteSearch, initialInvitePlayer])

  const allListings = isTeams ? teams : players
  const listings = useMemo(() => {
    const result = allListings.filter((item) => {
      const name = isTeams ? item.name : item.display_name
      const text = `${name} ${item.sport} ${item.area} ${item.position || ''} ${item.description || ''}`.toLowerCase()
      return (!search || text.includes(search.toLowerCase()))
        && (sport === 'Any sport' || item.sport === sport)
        && (!location || item.area.toLowerCase().includes(location.toLowerCase()))
        && (level === 'Any level' || item.level === level)
        && (availability === 'Any time' || item.availability === availability)
        && (!availableDay || item.available_days?.includes(availableDay))
        && (!lookingForTeamOnly || item.looking_for_team)
        && (!isTeams || recruitingFilter === 'all' || (recruitingFilter === 'recruiting'
          ? Boolean(item.recruiting) && openSpotsFor(item) > 0
          : !item.recruiting || openSpotsFor(item) < 1))
    })
    if (sort === 'A–Z') result.sort((a, b) => (isTeams ? a.name : a.display_name).localeCompare(isTeams ? b.name : b.display_name))
    return result
  }, [allListings, isTeams, search, sport, location, level, availability, availableDay, lookingForTeamOnly, recruitingFilter, sort])

  function resetFilters() {
    setSearch('')
    setSport('Any sport')
    setLocation('')
    setLevel('Any level')
    setAvailability('Any time')
    setAvailableDay('')
    setLookingForTeamOnly(false)
    setRecruitingFilter('all')
  }

  function openListingForm() {
    setEditingTeam(null)
    setInitialInvitePlayer(null)
    setInviteSearch('')
    setInviteSearchResults([])
    setInviteSearchError('')
    setShowForm(true)
  }

  function openTeamEditor(team) {
    setEditingTeam(team)
    setInitialInvitePlayer(null)
    setInviteSearch('')
    setInviteSearchResults([])
    setInviteSearchError('')
    setSelected(null)
    setError('')
    setNotice('')
    setShowForm(true)
  }

  async function createListing(event) {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    const common = {
      sport: String(form.get('sport')),
      area: String(form.get('area')).trim(),
      level: String(form.get('level')),
      availability: String(form.get('availability')),
      available_days: form.getAll('available_days').map(String),
      description: String(form.get('description') || '').trim(),
      is_active: true,
    }
    const row = isTeams
      ? { ...common, owner_id: user.id, name: String(form.get('name')).trim(), members_needed: Number(form.get('members_needed') || 0), recruiting: form.get('recruiting') === 'on', is_public: form.get('is_public') === 'on' }
      : { ...common, user_id: user.id, display_name: String(form.get('display_name')).trim(), position: String(form.get('position') || '').trim(), looking_for_team: form.get('looking_for_team') === 'on' }
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const initialInvitePlayerId = isTeams ? initialInvitePlayer?.user_id || '' : ''
      if (initialInvitePlayerId && row.members_needed < 1) {
        throw new Error('Add at least one open player spot before inviting a teammate.')
      }
      const query = isTeams
        ? editingTeam
          ? supabase.from('community_teams').update(row).eq('id', editingTeam.id).eq('owner_id', user.id).select('*').single()
          : supabase.from('community_teams').insert(row).select('*').single()
        : supabase.from('player_listings').upsert(row, { onConflict: 'user_id' }).select('*').single()
      const { data, error: saveError } = await query
      if (saveError) throw saveError
      if (isTeams) {
        setTeams((current) => [data, ...current.filter((item) => item.id !== data.id)])
        setOwnedTeams((current) => [data, ...current.filter((item) => item.id !== data.id)])
        if (data.recruiting && data.members_needed > 0) setSelectedInviteTeamId(data.id)
        setTeamTab('mine')
        setShowForm(false)
        setSelected(data)
        setNotice(editingTeam
          ? 'Your team details have been updated.'
          : data.is_public ? 'Your team has been created and listed publicly.' : 'Your private team has been created.')
        if (!editingTeam && initialInvitePlayerId) {
          if (!data.recruiting) {
            setError('Team created, but the invitation was not sent because recruiting is turned off. Edit the team and enable recruiting before inviting players.')
            return
          }
          const { error: inviteError } = await supabase.rpc('invite_player_to_team', {
            requested_team_id: data.id,
            requested_player_id: initialInvitePlayerId,
          })
          if (inviteError) setError(`Team created, but the initial player invitation could not be sent: ${teamFeatureError(inviteError)}`)
          else setNotice((current) => `${current} The selected player has been invited.`)
        }
        return
      }
      setPlayers((current) => [data, ...current.filter((item) => item.user_id !== user.id)])
      setNotice('Your player profile is now published.')
      setShowForm(false)
    } catch (saveError) {
      setError(listingSaveError(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function deleteTeam(team) {
    if (!supabase || !user || team.owner_id !== user.id || deletingTeamId) return
    const confirmed = window.confirm(`Delete "${team.name}"? This also deletes its invitations, join requests, memberships, and group chat. This cannot be undone.`)
    if (!confirmed) return
    setDeletingTeamId(team.id)
    setError('')
    setNotice('')
    try {
      const { error: deleteError } = await supabase.from('community_teams')
        .delete()
        .eq('id', team.id)
        .eq('owner_id', user.id)
        .select('id')
        .single()
      if (deleteError) throw deleteError
      setTeams((current) => current.filter((item) => item.id !== team.id))
      setOwnedTeams((current) => current.filter((item) => item.id !== team.id))
      setInvitations((current) => current.filter((invitation) => invitation.team_id !== team.id))
      setSelected(null)
      setNotice(`"${team.name}" has been deleted.`)
    } catch (deleteError) {
      setError(teamFeatureError(deleteError))
    } finally {
      setDeletingTeamId('')
    }
  }

  const canCreateTeam = Boolean(user && user.id !== 'playlink-local-demo')
  const collectionName = isTeams ? teamTab === 'mine' ? 'of your teams' : teamTab === 'invitations' ? 'invitations' : 'teams' : 'players'

  async function invitePlayerToTeam() {
    if (!user || !selected || !selectedInviteTeamId) return
    setInviting(true)
    setError('')
    setNotice('')
    try {
      const { error: inviteError } = await supabase.rpc('invite_player_to_team', {
        requested_team_id: selectedInviteTeamId,
        requested_player_id: selected.user_id,
      })
      if (inviteError) throw inviteError
      const teamName = ownedTeams.find((team) => team.id === selectedInviteTeamId)?.name || 'your team'
      setNotice(`Invitation sent to ${selected.display_name} for ${teamName}.`)
    } catch (inviteError) {
      setError(teamFeatureError(inviteError))
    } finally {
      setInviting(false)
    }
  }

  async function respondToInvitation(invitation, response) {
    setRespondingInvitationId(invitation.id)
    setError('')
    setNotice('')
    try {
      const { error: responseError } = await supabase.rpc('respond_to_team_invitation', {
        requested_invitation_id: invitation.id,
        requested_response: response,
      })
      if (responseError) throw responseError
      setInvitations((current) => current.map((item) => item.id === invitation.id
        ? { ...item, status: response }
        : item))
      if (response === 'accepted') {
        if (invitation.kind !== 'request' && invitation.player_id === user?.id) {
          setTeamMembershipIds((current) => current.includes(invitation.team_id) ? current : [...current, invitation.team_id])
          setNotice(`You joined ${invitation.team?.name || 'the team'}. Its group chat is now available.`)
        } else {
          setNotice(`${invitation.player?.display_name || 'The player'} is now a member of ${invitation.team?.name || 'the team'}.`)
        }
      } else {
        setNotice(invitation.kind === 'request'
          ? `Join request for ${invitation.team?.name || 'the team'} rejected.`
          : `Invitation from ${invitation.team?.name || 'the team'} rejected.`)
      }
    } catch (responseError) {
      setError(teamFeatureError(responseError))
    } finally {
      setRespondingInvitationId('')
    }
  }

  async function requestToJoinTeam(team) {
    if (!user || !team || requestingTeamId) return
    setRequestingTeamId(team.id)
    setError('')
    setNotice('')
    try {
      const { error: requestError } = await supabase.rpc('request_to_join_team', {
        requested_team_id: team.id,
      })
      if (requestError) throw requestError
      setTeamJoinRequestIds((current) => current.includes(team.id) ? current : [...current, team.id])
      setNotice(`Your request to join ${team.name} was sent to its creator.`)
    } catch (requestError) {
      setError(teamFeatureError(requestError))
    } finally {
      setRequestingTeamId('')
    }
  }

  async function toggleTeamVisibility(team) {
    if (!user || !team || teamVisibilityBusy) return
    setTeamVisibilityBusy(true)
    setError('')
    setNotice('')
    try {
      const { data, error: visibilityError } = await supabase.from('community_teams')
        .update({ is_public: !team.is_public })
        .eq('id', team.id)
        .eq('owner_id', user.id)
        .select('*')
        .single()
      if (visibilityError) throw visibilityError
      setTeams((current) => current.map((item) => item.id === data.id ? data : item))
      setSelected(data)
      setNotice(data.is_public ? 'Your team is now public and players can request to join.' : 'Your team is now private and hidden from team discovery.')
    } catch (visibilityError) {
      setError(teamFeatureError(visibilityError))
    } finally {
      setTeamVisibilityBusy(false)
    }
  }

  const pendingInvitationCount = invitations.filter((invitation) => invitation.status === 'pending').length

  return (
    <DashboardShell path={isTeams ? '/teams' : '/players'} search={search} onSearch={setSearch}>
      <div className="community-dashboard">
        <section className={`community-hero ${isTeams ? 'teams-hero' : 'players-hero'}`}>
          <div className="community-hero-copy"><span className="dashboard-kicker">YOUR LOCAL SPORTS COMMUNITY</span><h1>{isTeams && <Icon name="teams" size={26} />}{isTeams ? 'Find Teams' : 'Find Players'}</h1><p>{isTeams ? 'Discover registered teams that are recruiting and connect with local players.' : 'Find registered players by sport, skill level, and availability.'}</p>
            <div className="community-mode-tabs" aria-label={isTeams ? 'Team listings' : 'Community listings'}>{isTeams
              ? <><button type="button" className={teamTab === 'discover' ? 'active' : ''} aria-pressed={teamTab === 'discover'} onClick={() => setTeamTab('discover')}><Icon name="teams" size={14} />Find Teams</button><button type="button" className={teamTab === 'mine' ? 'active' : ''} aria-pressed={teamTab === 'mine'} onClick={() => setTeamTab('mine')}><Icon name="shield" size={14} />My Teams</button>{user && <button type="button" className={teamTab === 'invitations' ? 'active' : ''} aria-pressed={teamTab === 'invitations'} onClick={() => setTeamTab('invitations')}><Icon name="message" size={14} />Invitations{pendingInvitationCount > 0 && <span className="team-invitation-count">{pendingInvitationCount}</span>}</button>}</>
              : <><Link to="/players" className="active"><Icon name="player" size={14} />Find Players</Link><Link to="/teams"><Icon name="teams" size={14} />Find Teams</Link></>}</div>
          </div>
        </section>
        <div className="community-dashboard-grid">
          <section className="community-feed">
            {!(isTeams && teamTab === 'invitations') && <><div className="community-filter-bar">
              <label className="community-filter-search"><Icon name="search" size={16} /><input aria-label={`Search ${isTeams ? 'teams' : 'players'}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${isTeams ? 'teams' : 'players'}...`} /></label>
              <label><small>Sport</small><select value={sport} onChange={(event) => setSport(event.target.value)}><option>Any sport</option><option>Futsal</option><option>Cricket</option></select></label>
              <label><small>Location / Area</small><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Any area" /></label>
              <label><small>Skill level</small><select value={level} onChange={(event) => setLevel(event.target.value)}>{levels.map((item) => <option key={item}>{item}</option>)}</select></label>
              {isTeams ? <label><small>Recruiting</small><select value={recruitingFilter} onChange={(event) => setRecruitingFilter(event.target.value)}><option value="all">All teams</option><option value="recruiting">Recruiting</option><option value="closed">Not recruiting</option></select></label>
                : <label><small>Availability</small><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option>Any time</option><option>Weeknights</option><option>Weekends</option><option>Flexible</option></select></label>}
              {isTeams && <button className="button button-primary community-create-button" type="button" onClick={() => user ? openListingForm() : setError('Sign in to create a team.')}><Icon name="add" size={15} /> Create Team</button>}
            </div>
            {!isTeams && <div className="community-filter-bar"><label><small>Availability</small><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option>Any time</option><option>Weeknights</option><option>Weekends</option><option>Flexible</option></select></label><label><small>Day</small><select value={availableDay} onChange={(event) => setAvailableDay(event.target.value)}><option value="">Any day</option>{weekdays.map((day) => <option key={day}>{day}</option>)}</select></label><label className="player-team-only"><input type="checkbox" checked={lookingForTeamOnly} onChange={(event) => setLookingForTeamOnly(event.target.checked)} /><span>Looking for a team</span></label><button className="button button-primary community-create-button" type="button" onClick={() => user ? openListingForm() : setError('Sign in to publish a player profile.')}><Icon name="player" size={15} /> Publish profile</button></div>}
            <div className="community-feed-heading"><span>Showing <b>{isTeams && teamTab === 'invitations' ? invitations.length : listings.length}</b> {collectionName}</span>{!(isTeams && teamTab === 'invitations') && <div><span>Sort by:</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Newest first</option><option>A–Z</option></select><button type="button" onClick={resetFilters}>Clear filters</button></div>}</div></>}
            {error && <p className="venue-favorite-error" role="alert">{error}</p>}
            {notice && <p className="venue-feedback-success" role="status">{notice}</p>}
            <div className={`community-listing-grid ${isTeams ? 'teams-listing-grid' : 'players-listing-grid'}`}>
              {loading ? <div className="empty-state" role="status">Loading community listings…</div> : isTeams && teamTab === 'invitations'
                ? invitations.map((invitation) => {
                  const isJoinRequest = invitation.kind === 'request'
                  const canRespond = invitation.status === 'pending' && (
                    (isJoinRequest && invitation.team?.owner_id === user?.id)
                    || (!isJoinRequest && invitation.player_id === user?.id)
                  )
                  return <article className="team-invitation-card" key={invitation.id}>
                    <div className="team-invitation-heading">
                      <span className="community-create-icon"><Icon name="teams" size={19} /></span>
                      <div>
                        <h2>{invitation.team?.name || (isJoinRequest ? 'Team join request' : 'Team invitation')}</h2>
                        <p>{isJoinRequest
                          ? `${invitation.player?.display_name || 'A player'} requested to join${invitation.team?.area ? ` · ${invitation.team.area}` : ''}`
                          : invitation.team ? `${invitation.team.sport} · ${invitation.team.area} · Invitation for you` : 'This team listing is no longer available.'}</p>
                      </div>
                      <span className={`team-invitation-status status-${invitation.status}`}>{invitation.status}</span>
                    </div>
                    {isJoinRequest && canRespond && <button className="button button-outline team-request-profile-button" type="button" onClick={() => setRequestProfile({ ...invitation.player, teamName: invitation.team?.name })}>
                      View player profile
                    </button>}
                    {canRespond && <div className="team-invitation-actions">
                      <button className="button button-outline" type="button" disabled={respondingInvitationId === invitation.id} onClick={() => respondToInvitation(invitation, 'rejected')}>Reject {isJoinRequest ? 'request' : 'invitation'}</button>
                      <button className="button button-primary" type="button" disabled={respondingInvitationId === invitation.id} onClick={() => respondToInvitation(invitation, 'accepted')}>{respondingInvitationId === invitation.id ? 'Saving…' : `Accept ${isJoinRequest ? 'request' : 'invitation'}`}</button>
                    </div>}
                    {invitation.status === 'accepted' && <Link className="button button-primary" to={`/messages?team_id=${encodeURIComponent(invitation.team_id)}`}><Icon name="message" size={14} /> Open team chat</Link>}
                  </article>
                })
                : listings.map((item) => <ListingCard
                  key={item.id}
                  item={item}
                  mode={initialMode}
                  currentUserId={user?.id}
                  onView={setSelected}
                  onRequestJoin={requestToJoinTeam}
                  joinRequestPending={teamJoinRequestIds.includes(item.id) || requestingTeamId === item.id}
                  isMember={teamMembershipIds.includes(item.id)}
                />)}
              {!loading && (isTeams && teamTab === 'invitations' ? !invitations.length : !listings.length) && <div className="empty-state"><span><Icon name={isTeams ? 'teams' : 'player'} size={24} /></span><h2>{isTeams && teamTab === 'mine' ? 'You have not published any teams' : isTeams && teamTab === 'invitations' ? 'No invitations or join requests yet' : `No ${isTeams ? 'teams' : 'players'} yet`}</h2><p>{isTeams && teamTab === 'mine' ? 'Create a team listing to make it visible to players.' : isTeams && teamTab === 'invitations' ? 'Player invitations and requests to join your teams will appear here.' : 'Listings appear here when community members publish real profiles.'}</p>{teamTab !== 'invitations' && <button className="button button-outline" type="button" onClick={resetFilters}>Clear filters</button>}</div>}
            </div>
          </section>
          <aside className={`community-aside${isTeams ? ' teams-community-aside' : ' players-community-aside'}`}>
            {isTeams ? <section className="community-create-panel"><span className="community-create-icon"><Icon name="teams" size={21} /></span><h2>Create Your Team</h2><p>Any player can create a team, invite teammates, and control whether it is listed publicly.</p>{user ? <button type="button" className="button button-primary" onClick={openListingForm}><Icon name="add" size={15} /> Create Team</button> : <Link className="button button-primary" to="/sign-in">Sign in to create</Link>}</section>
              : <section className="player-profile-cta"><span><Icon name="player" size={21} /></span><div><h2>Looking for teammates?</h2><p>Publish your player profile to help nearby teams discover you.</p>{user ? <button type="button" onClick={openListingForm}>Publish profile <Icon name="arrow-right" size={13} /></button> : <Link to="/sign-in">Sign in to publish</Link>}</div></section>}
            <section className="dashboard-side-card popular-community-sports"><div className="dashboard-aside-heading"><h2>Browse by sport</h2><button type="button" onClick={() => setSport('Any sport')}>View all</button></div>{['Futsal', 'Cricket'].map((item) => <button key={item} type="button" onClick={() => setSport(sport === item ? 'Any sport' : item)}><span className={`popular-sport-icon${item === 'Cricket' ? ' cricket-sport-icon' : ''}`}><Icon name={item === 'Cricket' ? 'cricket' : 'futsal'} size={18} /></span><b>{item}<small>{allListings.filter((listing) => listing.sport === item).length} listings</small></b><Icon name="chevron-right" size={14} /></button>)}</section>
          </aside>
        </div>
      </div>
      {showForm && <Modal eyebrow={editingTeam ? 'EDIT TEAM' : 'CREATE LISTING'} title={isTeams ? editingTeam ? 'Edit your team' : 'Publish a team listing' : 'Publish your player profile'} onClose={() => { setShowForm(false); setEditingTeam(null) }}>
        <p className="modal-lead">This information will be stored in PlayLink and visible to other users. Do not include private contact details.</p>
        <form className="demo-form" onSubmit={createListing}>
          <label>{isTeams ? 'Team name' : 'Display name'}<input name={isTeams ? 'name' : 'display_name'} required minLength="2" maxLength="80" defaultValue={editingTeam?.name || (!isTeams ? user?.user_metadata?.full_name || '' : '')} /></label>
          <div className="form-row"><label>Sport<select name="sport" required defaultValue={editingTeam?.sport || ''}><option value="" disabled>Select a sport</option><option>Futsal</option><option>Cricket</option></select></label><label>Skill level<select name="level" required defaultValue={editingTeam?.level || ''}><option value="" disabled>Select level</option>{levels.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <div className="form-row"><label>Area<input name="area" required minLength="2" maxLength="160" placeholder="City or neighborhood" defaultValue={editingTeam?.area || ''} /></label><label>Availability<select name="availability" required defaultValue={editingTeam?.availability || ''}><option value="" disabled>Select availability</option><option>Weeknights</option><option>Weekends</option><option>Flexible</option></select></label></div>
          {isTeams ? <>
            <label>Open player spots<input name="members_needed" type="number" min="0" max="100" defaultValue={editingTeam?.members_needed ?? 1} /></label>
            <label className="player-team-only"><input name="recruiting" type="checkbox" defaultChecked={editingTeam ? editingTeam.recruiting : true} /><span>Currently recruiting</span></label>
            <label className="player-team-only"><input name="is_public" type="checkbox" defaultChecked={editingTeam ? editingTeam.is_public : true} /><span>List this team publicly so players can request to join</span></label>
            {!editingTeam && <div className="team-player-search">
              <label htmlFor="team-invite-player-search">Invite a player now</label>
              <input
                id="team-invite-player-search"
                type="search"
                autoComplete="off"
                value={initialInvitePlayer ? `@${initialInvitePlayer.username}` : inviteSearch}
                onChange={(event) => {
                  setInitialInvitePlayer(null)
                  setInviteSearch(event.target.value)
                }}
                placeholder="Search by username or player name"
                aria-describedby="team-invite-player-hint"
              />
              <small id="team-invite-player-hint">Optional. Search active player profiles by username or name.</small>
              {inviteSearchLoading && <p className="team-player-search-status" role="status">Searching players…</p>}
              {inviteSearchError && <p className="venue-favorite-error" role="alert">{inviteSearchError}</p>}
              {inviteSearchResults.length > 0 && !initialInvitePlayer && <div className="team-player-search-results" role="listbox" aria-label="Matching players">
                {inviteSearchResults.map((player) => <button
                  key={player.user_id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    setInitialInvitePlayer(player)
                    setInviteSearch(`@${player.username}`)
                    setInviteSearchResults([])
                  }}
                >
                  <strong>{player.display_name}</strong>
                  <span>@{player.username}</span>
                </button>)}
              </div>}
              {inviteSearch.trim().replace(/^@/, '').length >= 2 && !inviteSearchLoading && !inviteSearchError && !inviteSearchResults.length && !initialInvitePlayer && <p className="team-player-search-status">No active player found. Check the username and try again.</p>}
              {initialInvitePlayer && <p className="team-player-search-status" role="status">Invite selected: {initialInvitePlayer.display_name} (@{initialInvitePlayer.username})</p>}
            </div>}
          </> : <><label>Position / role<input name="position" maxLength="80" placeholder="Optional" /></label><label className="player-team-only"><input name="looking_for_team" type="checkbox" defaultChecked /><span>Looking for a team</span></label></>}
          <fieldset><legend>Available days</legend><div className="player-day-choices">{weekdays.map((day) => <label key={day}><input type="checkbox" name="available_days" value={day} defaultChecked={editingTeam?.available_days?.includes(day) || false} />{day}</label>)}</div></fieldset>
          <label>Introduction<textarea name="description" rows="3" maxLength="500" placeholder="Share relevant details" defaultValue={editingTeam?.description || ''} /></label>
          <button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? (editingTeam ? 'Saving changes…' : 'Publishing…') : editingTeam ? 'Save changes' : 'Publish listing'}</button>
        </form>
      </Modal>}
      {selected && <Modal eyebrow={isTeams ? 'TEAM LISTING' : selected.user_id === user?.id ? 'YOUR PLAYER PROFILE' : 'PLAYER PROFILE'} title={isTeams ? selected.name : selected.display_name} onClose={() => { setSelected(null); setNotice(''); setError('') }}>
        <p className="modal-lead">{selected.description || 'No introduction provided.'}</p>
        <div className="detail-facts"><span><small>SPORT</small><b>{selected.sport}</b></span><span><small>AREA</small><b>{selected.area}</b></span><span><small>LEVEL</small><b>{selected.level}</b></span><span><small>AVAILABILITY</small><b>{selected.availability}</b></span></div>
        {notice && <p className="venue-feedback-success" role="status">{notice}</p>}
        {error && <p className="venue-favorite-error" role="alert">{error}</p>}
        {isTeams && selected.owner_id === user?.id && <section className="community-team-invite-form">
          <p>Visibility: <strong>{selected.is_public ? 'Public' : 'Private'}</strong>{selected.is_public ? ' · Players can find your team and request to join.' : ' · Only you and accepted members can find this team.'}</p>
          <div className="community-team-owner-actions">
            <button className="button button-outline" type="button" onClick={() => openTeamEditor(selected)}>Edit team</button>
            <button className="button button-outline" type="button" disabled={teamVisibilityBusy} onClick={() => toggleTeamVisibility(selected)}>
              {teamVisibilityBusy ? 'Updating…' : selected.is_public ? 'Make team private' : 'Make team public'}
            </button>
            <button className="button button-danger" type="button" disabled={deletingTeamId === selected.id} onClick={() => deleteTeam(selected)}>
              {deletingTeamId === selected.id ? 'Deleting…' : 'Delete team'}
            </button>
          </div>
        </section>}
        {isTeams && (selected.owner_id === user?.id || teamMembershipIds.includes(selected.id)) && <div className="community-player-message-action"><Link className="button button-primary" to={`/messages?team_id=${encodeURIComponent(selected.id)}`}><Icon name="message" size={14} /> Open team group chat</Link></div>}
        {isTeams && selected.owner_id !== user?.id && !teamMembershipIds.includes(selected.id) && <div className="community-player-message-action">
          {selected.is_public && selected.recruiting && openSpotsFor(selected) > 0
            ? (user
              ? <button className="button button-primary" type="button" disabled={teamJoinRequestIds.includes(selected.id) || requestingTeamId === selected.id} onClick={() => requestToJoinTeam(selected)}>
                {requestingTeamId === selected.id ? 'Sending request…' : teamJoinRequestIds.includes(selected.id) ? 'Join request sent' : 'Join team'}
              </button>
              : <Link className="button button-primary" to="/sign-in?next=%2Fteams">Sign in to join team</Link>)
            : <p className="team-card-join-note">{!selected.is_public ? 'This team is private and does not accept public join requests.' : openSpotsFor(selected) < 1 ? 'This team is full.' : 'This team is not recruiting right now.'}</p>}
        </div>}
        {!isTeams && selected.user_id !== user?.id && <div className="community-player-message-action">
          {user ? <Link className="button button-primary" to={`/messages?player_id=${encodeURIComponent(selected.user_id)}`}><Icon name="message" size={14} /> Message player</Link> : <Link className="button button-primary" to={`/sign-in?next=${encodeURIComponent(`/messages?player_id=${selected.user_id}`)}`}><Icon name="message" size={14} /> Sign in to message</Link>}
        </div>}
        {!isTeams && user && selected.user_id !== user.id && canCreateTeam && <section className="community-team-invite-form">
          <label htmlFor="invite-player-team">Invite to join your team</label>
          {inviteableTeams.length
            ? <div className="community-team-invite-controls">
              <select id="invite-player-team" value={selectedInviteTeamId} onChange={(event) => setSelectedInviteTeamId(event.target.value)}>
                {inviteableTeams.map((team) => <option value={team.id} key={team.id}>{team.name} · {team.members_needed} spots</option>)}
              </select>
              <button className="button button-outline" type="button" disabled={inviting || !selectedInviteTeamId} onClick={invitePlayerToTeam}>{inviting ? 'Sending…' : 'Invite'}</button>
            </div>
            : <p>You need a team with recruiting enabled and at least one open player spot before inviting this player. Create a team or edit one of your teams, then try again.</p>}
        </section>}
      </Modal>}
      {requestProfile && <Modal eyebrow="JOIN REQUEST PROFILE" title={requestProfile.display_name || 'PlayLink player'} onClose={() => setRequestProfile(null)}>
        {requestProfile.avatar_url && <img className="team-request-profile-avatar" src={requestProfile.avatar_url} alt="" />}
        {requestProfile.username && <p className="team-request-profile-username">@{requestProfile.username}</p>}
        <p className="modal-lead">{requestProfile.bio || 'This player has not added a profile introduction.'}</p>
        <div className="detail-facts">
          <span><small>TEAM</small><b>{requestProfile.teamName}</b></span>
          <span><small>AREA</small><b>{requestProfile.listing_area || requestProfile.home_location || 'Not provided'}</b></span>
          <span><small>SPORT</small><b>{requestProfile.listing_sport || requestProfile.preferred_sport || 'Not provided'}</b></span>
          <span><small>POSITION</small><b>{requestProfile.listing_position || requestProfile.player_position || 'Not provided'}</b></span>
          <span><small>EXPERIENCE</small><b>{requestProfile.listing_level || requestProfile.skill_level || 'Not provided'}</b></span>
          <span><small>AVAILABILITY</small><b>{requestProfile.listing_availability || 'Not provided'}</b></span>
        </div>
        {requestProfile.listing_description && <p className="team-request-profile-description">{requestProfile.listing_description}</p>}
      </Modal>}
    </DashboardShell>
  )
}
