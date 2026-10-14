import { createClient } from '@supabase/supabase-js'

/** Creato solo da getSupabase() (src/lib/supabase.ts): la libreria pesa e si scarica dopo il primo avvio. */
export const createSupabase = (url: string, anonKey: string) =>
  createClient(url, anonKey, {
    auth: {
      // PKCE: il codice torna nella query (?code=), così non si scontra con il routing via #.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
