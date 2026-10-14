import { UNIVERSES, type Universe } from '../config/categories'
import { DATA_BASE } from './native'
import { buildExploreCards } from '../data/exploreCards'
import type { Product } from '../types/product'
import { isCategoryId } from '../config/categories'
import { STORES, isStoreId } from '../config/stores'

export interface CatalogResult {
  products: Product[]
  /** true se il catalogo verificato è vuoto e mostriamo le card "esplora" */
  exploreMode: boolean
  skipped: number
  /** Sezioni contenute: il build divide il catalogo per sezione per aprire l'app prima. */
  sections: Universe[]
}

/**
 * Sorgente del catalogo. Il build scrive `catalog-<sezione>.json` (compatti):
 * si scarica prima la sezione aperta, poi le altre. In sviluppo c'è solo `catalog.json` (tutto).
 */
export async function loadCatalog(section: Universe, signal?: AbortSignal, beforeParse?: () => Promise<void>): Promise<CatalogResult> {
  let res = await fetch(`${DATA_BASE}catalog-${section}.json`, { signal })
  let sections: Universe[] = [section]
  if (!res.ok) {
    res = await fetch(`${DATA_BASE}catalog.json`, { signal })
    sections = [...UNIVERSES]
  }
  if (!res.ok) throw new Error(`Catalogo non disponibile (HTTP ${res.status})`)
  // Leggere il catalogo (alcuni MB) blocca il telefono per un attimo: chi chiama può farlo aspettare un momento libero,
  // così non capita in mezzo a uno swipe.
  const text = await res.text()
  await beforeParse?.()
  const { valid, invalid } = quickCheck((JSON.parse(text) as Record<string, unknown>[]).map(expand))
  if (invalid) console.warn('Prodotti scartati dal catalogo:', invalid)
  const available = valid.filter((p) => p.availability !== 'out_of_stock')
  if (available.length === 0 && sections.length > 1) return { products: buildExploreCards(), exploreMode: true, skipped: invalid, sections }
  return { products: valid, exploreMode: false, skipped: invalid, sections }
}

/** Anteprima leggera della sezione (catalog-<sezione>-anteprima.json, vedi build-catalog): vuota se manca. */
export async function loadCatalogPreview(section: Universe, signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch(`${DATA_BASE}catalog-${section}-anteprima.json`, { signal })
  if (!res.ok) return []
  return quickCheck((await res.json()).map(expand)).valid.filter((p) => p.availability !== 'out_of_stock')
}

/**
 * Controllo veloce: il controllo completo (src/lib/validate.ts) lo fa il build in scripts/build-catalog.ts.
 * Qui si scartano solo voci rotte, doppioni e negozi o categorie che questa versione dell'app non conosce.
 */
function quickCheck(list: Record<string, unknown>[]) {
  const valid: Product[] = []
  const seen = new Set<string>()
  for (const p of list) {
    const ok =
      typeof p.id === 'string' && !seen.has(p.id) && typeof p.title === 'string' && typeof p.addedAt === 'string' &&
      typeof p.category === 'string' && isCategoryId(p.category) && typeof p.store === 'string' && isStoreId(p.store) && STORES[p.store].enabled
    if (!ok) continue
    seen.add(p.id as string)
    valid.push(p as unknown as Product)
  }
  return { valid, invalid: list.length - valid.length }
}

/** Ricostruisce i campi tolti dal build per risparmiare peso (vedi scripts/build-catalog.ts). */
// Modifica l'oggetto appena letto dal JSON invece di copiarlo: con decine di migliaia di prodotti la copia pesa.
function expand(p: Record<string, unknown>) {
  if (p.externalId === undefined && typeof p.id === 'string') p.externalId = p.id.slice(p.id.indexOf(':') + 1)
  if (p.availability === undefined) p.availability = 'in_stock'
  return p
}
