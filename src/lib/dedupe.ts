import type { Product } from '../types/product'

const words = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/**
 * Chiave del "modello": stesso negozio, marca, categoria e prime 7 parole del titolo.
 * Le varianti di colore o taglia ("Hoodie Nike Park26 … Black/White XXL") hanno la stessa chiave.
 */
export const modelKey = (p: Product) => {
  // Calcolata una volta per prodotto: il mazzo la richiede a ogni swipe.
  let k = keys.get(p)
  if (k === undefined) {
    k = `${p.store}|${p.brand ?? ''}|${p.category}|${words(p.title).slice(0, 7).join(' ')}`
    keys.set(p, k)
  }
  return k
}
const keys = new WeakMap<Product, string>()

/** Tiene il primo prodotto di ogni modello e salta quelli di modelli già visti. */
export function onePerModel(list: Product[], seenModels: Set<string>) {
  const taken = new Set(seenModels)
  return list.filter((p) => {
    const k = modelKey(p)
    if (taken.has(k)) return false
    taken.add(k)
    return true
  })
}
