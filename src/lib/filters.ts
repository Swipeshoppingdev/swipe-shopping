import { NO_CATEGORY, categoryGroupOf, categoryIdsOf, isCategoryId, universeOf, type CategoryId } from '../config/categories'
import { COLOR_ORDER } from '../config/colors'
import type { Filters, Product } from '../types/product'
import { discountBadge, freshPrice } from './price'
import { yieldToMain } from './idle'
import { sizeChip, sortSizes } from './sizes'
import { stylesOf } from './styles'

export function matchesFilters(p: Product, f: Filters) {
  if (f.gender !== 'tutti' && p.gender !== f.gender && p.gender !== 'unisex') return false
  if (f.categories.length && !f.categories.includes(p.category)) return false
  if (f.brands.length && (!p.brand || !f.brands.includes(p.brand))) return false
  if (f.stores.length && !f.stores.includes(p.store)) return false
  // La taglia non nasconde niente: i capi con la taglia confermata vanno solo per primi (vedi AppState).
  if (f.colors.length) {
    // Prodotti senza colore riconosciuto: restano se l'utente ha escluso solo pochi colori (più verdi che rossi).
    if (!p.colors?.length) {
      if (f.colors.length * 2 <= COLOR_ORDER.length) return false
    } else if (!p.colors.some((c) => f.colors.includes(c))) return false
  }
  if (f.styles?.length && !stylesOf(p).some((s) => f.styles!.includes(s))) return false
  if (f.onlyDeals && discountBadge(p) === null) return false
  if (f.priceMin !== undefined || f.priceMax !== undefined) {
    // Con un filtro prezzo attivo escludiamo i prodotti senza prezzo verificato.
    const price = freshPrice(p)?.price
    if (price === undefined) return false
    if (f.priceMin !== undefined && price < f.priceMin) return false
    if (f.priceMax !== undefined && price > f.priceMax) return false
  }
  return true
}

/** Hash veloce e stabile: serve a mescolare i prodotti sempre nello stesso modo per ogni utente. */
function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const mixKeys = new Map<string, WeakMap<Product, number>>()

/**
 * Chiavi dell'ordine "mix" calcolate prima, a blocchi con pause (vedi yieldToMain): quando il catalogo arriva,
 * il primo ordinamento del mazzo non deve farle tutte insieme (sui telefoni economici era un blocco lungo).
 */
export async function warmMixKeys(list: Product[], seed: string) {
  const cache = mixKeys.get(seed) ?? new WeakMap<Product, number>()
  mixKeys.set(seed, cache)
  for (let i = 0; i < list.length; i++) {
    if (i && i % 5000 === 0) await yieldToMain()
    const p = list[i]
    if (!cache.has(p)) cache.set(p, hash(seed + p.id))
  }
}

export function sortProducts(list: Product[], sort: Filters['sort'], seed = '') {
  const sorted = [...list]
  // Mix: categorie e marche alternate, così lo swipe non mostra 50 t-shirt di fila.
  if (sort === 'mix') {
    // Una chiave per prodotto, calcolata una volta sola (il mazzo si riordina a ogni swipe).
    const cache = mixKeys.get(seed) ?? new WeakMap<Product, number>()
    mixKeys.set(seed, cache)
    const key = (p: Product) => {
      let k = cache.get(p)
      if (k === undefined) {
        k = hash(seed + p.id)
        cache.set(p, k)
      }
      return k
    }
    // Chiave (32 bit) e posizione (21 bit) in un solo numero: l'ordinamento nativo di Float64Array, senza funzione di
    // confronto, è molto più veloce con ~20.000 prodotti. A parità di chiave vince la posizione, come prima.
    if (list.length < 2 ** 21) {
      const packed = new Float64Array(list.length)
      for (let i = 0; i < list.length; i++) packed[i] = key(list[i]) * 2 ** 21 + i
      packed.sort()
      const out = new Array<Product>(list.length)
      for (let i = 0; i < packed.length; i++) out[i] = list[packed[i] % 2 ** 21]
      return out
    }
    const keyed = list.map((p) => ({ k: key(p), p }))
    keyed.sort((a, b) => a.k - b.k)
    return keyed.map((x) => x.p)
  }
  if (sort === 'novita') return sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  const dir = sort === 'prezzo_asc' ? 1 : -1
  // I prodotti senza prezzo vanno in fondo.
  return sorted.sort((a, b) => {
    const pa = freshPrice(a)?.price
    const pb = freshPrice(b)?.price
    if (pa === undefined) return pb === undefined ? 0 : 1
    if (pb === undefined) return -1
    return (pa - pb) * dir
  })
}

