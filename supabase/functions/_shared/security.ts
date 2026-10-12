const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
}

export function corsForRequest(request: Request, methods = 'POST, OPTIONS') {
  const origin = request.headers.get('Origin')
  const configuredOrigins = (Deno.env.get('PLAYLINK_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const allowedOrigins = new Set(configuredOrigins.flatMap((value) => {
    try {
      const parsed = new URL(value)
      return parsed.origin === value && (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
        ? [parsed.origin]
        : []
    } catch {
      return []
    }
  }))

  const headers: Record<string, string> = {
    ...securityHeaders,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
  if (!origin) return { allowed: true, headers }
  if (!allowedOrigins.has(origin)) return { allowed: false, headers }
  headers['Access-Control-Allow-Origin'] = origin
  return { allowed: true, headers }
}

export async function readJsonBody(request: Request, maxBytes = 16_384): Promise<{ value?: unknown; error?: 'invalid' | 'too_large' | 'content_type' }> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return { error: 'content_type' }
  }
  const declaredLength = Number(request.headers.get('Content-Length') || 0)
  if (declaredLength > maxBytes) return { error: 'too_large' }

  const reader = request.body?.getReader()
  if (!reader) return { error: 'invalid' }
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        return { error: 'too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { error: 'invalid' }
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch {
    return { error: 'invalid' }
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function digestKey(scope: string, identifier: string) {
  const value = new TextEncoder().encode(`${scope}:${identifier}`)
  const digest = await crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function consumeRateLimit(
  client: SupabaseClient,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
) {
  const key = await digestKey(scope, identifier)
  const { data, error } = await client.rpc('consume_playlink_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error(error.message)
  return data === true
}

export function clientAddress(request: Request) {
  const value = request.headers.get('cf-connecting-ip')?.trim()
  return value && value.length <= 64 ? value : ''
}
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
