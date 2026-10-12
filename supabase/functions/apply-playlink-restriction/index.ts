import { createClient } from 'npm:@supabase/supabase-js@2'
import { consumeRateLimit, corsForRequest, isJsonObject, readJsonBody } from '../_shared/security.ts'

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
    console.error('PlayLink moderation function is missing Supabase environment configuration.')
    return json({ error: 'Account restrictions are not configured.' }, cors.headers, 500)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in as an administrator.' }, cors.headers, 401)

  const parsedBody = await readJsonBody(request)
  if (parsedBody.error === 'too_large') return json({ error: 'Request is too large.' }, cors.headers, 413)
  if (parsedBody.error === 'content_type') return json({ error: 'Send the request as JSON.' }, cors.headers, 415)
  if (parsedBody.error || !isJsonObject(parsedBody.value)) {
    return json({ error: 'Invalid request.' }, cors.headers, 400)
  }
  const body = parsedBody.value
  const reportId = typeof body.report_id === 'string' ? body.report_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return json({ error: 'Invalid report.' }, cors.headers, 400)

  const caller = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await caller.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Your admin session is invalid.' }, cors.headers, 401)
  const { data: isAdmin, error: adminCheckError } = await caller.rpc('is_playlink_admin')
  if (adminCheckError) {
    console.error('PlayLink moderation admin check failed:', adminCheckError.message)
    return json({ error: 'Administrator access could not be verified.' }, cors.headers, 503)
  }
  if (!isAdmin) return json({ error: 'Administrator access is required.' }, cors.headers, 403)

  const service = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    if (!await consumeRateLimit(service, 'admin-apply-restriction', authData.user.id, 30, 3600)) {
      return json({ error: 'Restriction update limit reached. Try again later.' }, cors.headers, 429)
    }
  } catch (rateLimitError) {
    console.error('Moderation rate limit could not be checked:', rateLimitError instanceof Error ? rateLimitError.message : 'Unknown rate limit error.')
    return json({ error: 'Account restrictions are temporarily unavailable.' }, cors.headers, 503)
  }
  const { data: action, error: actionError } = await service
    .from('playlink_moderation_actions')
    .select('target_user_id, action_type, ban_duration')
    .eq('report_id', reportId)
    .maybeSingle()
  if (actionError) {
    console.error('PlayLink moderation action lookup failed:', actionError.message)
    return json({ error: 'The approved restriction could not be loaded.' }, cors.headers, 503)
  }
  if (!action || !['temporary_ban', 'permanent_ban'].includes(action.action_type)) {
    return json({ error: 'This report does not have an account suspension to apply.' }, cors.headers, 409)
  }
  const banDuration = action.ban_duration
  if (banDuration !== '72h' && banDuration !== '168h' && banDuration !== '876000h') {
    console.error('PlayLink moderation action contains an unsupported duration.')
    return json({ error: 'The approved restriction duration is invalid.' }, cors.headers, 500)
  }

  const { error: restrictionError } = await service.auth.admin.updateUserById(action.target_user_id, {
    ban_duration: banDuration,
  })
  if (restrictionError) {
    console.error('PlayLink auth suspension failed:', restrictionError.message)
    return json({ error: 'The account restriction was recorded but could not be applied to sign-in.' }, cors.headers, 502)
  }
  const { error: auditError } = await service
    .from('playlink_moderation_actions')
    .update({ auth_ban_applied_at: new Date().toISOString() })
    .eq('report_id', reportId)
  if (auditError) {
    console.error('PlayLink auth suspension audit update failed:', auditError.message)
    return json({ error: 'The account restriction was applied, but its audit status could not be saved.' }, cors.headers, 502)
  }
  return json({ success: true }, cors.headers)
})
