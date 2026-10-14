import type { SupabaseClient } from '@supabase/supabase-js'
import { APP_AUTH_URL, isNative } from './native'

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Account e sincronizzazione disponibili (progetto Supabase configurato). Senza, l'app salva solo sul dispositivo. */
export const hasSupabase = !!(url && anonKey)

let client: Promise<SupabaseClient | null> | null = null

/**
 * Client Supabase, uno solo per tutta l'app. La libreria (oltre 200 KB) si scarica a parte, in parallelo al resto:
 * così non rallenta la prima schermata. null se il progetto non è configurato.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  client ??= hasSupabase ? import('./supabaseClient').then((m) => m.createSupabase(url!, anonKey!)) : Promise.resolve(null)
  return client
}

/** Indirizzo a cui tornano i link delle email (conferma, recupero password). */
// Nell'app le email riaprono l'app stessa. Se Supabase non ha questo indirizzo tra quelli consentiti
// usa il sito: la conferma vale lo stesso e l'app entra da sola (vedi useAutoLoginAfterConfirm).
export const authRedirectUrl = () => (isNative ? APP_AUTH_URL : `${window.location.origin}${window.location.pathname}`)

/** Chiamata a una funzione del database (RPC) per le pagine che non hanno bisogno del client completo. */
export async function supabaseRpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  const supabase = await getSupabase()
  if (!supabase) return { data: null, error: { message: 'Account non disponibile.' } }
  const { data, error } = await supabase.rpc(fn, args)
  return { data: data as unknown, error }
}
