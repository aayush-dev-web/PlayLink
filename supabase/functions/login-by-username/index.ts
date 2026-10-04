import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !anonKey || !serviceRoleKey) {
    console.error('Username sign-in function is missing Supabase environment configuration.')
    return json({ error: 'Username sign-in is not configured.' }, 500)
  }

  let body: { username?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 1 || password.length > 256) {
    return json({ error: 'Invalid username or password.' }, 400)
  }

  const admin = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const authClient = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (profileError) {
    console.error('Username profile lookup failed:', profileError.message)
    return json({ error: 'Username sign-in is temporarily unavailable.' }, 503)
  }
  if (!profile) return json({ error: 'Invalid username or password.' }, 400)

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(profile.id)
  const email = account.user?.email
  if (accountError || !email) return json({ error: 'Invalid username or password.' }, 400)

  const { data: auth, error: authError } = await authClient.auth.signInWithPassword({ email, password })
  if (authError || !auth.session) return json({ error: 'Invalid username or password.' }, 400)

  return json({
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
  })
})
