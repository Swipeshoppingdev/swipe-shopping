import { UNIVERSES, type Universe } from '../config/categories'
import { DATA_BASE } from './native'
import { buildExploreCards } from '../data/exploreCards'
import type { Product } from '../types/product'
import { checkCatalog } from './validate'

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
export async function loadCatalog(section: Universe, signal?: AbortSignal): Promise<CatalogResult> {
  let res = await fetch(`${DATA_BASE}catalog-${section}.json`, { signal })
  let sections: Universe[] = [section]
  if (!res.ok) {
    res = await fetch(`${DATA_BASE}catalog.json`, { signal })
    sections = [...UNIVERSES]
  }
  if (!res.ok) throw new Error(`Catalogo non disponibile (HTTP ${res.status})`)
  const { valid, invalid } = checkCatalog((await res.json()).map(expand))
  if (invalid.length) console.warn('Prodotti scartati dal catalogo:', invalid)
  const available = valid.filter((p) => p.availability !== 'out_of_stock')
  if (available.length === 0 && sections.length > 1) return { products: buildExploreCards(), exploreMode: true, skipped: invalid.length, sections }
  return { products: valid, exploreMode: false, skipped: invalid.length, sections }
}

/** Anteprima leggera della sezione (catalog-<sezione>-anteprima.json, vedi build-catalog): vuota se manca. */
export async function loadCatalogPreview(section: Universe, signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch(`${DATA_BASE}catalog-${section}-anteprima.json`, { signal })
  if (!res.ok) return []
  return checkCatalog((await res.json()).map(expand)).valid.filter((p) => p.availability !== 'out_of_stock')
}

/** Ricostruisce i campi tolti dal build per risparmiare peso (vedi scripts/build-catalog.ts). */
function expand(raw: Record<string, unknown>) {
  const p = { ...raw }
  if (p.externalId === undefined && typeof p.id === 'string') p.externalId = p.id.slice(p.id.indexOf(':') + 1)
  if (p.availability === undefined) p.availability = 'in_stock'
  return p
}
