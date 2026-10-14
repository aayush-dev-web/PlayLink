import { createClient } from 'npm:@supabase/supabase-js@2'
import { consumeRateLimit, corsForRequest, isJsonObject, readJsonBody } from '../_shared/security.ts'

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function parseCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null
}

function validOptionalUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

Deno.serve(async (request) => {
  const cors = corsForRequest(request)
  if (!cors.allowed) return json({ error: 'This site is not allowed to manage accounts.' }, cors.headers, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
  if (request.method !== 'POST') return json({ error: 'This action is not available.' }, cors.headers, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !anonKey || !serviceRoleKey) {
    console.error('Admin account-management function is missing Supabase configuration.')
    return json({ error: 'Account management is temporarily unavailable.' }, cors.headers, 503)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in as an administrator to continue.' }, cors.headers, 401)
  const caller = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Your admin session has expired. Sign in again.' }, cors.headers, 401)
  const { data: isAdmin, error: adminCheckError } = await caller.rpc('is_playlink_admin')
  if (adminCheckError) {
    console.error('Admin account-management authorization check failed:', adminCheckError.message)
    return json({ error: 'Administrator access could not be verified.' }, cors.headers, 503)
  }
  if (!isAdmin) return json({ error: 'Administrator access is required.' }, cors.headers, 403)

  const parsedBody = await readJsonBody(request)
  if (parsedBody.error === 'too_large') return json({ error: 'Account details are too large.' }, cors.headers, 413)
  if (parsedBody.error === 'content_type') return json({ error: 'Send account details as JSON.' }, cors.headers, 415)
  if (parsedBody.error || !isJsonObject(parsedBody.value)) return json({ error: 'Account details are invalid.' }, cors.headers, 400)

  const body = parsedBody.value
  const action = body.action
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: 'Choose a valid account.' }, cors.headers, 400)
  }
  if (userId === authData.user.id) return json({ error: 'You cannot change or deactivate your own administrator account here.' }, cors.headers, 403)

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    if (!await consumeRateLimit(admin, 'admin-manage-account', authData.user.id, 60, 3600)) {
      return json({ error: 'Too many account changes. Try again later.' }, cors.headers, 429)
    }
  } catch (rateLimitError) {
    console.error('Admin account-management rate limit failed:', rateLimitError instanceof Error ? rateLimitError.message : 'Unknown error.')
    return json({ error: 'Account management is temporarily unavailable.' }, cors.headers, 503)
  }

  const { data: targetAdmin, error: targetAdminError } = await admin.from('playlink_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (targetAdminError) {
    console.error('Admin account-management target check failed:', targetAdminError.message)
    return json({ error: 'The account could not be verified.' }, cors.headers, 503)
  }
  if (targetAdmin) return json({ error: 'Administrator accounts cannot be changed from user management.' }, cors.headers, 403)

  if (action === 'update_profile') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const accountType = body.account_type
    const homeLocation = typeof body.home_location === 'string' ? body.home_location.trim() : ''
    const homeLatitude = parseCoordinate(body.home_latitude, -90, 90)
    const homeLongitude = parseCoordinate(body.home_longitude, -180, 180)
    const profile = {
      username,
      display_name: displayName,
      phone,
      account_type: accountType,
      avatar_url: typeof body.avatar_url === 'string' ? body.avatar_url.trim() : '',
      bio: typeof body.bio === 'string' ? body.bio.trim() : '',
      preferred_sport: typeof body.preferred_sport === 'string' ? body.preferred_sport.trim() : '',
      player_position: typeof body.player_position === 'string' ? body.player_position.trim() : '',
      skill_level: typeof body.skill_level === 'string' ? body.skill_level.trim() : '',
      instagram_url: typeof body.instagram_url === 'string' ? body.instagram_url.trim() : '',
      facebook_url: typeof body.facebook_url === 'string' ? body.facebook_url.trim() : '',
      tiktok_url: typeof body.tiktok_url === 'string' ? body.tiktok_url.trim() : '',
      home_location: homeLocation,
      home_latitude: homeLatitude,
      home_longitude: homeLongitude,
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, cors.headers, 400)
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: 'Username must be 3–24 characters and use only letters, numbers, or underscores.' }, cors.headers, 400)
    if (displayName.length < 2 || displayName.length > 120) return json({ error: 'Display name must be between 2 and 120 characters.' }, cors.headers, 400)
    if (phone.length > 40 || profile.bio.length > 2000) return json({ error: 'Phone number or profile description is too long.' }, cors.headers, 400)
    if (!['player', 'team_organizer', 'venue_owner'].includes(String(accountType))) return json({ error: 'Choose a valid account type.' }, cors.headers, 400)
    if ((body.home_latitude === '' || body.home_latitude === null || body.home_latitude === undefined) !== (body.home_longitude === '' || body.home_longitude === null || body.home_longitude === undefined)
      || (body.home_latitude !== '' && body.home_latitude !== null && body.home_latitude !== undefined && homeLatitude === null)
      || (body.home_longitude !== '' && body.home_longitude !== null && body.home_longitude !== undefined && homeLongitude === null)) {
      return json({ error: 'Enter both valid home coordinates, or leave both empty.' }, cors.headers, 400)
    }
    if (homeLocation.length > 160 || profile.preferred_sport.length > 40 || profile.player_position.length > 80 || profile.skill_level.length > 80) {
      return json({ error: 'One or more profile fields are too long.' }, cors.headers, 400)
    }
    if (![profile.avatar_url, profile.instagram_url, profile.facebook_url, profile.tiktok_url].every(validOptionalUrl)) {
      return json({ error: 'Profile and social links must use valid HTTP or HTTPS URLs.' }, cors.headers, 400)
    }

    const { error: profileError } = await admin.from('profiles').update(profile).eq('id', userId)
    if (profileError) {
      console.error('Admin profile update failed:', profileError.message)
      if (profileError.code === '23505') return json({ error: 'That username is already in use.' }, cors.headers, 409)
      return json({ error: 'The profile could not be saved. Check the details and try again.' }, cors.headers, 503)
    }

    const { data: currentUser, error: currentUserError } = await admin.auth.admin.getUserById(userId)
    if (currentUserError || !currentUser.user) {
      console.error('Admin Auth profile lookup failed:', currentUserError?.message || 'Account not found.')
      return json({ error: 'The profile was saved, but account details could not be updated. Refresh and try again.' }, cors.headers, 503)
    }
    const userMetadata = {
      ...currentUser.user.user_metadata,
      username,
      full_name: displayName,
      phone,
      account_type: accountType,
      preferred_sport: profile.preferred_sport,
      home_location: homeLocation,
      home_latitude: homeLatitude,
      home_longitude: homeLongitude,
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      user_metadata: userMetadata,
    })
    if (authUpdateError) {
      console.error('Admin Auth account update failed:', authUpdateError.message)
      return json({ error: 'The profile was saved, but the email could not be updated. Refresh and try again.' }, cors.headers, 503)
    }
    return json({ success: true }, cors.headers)
  }

  if (action === 'change_password') {
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length < 8 || password.length > 256) return json({ error: 'Choose a password between 8 and 256 characters.' }, cors.headers, 400)
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password })
    if (passwordError) {
      console.error('Admin password update failed:', passwordError.message)
      return json({ error: 'The password could not be changed. Try again.' }, cors.headers, 503)
    }
    return json({ success: true }, cors.headers)
  }

  if (action === 'suspend' || action === 'deactivate' || action === 'restore') {
    const duration = action === 'suspend' ? body.duration : action === 'deactivate' ? '876000h' : ''
    if (action === 'suspend' && !['24h', '72h', '168h', '720h'].includes(String(duration))) {
      return json({ error: 'Choose a suspension period from the available options.' }, cors.headers, 400)
    }
    const { error: restrictionError } = await admin.auth.admin.updateUserById(userId, { ban_duration: duration })
    if (restrictionError) {
      console.error('Admin account-access update failed:', restrictionError.message)
      return json({ error: 'Account access could not be updated. Try again.' }, cors.headers, 503)
    }
    return json({ success: true }, cors.headers)
  }

  return json({ error: 'Choose a supported account action.' }, cors.headers, 400)
})
