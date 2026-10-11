import type { Product } from '../types/product'
import { load, remove, save } from './storage'

/**
 * Analytics con consenso. Gli eventi restano anche sul dispositivo (statistiche nella pagina
 * Profilo) e vengono inviati in forma anonima ai sink registrati con `addSink` (Supabase).
 */
export type EventName = 'view' | 'like' | 'dislike' | 'click' | 'remove' | 'share' | 'outfit_like' | 'outfit_dislike' | 'outfit_share'
export interface AnalyticsEvent {
  name: EventName
  productId: string
  category: string
  brand?: string
  store: string
  at: number
}
export type Consent = 'granted' | 'denied' | 'unset'

const EVENTS_KEY = 'analytics:events'
const CONSENT_KEY = 'analytics:consent'
const MAX_EVENTS = 5000

let consent: Consent = load<Consent>(CONSENT_KEY, 'unset')
let events: AnalyticsEvent[] = consent === 'granted' ? load<AnalyticsEvent[]>(EVENTS_KEY, []) : []
const sinks: ((e: AnalyticsEvent) => void)[] = []
const consentListeners = new Set<(c: Consent) => void>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

export const getConsent = () => consent
export function setConsent(value: Consent) {
  consent = value
  save(CONSENT_KEY, value)
  if (value !== 'granted') {
    events = []
    remove(EVENTS_KEY)
  }
  consentListeners.forEach((fn) => fn(value))
}

export function onConsentChange(fn: (c: Consent) => void) {
  consentListeners.add(fn)
  return () => {
    consentListeners.delete(fn)
  }
}

export const addSink = (fn: (e: AnalyticsEvent) => void) => sinks.push(fn)

export function track(name: EventName, p: Product) {
  emit({ name, productId: p.id, category: p.category, brand: p.brand, store: p.store, at: Date.now() })
}

/** Sì, no e condivisioni degli outfit: la categoria è lo stile (per vedere quali stili piacciono). */
export function trackOutfit(name: 'outfit_like' | 'outfit_dislike' | 'outfit_share', outfit: { id: string; style: string }) {
  emit({ name, productId: outfit.id, category: outfit.style, store: 'outfit', at: Date.now() })
}

function emit(event: AnalyticsEvent) {
  if (consent !== 'granted') return
  events.push(event)
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  sinks.forEach((fn) => fn(event))
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => save(EVENTS_KEY, events), 500)
}

export function summary() {
  const count = (name: EventName) => events.filter((e) => e.name === name).length
  const views = count('view')
  const clicks = count('click')
  const byCategory = new Map<string, number>()
  const byProduct = new Map<string, number>()
  for (const e of events) {
    if (e.name === 'like' || e.name === 'click') {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1)
      byProduct.set(e.productId, (byProduct.get(e.productId) ?? 0) + 1)
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  return {
    views,
    likes: count('like'),
    dislikes: count('dislike'),
    clicks,
    ctr: views ? clicks / views : 0,
    topCategories: top(byCategory),
    topProducts: top(byProduct),
  }
}
