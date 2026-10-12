import { createClient } from 'npm:@supabase/supabase-js@2'
import { clientAddress, consumeRateLimit, corsForRequest, isJsonObject, readJsonBody } from '../_shared/security.ts'

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
}

Deno.serve(async (request) => {
  const cors = corsForRequest(request)
  if (!cors.allowed) return json({ error: 'Origin is not allowed.' }, cors.headers, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, cors.headers, 405)

  const projectUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL')
  const origin = request.headers.get('Origin')
  if (!projectUrl || !anonKey || !serviceRoleKey || !resendApiKey || !resendFromEmail) {
    console.error('Auth fallback-link function is missing Supabase or email-provider configuration.')
    return json({ error: 'Fallback links are not configured yet.' }, cors.headers, 503)
  }
  if (!origin || request.headers.get('apikey') !== anonKey) {
    return json({ error: 'Invalid request.' }, cors.headers, 401)
  }

  const parsedBody = await readJsonBody(request)
  if (parsedBody.error === 'too_large') return json({ error: 'Request is too large.' }, cors.headers, 413)
  if (parsedBody.error === 'content_type') return json({ error: 'Send the request as JSON.' }, cors.headers, 415)
  if (parsedBody.error || !isJsonObject(parsedBody.value)) return json({ error: 'Invalid request.' }, cors.headers, 400)

  const email = typeof parsedBody.value.email === 'string' ? parsedBody.value.email.trim().toLowerCase() : ''
  const password = typeof parsedBody.value.password === 'string' ? parsedBody.value.password : ''
  if (parsedBody.value.type !== 'signup'
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 8 || password.length > 256) {
    return json({ error: 'Invalid link request.' }, cors.headers, 400)
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const authClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const emailAllowed = await consumeRateLimit(admin, 'signup-link-email', email, 5, 3600)
    const address = clientAddress(request)
    const addressAllowed = !address || await consumeRateLimit(admin, 'signup-link-ip', address, 40, 3600)
    if (!emailAllowed || !addressAllowed) {
      return json({ error: 'Too many link requests. Please try again later.' }, {
        ...cors.headers,
        'Retry-After': '3600',
      }, 429)
    }
  } catch (rateLimitError) {
    console.error('Auth fallback-link rate limit failed:', rateLimitError instanceof Error ? rateLimitError.message : 'Unknown error.')
    return json({ error: 'Fallback links are temporarily unavailable.' }, cors.headers, 503)
  }

  const { error: signInError } = await authClient.auth.signInWithPassword({ email, password })
  if (!signInError || signInError.code !== 'email_not_confirmed') {
    return json({ ok: true }, cors.headers)
  }

  const redirectTo = new URL('/dashboard', origin).toString()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  if (error) {
    if (error.status === 404 || /user not found/i.test(error.message)) {
      return json({ ok: true }, cors.headers)
    }
    console.error('Auth fallback-link generation failed:', `status ${error.status ?? 'unknown'}`)
    return json({ error: 'A fallback link could not be created. Please try again later.' }, cors.headers, 503)
  }

  const actionLink = data.properties?.action_link
  if (!actionLink) {
    console.error('Auth fallback-link generation returned no action link.')
    return json({ error: 'A fallback link could not be created. Please try again later.' }, cors.headers, 503)
  }

  const safeLink = escapeHtml(actionLink)
  let emailResponse: Response
  try {
    emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [email],
        subject: 'Your PlayLink sign-in link',
        html: `<h2>Verify your PlayLink email</h2><p>Use this one-time link to verify your email and sign in:</p><p><a href="${safeLink}">Verify email and sign in</a></p><p>If you did not request this link, you can ignore this email.</p>`,
        text: `Use this one-time link to verify your PlayLink email and sign in:\n${actionLink}\n\nIf you did not request this link, you can ignore this email.`,
      }),
    })
  } catch (emailError) {
    console.error('Auth fallback-link email delivery failed:', emailError instanceof Error ? emailError.message : 'Unknown provider error.')
    return json({ error: 'The email could not be sent. Please try again later.' }, cors.headers, 503)
  }
  if (!emailResponse.ok) {
    console.error('Auth fallback-link email provider rejected the request:', `status ${emailResponse.status}`)
    return json({ error: 'The email could not be sent. Please try again later.' }, cors.headers, 503)
  }

  return json({ ok: true }, cors.headers)
})
