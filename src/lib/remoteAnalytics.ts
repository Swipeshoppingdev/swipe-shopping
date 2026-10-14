import { addSink, getConsent, onConsentChange, type AnalyticsEvent } from './analytics'
import { load, save } from './storage'
import { getSupabase, hasSupabase } from './supabase'

/**
 * Invia a Supabase gli eventi anonimi (solo con consenso), a blocchi.
 * Il dispositivo è identificato da un codice casuale, mai da dati personali.
 */
interface Row {
  name: AnalyticsEvent['name'] | 'session'
  product_id?: string
  category?: string
  brand?: string
  device_id: string
}

const FLUSH_MS = 5000
const MAX_QUEUE = 200

function deviceId() {
  let id = load<string>('deviceId', '')
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    save('deviceId', id)
  }
  return id
}

let queue: Row[] = []
let timer: ReturnType<typeof setTimeout> | undefined
let sessionSent = false

async function flush() {
  clearTimeout(timer)
  timer = undefined
  if (!hasSupabase || queue.length === 0 || getConsent() !== 'granted') return
  const supabase = await getSupabase()
  if (!supabase) return
  // Gli eventi degli outfit vanno a parte: se in Supabase manca ancora schema-13.sql falliscono solo loro.
  const rows = queue.filter((r) => !r.name.startsWith('outfit_'))
  const outfitRows = queue.filter((r) => r.name.startsWith('outfit_'))
  queue = []
  if (outfitRows.length) void supabase.from('events').insert(outfitRows)
  if (!rows.length) return
  void supabase
    .from('events')
    .insert(rows)
    .then(({ error }) => {
      // Rete assente: rimetto in coda e riprovo al prossimo evento.
      if (error && queue.length < MAX_QUEUE) queue = [...rows, ...queue].slice(-MAX_QUEUE)
    })
}

function enqueue(row: Omit<Row, 'device_id'>) {
  queue.push({ ...row, device_id: deviceId() })
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  if (!timer) timer = setTimeout(flush, FLUSH_MS)
}

function startSession() {
  if (sessionSent || getConsent() !== 'granted') return
  sessionSent = true
  enqueue({ name: 'session' })
}

export function startRemoteAnalytics() {
  if (!hasSupabase) return
  addSink((e) => enqueue({ name: e.name, product_id: e.productId, category: e.category, brand: e.brand }))
  onConsentChange((c) => {
    if (c === 'granted') startSession()
    else queue = []
  })
  startSession()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
