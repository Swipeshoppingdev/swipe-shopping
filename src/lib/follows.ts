import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '../state/AuthState'
import { load, save } from './storage'
import { supabase } from './supabase'

/**
 * "Segui una marca": i prodotti delle marche seguite escono più spesso nel mazzo (una carta su tre)
 * e scripts/brand-alerts.ts avvisa delle novità (al massimo una notifica al giorno).
 * Salvate sul dispositivo e, con l'account, in user_data.follows (schema-17.sql; senza, solo locali).
 */
const KEY = 'followBrands'
const MAX = 50
let current: string[] = load<string[]>(KEY, [])
const listeners = new Set<() => void>()

const norm = (b: string) => b.trim().toLowerCase()

function set(next: string[]) {
  current = next.slice(0, MAX)
  save(KEY, current)
  listeners.forEach((fn) => fn())
}

export function isFollowed(brand: string | undefined, list = current) {
  return !!brand && list.some((b) => norm(b) === norm(brand))
}

export function toggleFollow(brand: string) {
  set(isFollowed(brand) ? current.filter((b) => norm(b) !== norm(brand)) : [brand, ...current])
  void pushCloud()
}

export function useFollows() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
  )
}

let userId: string | null = null
async function pushCloud() {
  if (!supabase || !userId) return
  const { error } = await supabase.from('user_data').update({ follows: current }).eq('user_id', userId)
  if (error) console.warn('Marche seguite non salvate:', error.message)
}

/** Con l'account: unisce le marche del dispositivo con quelle salvate e le tiene allineate. */
export function useFollowsSync() {
  const id = useAuth().user?.id ?? null
  useEffect(() => {
    userId = id
    if (!id || !supabase) return
    let stop = false
    void supabase
      .from('user_data')
      .select('follows')
      .eq('user_id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        // Colonna assente (schema-17 non eseguito) o nessuna riga: restano quelle del dispositivo.
        if (stop || error || !data) return
        const remote = Array.isArray(data.follows) ? (data.follows as unknown[]).filter((b): b is string => typeof b === 'string') : []
        const merged = [...current, ...remote.filter((b) => !isFollowed(b))]
        if (merged.length !== current.length) set(merged)
        if (merged.length !== remote.length) void pushCloud()
      })
    return () => {
      stop = true
    }
  }, [id])
}
