import { createClient } from 'npm:@supabase/supabase-js@2'
import { clientAddress, consumeRateLimit, corsForRequest, isJsonObject, readJsonBody } from '../_shared/security.ts'

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
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
    console.error('Username sign-in function is missing Supabase environment configuration.')
    return json({ error: 'Username sign-in is not configured.' }, cors.headers, 500)
  }

  const parsedBody = await readJsonBody(request)
  if (parsedBody.error === 'too_large') return json({ error: 'Request is too large.' }, cors.headers, 413)
  if (parsedBody.error === 'content_type') return json({ error: 'Send the request as JSON.' }, cors.headers, 415)
  if (parsedBody.error || !isJsonObject(parsedBody.value)) return json({ error: 'Invalid request.' }, cors.headers, 400)
  const body = parsedBody.value

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 1 || password.length > 256) {
    return json({ error: 'Invalid username or password.' }, cors.headers, 400)
  }

  const admin = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const authClient = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const usernameAllowed = await consumeRateLimit(admin, 'username-login', username, 10, 900)
    const address = clientAddress(request)
    const addressAllowed = !address || await consumeRateLimit(admin, 'username-login-ip', address, 60, 900)
    if (!usernameAllowed || !addressAllowed) {
      return json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }, { ...cors.headers, 'Retry-After': '900' }, 429)
    }
  } catch (rateLimitError) {
    console.error('Username sign-in rate limit failed:', rateLimitError instanceof Error ? rateLimitError.message : 'Unknown rate limit error.')
    return json({ error: 'Username sign-in is temporarily unavailable.' }, cors.headers, 503)
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (profileError) {
    console.error('Username profile lookup failed:', profileError.message)
    return json({ error: 'Username sign-in is temporarily unavailable.' }, cors.headers, 503)
  }
  if (!profile) return json({ error: 'Invalid username or password.' }, cors.headers, 400)

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(profile.id)
  const email = account.user?.email
  if (accountError || !email) return json({ error: 'Invalid username or password.' }, cors.headers, 400)

  const { data: auth, error: authError } = await authClient.auth.signInWithPassword({ email, password })
  if (authError || !auth.session) return json({ error: 'Invalid username or password.' }, cors.headers, 400)

  return json({
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
  }, cors.headers)
})
