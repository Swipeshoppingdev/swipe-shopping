import { freshPrice } from './price'
import type { Product } from '../types/product'

/** Generatore pseudo-casuale da un seme: la stessa sfida dà le stesse opzioni a tutti gli amici. */
export function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** Due prezzi finti credibili (circa -40% e +50%), arrotondati come quelli veri. */
export function decoys(price: number, rand: () => number = Math.random) {
  const round = (x: number) => (x >= 20 ? Math.round(x) - 0.01 : Math.round(x * 2) / 2 - 0.01)
  const low = round(price * (0.55 + rand() * 0.15))
  const high = round(price * (1.4 + rand() * 0.3))
  return [low, high].filter((x) => x > 1 && Math.abs(x - price) > 1)
}

/** Le 3 opzioni (prezzo vero + 2 finti) in ordine mescolato; null se il prezzo non è aggiornato. */
export function priceOptions(p: Product, rand: () => number = Math.random) {
  const fp = freshPrice(p)
  if (!fp || fp.from) return null
  const d = decoys(fp.price, rand)
  if (d.length < 2) return null
  const opts = [fp.price, ...d]
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  return { price: fp.price, options: opts }
}

/** Prodotti adatti a una sfida sui prezzi: prezzo aggiornato e prezzi abbastanza diversi tra loro. */
export function challengeProducts(pool: Product[], n = 5) {
  const out: Product[] = []
  for (const p of pool) {
    if (!priceOptions(p)) continue
    const price = freshPrice(p)!.price
    if (out.some((q) => Math.abs(freshPrice(q)!.price - price) < price * 0.1)) continue
    out.push(p)
    if (out.length === n) break
  }
  return out
}
