import { useSyncExternalStore } from 'react'

/**
 * "Cosa vuoi vedere adesso?": la categoria scelta nella pausa "Questo o quello" passa in cima al mazzo
 * per i prossimi `left` swipe. Solo in memoria (vale per questa visita), una sezione alla volta.
 */
export interface Boost {
  section: string
  category: string
  left: number
}
let current: Boost | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function setBoost(b: Boost | null) {
  current = b
  emit()
}
/** Uno swipe in più: il boost si consuma. */
export function spendBoost(n = 1) {
  if (!current) return
  current = current.left - n > 0 ? { ...current, left: current.left - n } : null
  emit()
}
export function useBoost() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
  )
}
