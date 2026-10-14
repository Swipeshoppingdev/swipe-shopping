import { load, save } from './storage'

/**
 * Ultimi errori dell'app salvati sul telefono e mandati da soli (anonimi) a Supabase (schema-16.sql):
 * l'admin li vede in Statistiche da qualsiasi telefono, e in Profilo quelli di questo telefono.
 */
export type CrashEntry = { at: string; where: string; message: string; stack?: string; route: string; ua: string; sent?: boolean }

const KEY = 'crashLog'
const MAX = 5

export function logCrash(where: string, err: unknown, extra?: string) {
  try {
    const e = err instanceof Error ? err : new Error(String(err))
    const entry: CrashEntry = {
      at: new Date().toISOString(),
      where,
      message: e.message.slice(0, 300),
      stack: `${e.stack ?? ''}${extra ? `\n--\n${extra}` : ''}`.slice(0, 1500),
      route: location.hash,
      ua: navigator.userAgent.slice(0, 200),
    }
    save(KEY, [entry, ...load<CrashEntry[]>(KEY, [])].slice(0, MAX))
    void sendCrashes()
  } catch {
    // Mai un errore mentre si salva un errore.
  }
}

export const crashLog = () => load<CrashEntry[]>(KEY, [])
export const clearCrashLog = () => save(KEY, [])

let sending = false
/** Manda gli errori non ancora inviati (anche quelli salvati prima di questa versione). */
export async function sendCrashes() {
  if (sending) return
  sending = true
  try {
    const supabase = await (await import('./supabase')).getSupabase()
    if (!supabase) return
    const native = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    for (const e of crashLog().filter((x) => !x.sent)) {
      const { error } = await supabase.rpc('report_error', {
        p_at: e.at, p_kind: e.where, p_message: e.message, p_stack: e.stack ?? null, p_route: e.route, p_ua: e.ua, p_native: native,
      })
      if (error) return
      save(KEY, crashLog().map((x) => (x.at === e.at && x.message === e.message ? { ...x, sent: true } : x)))
    }
  } catch {
    // Senza rete si riprova al prossimo avvio.
  } finally {
    sending = false
  }
}

/** Anche gli errori fuori da React (timer, promesse). Gli errori rimasti da mandare partono poco dopo l'avvio. */
export function watchErrors() {
  setTimeout(() => void sendCrashes(), 5000)
  window.addEventListener('error', (e) => logCrash('window', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => logCrash('promise', e.reason))
}
