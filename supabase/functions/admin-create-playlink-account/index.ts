import { createClient } from 'npm:@supabase/supabase-js@2'
import { consumeRateLimit, corsForRequest, readJsonBody } from '../_shared/security.ts'

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function isAccountType(value: unknown): value is 'player' | 'team_organizer' | 'venue_owner' {
  return value === 'player' || value === 'team_organizer' || value === 'venue_owner'
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : null
}

Deno.serve(async (request) => {
  const cors = corsForRequest(request)
  if (!cors.allowed) return json({ error: 'Origin is not allowed.' }, cors.headers, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, cors.headers, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !anonKey || !serviceRoleKey) {
    console.error('Admin account function is missing Supabase environment configuration.')
    return json({ error: 'Account creation is not configured.' }, cors.headers, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in as a PlayLink admin to continue.' }, cors.headers, 401)
  const token = authorization.slice('Bearer '.length)
  const authClient = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Your admin session has expired. Sign in again.' }, cors.headers, 401)

  const admin = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: adminRecord, error: adminCheckError } = await admin
    .from('playlink_admins')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()
  if (adminCheckError) {
    console.error('Admin account authorization check failed:', adminCheckError.message)
    return json({ error: 'Admin permissions could not be verified.' }, cors.headers, 503)
  }
  if (!adminRecord) return json({ error: 'Admin access is required to create accounts.' }, cors.headers, 403)

  try {
    if (!await consumeRateLimit(admin, 'admin-create-account', authData.user.id, 10, 3600)) {
      return json({ error: 'Account creation limit reached. Try again later.' }, cors.headers, 429)
    }
  } catch (rateLimitError) {
    console.error('Admin account rate limit could not be checked:', rateLimitError instanceof Error ? rateLimitError.message : 'Unknown rate limit error.')
    return json({ error: 'Account creation is temporarily unavailable.' }, cors.headers, 503)
  }

  const parsedBody = await readJsonBody(request)
  if (parsedBody.error === 'too_large') return json({ error: 'Account details are too large.' }, cors.headers, 413)
  if (parsedBody.error === 'content_type') return json({ error: 'Send account details as JSON.' }, cors.headers, 415)
  if (parsedBody.error || !isJsonObject(parsedBody.value)) return json({ error: 'Invalid account details.' }, cors.headers, 400)
  const body = parsedBody.value

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const accountType = body.account_type
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : ''
  const homeLocation = typeof body.home_location === 'string' ? body.home_location.trim() : ''
  const homeLatitude = parseCoordinate(body.home_latitude, -90, 90)
  const homeLongitude = parseCoordinate(body.home_longitude, -180, 180)
  const venueInput = isJsonObject(body.venue) ? body.venue : {}

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: 'Enter a valid email address.' }, cors.headers, 400)
  }
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return json({ error: 'Username must be 3–24 characters and use only letters, numbers, or underscores.' }, cors.headers, 400)
  }
  if (displayName.length < 2 || displayName.length > 120) {
    return json({ error: 'Display name must be between 2 and 120 characters.' }, cors.headers, 400)
  }
  if (password.length < 8 || password.length > 256) {
    return json({ error: 'Temporary password must be at least 8 characters.' }, cors.headers, 400)
  }
  if (!isAccountType(accountType)) {
    return json({ error: 'Choose a valid account type.' }, cors.headers, 400)
  }
  if (homeLocation.length < 2 || homeLocation.length > 160 || homeLatitude === null || homeLongitude === null) {
    return json({ error: 'Enter the account holder’s home area and valid latitude and longitude.' }, cors.headers, 400)
  }

  const { data: existingUsername, error: usernameCheckError } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle()
  if (usernameCheckError) {
    console.error('Admin username availability check failed:', usernameCheckError.message)
    return json({ error: 'Username availability could not be checked.' }, cors.headers, 503)
  }
  if (existingUsername) return json({ error: 'That username is already in use.' }, cors.headers, 409)

  let userMetadata: Record<string, unknown> = {
    username,
    full_name: displayName,
    phone,
    account_type: accountType,
    home_location: homeLocation,
    home_latitude: homeLatitude,
    home_longitude: homeLongitude,
  }

  if (accountType === 'venue_owner') {
    const name = typeof venueInput.name === 'string' ? venueInput.name.trim() : ''
    const area = typeof venueInput.area === 'string' ? venueInput.area.trim() : ''
    const sport = typeof venueInput.sport === 'string' ? venueInput.sport.trim() : ''
    const latitude = parseCoordinate(venueInput.latitude, -90, 90)
    const longitude = parseCoordinate(venueInput.longitude, -180, 180)
    if (name.length < 2 || name.length > 120 || area.length < 2 || area.length > 160) {
      return json({ error: 'Venue owners need an initial venue name and area.' }, cors.headers, 400)
    }
    if (latitude === null || longitude === null) {
      return json({ error: 'Venue owners need valid initial venue latitude and longitude.' }, cors.headers, 400)
    }
    if (sport !== 'Both') {
      const { data: validSport, error: sportError } = await admin
        .from('playlink_sports')
        .select('name')
        .eq('name', sport)
        .maybeSingle()
      if (sportError) {
        console.error('Admin venue sport check failed:', sportError.message)
        return json({ error: 'Venue sport could not be verified.' }, cors.headers, 503)
      }
      if (!validSport) return json({ error: 'Choose a sport from the PlayLink sports list.' }, cors.headers, 400)
    }
    userMetadata = { ...userMetadata, owner_venue: { name, area, sport, latitude, longitude } }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { playlink_managed_creation: true },
    user_metadata: userMetadata,
  })
  if (createError || !created.user) {
    const message = createError?.message || 'The account could not be created.'
    if (/already (been )?registered|already exists|duplicate/i.test(message)) {
      return json({ error: 'That email address is already registered.' }, cors.headers, 409)
    }
    console.error('Admin account creation failed:', message)
    return json({ error: 'The account could not be created. Check the details and try again.' }, cors.headers, 400)
  }

  return json({ user_id: created.user.id }, cors.headers)
})
