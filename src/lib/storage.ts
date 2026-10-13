/**
 * Persistenza locale con chiavi versionate. È l'unico punto che tocca
 * localStorage: per passare a Supabase basterà sostituire questo modulo.
 */
const PREFIX = 'swipeshop:v1:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage pieno o disabilitato (navigazione privata): l'app continua in memoria.
  }
}

/**
 * Come save, ma quando il telefono è libero (al più tardi dopo ~2 s) e subito se si chiude o si nasconde l'app.
 * Serve per i dati che cambiano a ogni swipe (preferiti, scartati): scriverli subito rallentava l'animazione.
 */
const pending = new Map<string, unknown>()
let scheduled = false
function flushPending() {
  scheduled = false
  for (const [key, value] of pending) save(key, value)
  pending.clear()
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPending)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushPending())
}
export function saveLater<T>(key: string, value: T) {
  pending.set(key, value)
  if (scheduled) return
  scheduled = true
  if ('requestIdleCallback' in window) requestIdleCallback(flushPending, { timeout: 2000 })
  else setTimeout(flushPending, 1000)
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignorato */
  }
}
