import { useEffect, useState, useSyncExternalStore } from 'react'
import { modelKey } from './dedupe'
import { freshPrice } from './price'
import type { Product } from '../types/product'

/**
 * "Drop di oggi": ogni mattina alle 8 escono 10 prodotti per sezione (novità e sconti veri),
 * scelti con lo stesso sorteggio per tutti a parità di filtri. Un appuntamento fisso per riaprire l'app.
 */
export const DROP_SIZE = 10
const DROP_HOUR = 8
const NEW_MS = 3 * 24 * 3_600_000

/** Giorno del drop: cambia alle 8 di mattina (ora del telefono). */
export function dropDay(now = new Date()) {
  const d = new Date(now.getTime() - DROP_HOUR * 3_600_000)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function msToNextDrop(now = new Date()) {
  const next = new Date(now)
  next.setHours(DROP_HOUR, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return +next - +now
}

/** Il giorno del drop, aggiornato quando l'app torna in primo piano o scatta l'ora. */
export function useDropDay() {
  const [day, setDay] = useState(() => dropDay())
  useEffect(() => {
    const check = () => setDay(dropDay())
    const t = setTimeout(check, msToNextDrop() + 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', check)
    }
  }, [day])
  return day
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** I 10 del giorno tra i candidati (già filtrati per sezione, filtri e disponibilità). */
export function pickDrop(candidates: Product[], day: string, now = Date.now()) {
  const good = candidates.filter((p) => {
    const fp = freshPrice(p, now)
    if (!fp || fp.from) return false
    return (fp.discountPct ?? 0) >= 15 || now - Date.parse(p.addedAt) < NEW_MS
  })
  good.sort((a, b) => hash(day + a.id) - hash(day + b.id))
  const models = new Set<string>()
  const perCategory = new Map<string, number>()
  const out: Product[] = []
  for (const p of good) {
    const k = modelKey(p)
    const c = perCategory.get(p.category) ?? 0
    if (models.has(k) || c >= 2) continue
    models.add(k)
    perCategory.set(p.category, c + 1)
    out.push(p)
    if (out.length === DROP_SIZE) break
  }
  return out
}

// Tab "Oggi" aperta o no (solo in memoria: riaprendo l'app si parte da "Tutto").
let on = false
const listeners = new Set<() => void>()
export function setDropOn(v: boolean) {
  on = v
  listeners.forEach((fn) => fn())
}
export function useDropOn() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => on,
  )
}

export function formatWait(ms: number) {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h ? `${h} h ${m} min` : `${m} min`
}
