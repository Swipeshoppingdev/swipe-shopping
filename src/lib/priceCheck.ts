import { categoryLabel, type CategoryId } from '../config/categories'
import type { Product } from '../types/product'
import { freshPrice } from './price'

/**
 * "Prezzo giusto?" e "Simile ma costa meno": confronto con i prezzi di OGGI degli altri prodotti della stessa
 * categoria (niente storico: Amazon non permette di conservare i prezzi oltre 24 ore).
 */

/** Stesso articolo in più taglie o colori: non si confronta con se stesso. */
const model = (p: Product) => `${p.brand ?? ''}|${p.title.replace(/,\s*[^,]{1,14}$/, '').toLowerCase()}`
const MIN_PEERS = 12

/** Il titolo contiene una parola del nome della categoria (Pantaloni → "pantalon"): scarta prodotti classificati male. */
const stems = new Map<string, string[]>()
function looksLike(p: Product) {
  let st = stems.get(p.category)
  if (!st) {
    st = categoryLabel(p.category as CategoryId)
      .toLowerCase()
      .split(/[^a-zàèéìòù]+/)
      .filter((w) => w.length > 4)
      .map((w) => w.slice(0, -1))
    stems.set(p.category, st)
  }
  const t = p.title.toLowerCase()
  return st.some((w) => t.includes(w))
}

function peersOf(product: Product, all: Product[]) {
  const own = model(product)
  return all.filter(
    (p) =>
      p.id !== product.id &&
      p.category === product.category &&
      p.availability !== 'out_of_stock' &&
      !p.searchQuery &&
      (product.gender === 'unisex' || p.gender === product.gender || p.gender === 'unisex') &&
      model(p) !== own &&
      freshPrice(p) !== null,
  )
}

export interface PriceRank {
  /** % dei prodotti simili che costano di più */
  cheaperThan: number
  level: 'basso' | 'medio' | 'alto'
  peers: number
}

/** Calcolato una volta per prodotto (carta e scheda usano lo stesso risultato). */
const rankCache = new WeakMap<Product[], Map<string, PriceRank | null>>()

export function priceRank(product: Product, all: Product[]): PriceRank | null {
  let cache = rankCache.get(all)
  if (!cache) rankCache.set(all, (cache = new Map()))
  const key = `${product.id}|${product.price}|${product.priceCheckedAt}`
  if (!cache.has(key)) cache.set(key, computeRank(product, all))
  return cache.get(key)!
}

function computeRank(product: Product, all: Product[]): PriceRank | null {
  const price = freshPrice(product)?.price
  if (price === undefined) return null
  const peers = peersOf(product, all)
  if (peers.length < MIN_PEERS) return null
  const dearer = peers.filter((p) => freshPrice(p)!.price > price).length
  const cheaperThan = Math.round((dearer / peers.length) * 100)
  return { cheaperThan, peers: peers.length, level: cheaperThan >= 65 ? 'basso' : cheaperThan >= 30 ? 'medio' : 'alto' }
}

/**
 * Fino a `limit` alternative simili che costano almeno il 15% (e 5 €) in meno: stessa categoria e genere,
 * prima quelle con colore o marca in comune e prezzo più vicino (più simili), una per modello e marca.
 */
export function cheaperAlternatives(product: Product, all: Product[], limit = 3) {
  const price = freshPrice(product)?.price
  if (price === undefined) return []
  const colors = new Set(product.colors ?? [])
  const strict = looksLike(product)
  const scored = peersOf(product, all)
    .filter((p) => !strict || looksLike(p))
    .map((p) => ({ p, q: freshPrice(p)!.price }))
    .filter(({ q }) => q <= price * 0.85 && price - q >= 5 && q >= price * 0.3)
    .map(({ p, q }) => {
      const sameColor = (p.colors ?? []).some((c) => colors.has(c))
      const sameBrand = !!p.brand && p.brand === product.brand
      // Un risparmio vero (intorno a un terzo in meno) ma non un oggetto di tutt'altra fascia; meglio se colore o marca in comune.
      const score = Math.abs(Math.log(q / (price * 0.65))) - (sameColor ? 0.3 : 0) - (sameBrand ? 0.2 : 0)
      return { product: p, saving: price - q, score }
    })
    .sort((a, b) => a.score - b.score)
  const out: { product: Product; saving: number }[] = []
  const brands = new Set<string>()
  const models = new Set<string>()
  for (const s of scored) {
    const m = model(s.product)
    const b = s.product.brand ?? s.product.id
    if (models.has(m) || brands.has(b)) continue
    models.add(m)
    brands.add(b)
    out.push({ product: s.product, saving: s.saving })
    if (out.length >= limit) break
  }
  return out
}