export function activeFilterCount(f: Filters) {
  return (
    (f.gender !== 'tutti' ? 1 : 0) +
    (f.onlyDeals ? 1 : 0) +
    // Ogni gruppo di chip conta 1: con il verde/rosso la lista può essere lunga.
    (f.categories.length ? 1 : 0) +
    (f.brands.length ? 1 : 0) +
    (f.stores.length ? 1 : 0) +
    (f.sizes.length ? 1 : 0) +
    (f.colors.length ? 1 : 0) +
    (f.styles?.length ? 1 : 0) +
    (f.priceMin !== undefined ? 1 : 0) +
    (f.priceMax !== undefined ? 1 : 0)
  )
}

const colorRank = (c: string) => (COLOR_ORDER.includes(c) ? COLOR_ORDER.indexOf(c) : COLOR_ORDER.length)

/** Valori distinti presenti nel catalogo, per mostrare solo filtri utili. */
export function facetValues(products: Product[]) {
  const brandCount = new Map<string, number>()
  const stores = new Set<Product['store']>()
  const sizes = new Set<string>()
  const colors = new Set<string>()
  for (const p of products) {
    if (p.brand) brandCount.set(p.brand, (brandCount.get(p.brand) ?? 0) + 1)
    stores.add(p.store)
    p.sizes?.forEach((s) => sizes.add(sizeChip(s)))
    p.colors?.forEach((c) => colors.add(c))
  }
  // Marche dalla più presente: le prime sono quelle che l'utente cerca più spesso.
  const brands = [...brandCount].sort((a, b) => b[1] - a[1]).map(([b]) => b)
  return { brands, stores: [...stores], sizes: sortSizes(sizes), colors: [...colors].sort((a, b) => colorRank(a) - colorRank(b) || a.localeCompare(b)) }
}

/**
 * Lista categorie vuota = tutte incluse. Se l'utente le seleziona tutte (o nessuna) torniamo a "tutte",
 * come per le marche: il filtro conta solo quando restringe davvero.
 */
export function normalizeFilters(f: Filters): Filters {
  // "Escludi tutto": nessuna categoria inclusa, resta così finché l'utente non ne riaccende una.
  if (f.categories.includes(NO_CATEGORY)) return { ...stripOld(f), sort: 'mix', categories: [NO_CATEGORY], catsV: CATS_V }
  const unique = [...new Set(f.categories.filter(isCategoryId))]
  // Categorie nuove: chi aveva scelto solo alcune categorie le riceve se ha già scelto qualcosa dello stesso gruppo
  // (es. Gonne a chi ha l'Abbigliamento). Una volta sola: se poi le toglie, restano tolte.
  if ((f.catsV ?? 0) < CATS_V && unique.length) {
    const groups = new Set(unique.map(categoryGroupOf))
    for (const c of NEW_CATEGORIES) if (!unique.includes(c) && groups.has(categoryGroupOf(c))) unique.push(c)
  }
  // Tutte le categorie della sezione (moda o tech) = nessun filtro.
  const all = unique.length > 0 && unique.length >= categoryIdsOf(universeOf(unique[0])).length
  // "Ordina per" non c'è più: il mazzo usa sempre il mix consigliato.
  return { ...stripOld(f), sort: 'mix', categories: all ? [] : unique, catsV: CATS_V }
}

/** Categorie aggiunte dopo il lancio (14/10/2026). Per le prossime: aggiungerle qui e alzare CATS_V. */
const NEW_CATEGORIES: CategoryId[] = ['gonne', 'pigiami', 'pantofole', 'sciarpe', 'berretti', 'cravatte']
const CATS_V = 1

/** "Solo novità" e le vecchie "sezioni extra" non esistono più: le togliamo dai filtri salvati. */
function stripOld(f: Filters): Filters {
  const { onlyNew: _n, extras: _e, ...rest } = f as Filters & { onlyNew?: boolean; extras?: string[] }
  return rest
}
