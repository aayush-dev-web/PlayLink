import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const hasPlaceholder = [supabaseUrl, supabaseKey].some((value) => value?.includes('your-'))

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey && !hasPlaceholder)
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null
